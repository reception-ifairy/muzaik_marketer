import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import starterJson from '../src/data/starterOptions.json';
import {
  GROUP_ICONS, GROUP_TONES, OptionSetSchema, STARTER_SET_ID, missingSamples,
  type OptionGroup, type OptionItem, type OptionSet, type OptionsState, type SampleEstimate, type SampleRun,
} from '../src/options';
import { imagePrice, type ImageModelDef } from '../src/imageModels';
import type { StreamEvent } from '../src/types';
import type { SettingsStore } from './store';
import type { ProviderService } from './providers';
import { structuredCall } from './research';
import { generateImage } from './images/generate';
import { optionSetPrompt, samplePrompt } from './prompts';
import { ResearchError, toHttpError } from './errors';

// Option sets for the option window (src/components/options/OptionWindow.tsx). The starter set ships with the
// app (read-only); the owner can ask the text engine for a set built around the project, review it, save it,
// and then have the thumbnails made with the sample image model — a PAID step that is always estimated first
// and only runs when the client sends back the exact cost the owner confirmed.

const DOC = 'option_sets';
const SAMPLE_PX = 256;
const MAX_GROUPS = 9;
const MAX_PER_GROUP = 16;
const MAX_CONTEXT = 2000;
const SLUG = /^[a-z0-9_]{1,40}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const STARTER = OptionSetSchema.parse(starterJson);

// What the text engine fills in. Kept free of regex patterns (not every provider's structured outputs accept them);
// ids, tones and colours are cleaned up in sanitizeProposal.
const ProposalSchema = z.object({
  name: z.string().describe('Krótka polska nazwa zestawu'),
  motif: z.string().describe('Neutralny angielski temat wspólny dla wszystkich miniaturek'),
  groups: z.array(
    z.object({
      id: z.string().describe('Kod grupy: małe litery, cyfry, podkreślenia'),
      label: z.string(),
      description: z.string(),
      promptLabel: z.string().nullable(),
      kind: z.enum(['sample', 'palette']),
      tone: z.string(),
      icon: z.enum(GROUP_ICONS),
      options: z.array(
        z.object({
          code: z.string(),
          label: z.string(),
          description: z.string(),
          prompt: z.string(),
          colors: z.array(z.string()).nullable(),
        }),
      ),
    }),
  ),
});

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

