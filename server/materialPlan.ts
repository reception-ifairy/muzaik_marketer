import crypto from 'crypto';
import { endCardBars, fitBars } from '../src/beat';
import { flowClipFor, getFlowModel, maxFlowClip, withVideoRules, type FlowMode } from '../src/flow';
import { MATERIAL_KINDS, type MaterialCopy, type MaterialDraft, type MaterialRequest, type MusicCut, type Shot, type ShotDraft } from '../src/material';
import { LEGACY_NAMES, type Article, type ParallaxScene, type Premiere, type TrackCard } from '../src/muzaik';

// Hard limits after the model (never trusted for them): the bar grid, Flow clip lengths and modes, which pictures exist,
// the closing card (written by code), the copy rules of the channel. Pure — tested in test/material.test.ts.

export interface PlanContext {
  request: MaterialRequest;
  cut: MusicCut | null;
  track: TrackCard | null;
  scenes: ParallaxScene[];
  premiere: Premiere | null;
  article: Article | null;
  siteUrl: string;
}

const NO_GRID_UNIT = 2;
const clean = (s: string) => s.replace(LEGACY_NAMES, 'MuzaIK').replace(/\s+/g, ' ').trim();
const words = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(' ');
const shotId = () => crypto.randomUUID().slice(0, 8);

/** The closing card: written by code, so the call to action and the address are always right. */
export function endCardText(ctx: PlanContext): string {
  const k = ctx.request.kind;
  if (k === 'premiera' && ctx.premiere) return `${ctx.premiere.date ? `Premiera ${polishDate(ctx.premiere.date)}` : 'Premiera'}\n${ctx.premiere.title}`;
  if (k === 'radio') return 'Radio MuzaIK 24/7\nmuzaik.channel/radio';
  if (k === 'magazyn') return 'Magazyn MuzaIK\nmuzaik.channel/magazyn';
  return `${MATERIAL_KINDS[k].endCard}\nmuzaik.channel`;
}

export function polishDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim();
}

