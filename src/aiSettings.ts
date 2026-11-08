// AI provider settings shared by the server (storage, routing) and the client (Settings UI).

import type { Effort } from './config';
import { DEFAULT_IMAGE_MODEL, DEFAULT_SAMPLE_MODEL } from './imageModels';

/** Text engines (search, research, chat). */
export type Provider = 'anthropic' | 'openai' | 'google';

export const PROVIDER_IDS: Provider[] = ['anthropic', 'openai', 'google'];

/** Everything that can hold an API key: the text engines plus image-only providers. */
export type KeyProvider = Provider | 'replicate' | 'stability';

export const KEY_PROVIDER_IDS: KeyProvider[] = ['anthropic', 'openai', 'google', 'replicate', 'stability'];

export const PROVIDER_INFO: Record<KeyProvider, { label: string; company: string; keyPlaceholder: string; keyUrl: string; engineNote: string }> = {
  anthropic: {
    label: 'Claude',
    company: 'Anthropic',
    keyPlaceholder: 'sk-ant-…',
    keyUrl: 'console.anthropic.com → API Keys',
    engineNote: 'Najdokładniejsza analiza: sam wyszukuje, otwiera strony i sprawdza fakty. Wolniejszy i droższy.',
  },
  openai: {
    label: 'GPT',
    company: 'OpenAI',
    keyPlaceholder: 'sk-…',
    keyUrl: 'platform.openai.com → API keys',
    engineNote: 'Szybkie wyszukiwanie w sieci z cytowaniem źródeł; dobra alternatywa do porównania wyników.',
  },
  google: {
    label: 'Gemini',
    company: 'Google',
    keyPlaceholder: 'AIza…',
    keyUrl: 'aistudio.google.com → Get API key',
    engineNote: 'Wyszukiwarka Google + czytanie stron; szybki i tani. Ten klucz obsługuje też głos i nagrania.',
  },
  replicate: {
    label: 'FLUX',
    company: 'Replicate',
    keyPlaceholder: 'r8_…',
    keyUrl: 'replicate.com → Account settings → API tokens',
    engineNote: 'Tylko obrazy: FLUX (Schnell, 1.1 Pro, Ultra, 2 Pro, 3).',
  },
  stability: {
    label: 'Stable Image',
    company: 'Stability AI',
    keyPlaceholder: 'sk-…',
    keyUrl: 'platform.stability.ai → Account → API keys',
    engineNote: 'Tylko obrazy: SD3.5 i Stable Image Core / Ultra.',
  },
};

export interface ModelInfo {
  id: string;
  label: string;
  /** image = an image model the key can reach (matched against src/imageModels.ts). */
  kind: 'text' | 'tts' | 'image';
}

export type KeyStatus = 'untested' | 'ok' | 'error';

export interface ProviderStatus {
  configured: boolean;
  /** db = saved in Settings, env = ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY on the server. */
  source: 'db' | 'env' | null;
  hint: string | null;
  status: KeyStatus;
  message: string | null;
  testedAt: string | null;
  models: ModelInfo[];
}

export interface AiPrefs {
  engine: { provider: Provider; models: Record<Provider, string> };
  effort: Effort;
  voice: { voiceName: string; ttsModel: string; autoRead: boolean };
  stt: { model: string };
  /** Image models: catalogue ids from src/imageModels.ts. Detected models are on unless listed in `disabled`. */
  image: { defaultModel: string; sampleModel: string; disabled: string[] };
}

export interface AiSettings {
  providers: Record<KeyProvider, ProviderStatus>;
  prefs: AiPrefs;
  storage: 'mysql' | 'file';
}

export const DEFAULT_PREFS: AiPrefs = {
  engine: {
    provider: 'anthropic',
    models: { anthropic: 'claude-opus-5-5', openai: 'gpt-6.1-sol', google: 'gemini-3.8-flash' },
  },
  effort: 'medium',
  voice: { voiceName: 'Charon', ttsModel: 'gemini-3.8-flash-tts', autoRead: false },
  stt: { model: 'gemini-3.8-flash' },
  image: { defaultModel: DEFAULT_IMAGE_MODEL, sampleModel: DEFAULT_SAMPLE_MODEL, disabled: [] },
};

// Gemini TTS prebuilt voices with a lower, male timbre. Descriptions follow Google's voice list.
export const MALE_VOICES: { id: string; label: string }[] = [
  { id: 'Charon', label: 'Charon — rzeczowy, niski (domyślny)' },
  { id: 'Algenib', label: 'Algenib — chropawy, dojrzały' },
  { id: 'Orus', label: 'Orus — stanowczy' },
  { id: 'Rasalgethi', label: 'Rasalgethi — spokojny, informacyjny' },
  { id: 'Schedar', label: 'Schedar — równy, opanowany' },
  { id: 'Sadaltager', label: 'Sadaltager — jak doświadczony znawca' },
  { id: 'Alnilam', label: 'Alnilam — pewny, stanowczy' },
  { id: 'Iapetus', label: 'Iapetus — wyraźny' },
  { id: 'Algieba', label: 'Algieba — gładki, ciepły' },
  { id: 'Enceladus', label: 'Enceladus — miękki, z oddechem' },
];

/** Result of a recorded voice message after Gemini listened to it. */
export interface VoiceQuery {
  transcript: string;
  /** The request in one sentence, ready for a search field or chat. */
  query: string;
}
