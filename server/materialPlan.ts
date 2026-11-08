import crypto from 'crypto';
import { endCardBars, fitBars } from '../src/beat';
import { flowClipFor, getFlowModel, maxFlowClip, withVideoRules, VIDEO_HOUSE_RULES, type FlowMode } from '../src/flow';
import type { AestheticPreset, ChannelProfile } from '../src/profile';
import { MATERIAL_KINDS, type MaterialCopy, type MaterialDraft, type MaterialProject, type MaterialRequest, type MaterialThumbnail, type MusicCut, type SelfCheck, type Shot, type ShotDraft } from '../src/material';
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
  profile: ChannelProfile;
  preset: AestheticPreset | null;
}

/** Names of AI tools and models never said in public text (from the AI Studio module's self-check). */
export const AI_TOOL_NAMES = /\b(suno|udio|midjourney|runway|pika|sora|veo|omni[- ]?flash|gemini|nano banana|chat ?gpt|openai|claude|anthropic|stable diffusion|dall-?e|flux|lyria)\b/i;
/** The creator's name is never public on muzaik.channel. */
const CREATOR_NAME = /\bbeti\b/i;

export function purpleRule(profile: ChannelProfile): string {
  return `Purple and magenta only as a small accent (under ${profile.purpleMaxPercent}% of the frame); prefer night blue, teal, emerald, amber, neon red, gold, icy white, coral.`;
}

/** Max voice-over length for a shot: DJ MuzaIK reads ~0.09 s per character (measured on muzaik's DJ voice). */
export function voiceoverMaxChars(seconds: number): number {
  return Math.max(0, Math.floor((seconds - 0.4) / 0.09));
}

function cutToSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const part = text.slice(0, max);
  const end = Math.max(part.lastIndexOf('. '), part.lastIndexOf('! '), part.lastIndexOf('? '), part.lastIndexOf('… '));
  if (end > max * 0.4) return part.slice(0, end + 1).trim();
  return part.replace(/\s+\S*$/, '').replace(/[,;:–-]+$/, '').trim() + '…';
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

