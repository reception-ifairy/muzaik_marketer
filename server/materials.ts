import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import type { SettingsStore } from './store';
import type { ProviderService } from './providers';
import { structuredCall } from './research';
import { toHttpError } from './errors';
import { MATERIAL_SYSTEM, materialPrompt } from './prompts';
import { finalizeDraft, cleanCopy, selfCheck, type PlanContext } from './materialPlan';
import { getPreset, normalizeProfile, PLACEHOLDER_PROFILE, PROFILE_CONFLICTS, AESTHETIC_PRESETS, type ChannelProfile } from '../src/profile';
import { MuzaikData } from './muzaikData';
import { AudioError, AudioService, MAX_AUDIO_BYTES } from './audio';
import { probeDuration, renderProject, RenderError, drawThumbnail, composeScene, frameAt, coverStill } from './render';
import { synthesizeSpeech } from './voice';
import { chooseCut, endCardBars } from '../src/beat';
import { FLOW_MODELS, getFlowModel } from '../src/flow';
import { LEGACY_NAMES, type ParallaxScene, type TrackCard } from '../src/muzaik';
import {
  MATERIAL_KINDS, MaterialDraftSchema, summarize, type MaterialKind, type MaterialProject, type MaterialRequest, type MaterialSummary, type VideoFormat,
} from '../src/material';
import type { StreamEvent } from '../src/types';

// Studio materiałów (/api/materials): brief → music cut (code) → AI draft (one structuredCall) → finalizeDraft (code) →
// the owner uploads Flow clips per shot → render (ffmpeg, in the background, one at a time) → files to download / YouTube.
// Projects are docs `materials` (index) + `material_<id>`; files in data/materials/<id>/ (clips/, rendered mp4).

const INDEX = 'materials';
const PROFILE_DOC = 'channel_profile';
const MAX_PROJECTS = 200;
const MAX_CLIP_BYTES = 400 * 1024 * 1024;

type OpenStream = <T>(res: express.Response) => { send: (e: StreamEvent<T>) => void; signal: AbortSignal; end: () => void };

export class MaterialError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function videoKind(buf: Buffer): 'mp4' | 'mov' | 'webm' | null {
  if (buf.length < 12) return null;
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return buf.subarray(8, 10).toString('latin1') === 'qt' ? 'mov' : 'mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  return null;
}

const DJ_VOICE_STYLE = 'Przeczytaj po polsku jak nocny radiowy DJ: ciepło, pewnie, spokojnie, z lekkim uśmiechem i pauzą na końcu zdania:';

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(LEGACY_NAMES, 'MuzaIK').trim().slice(0, max) : '');

export class MaterialService {
  readonly dir: string;
  private lock: Promise<unknown> = Promise.resolve();
  private rendering: string | null = null;

  constructor(private readonly store: SettingsStore, private readonly providers: ProviderService, readonly muzaik: MuzaikData, readonly audio: AudioService, appDir: string) {
    this.dir = path.join(appDir, 'data', 'materials');
  }

  async profile(): Promise<ChannelProfile> {
    return normalizeProfile(await this.store.getDoc(PROFILE_DOC));
  }

  async saveProfile(raw: unknown): Promise<ChannelProfile> {
    if (!raw || typeof raw !== 'object') throw new MaterialError('To nie jest profil kanału (oczekiwany obiekt JSON).');
    const next = normalizeProfile({ ...(await this.profile()), ...(raw as Record<string, unknown>), updatedAt: new Date().toISOString() });
    await this.store.saveDoc(PROFILE_DOC, next);
    return next;
  }

  async resetProfile(): Promise<ChannelProfile> {
    await this.store.saveDoc(PROFILE_DOC, PLACEHOLDER_PROFILE);
    return PLACEHOLDER_PROFILE;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lock.then(fn, fn);
    this.lock = next.catch(() => undefined);
    return next;
  }