export function finalizeDraft(draft: MaterialDraft, ctx: PlanContext): { shots: Shot[]; copy: MaterialCopy; styleAnchor: string; fixes: string[] } {
  const fixes: string[] = [];
  const { request } = ctx;
  const model = getFlowModel(request.flowModel);
  const unit = ctx.cut?.barSec ?? NO_GRID_UNIT;
  const totalBars = ctx.cut?.bars ?? Math.max(2, Math.round(request.seconds / NO_GRID_UNIT));
  const endBars = Math.min(endCardBars(unit), Math.max(1, totalBars - 1));
  const sceneIds = new Set(ctx.scenes.map((s) => s.id));
  const firstScene = request.sceneIds.find((id) => sceneIds.has(id)) ?? ctx.scenes[0]?.id ?? null;
  const styleAnchor = clean(draft.styleAnchor).slice(0, 400);

  let drafts: ShotDraft[] = draft.shots.slice(0, 40);
  // The closing card is ours: drop the model's own trailing cards.
  while (drafts.length > 1 && drafts[drafts.length - 1].visual === 'plansza' && drafts[drafts.length - 1].role === 'outro') {
    drafts = drafts.slice(0, -1);
    fixes.push('Plansza końcowa modelu zastąpiona planszą programu (zawsze z adresem muzaik.channel).');
  }
  if (!drafts.length) throw new Error('Model nie zaproponował żadnego ujęcia.');

  drafts = drafts.map((s, i) => {
    const n = i + 1;
    let visual = s.visual;
    let sceneId: string | null = s.sceneId && sceneIds.has(s.sceneId) ? s.sceneId : null;
    if (request.freeOnly && visual === 'flow') {
      visual = firstScene ? 'parallax' : 'plansza';
      fixes.push(`Ujęcie ${n}: wybrano „tylko bez kosztu”, więc zamiast klipu z Flow ${visual === 'parallax' ? 'scena Parallax' : 'plansza'}.`);
    }
    if (visual === 'parallax' && !sceneId) {
      if (firstScene) {
        sceneId = firstScene;
        if (s.sceneId) fixes.push(`Ujęcie ${n}: nieznana scena „${s.sceneId}” — użyta scena z briefu.`);
      }
      else {
        visual = request.freeOnly ? 'plansza' : 'flow';
        fixes.push(`Ujęcie ${n}: nie ma sceny Parallax — zamiast niej ${visual === 'flow' ? 'klip z Flow' : 'plansza'}.`);
      }
    }
    if (visual === 'okladka' && !ctx.premiere?.cover) {
      visual = 'plansza';
      fixes.push(`Ujęcie ${n}: brak okładki premiery — zamiast niej plansza.`);
    }
    let mode: FlowMode = s.mode;
    let reference = s.reference ? clean(s.reference).slice(0, 200) : null;
    if (visual === 'flow') {
      if (!model.modes.includes(mode)) {
        mode = model.modes.includes('frames') ? 'frames' : 'text';
        fixes.push(`Ujęcie ${n}: ${model.label} nie ma trybu ${s.mode} — tryb ${mode}.`);
      }
      if (mode !== 'text' && !reference) {
        mode = 'text';
        fixes.push(`Ujęcie ${n}: tryb z obrazem bez wskazanego obrazu — zmieniony na tekst → wideo.`);
      }
      if (mode === 'text') reference = null;
    } else reference = null;
    let prompt = visual === 'flow' ? clean(s.prompt).slice(0, 1500) : '';
    if (visual === 'flow' && !prompt) {
      visual = firstScene ? 'parallax' : 'plansza';
      sceneId = firstScene;
      fixes.push(`Ujęcie ${n}: model nie napisał promptu — zamiast klipu ${visual === 'parallax' ? 'scena Parallax' : 'plansza'}.`);
      prompt = '';
    }
    let cardText = visual === 'plansza' ? words(clean(s.cardText ?? ''), 6) : null;
    if (visual === 'plansza' && !cardText) cardText = ctx.track?.title ?? ctx.premiere?.title ?? 'MuzaIK';
    return { ...s, visual, sceneId, mode, reference, prompt, cardText, note: clean(s.note).slice(0, 500) };
  });

  const fitted = fitBars(drafts.map((s) => s.bars), Math.max(1, totalBars - endBars));
  if (fitted.changed) fixes.push(`Długości ujęć dopasowane do ${totalBars - endBars} taktów muzyki (plus ${endBars} na planszę końcową).`);
  drafts = drafts.slice(0, fitted.bars.length).map((s, i) => ({ ...s, bars: fitted.bars[i] }));

  // A Flow shot longer than the longest clip is split into parts (same prompt, continued).
  const split: ShotDraft[] = [];
  for (const s of drafts) {
    const max = s.visual === 'flow' ? maxFlowClip(model, s.mode) : Infinity;
    if (s.visual !== 'flow' || s.bars * unit <= max + 1e-6) { split.push(s); continue; }
    const perPart = Math.max(1, Math.floor(max / unit));
    let left = s.bars;
    let part = 1;
    while (left > 0) {
      const b = Math.min(perPart, left);
      split.push({ ...s, bars: b, prompt: part === 1 ? s.prompt : `${s.prompt} (continuation, part ${part}: same scene, the camera keeps moving)` });
      left -= b;
      part++;
    }
    fixes.push(`Ujęcie „${words(s.note, 5)}…” dłuższe niż najdłuższy klip ${model.label} (${max} s) — podzielone na ${part - 1} części.`);
  }
  split.push({
    bars: endBars, role: 'outro', visual: 'plansza', prompt: '', mode: 'text', reference: null, sceneId: null,
    cardText: endCardText(ctx), note: 'Plansza końcowa — tekst i adres pisze program.',
  });

  let at = 0;
  const shots: Shot[] = split.map((s, i) => {
    const seconds = Math.round(s.bars * unit * 1000) / 1000;
    const flowSeconds = s.visual === 'flow' ? flowClipFor(model, seconds, s.mode) : null;
    const shot: Shot = {
      ...s, id: shotId(), at: Math.round(at * 1000) / 1000, seconds, flowSeconds, clip: null, fixed: i === split.length - 1,
      flowPrompt: s.visual === 'flow' ? withVideoRules(`${s.prompt} ${styleAnchor} Framing: ${request.format === '9:16' ? '9:16 portrait' : '16:9 landscape'}.`.replace(/\s+/g, ' ')) : '',
    };
    at += seconds;
    return shot;
  });

  return { shots, copy: cleanCopy(draft.copy, ctx, fixes), styleAnchor, fixes };
}