export function finalizeDraft(draft: MaterialDraft, ctx: PlanContext): { shots: Shot[]; copy: MaterialCopy; styleAnchor: string; thumbnail: MaterialThumbnail; fixes: string[] } {
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
    let overlayText = s.overlayText && visual !== 'plansza' ? words(clean(s.overlayText), 5) || null : null;
    if (overlayText && (AI_TOOL_NAMES.test(overlayText) || CREATOR_NAME.test(overlayText))) {
      overlayText = null;
      fixes.push(`Ujęcie ${n}: napis z nazwą narzędzia AI albo imieniem twórczyni usunięty.`);
    }
    let voiceover = request.voiceover && s.voiceover ? clean(s.voiceover).slice(0, 600) || null : null;
    if (voiceover && (AI_TOOL_NAMES.test(voiceover) || CREATOR_NAME.test(voiceover))) {
      voiceover = null;
      fixes.push(`Ujęcie ${n}: kwestia lektora z nazwą narzędzia AI albo imieniem twórczyni usunięta.`);
    }
    return {
      ...s, visual, sceneId, mode, reference, prompt, cardText, overlayText, voiceover,
      camera: clean(s.camera ?? '').slice(0, 200), light: clean(s.light ?? '').slice(0, 200), transition: clean(s.transition ?? '').slice(0, 200),
      note: clean(s.note).slice(0, 500),
    };
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
    cardText: endCardText(ctx), camera: '', light: '', transition: 'wejście z rozjaśnienia, koniec z muzyką', overlayText: null, voiceover: null,
    note: 'Plansza końcowa — tekst i adres pisze program.',
  });

  let at = 0;
  const shots: Shot[] = split.map((s, i) => {
    const seconds = Math.round(s.bars * unit * 1000) / 1000;
    const flowSeconds = s.visual === 'flow' ? flowClipFor(model, seconds, s.mode) : null;
    let voiceover = s.voiceover;
    if (voiceover) {
      const max = voiceoverMaxChars(seconds);
      const cut = max >= 12 ? cutToSentence(voiceover, max) : '';
      if (cut !== voiceover) fixes.push(cut ? `Kwestia lektora w ujęciu ${i + 1} skrócona do ${seconds.toFixed(1)} s ujęcia.` : `Ujęcie ${i + 1} za krótkie na kwestię lektora — usunięta.`);
      voiceover = cut || null;
    }
    const shot: Shot = {
      ...s, voiceover, id: shotId(), at: Math.round(at * 1000) / 1000, seconds, flowSeconds, clip: null, fixed: i === split.length - 1,
      flowPrompt: s.visual === 'flow'
        ? withVideoRules([s.prompt, s.camera && `Camera: ${s.camera}.`, s.light && `Light: ${s.light}.`, styleAnchor, `Framing: ${request.format === '9:16' ? '9:16 portrait' : '16:9 landscape'}.`, purpleRule(ctx.profile)].filter(Boolean).join(' ').replace(/\s+/g, ' '))
        : '',
    };
    at += seconds;
    return shot;
  });

  const thumbPrompt = clean(draft.thumbnail?.prompt ?? '');
  const thumbnail: MaterialThumbnail = {
    prompt: thumbPrompt ? withVideoRules(`${thumbPrompt} ${styleAnchor} 16:9, leave calm negative space for a short title. ${purpleRule(ctx.profile)}`) : '',
    overlayOptions: (draft.thumbnail?.overlayOptions ?? []).map((o) => words(clean(o), 3)).filter((o) => o && !AI_TOOL_NAMES.test(o) && !CREATOR_NAME.test(o)).slice(0, 3),
    file: null,
    text: null,
  };
  return { shots, copy: cleanCopy(draft.copy, ctx, fixes), styleAnchor, thumbnail, fixes };
}

const ALLOWED_HOST = /^(?:[a-z0-9-]+\.)*muzaik\.channel$/i;
const LINK_LABEL: Record<string, string> = { website: '🌐 Strona', radio: '📻 Radio MuzaIK 24/7', magazine: '📖 Magazyn', spotify: '🎧 Spotify', shop: '🛍 Sklep' };

/** Hosts the description may link to: muzaik.channel plus the profile links the owner allowed. */
export function allowedHosts(profile: ChannelProfile): string[] {
  const hosts: string[] = [];
  for (const key of profile.descriptionLinks) {
    try { hosts.push(new URL(profile.links[key]).hostname.toLowerCase()); } catch { /* not a URL */ }
  }
  return hosts;
}

function hostAllowed(url: string, hosts: string[]): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOST.test(h) || hosts.includes(h);
  } catch {
    return false;
  }
}

