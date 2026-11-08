import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { googleClient } from './googleClient';
import {
  DEFAULT_PREFS, PROVIDER_IDS, KEY_PROVIDER_IDS, PROVIDER_INFO, MALE_VOICES,
  type AiPrefs, type AiSettings, type KeyProvider, type ModelInfo, type Provider, type ProviderStatus,
} from '../src/aiSettings';
import { getImageModel, looksLikeImageModel, type ImageModelDef } from '../src/imageModels';
import { detectReplicate, detectStability } from './images/detect';
import type { Effort } from '../src/config';
import type { SettingsStore } from './store';
import { decryptSecret, encryptSecret, keyHint } from './secrets';
import { describeProviderError } from './errors';
import { createGoogleVerifier, type Verifier } from './verify';

const ENV_KEYS: Record<KeyProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN'],
  stability: ['STABILITY_API_KEY'],
};

const EFFORTS: Effort[] = ['low', 'medium', 'high'];

function envKey(provider: KeyProvider): string | null {
  for (const name of ENV_KEYS[provider]) {
    const value = process.env[name]?.trim();
    // AI Studio templates ship placeholder values like "MY_GEMINI_API_KEY".
    if (value && !/^MY_/.test(value)) return value;
  }
  return null;
}

// Each listing call doubles as the key test: it needs a valid key but costs nothing. Image models the key can
// reach come back with kind 'image' (matched against src/imageModels.ts in the Settings "Obrazy" tab).
async function listModels(provider: KeyProvider, apiKey: string): Promise<{ models: ModelInfo[]; note?: string }> {
  if (provider === 'replicate') return { models: await detectReplicate(apiKey) };
  if (provider === 'stability') {
    const { models, credits } = await detectStability(apiKey);
    return { models, note: credits !== null ? `${credits.toFixed(1).replace('.', ',')} kredytów` : undefined };
  }

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
    const models: ModelInfo[] = [];
    for await (const m of client.models.list({ limit: 100 })) {
      models.push({ id: m.id, label: m.display_name || m.id, kind: 'text' });
    }
    return { models };
  }

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 20_000 });
    const all: { id: string; created: number }[] = [];
    for await (const m of client.models.list()) all.push({ id: m.id, created: m.created });
    all.sort((a, b) => b.created - a.created);
    // /v1/models also lists embeddings, audio and realtime models — keep text and image models only.
    const text = all
      .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id))
      .filter((m) => !/(audio|realtime|tts|transcribe|image|embedding|search-api|instruct|moderation|codex)/.test(m.id))
      .map((m) => ({ id: m.id, label: m.id, kind: 'text' as const }));
    const images = all.filter((m) => looksLikeImageModel('openai', m.id)).map((m) => ({ id: m.id, label: m.id, kind: 'image' as const }));
    return { models: [...text, ...images] };
  }

  const ai = googleClient(apiKey);
  const models: ModelInfo[] = [];
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const m of pager) {
    const id = (m.name ?? '').replace(/^models\//, '');
    const actions = m.supportedActions ?? [];
    if (looksLikeImageModel('google', id) && (actions.includes('generateContent') || actions.includes('predict'))) {
      models.push({ id, label: m.displayName || id, kind: 'image' });
      continue;
    }
    if (!id.startsWith('gemini-')) continue;
    if (!actions.includes('generateContent')) continue;
    if (/(embedding|image|nano-banana|live|native-audio|robotics|computer-use)/.test(id)) continue;
    models.push({ id, label: m.displayName || id, kind: /tts/.test(id) ? 'tts' : 'text' });
  }
  return { models };
}

/** "Klucz działa · 12 modeli tekstowych · 3 modele obrazów". */
function okMessage(models: ModelInfo[], note?: string): string {
  const text = models.filter((m) => m.kind !== 'image').length;
  const images = models.filter((m) => m.kind === 'image').length;
  const parts = [text ? countOf(text, 'model tekstowy', 'modele tekstowe', 'modeli tekstowych') : null, images ? countOf(images, 'model obrazów', 'modele obrazów', 'modeli obrazów') : null, note ?? null].filter(Boolean);
  return parts.length ? `Klucz działa · ${parts.join(' · ')}` : 'Klucz działa, ale nie zwrócił żadnego modelu.';
}