  private async ids(): Promise<string[]> {
    const doc = await this.store.getDoc(INDEX);
    return Array.isArray(doc.ids) ? (doc.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  }

  async get(id: string): Promise<MaterialProject | null> {
    if (!/^[a-f0-9-]{36}$/.test(id)) return null;
    const doc = (await this.store.getDoc(`material_${id}`)) as unknown as MaterialProject;
    if (!doc || doc.id !== id) return null;
    // Projects saved before the AI Studio additions (2026-11-08) get the new fields empty.
    doc.thumbnail ??= { prompt: '', overlayOptions: [], file: null, text: null };
    doc.checks ??= [];
    doc.copy.pinnedComment ??= '';
    doc.request.preset ??= null;
    doc.request.voiceover ??= false;
    for (const sh of doc.shots) { sh.camera ??= ''; sh.light ??= ''; sh.transition ??= ''; sh.overlayText ??= null; sh.voiceover ??= null; }
    // Only one render runs per process; a 'running' state that isn't ours is left over from a restart.
    if (doc.render.state === 'running' && this.rendering !== id) doc.render = { state: 'error', message: 'Render przerwany (restart aplikacji). Uruchom go jeszcze raz.', at: Date.now() };
    return doc;
  }

  private async save(p: MaterialProject) {
    p.updatedAt = Date.now();
    await this.store.saveDoc(`material_${p.id}`, p);
  }

  async list(): Promise<MaterialSummary[]> {
    const out: MaterialSummary[] = [];
    for (const id of await this.ids()) {
      const p = await this.get(id);
      if (p) out.push(summarize(p));
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  parseRequest(body: Record<string, unknown>): MaterialRequest {
    const kind = (typeof body.kind === 'string' && body.kind in MATERIAL_KINDS ? body.kind : 'zwiastun') as MaterialKind;
    const info = MATERIAL_KINDS[kind];
    const seconds = info.seconds.includes(Number(body.seconds)) ? Number(body.seconds) : info.defaultSeconds;
    const format: VideoFormat = body.format === '16:9' || body.format === '9:16' ? body.format : info.defaultFormat;
    const trackId = Number.isInteger(body.trackId) ? Number(body.trackId) : null;
    const sceneIds = Array.isArray(body.sceneIds) ? (body.sceneIds as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 4) : [];
    return {
      kind, seconds, format, alsoOther: body.alsoOther !== false, trackId, sceneIds,
      premiereId: Number.isInteger(body.premiereId) ? Number(body.premiereId) : null,
      articleSlug: typeof body.articleSlug === 'string' && body.articleSlug ? body.articleSlug.slice(0, 160) : null,
      topic: text(body.topic, 300), notes: text(body.notes, 1500),
      flowModel: FLOW_MODELS.some((m) => m.id === body.flowModel) ? String(body.flowModel) : getFlowModel(undefined).id,
      freeOnly: body.freeOnly === true,
      preset: typeof body.preset === 'string' && getPreset(body.preset) ? body.preset : null,
      voiceover: body.voiceover === true,
    };
  }

  /** Everything the plan needs, checked: covers are refused, a track is required where the kind needs one. */
  async context(request: MaterialRequest): Promise<PlanContext> {
    const ov = this.muzaik.overview();
    let track: TrackCard | null = null;
    if (request.trackId != null) {
      track = this.muzaik.track(request.trackId);
      if (!track) throw new MaterialError('Nie ma takiego utworu w kartach muzaik.channel.');
      if (track.cover) throw new MaterialError(`„${track.title}” to cover — do materiałów na YouTube idą tylko utwory autorskie (Content ID).`);
    }
    const premiere = request.premiereId != null ? this.muzaik.premiere(request.premiereId) : null;
    if (request.kind === 'premiera' && !premiere) throw new MaterialError('Wybierz premierę.');
    if (MATERIAL_KINDS[request.kind].needsTrack && !track) throw new MaterialError('Wybierz utwór — muzyka prowadzi montaż.');
    const article = request.articleSlug ? this.muzaik.article(request.articleSlug) : null;
    if (request.kind === 'magazyn' && !article) throw new MaterialError('Wybierz artykuł Magazynu.');
    const wanted = request.sceneIds.map((id) => this.muzaik.scene(id)).filter((s): s is ParallaxScene => s !== null);
    const scenes = wanted.length ? wanted : ov.scenes.filter((s) => s.onAir).slice(0, 1);
    const cut = track ? chooseCut(track, request.seconds, request.kind) : null;
    if (track && !cut) throw new MaterialError(`Karta „${track.title}” nie ma długości utworu — odśwież pomiar w muzaik.channel.`);
    const profile = await this.profile();
    const preset = getPreset(request.preset) ?? (request.kind === 'zwiastun' ? getPreset(profile.channelTeaserPreset) : null);
    return { request, cut, track, scenes, premiere, article, siteUrl: ov.brand.siteUrl, profile, preset };
  }

  async design(body: Record<string, unknown>, onStatus: (m: string) => void, signal?: AbortSignal): Promise<MaterialProject> {
    const request = this.parseRequest(body);
    const ctx = await this.context(request);
    const engine = await this.providers.resolveEngine();
    if ('error' in engine) throw new MaterialError(engine.error);
    const ov = this.muzaik.overview();
    const model = getFlowModel(request.flowModel);
    const info = MATERIAL_KINDS[request.kind];
    if (ctx.cut) onStatus(`Fragment utworu: ${ctx.cut.why}`);
    onStatus('DJ MuzaIK rozpisuje ujęcia…');

    const t = ctx.track;
    const prompt = materialPrompt({
      kindLabel: info.label, goal: info.goal, seconds: request.seconds, format: request.format,
      flowModel: { label: model.label, seconds: model.seconds, modes: model.modes, note: model.note }, freeOnly: request.freeOnly,
      cut: ctx.cut ? { bars: ctx.cut.bars, barSec: ctx.cut.barSec, dropAt: ctx.cut.dropAt, grid: ctx.cut.grid, endBars: endCardBars(ctx.cut.barSec) } : null,
      track: t ? [
        `Tytuł: ${t.title}`, t.genre && `Gatunek: ${t.genre}`, t.bpm && `Tempo: ${t.bpm} BPM (${t.tempo})`, t.sound && `Brzmienie: ${t.sound}`,
        t.instruments.length && `Instrumenty: ${t.instruments.join(', ')}`, t.moods.length && `Nastrój: ${t.moods.join(', ')}`,
        t.vocal && `Wokal: ${t.vocal}`, t.about && `O czym jest: ${t.about}`, t.style && `Styl (ang.): ${t.style}`,
        t.energy != null && `Energia: ${t.energy}/10`,
      ].filter(Boolean).join('\n') : null,
      scenes: ctx.scenes.length ? ctx.scenes.map((s) => [
        `id: ${s.id} · „${s.title}”${s.onAir ? ' (na wizji)' : ''}`,
        [s.hero && `bohater: ${s.hero}`, s.place && `miejsce: ${s.place}`, s.light && `światło: ${s.light}`, s.timeOfDay && `pora: ${s.timeOfDay}`, s.style && `styl: ${s.style}`].filter(Boolean).join('; '),
        s.moods.length ? `nastrój: ${s.moods.join(', ')}` : '', s.palette.length ? `paleta: ${s.palette.join(' ')}` : '',
        ...s.layers.map((l, i) => `warstwa ${i + 1} (głębia ${l.depth}): ${l.description}${l.prompt ? ` — prompt: ${l.prompt.slice(0, 500)}` : ''}`),
      ].filter(Boolean).join('\n')).join('\n\n') : null,
      premiere: ctx.premiere ? [`Tytuł: ${ctx.premiere.title}`, ctx.premiere.date && `Data premiery: ${ctx.premiere.date}`, ctx.premiere.description && `Opis: ${ctx.premiere.description}`, ctx.premiere.story && `Historia: ${ctx.premiere.story.slice(0, 1200)}`, ctx.premiere.cover ? 'Okładka: jest (visual = okladka).' : 'Okładki brak.'].filter(Boolean).join('\n') : null,
      article: ctx.article ? `Tytuł: ${ctx.article.title}\nDział: ${ctx.article.section}\nStreszczenie: ${ctx.article.summary}` : null,
      brand: `Tło ${ov.brand.colors.bg}, akcenty: cyan ${ov.brand.colors.cyan}, fiolet ${ov.brand.colors.purple}, róż ${ov.brand.colors.pink}. Kroje plansz: Audiowide (tytuły), Rajdhani.`,
      topic: request.topic, notes: request.notes,
      profile: [
        ctx.profile.placeholder ? 'UWAGA: dane wstępne z modułu AI Studio — traktuj jako kierunek, nie cytuj ich jako faktów.' : '',
        `Hasło marki: ${ctx.profile.slogan}`, `Idea: ${ctx.profile.concept}`,
        `Filary brzmienia: ${ctx.profile.pillars.map((p) => p.name).join(' · ')}; poboczne: ${ctx.profile.secondary.join(', ')}`,
        `Seria: ${ctx.profile.series.map((x) => `„${x.name}” (${x.format})`).join(', ')}`,
        `Maskotki ekipy (${ctx.profile.mascots.count}, ${ctx.profile.mascots.style}): ${ctx.profile.mascots.names.join(', ')} — mogą być cameo, przejściem albo na planszy końcowej.`,
        `Styl obrazu: ${ctx.profile.visualStyle}. Nigdy: ${ctx.profile.visualNever.join(', ')}.`,
        ctx.profile.museMotif,
        `Fiolet i magenta najwyżej jako akcent (≤ ${ctx.profile.purpleMaxPercent}% kadru) — szersza paleta: błękit nocny, turkus, szmaragd, bursztyn, czerwień neonowa, złoto, biel lodowa, koral.`,
        `Lektor DJ MuzaIK: ${ctx.profile.djVoice}.`,
        ctx.profile.descriptionVoice === 'dj'
          ? 'Opis na YouTube pisze DJ MuzaIK: o sobie w 1. osobie, o twórczyni i kanale w 3. osobie („Twórczyni MuzaIK przygotowała…”). Imienia twórczyni nie podawaj.'
          : 'Opis na YouTube pisze Twórczyni MuzaIK: 1. osoba, rodzaj żeński.',
      ].filter(Boolean).join('\n'),
      preset: ctx.preset ? [
        `${ctx.preset.name} — ${ctx.preset.subtitle}. ${ctx.preset.description}`,
        `Paleta HEX: ${ctx.preset.paletteHex.join(', ')}. Unikaj: ${ctx.preset.avoid.join(', ')}.`,
        `Światło: ${ctx.preset.lighting}. Faktura: ${ctx.preset.texture}.`,
      ].join('\n') : null,
      voiceover: request.voiceover,
    });
    const draft = await structuredCall(engine, MaterialDraftSchema, `${MATERIAL_SYSTEM}\n\n---\n\n${prompt}`, signal);
    if (!draft) throw new MaterialError('Model nie oddał poprawnego planu (albo odmówił). Spróbuj jeszcze raz albo zmień silnik w Ustawieniach.');
    onStatus('Sprawdzam plan: takty, długości klipów Flow, zasady kanału…');
    const fin = finalizeDraft(draft, ctx);

    const now = Date.now();
    const project: MaterialProject = {
      id: crypto.randomUUID(), createdAt: now, updatedAt: now, request, trackTitle: t?.title ?? null,
      concept: draft.concept.replace(LEGACY_NAMES, 'MuzaIK').slice(0, 1200), hook: draft.hook.replace(LEGACY_NAMES, 'MuzaIK').slice(0, 600),
      styleAnchor: fin.styleAnchor, cut: ctx.cut, shots: fin.shots, copy: fin.copy, thumbnail: fin.thumbnail, checks: [], fixes: fin.fixes,
      render: { state: 'none' }, published: [], model: `${engine.provider} · ${engine.model}`,
    };
    project.checks = selfCheck(project, ctx);
    await this.serial(async () => {
      await this.save(project);
      const ids = [project.id, ...(await this.ids())];
      for (const old of ids.slice(MAX_PROJECTS)) await this.removeFiles(old);
      await this.store.saveDoc(INDEX, { ids: ids.slice(0, MAX_PROJECTS) });
    });
    return project;
  }

  async update(id: string, body: Record<string, unknown>): Promise<MaterialProject> {
    return this.serial(async () => {
      const p = await this.need(id);
      const fixes: string[] = [];
      if (body.copy && typeof body.copy === 'object') {
        const c = body.copy as Record<string, unknown>;
        const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 40) : null);
        const draftCopy = {
          title: typeof c.title === 'string' ? c.title : p.copy.title,
          description: typeof c.description === 'string' ? stripFooter(c.description, p) : stripFooter(p.copy.description, p),
          tags: strArr(c.tags) ?? p.copy.tags,
          hashtags: strArr(c.hashtags) ?? p.copy.hashtags,
          pinnedComment: typeof c.pinnedComment === 'string' ? c.pinnedComment : p.copy.pinnedComment,
        };
        p.copy = cleanCopy(draftCopy, await this.contextFor(p), fixes);
      }
      if (Array.isArray(body.shots)) {
        for (const raw of body.shots as Record<string, unknown>[]) {
          const shot = p.shots.find((s) => s.id === raw?.id);
          if (!shot || shot.fixed) continue;
          if (typeof raw.flowPrompt === 'string' && shot.visual === 'flow') shot.flowPrompt = text(raw.flowPrompt, 2500);
          if (typeof raw.cardText === 'string' && shot.visual === 'plansza') shot.cardText = text(raw.cardText, 80).split(/\s+/).slice(0, 6).join(' ');
          if (typeof raw.note === 'string') shot.note = text(raw.note, 500);
          if (typeof raw.overlayText === 'string' && shot.visual !== 'plansza') shot.overlayText = text(raw.overlayText, 60).split(/\s+/).slice(0, 5).join(' ') || null;
          if (typeof raw.voiceover === 'string' && p.request.voiceover) shot.voiceover = text(raw.voiceover, 600) || null;
        }
      }
      if (fixes.length) p.fixes = [...p.fixes, ...fixes].slice(-30);
      if (p.render.state === 'done') p.render = { state: 'none' };
      await this.recheck(p);
      await this.save(p);
      return p;
    });
  }

  private async contextFor(p: MaterialProject): Promise<PlanContext> {
    const t = p.request.trackId != null ? this.muzaik.track(p.request.trackId) : null;
    return {
      request: p.request, cut: p.cut, track: t, scenes: [], premiere: p.request.premiereId != null ? this.muzaik.premiere(p.request.premiereId) : null,
      article: p.request.articleSlug ? this.muzaik.article(p.request.articleSlug) : null, siteUrl: this.muzaik.overview().brand.siteUrl,
      profile: await this.profile(), preset: getPreset(p.request.preset),
    };
  }

  /** Re-runs the channel checks after any change (copy, prompts, clips, thumbnail). */
  private async recheck(p: MaterialProject) {
    p.checks = selfCheck(p, await this.contextFor(p));
  }

  private async need(id: string): Promise<MaterialProject> {
    const p = await this.get(id);
    if (!p) throw new MaterialError('Nie ma takiego materiału.', 404);
    return p;
  }

  private projectDir(id: string) {
    return path.join(this.dir, id);
  }

  private async removeFiles(id: string) {
    if (/^[a-f0-9-]{36}$/.test(id)) fs.rmSync(this.projectDir(id), { recursive: true, force: true });
  }

  async remove(id: string) {
    await this.serial(async () => {
      if (this.rendering === id) throw new MaterialError('Ten materiał właśnie się renderuje — poczekaj na koniec.', 409);
      await this.removeFiles(id);
      await this.store.saveDoc(`material_${id}`, {});
      await this.store.saveDoc(INDEX, { ids: (await this.ids()).filter((x) => x !== id) });
    });
  }

  clipPath(p: MaterialProject, shotId: string): string | null {
    const shot = p.shots.find((s) => s.id === shotId);
    if (!shot?.clip) return null;
    const f = path.join(this.projectDir(p.id), 'clips', shot.clip);
    return fs.existsSync(f) ? f : null;
  }

  async saveClip(id: string, shotId: string, buf: Buffer): Promise<MaterialProject> {
    const kind = videoKind(buf);
    if (!kind) throw new MaterialError('To nie jest plik wideo (MP4, MOV albo WebM).');
    if (buf.length > MAX_CLIP_BYTES) throw new MaterialError('Klip jest większy niż 400 MB.');
    return this.serial(async () => {
      const p = await this.need(id);
      const shot = p.shots.find((s) => s.id === shotId);
      if (!shot || shot.visual !== 'flow') throw new MaterialError('To ujęcie nie potrzebuje klipu z Flow.');
      const dir = path.join(this.projectDir(id), 'clips');
      fs.mkdirSync(dir, { recursive: true });
      const name = `${shotId}-${Date.now()}.${kind}`;
      const file = path.join(dir, name);
      fs.writeFileSync(file, buf);
      const info = await probeDuration(file);
      if (!info) { fs.rmSync(file, { force: true }); throw new MaterialError('Nie umiem odczytać tego klipu (uszkodzony plik?).'); }
      if (shot.clip) fs.rmSync(path.join(dir, shot.clip), { force: true });
      shot.clip = name;
      await this.recheck(p);
      if (info.seconds + 0.05 < shot.seconds) p.fixes = [...p.fixes, `Klip ujęcia ${p.shots.indexOf(shot) + 1} ma ${info.seconds.toFixed(1)} s, a ujęcie ${shot.seconds.toFixed(1)} s — ostatnia klatka zostanie przytrzymana.`].slice(-30);
      if (p.render.state === 'done') p.render = { state: 'none' };
      await this.save(p);
      return p;
    });
  }

  async removeClip(id: string, shotId: string): Promise<MaterialProject> {
    return this.serial(async () => {
      const p = await this.need(id);
      const shot = p.shots.find((s) => s.id === shotId);
      if (shot?.clip) {
        fs.rmSync(path.join(this.projectDir(id), 'clips', shot.clip), { force: true });
        shot.clip = null;
        if (p.render.state === 'done') p.render = { state: 'none' };
        await this.recheck(p);
        await this.save(p);
      }
      return p;
    });
  }

  /** Starts the render in the background (one at a time); the client polls GET /:id. */
  async startRender(id: string): Promise<MaterialProject> {
    if (this.rendering) throw new MaterialError(this.rendering === id ? 'Ten materiał już się renderuje.' : 'Renderuje się inny materiał — poczekaj na koniec.', 409);
    const p = await this.need(id);
    this.rendering = id;
    p.render = { state: 'running', step: 'Przygotowuję…', startedAt: Date.now() };
    await this.save(p);
    void this.runRender(id).finally(() => { this.rendering = null; });
    return p;
  }

  private async runRender(id: string) {
    const setStep = async (step: string) => {
      await this.serial(async () => {
        const cur = await this.get(id);
        if (cur && cur.render.state === 'running') { cur.render = { ...cur.render, step }; await this.save(cur); }
      });
    };
    try {
      const p = await this.need(id);
      const ov = this.muzaik.overview(true);
      const trackFile = p.request.trackId != null ? await this.audio.trackFile(p.request.trackId) : null;
      const premiere = p.request.premiereId != null ? this.muzaik.premiere(p.request.premiereId) : null;
      const scenes = new Map(ov.scenes.map((s) => [s.id, s]));
      const dir = this.projectDir(id);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.mp4')) fs.rmSync(path.join(dir, f), { force: true });
      const voiceFiles = await this.voiceovers(p, setStep);
      let last = 0;
      const result = await renderProject({
        voiceFiles,
        project: p, brand: ov.brand, dir, trackFile, scenes, image: (url) => this.audio.publicImage(url),
        coverUrl: premiere?.cover || null, clipFile: (shot) => this.clipPath(p, shot.id),
        onStep: (step) => { if (Date.now() - last > 800) { last = Date.now(); void setStep(step); } },
      });
      await this.serial(async () => {
        const cur = await this.need(id);
        cur.render = { state: 'done', at: Date.now(), files: result.files, warnings: [...new Set(result.warnings)] };
        await this.save(cur);
      });
    } catch (err) {
      const message = err instanceof AudioError || err instanceof RenderError || err instanceof MaterialError ? err.message : `Render się nie udał: ${(err as Error).message}`;
      await this.serial(async () => {
        const cur = await this.get(id);
        if (cur) { cur.render = { state: 'error', message: message.slice(0, 800), at: Date.now() }; await this.save(cur); }
      });
    }
  }

  /** DJ MuzaIK lines → WAV (Gemini TTS, paid), cached per shot and text in the project folder. */
  private async voiceovers(p: MaterialProject, setStep: (s: string) => Promise<void>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const lines = p.request.voiceover ? p.shots.filter((s) => s.voiceover) : [];
    if (!lines.length) return out;
    const key = await this.providers.getKey('google');
    if (!key) throw new MaterialError('Lektor DJ MuzaIK potrzebuje klucza Google (Gemini) — dodaj go w Ustawieniach albo wyłącz lektora.');
    const prefs = await this.providers.getPrefs();
    const dir = path.join(this.projectDir(p.id), 'vo');
    fs.mkdirSync(dir, { recursive: true });
    for (const [i, shot] of lines.entries()) {
      const hash = crypto.createHash('sha256').update(`${prefs.voice.ttsModel}|${prefs.voice.voiceName}|${shot.voiceover}`).digest('hex').slice(0, 12);
      const file = path.join(dir, `${shot.id}-${hash}.wav`);
      if (!fs.existsSync(file)) {
        await setStep(`Lektor: kwestia ${i + 1} z ${lines.length}`);
        fs.writeFileSync(file, await synthesizeSpeech(key, prefs.voice.ttsModel, prefs.voice.voiceName, shot.voiceover!, undefined, DJ_VOICE_STYLE));
      }
      out.set(shot.id, file);
    }
    return out;
  }

  thumbnailFile(p: MaterialProject): string | null {
    if (!p.thumbnail?.file) return null;
    const f = path.join(this.projectDir(p.id), p.thumbnail.file);
    return fs.existsSync(f) ? f : null;
  }

  /** Free thumbnail: a frame of the film (at the refrain), the scene or the cover, plus a short title drawn by code. */
  async makeThumbnail(id: string, body: Record<string, unknown>): Promise<MaterialProject> {
    const p = await this.need(id);
    const textIn = text(body.text, 40).split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    if (!textIn) throw new MaterialError('Wpisz napis na miniaturę (najwyżej 3 słowa).');
    const source = body.source === 'scena' || body.source === 'okladka' ? body.source : 'film';
    const dir = this.projectDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `thumb-base-${Date.now()}.png`);
    try {
      if (source === 'film') {
        const f = p.render.state === 'done' ? p.render.files.find((x) => x.format === '16:9') : undefined;
        if (!f) throw new MaterialError('Najpierw zmontuj film w formacie 16:9 (albo wybierz scenę lub okładkę).');
        // A shot with a real picture (not a text card, not a missing Flow clip): the one under the refrain, else the longest.
        const pictured = p.shots.filter((sh) => sh.visual !== 'plansza' && !(sh.visual === 'flow' && !sh.clip));
        const drop = p.cut?.dropAt;
        const shot = pictured.find((sh) => drop != null && drop >= sh.at && drop < sh.at + sh.seconds) ?? [...pictured].sort((a, b) => b.seconds - a.seconds)[0];
        const at = shot ? shot.at + shot.seconds / 2 : f.seconds * 0.4;
        await frameAt(path.join(dir, f.name), at, tmp);
      } else if (source === 'scena') {
        const scene = this.muzaik.overview().scenes.find((sc) => p.request.sceneIds.includes(sc.id)) ?? this.muzaik.overview().scenes.find((sc) => sc.onAir);
        if (!scene?.layers.length) throw new MaterialError('Ten materiał nie ma sceny Parallax.');
        const files = [];
        for (const l of [...scene.layers].sort((a, b) => a.depth - b.depth)) files.push(await this.audio.publicImage(l.url));
        await composeScene(files, tmp);
      } else {
        const prem = p.request.premiereId != null ? this.muzaik.premiere(p.request.premiereId) : null;
        if (!prem?.cover) throw new MaterialError('Ten materiał nie ma okładki premiery.');
        await coverStill(await this.audio.publicImage(prem.cover), '16:9', tmp);
      }
      const jpg = await drawThumbnail(tmp, this.muzaik.overview().brand, textIn);
      const name = `miniatura-${Date.now()}.jpg`;
      return await this.serial(async () => {
        const cur = await this.need(id);
        if (cur.thumbnail.file) fs.rmSync(path.join(dir, cur.thumbnail.file), { force: true });
        fs.writeFileSync(path.join(dir, name), jpg);
        cur.thumbnail = { ...cur.thumbnail, file: name, text: textIn };
        await this.recheck(cur);
        await this.save(cur);
        return cur;
      });
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  renderedFile(p: MaterialProject, name: string): string | null {
    if (p.render.state !== 'done' || !p.render.files.some((f) => f.name === name)) return null;
    const f = path.join(this.projectDir(p.id), name);
    return fs.existsSync(f) ? f : null;
  }

  async markPublished(id: string, entry: MaterialProject['published'][number]) {
    await this.serial(async () => {
      const p = await this.need(id);
      p.published = [...p.published, entry];
      await this.save(p);
    });
  }
}

/** The footer and hashtags are re-added by cleanCopy; strip them from an edited description so they don't double. */
function stripFooter(desc: string, p: MaterialProject): string {
  const footerStart = desc.search(/\n\n(▶|🔔|📻|📖|🌐) /);
  return (footerStart >= 0 ? desc.slice(0, footerStart) : desc).replace(new RegExp(`\\n\\n${p.copy.hashtags.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ')}\\s*$`), '').trim();
}

/** Markdown pack for the owner: every Flow prompt in order, the cards and the copy. */
export function exportMarkdown(p: MaterialProject): string {
  const lines = [`# ${p.copy.title}`, '', `${MATERIAL_KINDS[p.request.kind].label} · ${p.request.format} · ${p.shots.reduce((a, s) => a + s.seconds, 0).toFixed(1)} s${p.trackTitle ? ` · utwór „${p.trackTitle}”` : ''}`, '', `**Pomysł:** ${p.concept}`, '', `**Hak:** ${p.hook}`, ''];
  if (p.cut) lines.push(`**Muzyka:** ${p.cut.why} Fragment ${p.cut.start.toFixed(2)}–${p.cut.end.toFixed(2)} s.`, '');
  lines.push(`Google Flow: ${getFlowModel(p.request.flowModel).label}`, '', '## Ujęcia', '');
  p.shots.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.at.toFixed(2)}–${(s.at + s.seconds).toFixed(2)} s · ${s.bars} takt.`, '', s.note, '');
    if (s.transition) lines.push(`Przejście: ${s.transition}`, '');
    if (s.visual === 'flow') lines.push(`Klip Flow: ${s.flowSeconds ?? '?'} s · tryb ${s.mode}${s.reference ? ` · obraz: ${s.reference}` : ''}`, '', '```', s.flowPrompt, '```', '');
    else lines.push(`Render programu: ${s.visual}${s.cardText ? ` — „${s.cardText.replace(/\n/g, ' / ')}”` : ''}`, '');
    if (s.overlayText) lines.push(`Napis na obrazie: „${s.overlayText}”`, '');
    if (s.voiceover) lines.push(`Lektor DJ MuzaIK: „${s.voiceover}”`, '');
  });
  if (p.thumbnail?.prompt) lines.push('## Miniatura', '', `Napisy do wyboru: ${p.thumbnail.overlayOptions.join(' · ')}`, '', '```', p.thumbnail.prompt, '```', '');
  lines.push('## YouTube', '', `**Tytuł:** ${p.copy.title}`, '', '**Opis:**', '', p.copy.description, '', `**Tagi:** ${p.copy.tags.join(', ')}`, '', `**Przypięty komentarz:** ${p.copy.pinnedComment}`, '');
  if (p.checks?.length) lines.push('## Kontrola zasad', '', ...p.checks.map((c) => `- ${c.ok ? '✅' : c.level === 'error' ? '❌' : '⚠️'} ${c.label} — ${c.detail}`), '');
  return lines.join('\n');
}

export function createMaterialsRouter(svc: MaterialService, openEventStream: OpenStream): express.Router {
  const router = express.Router();
  const fail = (res: express.Response, err: unknown) => {
    if (err instanceof MaterialError) return res.status(err.status).json({ error: err.message });
    if (err instanceof AudioError) return res.status(400).json({ error: err.message });
    const e = toHttpError(err);
    return res.status(e.status === 401 ? 400 : e.status).json({ error: e.message });
  };

  router.get('/', async (_req, res) => {
    try { res.json({ materials: await svc.list(), rendering: null }); } catch (err) { fail(res, err); }
  });

  router.post('/design', async (req, res) => {
    let request: MaterialRequest;
    try {
      request = svc.parseRequest(req.body ?? {});
      await svc.context(request);
    } catch (err) {
      return fail(res, err);
    }
    const stream = openEventStream<MaterialProject>(res);
    try {
      const project = await svc.design(req.body ?? {}, (message) => stream.send({ type: 'status', message }), stream.signal);
      stream.send({ type: 'result', data: project });
    } catch (err) {
      const message = err instanceof MaterialError ? err.message : toHttpError(err).message;
      stream.send({ type: 'error', message });
    } finally {
      stream.end();
    }
  });

  router.get('/:id', async (req, res) => {
    const p = await svc.get(req.params.id).catch(() => null);
    if (!p) return res.status(404).json({ error: 'Nie ma takiego materiału.' });
    res.json({ material: p });
  });

  router.patch('/:id', async (req, res) => {
    try { res.json({ material: await svc.update(req.params.id, req.body ?? {}) }); } catch (err) { fail(res, err); }
  });

  router.delete('/:id', async (req, res) => {
    try { await svc.remove(req.params.id); res.json({ ok: true }); } catch (err) { fail(res, err); }
  });

  router.put('/:id/shots/:shot/clip', express.raw({ type: () => true, limit: MAX_CLIP_BYTES }), async (req, res) => {
    try { res.json({ material: await svc.saveClip(req.params.id, req.params.shot, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)) }); } catch (err) { fail(res, err); }
  });

  router.delete('/:id/shots/:shot/clip', async (req, res) => {
    try { res.json({ material: await svc.removeClip(req.params.id, req.params.shot) }); } catch (err) { fail(res, err); }
  });

  router.get('/:id/shots/:shot/clip', async (req, res) => {
    const p = await svc.get(req.params.id).catch(() => null);
    const f = p ? svc.clipPath(p, req.params.shot) : null;
    if (!f) return res.status(404).json({ error: 'Brak klipu.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(f);
  });

  router.post('/:id/render', async (req, res) => {
    try { res.json({ material: await svc.startRender(req.params.id) }); } catch (err) { fail(res, err); }
  });

  router.get('/:id/files/:name', async (req, res) => {
    const p = await svc.get(req.params.id).catch(() => null);
    const f = p ? svc.renderedFile(p, req.params.name) : null;
    if (!f) return res.status(404).json({ error: 'Nie ma takiego pliku.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.query.download === '1') res.attachment(req.params.name);
    res.sendFile(f);
  });

  router.post('/:id/thumbnail', async (req, res) => {
    try { res.json({ material: await svc.makeThumbnail(req.params.id, req.body ?? {}) }); } catch (err) { fail(res, err); }
  });

  router.get('/:id/thumbnail.jpg', async (req, res) => {
    const p = await svc.get(req.params.id).catch(() => null);
    const f = p ? svc.thumbnailFile(p) : null;
    if (!f) return res.status(404).json({ error: 'Brak miniatury.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.query.download === '1') res.attachment('miniatura.jpg');
    res.sendFile(f);
  });

  router.get('/:id/export.md', async (req, res) => {
    const p = await svc.get(req.params.id).catch(() => null);
    if (!p) return res.status(404).json({ error: 'Nie ma takiego materiału.' });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.attachment(`${p.id.slice(0, 8)}-flow.md`);
    res.send(exportMarkdown(p));
  });

  return router;
}

export function createMuzaikRouter(svc: MaterialService): express.Router {
  const router = express.Router();
  router.get('/', (req, res) => res.json(svc.muzaik.overview(req.query.refresh === '1')));
  router.get('/profile', async (_req, res) => res.json({ profile: await svc.profile(), conflicts: PROFILE_CONFLICTS, presets: AESTHETIC_PRESETS }));
  router.put('/profile', async (req, res) => {
    try { res.json({ profile: await svc.saveProfile(req.body?.profile ?? req.body), conflicts: PROFILE_CONFLICTS, presets: AESTHETIC_PRESETS }); } catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });
  router.post('/profile/reset', async (_req, res) => res.json({ profile: await svc.resetProfile(), conflicts: PROFILE_CONFLICTS, presets: AESTHETIC_PRESETS }));
  router.get('/azuracast', async (_req, res) => res.json(await svc.audio.azuraStatus()));
  router.put('/azuracast', async (req, res) => {
    try { res.json(await svc.audio.saveAzura(req.body ?? {})); } catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });
  router.get('/tracks/:id/audio', async (req, res) => res.json({ availability: await svc.audio.availability(Number(req.params.id)) }));
  router.put('/tracks/:id/audio', express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }), (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!svc.muzaik.track(id)) return res.status(404).json({ error: 'Nie ma takiego utworu.' });
      svc.audio.saveUpload(id, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
      res.json({ availability: 'own' });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });
  router.get('/image', async (req, res) => {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!/^\/media\/[\w./-]+\.(webp|png|jpe?g)$/i.test(url) || url.includes('..')) return res.status(400).json({ error: 'Zły adres obrazu.' });
    try {
      const f = await svc.audio.publicImage(url);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(f);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  });
  return router;
}