/** Channel copy rules: legacy names, e-mails, foreign links, standalone „MuzaIK” in the title, tag/hashtag limits, footer by code. */
export function cleanCopy(copy: Omit<MaterialCopy, 'pinnedComment'> & { pinnedComment?: string }, ctx: PlanContext, fixes: string[]): MaterialCopy {
  const hosts = allowedHosts(ctx.profile);
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
    if (hostAllowed(url, hosts)) return whole;
    fixes.push(`Z opisu usunięty link spoza dozwolonych: ${url.slice(0, 60)}`);
    return '';
  });
  description = description.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  const footer: string[] = [];
  if (ctx.track?.youtube?.public === true) footer.push(`▶ Cały utwór „${ctx.track.title}”: https://www.youtube.com/watch?v=${ctx.track.youtube.videoId}`);
  if (ctx.request.kind === 'premiera' && ctx.premiere?.hyperfollowUrl) footer.push(`🔔 Zapisz premierę: ${ctx.premiere.hyperfollowUrl}`);
  if (ctx.request.kind === 'radio') footer.push(`📻 Radio MuzaIK 24/7: ${ctx.siteUrl}/radio`);
  if (ctx.request.kind === 'magazyn' && ctx.article) footer.push(`📖 Artykuł: ${ctx.siteUrl}/magazyn/${ctx.article.slug}`);
  footer.push(`🌐 ${ctx.siteUrl}`);
  for (const key of ctx.profile.descriptionLinks) {
    const url = ctx.profile.links[key];
    if (!url || footer.some((f) => f.includes(url)) || url.replace(/\/$/, '') === ctx.siteUrl) continue;
    if (key === 'radio' && ctx.request.kind === 'radio') continue;
    footer.push(`${LINK_LABEL[key] ?? key}: ${url}`);
  }

  const tags: string[] = [];
  let len = 0;
  for (const t of copy.tags.map((x) => clean(x).replace(/^#/, '').replace(/[<>",]/g, '').trim()).filter(Boolean)) {
    if (AI_TOOL_NAMES.test(t) || CREATOR_NAME.test(t)) { fixes.push(`Z tagów usunięty „${t}” (nazwa narzędzia AI albo imię twórczyni).`); continue; }
    if (/^muzaik$/i.test(t) || tags.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    if (len + t.length + 1 > 480) break;
    tags.push(t);
    len += t.length + 1;
  }

  const hashtags = ['#MuzaIK'];
  for (const h of copy.hashtags.map((x) => `#${clean(x).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`)) {
    if (AI_TOOL_NAMES.test(h) || CREATOR_NAME.test(h)) continue;
    if (h.length > 1 && !hashtags.some((x) => x.toLowerCase() === h.toLowerCase())) hashtags.push(h);
  }
  if (ctx.request.format === '9:16' && !hashtags.some((h) => h.toLowerCase() === '#shorts')) hashtags.splice(1, 0, '#shorts');
  const hash = hashtags.slice(0, 5);

  let full = [description, footer.join('\n'), hash.join(' ')].filter(Boolean).join('\n\n');
  while (Buffer.byteLength(full) > 5000 && description.length > 100) {
    description = description.slice(0, Math.floor(description.length * 0.9)).replace(/\s+\S*$/, '…');
    full = [description, footer.join('\n'), hash.join(' ')].join('\n\n');
  }
  let pinnedComment = (copy.pinnedComment ?? '').replace(LEGACY_NAMES, 'MuzaIK').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (AI_TOOL_NAMES.test(pinnedComment) || CREATOR_NAME.test(pinnedComment)) { pinnedComment = ''; fixes.push('Przypięty komentarz z nazwą narzędzia AI albo imieniem twórczyni — usunięty.'); }
  return { title, description: full, tags, hashtags: hash, pinnedComment };
}

const DATE_LIKE = /\b(?!24\/7\b)(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)(?:\s+\d{4})?|20\d{2}-\d{2}(?:-\d{2})?)\b/gi;

/**
 * The channel's rules checked on the finished project (the AI Studio module's 7-point self-check, adapted to
 * muzaik.channel): AI tool names, no-text clause, purple accent, durations, dates, authored track, links, names.
 */
export function selfCheck(p: Pick<MaterialProject, 'shots' | 'copy' | 'thumbnail' | 'cut' | 'request'>, ctx: Pick<PlanContext, 'profile' | 'premiere' | 'track' | 'siteUrl'>): SelfCheck[] {
  const pub = [p.copy.title, p.copy.description, p.copy.pinnedComment, ...p.copy.tags, ...p.copy.hashtags, ...p.thumbnail.overlayOptions, p.thumbnail.text ?? '',
    ...p.shots.map((s) => `${s.cardText ?? ''} ${s.overlayText ?? ''} ${s.voiceover ?? ''}`)].join(' \n ');
  const out: SelfCheck[] = [];
  const ai = AI_TOOL_NAMES.exec(pub);
  out.push({ id: 'ai', label: 'Bez nazw narzędzi i modeli AI w treściach publicznych', level: 'error', ok: !ai, detail: ai ? `Znaleziono „${ai[0]}” — popraw tytuł, opis albo napisy.` : 'Tytuł, opis, napisy i lektor nie wymieniają narzędzi AI.' });
  const legacy = new RegExp(LEGACY_NAMES.source, 'i').exec(pub) ?? CREATOR_NAME.exec(pub);
  out.push({ id: 'names', label: 'Bez dawnych nazw i imienia twórczyni', level: 'error', ok: !legacy, detail: legacy ? `Znaleziono „${legacy[0]}”.` : 'Tylko MuzaIK, DJ MuzaIK i Twórczyni MuzaIK.' });
  const prompts = [...p.shots.filter((s) => s.visual === 'flow').map((s) => s.flowPrompt), ...(p.thumbnail.prompt ? [p.thumbnail.prompt] : [])];
  const noClause = prompts.filter((x) => !x.includes(VIDEO_HOUSE_RULES)).length;
  out.push({ id: 'notext', label: 'Zakaz tekstu, liter i logo w każdym prompcie obrazu', level: 'error', ok: noClause === 0, detail: noClause ? `${noClause} promptów bez klauzuli.` : `${prompts.length}/${prompts.length} promptów ma klauzulę.` });
  const noPurple = prompts.filter((x) => !/purple and magenta only as a small accent/i.test(x)).length;
  out.push({ id: 'purple', label: `Fiolet tylko jako akcent (≤ ${ctx.profile.purpleMaxPercent}% kadru)`, level: 'warn', ok: noPurple === 0, detail: noPurple ? `${noPurple} promptów bez reguły fioletu (edytowane ręcznie?).` : 'Każdy prompt ogranicza fiolet.' });
  const total = p.shots.reduce((a, s) => a + s.seconds, 0);
  const target = p.cut ? p.cut.end - p.cut.start : total;
  out.push({ id: 'duration', label: 'Ujęcia trwają tyle, co fragment muzyki', level: 'error', ok: Math.abs(total - target) < 0.05, detail: `Ujęcia ${total.toFixed(2)} s, muzyka ${target.toFixed(2)} s.` });
  const known = new Set<string>();
  if (ctx.premiere?.date) { known.add(ctx.premiere.date); known.add(polishDate(ctx.premiere.date)); }
  const dates = [...pub.matchAll(DATE_LIKE)].map((m) => m[0]).filter((d) => ![...known].some((k) => k.includes(d) || d.includes(k)));
  out.push({ id: 'dates', label: 'Daty tylko z danych kanału', level: 'warn', ok: dates.length === 0, detail: dates.length ? `Sprawdź: ${[...new Set(dates)].slice(0, 3).join(', ')} — nie ma ich w premierze.` : 'Brak dat spoza danych.' });
  out.push({ id: 'track', label: 'Utwór autorski (bez coverów)', level: 'error', ok: !ctx.track || !ctx.track.cover, detail: ctx.track ? (ctx.track.cover ? 'To cover.' : `„${ctx.track.title}” — autorski.`) : 'Materiał bez utworu.' });
  const hosts = allowedHosts(ctx.profile);
  const bad = [...p.copy.description.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]).filter((u) => !hostAllowed(u, hosts));
  out.push({ id: 'links', label: 'Linki tylko z dozwolonej listy', level: 'error', ok: bad.length === 0, detail: bad.length ? `Spoza listy: ${bad.slice(0, 2).join(', ')}` : 'muzaik.channel i linki zaznaczone w profilu.' });
  out.push({ id: 'title', label: 'Tytuł do 60 znaków (widać go w całości)', level: 'warn', ok: p.copy.title.length <= 60, detail: `${p.copy.title.length} znaków.` });
  const flow = p.shots.filter((s) => s.visual === 'flow');
  out.push({ id: 'clips', label: 'Komplet klipów z Flow', level: 'warn', ok: flow.every((s) => s.clip), detail: `${flow.filter((s) => s.clip).length}/${flow.length} wgranych.` });
  return out;
}