export class ProviderService {
  constructor(private store: SettingsStore) {}

  async getKey(provider: KeyProvider): Promise<string | null> {
    const stored = (await this.store.getKeys()).find((k) => k.provider === provider);
    if (stored) {
      const plain = decryptSecret(stored.cipher);
      if (plain) return plain;
    }
    return envKey(provider);
  }

  /** Saves a key, then tests it and fetches its model list in one go. */
  async saveKey(provider: KeyProvider, key: string): Promise<ProviderStatus> {
    await this.store.saveKey(provider, encryptSecret(key), keyHint(key));
    return this.testKey(provider);
  }

  async deleteKey(provider: KeyProvider) {
    await this.store.deleteKey(provider);
  }

  async testKey(provider: KeyProvider): Promise<ProviderStatus> {
    const key = await this.getKey(provider);
    if (!key) return (await this.getSettings()).providers[provider];
    const fromDb = (await this.store.getKeys()).some((k) => k.provider === provider);
    try {
      const { models, note } = await listModels(provider, key);
      const message = okMessage(models, note);
      if (fromDb) await this.store.saveKeyStatus(provider, 'ok', message, models);
      else this.envStatus[provider] = { status: 'ok', message, models, testedAt: new Date().toISOString() };
    } catch (err) {
      const message = describeProviderError(provider, err);
      if (fromDb) await this.store.saveKeyStatus(provider, 'error', message, null);
      else this.envStatus[provider] = { status: 'error', message, models: [], testedAt: new Date().toISOString() };
    }
    return (await this.getSettings()).providers[provider];
  }

  // Keys from .env aren't in the store, so their last test result lives in memory.
  private envStatus: Partial<Record<KeyProvider, Pick<ProviderStatus, 'status' | 'message' | 'models' | 'testedAt'>>> = {};

  async getPrefs(): Promise<AiPrefs> {
    return normalizePrefs(await this.store.getDoc('ai_prefs'));
  }

  async savePrefs(patch: unknown): Promise<AiPrefs> {
    const next = normalizePrefs(deepMerge(await this.getPrefs(), patch));
    await this.store.saveDoc('ai_prefs', next);
    return next;
  }

  async getSettings(): Promise<AiSettings> {
    const keys = await this.store.getKeys();
    const providers = {} as Record<KeyProvider, ProviderStatus>;
    for (const provider of KEY_PROVIDER_IDS) {
      const stored = keys.find((k) => k.provider === provider);
      const env = envKey(provider);
      if (stored) {
        const readable = decryptSecret(stored.cipher) !== null;
        providers[provider] = {
          configured: readable,
          source: 'db',
          hint: stored.hint,
          status: readable ? stored.status : 'error',
          message: readable ? stored.message : 'Nie da się odszyfrować klucza (zmienił się SETTINGS_SECRET). Wpisz klucz ponownie.',
          testedAt: stored.testedAt,
          models: stored.models,
        };
      } else if (env) {
        const tested = this.envStatus[provider];
        providers[provider] = {
          configured: true,
          source: 'env',
          hint: keyHint(env),
          status: tested?.status ?? 'untested',
          message: tested?.message ?? null,
          testedAt: tested?.testedAt ?? null,
          models: tested?.models ?? [],
        };
      } else {
        providers[provider] = { configured: false, source: null, hint: null, status: 'untested', message: null, testedAt: null, models: [] };
      }
    }
    return { providers, prefs: await this.getPrefs(), storage: this.store.kind };
  }