const ALLOWED_HOST = /^(?:[a-z0-9-]+\.)*muzaik\.channel$/i;

/** Channel copy rules: legacy names, e-mails, foreign links, standalone „MuzaIK” in the title, tag/hashtag limits, footer by code. */
export function cleanCopy(copy: MaterialCopy, ctx: PlanContext, fixes: string[]): MaterialCopy {
  let title = clean(copy.title).replace(/[<>]/g, '');
  const bare = /(^|[\s|·–—-]+)MuzaIK(?=$|[\s|·–—:-]+)/g;
  if (/(?<!DJ )\bMuzaIK\b/.test(title)) {
    title = title.replace(/\bDJ MuzaIK\b/g, 'DJ\u0000').replace(bare, ' ').replace(/DJ\u0000/g, 'DJ MuzaIK').replace(/\s*[|·–—-]\s*$/, '').replace(/^\s*[|·–—-]\s*/, '').replace(/\s+/g, ' ').trim();
    fixes.push('Z tytułu zdjęte samo „MuzaIK” (zasada kanału: zostaje „DJ MuzaIK”, „muzaik.channel” i #MuzaIK).');
  }
  if (!title) title = ctx.track?.title ?? ctx.premiere?.title ?? MATERIAL_KINDS[ctx.request.kind].label;
  if (title.length > 100) title = title.slice(0, 100).replace(/\s+\S*$/, '');

  let description = copy.description.replace(LEGACY_NAMES, 'MuzaIK').replace(/\r/g, '');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(description)) { description = description.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ''); fixes.push('Z opisu usunięty adres e-mail.'); }
  description = description.replace(/((?:\p{L}+:)?\s*)(https?:\/\/[^\s)]+)/gu, (whole: string, _label: string, url: string) => {
    try {
      if (ALLOWED_HOST.test(new URL(url).hostname)) return whole;
    } catch { /* not a URL */ }
    fixes.push(`Z opisu usunięty link spoza muzaik.channel: ${url.slice(0, 60)}`);
    return '';
  });
  description = description.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  const footer: string[] = [];
  if (ctx.track?.youtube?.public === true) footer.push(`▶ Cały utwór „${ctx.track.title}”: https://www.youtube.com/watch?v=${ctx.track.youtube.videoId}`);
  if (ctx.request.kind === 'premiera' && ctx.premiere?.hyperfollowUrl) footer.push(`🔔 Zapisz premierę: ${ctx.premiere.hyperfollowUrl}`);
  if (ctx.request.kind === 'radio') footer.push(`📻 Radio MuzaIK 24/7: ${ctx.siteUrl}/radio`);
  if (ctx.request.kind === 'magazyn' && ctx.article) footer.push(`📖 Artykuł: ${ctx.siteUrl}/magazyn/${ctx.article.slug}`);
  footer.push(`🌐 ${ctx.siteUrl}`);

  const tags: string[] = [];
  let len = 0;
  for (const t of copy.tags.map((x) => clean(x).replace(/^#/, '').replace(/[<>",]/g, '').trim()).filter(Boolean)) {
    if (/^muzaik$/i.test(t) || tags.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    if (len + t.length + 1 > 480) break;
    tags.push(t);
    len += t.length + 1;
  }

  const hashtags = ['#MuzaIK'];
  for (const h of copy.hashtags.map((x) => `#${clean(x).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`)) {
    if (h.length > 1 && !hashtags.some((x) => x.toLowerCase() === h.toLowerCase())) hashtags.push(h);
  }
  if (ctx.request.format === '9:16' && !hashtags.some((h) => h.toLowerCase() === '#shorts')) hashtags.splice(1, 0, '#shorts');
  const hash = hashtags.slice(0, 5);

  let full = [description, footer.join('\n'), hash.join(' ')].filter(Boolean).join('\n\n');
  while (Buffer.byteLength(full) > 5000 && description.length > 100) {
    description = description.slice(0, Math.floor(description.length * 0.9)).replace(/\s+\S*$/, '…');
    full = [description, footer.join('\n'), hash.join(' ')].join('\n\n');
  }
  return { title, description: full, tags, hashtags: hash };
}