function toSlug(raw: string, taken: Set<string>, fallback: string): string {
  let base = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  if (!base) base = fallback;
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}_${i}`;
  taken.add(slug);
  return slug;
}

/** Turns whatever the model returned into a valid, capped OptionSet (no samples yet). */
function sanitizeProposal(raw: z.infer<typeof ProposalSchema>, context: string, perGroup: number): OptionSet {
  const groupIds = new Set<string>();
  const tonesLeft: string[] = [...GROUP_TONES];
  let palettes = 0;
  const groups: OptionGroup[] = [];
  for (const g of raw.groups.slice(0, MAX_GROUPS)) {
    const isPalette = g.kind === 'palette' && palettes === 0;
    if (isPalette) palettes++;
    const codes = new Set<string>();
    const options: OptionItem[] = [];
    for (const o of g.options.slice(0, Math.min(perGroup, MAX_PER_GROUP))) {
      const colors = isPalette ? (o.colors ?? []).filter((c) => HEX.test(c)).slice(0, 5) : [];
      if (isPalette && colors.length < 2) continue;
      const prompt = clip(o.prompt, 200);
      if (!prompt) continue;
      options.push({
        code: toSlug(o.code || o.label, codes, `opcja_${options.length + 1}`),
        label: clip(o.label, 40) || prompt.slice(0, 40),
        description: clip(o.description, 200),
        prompt,
        colors: isPalette ? colors.map((c) => c.toUpperCase()) : null,
        sample: null,
      });
    }
    if (options.length < 2) continue;
    const tone = tonesLeft.includes(g.tone.toLowerCase()) ? g.tone.toLowerCase() : (tonesLeft[0] ?? GROUP_TONES[groups.length % GROUP_TONES.length]);
    tonesLeft.splice(tonesLeft.indexOf(tone), 1);
    groups.push({
      id: toSlug(g.id || g.label, groupIds, `grupa_${groups.length + 1}`),
      label: clip(g.label, 40),
      description: clip(g.description, 200),
      promptLabel: g.promptLabel ? clip(g.promptLabel, 40) : null,
      kind: isPalette ? 'palette' : 'sample',
      tone,
      icon: g.icon,
      options,
    });
  }
  if (!groups.length) throw new ResearchError('AI nie zaproponowało żadnej użytecznej grupy. Opisz projekt dokładniej i spróbuj ponownie.', 422);
  return {
    id: `s_${crypto.randomBytes(5).toString('hex')}`,
    name: clip(raw.name, 60) || 'Zestaw projektu',
    context: clip(context, MAX_CONTEXT),
    motif: clip(raw.motif, 160) || 'a simple still life on a table',
    source: 'ai',
    createdAt: new Date().toISOString(),
    groups,
  };
}

export class OptionService {
  private dir: string;
  private writes: Promise<unknown> = Promise.resolve();
  /** One thumbnail run per set at a time (a second click must not pay twice). */
  private running = new Set<string>();

  constructor(
    private store: SettingsStore,
    private providers: ProviderService,
    appDir: string,
  ) {
    this.dir = path.join(appDir, 'data', 'options');
  }

  async state(): Promise<OptionsState> {
    const doc = await this.store.getDoc(DOC);
    const sets = Array.isArray(doc.sets) ? doc.sets.map((s) => OptionSetSchema.safeParse(s)).flatMap((r) => (r.success && r.data.id !== STARTER_SET_ID ? [r.data] : [])) : [];
    const all = [STARTER, ...sets];
    const activeId = typeof doc.activeId === 'string' && all.some((s) => s.id === doc.activeId) ? doc.activeId : STARTER_SET_ID;
    return { activeId, sets: all };
  }

  async getSet(id: string): Promise<OptionSet | null> {
    return (await this.state()).sets.find((s) => s.id === id) ?? null;
  }

  /** Serialised read-modify-write of the stored document. */
  private update(fn: (state: OptionsState) => OptionsState): Promise<OptionsState> {
    const next = this.writes.then(async () => {
      const result = fn(await this.state());
      await this.store.saveDoc(DOC, { activeId: result.activeId, sets: result.sets.filter((s) => s.id !== STARTER_SET_ID) });
      return result;
    });
    this.writes = next.catch(() => undefined);
    return next;
  }

  setActive(id: string): Promise<OptionsState> {
    return this.update((s) => {
      if (!s.sets.some((x) => x.id === id)) throw new ResearchError('Nie ma takiego zestawu.', 404);
      return { ...s, activeId: id };
    });
  }

  /** Asks the selected text engine for a set that fits the project. Not saved — the owner reviews it first. */
  async propose(context: string, groupCount: number, perGroup: number, signal?: AbortSignal): Promise<OptionSet> {
    const engine = await this.providers.resolveEngine();
    if ('error' in engine) throw new ResearchError(engine.error, 400);
    const prompt = optionSetPrompt(context, groupCount, perGroup, GROUP_TONES, GROUP_ICONS);
    try {
      const raw = await structuredCall(engine, ProposalSchema, prompt, signal);
      if (!raw) throw new ResearchError('AI nie zwróciło poprawnego zestawu. Spróbuj ponownie.', 502);
      return sanitizeProposal(raw, context, perGroup);
    } catch (err) {
      if (err instanceof ResearchError) throw err;
      const { status, message } = toHttpError(err, engine.provider);
      throw new ResearchError(message, status);
    }
  }

  /**
   * Saves a reviewed (possibly edited) set. Sample URLs are never taken from the client: a thumbnail is kept
   * only when its file already exists on disk for the same set/group/option.
   */
  async save(input: unknown): Promise<OptionsState> {
    const parsed = OptionSetSchema.safeParse(input);
    if (!parsed.success) throw new ResearchError('Zestaw ma nieprawidłowy format.', 400);
    const set = parsed.data;
    if (set.id === STARTER_SET_ID || !SLUG.test(set.id)) throw new ResearchError('Zestawu startowego nie można zmieniać.', 400);
    const groupIds = new Set<string>();
    for (const g of set.groups) {
      const codes = new Set(g.options.map((o) => o.code));
      if (groupIds.has(g.id) || codes.size !== g.options.length) throw new ResearchError('Kody grup i opcji muszą być unikalne.', 400);
      groupIds.add(g.id);
      if (g.options.length > MAX_PER_GROUP) throw new ResearchError(`Grupa może mieć najwyżej ${MAX_PER_GROUP} opcji.`, 400);
    }
    if (!set.groups.length || set.groups.length > MAX_GROUPS) throw new ResearchError(`Zestaw musi mieć od 1 do ${MAX_GROUPS} grup.`, 400);

    const clean: OptionSet = {
      ...set,
      name: clip(set.name, 60),
      context: clip(set.context, MAX_CONTEXT),
      motif: clip(set.motif, 160),
      source: 'ai',
      groups: set.groups.map((g) => ({
        ...g,
        kind: g.kind === 'palette' ? 'palette' : 'sample',
        tone: HEX.test(g.tone) ? g.tone : GROUP_TONES[0],
        options: g.options.map((o) => ({
          ...o,
          label: clip(o.label, 40),
          description: clip(o.description, 200),
          prompt: clip(o.prompt, 200),
          colors: g.kind === 'palette' ? (o.colors ?? []).filter((c) => HEX.test(c)).slice(0, 5) : null,
          sample: g.kind === 'sample' ? this.existingSample(set.id, g.id, o.code) : null,
        })),
      })),
    };
    return this.update((s) => {
      const others = s.sets.filter((x) => x.id !== clean.id);
      return { activeId: clean.id, sets: [...others, clean] };
    });
  }

  async remove(id: string): Promise<OptionsState> {
    if (id === STARTER_SET_ID) throw new ResearchError('Zestawu startowego nie można usunąć.', 400);
    if (!SLUG.test(id)) throw new ResearchError('Nie ma takiego zestawu.', 404);
    const state = await this.update((s) => ({
      activeId: s.activeId === id ? STARTER_SET_ID : s.activeId,
      sets: s.sets.filter((x) => x.id !== id),
    }));
    fs.rmSync(path.join(this.dir, id), { recursive: true, force: true });
    return state;
  }

  private file(setId: string, group: string, code: string): string {
    return path.join(this.dir, setId, group, `${code}.webp`);
  }

  private existingSample(setId: string, group: string, code: string): string | null {
    const file = this.file(setId, group, code);
    if (!fs.existsSync(file)) return null;
    return `/api/options/samples/${setId}/${group}/${code}.webp?v=${Math.round(fs.statSync(file).mtimeMs).toString(36)}`;
  }

  /** Thumbnails that would be made (missing ones, or exactly `only`) and what they cost with the sample model. */
  async estimate(setId: string, only?: { group: string; code: string }[]): Promise<{ estimate: SampleEstimate; jobs: { group: OptionGroup; option: OptionItem }[]; model: ImageModelDef | null; apiKey: string | null }> {
    const set = await this.getSet(setId);
    if (!set) throw new ResearchError('Nie ma takiego zestawu.', 404);
    const jobs = only?.length
      ? set.groups.filter((g) => g.kind === 'sample').flatMap((group) => group.options.filter((o) => only.some((x) => x.group === group.id && x.code === o.code)).map((option) => ({ group, option })))
      : missingSamples(set);
    const prefs = await this.providers.getPrefs();
    const resolved = await this.providers.resolveImageModel(prefs.image.sampleModel);
    const model = 'error' in resolved ? null : resolved.model;
    // Thumbnails are small: tier-priced models run at their cheapest tier.
    const priceEach = model ? imagePrice(model, model.sizing.kind === 'tier' ? model.sizing.tiers[0] : undefined) : 0;
    let blocker = 'error' in resolved ? resolved.error : null;
    if (set.id === STARTER_SET_ID) blocker = 'Zestaw startowy ma gotowe miniaturki i nie można go zmieniać.';
    else if (!jobs.length) blocker = 'Wszystkie miniaturki są już gotowe.';
    return {
      estimate: {
        setId,
        count: jobs.length,
        priceEach,
        totalUsd: Math.round(priceEach * jobs.length * 10000) / 10000,
        model: model ? { id: model.id, label: model.label } : null,
        blocker,
      },
      jobs,
      model,
      apiKey: 'error' in resolved ? null : resolved.apiKey,
    };
  }

  /**
   * Makes the thumbnails one by one. `confirmedUsd` must equal the estimate the owner accepted — if the set,
   * the model or its price changed in between, nothing is generated and the owner sees the new cost.
   */
  async makeSamples(
    setId: string,
    confirmedUsd: number,
    only: { group: string; code: string }[] | undefined,
    onEvent: (e: StreamEvent<SampleRun>) => void,
    signal: AbortSignal,
  ): Promise<SampleRun> {
    if (this.running.has(setId)) throw new ResearchError('Miniaturki tego zestawu już się tworzą.', 409);
    const { estimate, jobs, model, apiKey } = await this.estimate(setId, only);
    if (estimate.blocker) throw new ResearchError(estimate.blocker, 400);
    if (!model || !apiKey) throw new ResearchError('Brak modelu próbek.', 400);
    if (!(Math.abs(estimate.totalUsd - confirmedUsd) < 0.00005)) {
      throw new ResearchError('Koszt zmienił się od potwierdzenia (inny model albo inne opcje). Sprawdź koszt jeszcze raz.', 409);
    }
    const set = (await this.getSet(setId))!;
    const tier = model.sizing.kind === 'tier' ? model.sizing.tiers[0] : undefined;

    this.running.add(setId);
    let made = 0;
    let failed = 0;
    let spentUsd = 0;
    try {
      onEvent({ type: 'status', message: `Tworzę ${jobs.length} miniaturek modelem ${model.label}…` });
      for (const [i, { group, option }] of jobs.entries()) {
        if (signal.aborted) break;
        let url: string | null = null;
        let error: string | null = null;
        try {
          const image = await generateImage({ model, apiKey, prompt: samplePrompt(set.motif, group.promptLabel, option.prompt), aspect: '1:1', tier, signal });
          spentUsd += image.costUsd;
          const webp = await sharp(image.data).resize(SAMPLE_PX, SAMPLE_PX, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
          const file = this.file(setId, group.id, option.code);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, webp);
          url = this.existingSample(setId, group.id, option.code);
          made++;
          await this.update((s) => ({
            ...s,
            sets: s.sets.map((x) =>
              x.id !== setId ? x : { ...x, groups: x.groups.map((g) => (g.id !== group.id ? g : { ...g, options: g.options.map((o) => (o.code === option.code ? { ...o, sample: url } : o)) })) },
            ),
          }));
        } catch (err) {
          if (signal.aborted) break;
          failed++;
          error = toHttpError(err, model.provider).message;
          console.error(`Sample ${group.id}/${option.code} failed:`, err);
          // A key or billing problem will fail every remaining picture the same way — stop instead of retrying.
          const status = toHttpError(err, model.provider).status;
          if ([400, 401, 402, 403, 404, 429].includes(status)) {
            onEvent({ type: 'sample', group: group.id, code: option.code, url, error, done: i + 1, total: jobs.length, spentUsd: Math.round(spentUsd * 10000) / 10000 });
            break;
          }
        }
        onEvent({ type: 'sample', group: group.id, code: option.code, url, error, done: i + 1, total: jobs.length, spentUsd: Math.round(spentUsd * 10000) / 10000 });
      }
    } finally {
      this.running.delete(setId);
    }
    return { set: (await this.getSet(setId)) ?? set, made, failed, spentUsd: Math.round(spentUsd * 10000) / 10000 };
  }

  /** Path of a stored thumbnail, or null when the request doesn't name one. */
  sampleFile(setId: string, group: string, file: string): string | null {
    const m = /^([a-z0-9_]{1,40})\.webp$/.exec(file);
    if (!m || !SLUG.test(setId) || !SLUG.test(group)) return null;
    const full = this.file(setId, group, m[1]);
    return fs.existsSync(full) ? full : null;
  }
}

function parseOnly(raw: unknown): { group: string; code: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.flatMap((x) => (x && typeof x.group === 'string' && typeof x.code === 'string' && SLUG.test(x.group) && SLUG.test(x.code) ? [{ group: x.group, code: x.code }] : []));
  return items.length ? items.slice(0, MAX_GROUPS * MAX_PER_GROUP) : undefined;
}

/** /api/options — option sets, AI proposals and paid thumbnail generation (SSE). */
export function createOptionsRouter(service: OptionService, openEventStream: <T>(res: express.Response) => { send: (e: StreamEvent<T>) => void; signal: AbortSignal; end: () => void }): express.Router {
  const router = express.Router();

  const fail = (res: express.Response, err: unknown) => {
    const { status, message } = toHttpError(err);
    if (status >= 500) console.error('Options error:', err);
    res.status(status >= 400 && status < 600 && status !== 401 ? status : 500).json({ error: message });
  };
  const handle = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) => (req: express.Request, res: express.Response) => {
    fn(req, res).then((data) => res.json(data), (err) => fail(res, err));
  };
  const abortOnClose = (res: express.Response) => {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    return controller.signal;
  };

  router.get('/', handle(() => service.state()));
  router.put('/active', handle((req) => service.setActive(String(req.body?.id ?? ''))));
  router.post('/sets', express.json({ limit: '256kb' }), handle((req) => service.save(req.body?.set)));
  router.delete('/sets/:id', handle((req) => service.remove(req.params.id)));

  router.post(
    '/propose',
    handle(async (req, res) => {
      const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, MAX_CONTEXT) : '';
      if (context.length < 10) throw new ResearchError('Opisz projekt w kilku zdaniach, żeby AI mogło dobrać opcje.', 400);
      const groupCount = Math.min(MAX_GROUPS, Math.max(2, Number(req.body?.groupCount) || 6));
      const perGroup = Math.min(MAX_PER_GROUP, Math.max(4, Number(req.body?.perGroup) || 8));
      return { set: await service.propose(context, groupCount, perGroup, abortOnClose(res)) };
    }),
  );

  router.post('/sets/:id/estimate', handle(async (req) => (await service.estimate(req.params.id, parseOnly(req.body?.only))).estimate));

  router.post('/sets/:id/samples', async (req, res) => {
    const confirmedUsd = Number(req.body?.confirmedUsd);
    if (!Number.isFinite(confirmedUsd) || confirmedUsd < 0) return res.status(400).json({ error: 'Najpierw sprawdź i potwierdź koszt.' });
    const stream = openEventStream<SampleRun>(res);
    try {
      const run = await service.makeSamples(req.params.id, confirmedUsd, parseOnly(req.body?.only), stream.send, stream.signal);
      stream.send({ type: 'result', data: run });
    } catch (err) {
      stream.send({ type: 'error', message: toHttpError(err).message });
    } finally {
      stream.end();
    }
  });

  router.get('/samples/:set/:group/:file', (req, res) => {
    const file = service.sampleFile(req.params.set, req.params.group, req.params.file);
    if (!file) return res.status(404).end();
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.sendFile(file);
  });

  return router;
}