  /**
   * An image model ready to call: catalogue entry, its provider key, and whether the key's last test found it.
   * `id` defaults to the owner's default image model.
   */
  async resolveImageModel(id?: string): Promise<{ model: ImageModelDef; apiKey: string } | { error: string }> {
    const prefs = await this.getPrefs();
    const model = getImageModel(id ?? prefs.image.defaultModel);
    if (!model) return { error: 'Nieznany model obrazów.' };
    if (prefs.image.disabled.includes(model.id)) return { error: `Model ${model.label} jest wyłączony w Ustawieniach → Obrazy.` };
    const apiKey = await this.getKey(model.provider);
    if (!apiKey) {
      const info = PROVIDER_INFO[model.provider];
      return { error: `${model.label} wymaga klucza ${info.company}. Dodaj go w Ustawieniach → Klucze API.` };
    }
    const status = (await this.getSettings()).providers[model.provider];
    if (status.status === 'ok' && !status.models.some((m) => m.kind === 'image' && m.id === model.model)) {
      return { error: `Klucz ${PROVIDER_INFO[model.provider].company} nie ma dostępu do modelu ${model.label}. Wybierz inny model w Ustawieniach → Obrazy.` };
    }
    return { model, apiKey };
  }

  /** Google cross-check for Claude, available when a Google key exists. */
  async googleVerifier(): Promise<Verifier | undefined> {
    const key = await this.getKey('google');
    if (!key) return undefined;
    const prefs = await this.getPrefs();
    return createGoogleVerifier(key, prefs.engine.models.google);
  }

  /** The search engine to use right now, or a Polish explanation of what is missing. */
  async resolveEngine(): Promise<{ provider: Provider; model: string; apiKey: string; effort: Effort } | { error: string }> {
    const prefs = await this.getPrefs();
    const provider = prefs.engine.provider;
    const apiKey = await this.getKey(provider);
    if (!apiKey) {
      const info = PROVIDER_INFO[provider];
      return { error: `Brak klucza ${info.company} (${info.label}). Dodaj go w Ustawieniach albo wybierz inny silnik.` };
    }
    return { provider, model: prefs.engine.models[provider], apiKey, effort: prefs.effort };
  }
}

// Polish plural: 1 model, 2–4 modele (but 12–14 modeli), 5+ modeli
function countOf(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `1 ${one}`;
  const isFew = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${isFew ? few : many}`;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isRecord(base) || !isRecord(patch)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isRecord(v) && isRecord(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

const MODEL_ID = /^[A-Za-z0-9._:\-/]{1,120}$/;

/** Fills defaults and drops anything malformed, so stored or posted prefs can never break a request. */
function normalizePrefs(raw: unknown): AiPrefs {
  const p = deepMerge(DEFAULT_PREFS, raw);
  const pick = (value: unknown, fallback: string) => (typeof value === 'string' && MODEL_ID.test(value) ? value : fallback);
  return {
    engine: {
      provider: PROVIDER_IDS.includes(p.engine.provider) ? p.engine.provider : DEFAULT_PREFS.engine.provider,
      models: {
        anthropic: pick(p.engine.models.anthropic, process.env.ANTHROPIC_MODEL || DEFAULT_PREFS.engine.models.anthropic),
        openai: pick(p.engine.models.openai, DEFAULT_PREFS.engine.models.openai),
        google: pick(p.engine.models.google, DEFAULT_PREFS.engine.models.google),
      },
    },
    effort: EFFORTS.includes(p.effort) ? p.effort : DEFAULT_PREFS.effort,
    voice: {
      voiceName: MALE_VOICES.some((v) => v.id === p.voice.voiceName) ? p.voice.voiceName : DEFAULT_PREFS.voice.voiceName,
      ttsModel: pick(p.voice.ttsModel, DEFAULT_PREFS.voice.ttsModel),
      autoRead: p.voice.autoRead === true,
    },
    stt: { model: pick(p.stt.model, DEFAULT_PREFS.stt.model) },
    image: {
      defaultModel: getImageModel(p.image.defaultModel) ? p.image.defaultModel : DEFAULT_PREFS.image.defaultModel,
      sampleModel: getImageModel(p.image.sampleModel) ? p.image.sampleModel : DEFAULT_PREFS.image.sampleModel,
      disabled: Array.isArray(p.image.disabled) ? [...new Set(p.image.disabled.filter((id: unknown) => typeof id === 'string' && getImageModel(id)))] : [],
    },
  };
}
