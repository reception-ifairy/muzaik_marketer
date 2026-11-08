import { z } from 'zod';

// Studio materiałów: one marketing video project (trailer first, then Shorts and promos). The AI draft schema
// (MaterialDraftSchema) has no min/max — structured outputs reject them; hard limits are applied by code
// (server/materialPlan.ts finalizeDraft, src/beat.ts).

export type MaterialKind = 'zwiastun' | 'short' | 'premiera' | 'radio' | 'szkola' | 'magazyn' | 'utwor-dnia';

export const MATERIAL_KINDS: Record<MaterialKind, { label: string; goal: string; seconds: number[]; defaultSeconds: number; defaultFormat: VideoFormat; needsTrack: boolean; endCard: string }> = {
  zwiastun: {
    label: 'Zwiastun kanału',
    goal: 'Zwiastun kanału YouTube dla osób, które jeszcze nie subskrybują: w kilkadziesiąt sekund pokazać, czym jest MuzaIK (klimat lat 80./90., dark electronic, retro, własna muzyka) i zachęcić do subskrypcji.',
    seconds: [15, 30, 45, 60], defaultSeconds: 30, defaultFormat: '16:9', needsTrack: true, endCard: 'Subskrybuj MuzaIK',
  },
  short: {
    label: 'Short z utworu',
    goal: 'YouTube Short z jednego utworu: hak w pierwszych 1–2 sekundach, wejście refrenu jako kulminacja, zachęta do posłuchania całości.',
    seconds: [15, 20, 30], defaultSeconds: 20, defaultFormat: '9:16', needsTrack: true, endCard: 'Cały utwór na kanale MuzaIK',
  },
  premiera: {
    label: 'Zapowiedź premiery',
    goal: 'Zapowiedź nowego wydania: okładka, nastrój utworu, data premiery i zaproszenie do zapisania (link HyperFollow w opisie).',
    seconds: [15, 20, 30], defaultSeconds: 20, defaultFormat: '9:16', needsTrack: false, endCard: 'Premiera',
  },
  radio: {
    label: 'Promo Radia MuzaIK',
    goal: 'Zaproszenie do Radia MuzaIK grającego 24/7 na muzaik.channel/radio — klimat nocnej jazdy, bez liczby słuchaczy.',
    seconds: [15, 20, 30], defaultSeconds: 20, defaultFormat: '9:16', needsTrack: true, endCard: 'Radio MuzaIK 24/7',
  },
  szkola: {
    label: 'Promo Szkoły gatunków',
    goal: 'Zaproszenie na lekcję Szkoły gatunków MuzaIK (podcast o historii i brzmieniu gatunku) — temat podaje właścicielka.',
    seconds: [15, 20, 30], defaultSeconds: 20, defaultFormat: '9:16', needsTrack: true, endCard: 'Szkoła gatunków MuzaIK',
  },
  magazyn: {
    label: 'Promo artykułu Magazynu',
    goal: 'Zaproszenie do przeczytania artykułu w Magazynie MuzaIK — tytuł i dział z bazy, bez cytowania liczb, których nie ma w artykule.',
    seconds: [15, 20], defaultSeconds: 15, defaultFormat: '9:16', needsTrack: true, endCard: 'Magazyn MuzaIK',
  },
  'utwor-dnia': {
    label: 'Utwór dnia',
    goal: 'Krótki „utwór dnia”: jeden autorski utwór z pełnym filmem na kanale, nastrój i brzmienie z karty.',
    seconds: [15, 20], defaultSeconds: 15, defaultFormat: '9:16', needsTrack: true, endCard: 'Utwór dnia · MuzaIK',
  },
};

export const MATERIAL_KIND_IDS = Object.keys(MATERIAL_KINDS) as MaterialKind[];

export type VideoFormat = '16:9' | '9:16';
export const VIDEO_SIZE: Record<VideoFormat, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

/** How a shot gets its picture: a Flow clip the owner generates, or something the server renders for free. */
export type ShotVisual = 'flow' | 'parallax' | 'okladka' | 'plansza';

export const SHOT_VISUALS: Record<ShotVisual, { label: string; paid: boolean }> = {
  flow: { label: 'Klip z Google Flow', paid: true },
  parallax: { label: 'Scena Parallax (render, bez kosztu)', paid: false },
  okladka: { label: 'Okładka premiery (render, bez kosztu)', paid: false },
  plansza: { label: 'Plansza z tekstem (render, bez kosztu)', paid: false },
};

export type ShotRole = 'hook' | 'build' | 'drop' | 'story' | 'outro';
export const SHOT_ROLES: Record<ShotRole, string> = { hook: 'Hak', build: 'Narastanie', drop: 'Refren / drop', story: 'Opowieść', outro: 'Zakończenie' };

// ---- AI draft (structured output) -------------------------------------------------------------------------

export const ShotDraftSchema = z.object({
  bars: z.number().describe('Ile taktów trwa ujęcie (liczba całkowita, zwykle 1–4).'),
  role: z.enum(['hook', 'build', 'drop', 'story', 'outro']),
  visual: z.enum(['flow', 'parallax', 'okladka', 'plansza']).describe('flow = klip z Google Flow; parallax = animowana scena Parallax kanału; okladka = okładka premiery; plansza = plansza z tekstem.'),
  prompt: z.string().describe('Dla visual=flow: prompt wideo po angielsku (obraz, ruch kamery, światło, nastrój; bez tekstu w kadrze). Dla pozostałych pusty.'),
  mode: z.enum(['text', 'frames', 'ingredients']).describe('Tryb Flow: text, frames (klatka startowa), ingredients (obrazy referencyjne).'),
  reference: z.string().nullable().describe('Dla frames/ingredients: który obraz dać do Flow — „warstwa N sceny <tytuł>” albo „okładka”. null dla text.'),
  sceneId: z.string().nullable().describe('Dla visual=parallax (albo jako kotwica stylu): id sceny z listy. null gdy brak.'),
  cardText: z.string().nullable().describe('Dla visual=plansza: krótki napis po polsku (najwyżej 6 słów). null dla pozostałych.'),
  note: z.string().describe('Notatka po polsku dla właścicielki: co ma się dziać w ujęciu i dlaczego.'),
});

export const MaterialDraftSchema = z.object({
  concept: z.string().describe('Pomysł na film w 2–3 zdaniach, po polsku.'),
  hook: z.string().describe('Co widz zobaczy w pierwszych 2 sekundach i dlaczego zostanie — po polsku.'),
  styleAnchor: z.string().describe('Jedno zdanie po angielsku: wspólny styl wizualny dopisywany do każdego promptu (paleta, światło, faktura, epoka).'),
  shots: z.array(ShotDraftSchema),
  copy: z.object({
    title: z.string().describe('Tytuł filmu na YouTube, po polsku.'),
    description: z.string().describe('Opis filmu po polsku, w pierwszej osobie w rodzaju żeńskim (pisze Twórczyni MuzaIK), 2–4 krótkie akapity, bez linków (stopkę dopisze program).'),
    tags: z.array(z.string()),
    hashtags: z.array(z.string()),
  }),
});

export type ShotDraft = z.infer<typeof ShotDraftSchema>;
export type MaterialDraft = z.infer<typeof MaterialDraftSchema>;

// ---- Project (stored, after code checks) -------------------------------------------------------------------

export interface MusicCut {
  /** Seconds in the track. */
  start: number;
  end: number;
  bars: number;
  barSec: number;
  /** Seconds from the cut start where the refrain/drop lands (null = not known). */
  dropAt: number | null;
  /** true = a real BPM grid; false = no BPM in the card, shots use 2-second units. */
  grid: boolean;
  /** Plain Polish explanation of where the cut came from. */
  why: string;
}

export interface Shot extends ShotDraft {
  id: string;
  /** Seconds from the start of the video. */
  at: number;
  seconds: number;
  /** Flow clip length to generate (≥ seconds; trimmed in the edit), null for rendered shots. */
  flowSeconds: number | null;
  /** Uploaded clip (file id in data/materials/<id>/clips/), null until the owner adds it. */
  clip: string | null;
  /** Prompt as pasted into Flow (with style anchor + house rules), empty for rendered shots. */
  flowPrompt: string;
  /** true = this shot was written by code (end card), not by the model. */
  fixed: boolean;
}

export interface MaterialCopy {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
}

export interface MaterialRequest {
  kind: MaterialKind;
  seconds: number;
  format: VideoFormat;
  /** Also export the other format (blurred background fill). */
  alsoOther: boolean;
  trackId: number | null;
  sceneIds: string[];
  premiereId: number | null;
  articleSlug: string | null;
  topic: string;
  notes: string;
  flowModel: string;
  /** Allow free rendered shots only (Parallax, cover, cards) — no Flow cost. */
  freeOnly: boolean;
}

export type RenderState = { state: 'none' } | { state: 'running'; step: string; startedAt: number } | { state: 'done'; at: number; files: RenderFile[]; warnings: string[] } | { state: 'error'; message: string; at: number };

export interface RenderFile {
  format: VideoFormat;
  name: string;
  seconds: number;
  bytes: number;
}

export interface YoutubePublish {
  videoId: string;
  format: VideoFormat;
  at: number;
  asChannelTrailer: boolean;
}

export interface MaterialProject {
  id: string;
  createdAt: number;
  updatedAt: number;
  request: MaterialRequest;
  trackTitle: string | null;
  concept: string;
  hook: string;
  styleAnchor: string;
  cut: MusicCut | null;
  shots: Shot[];
  copy: MaterialCopy;
  /** What the code changed in the model's draft (Polish, shown to the owner). */
  fixes: string[];
  render: RenderState;
  published: YoutubePublish[];
  model: string;
}

export interface MaterialSummary {
  id: string;
  kind: MaterialKind;
  title: string;
  trackTitle: string | null;
  seconds: number;
  format: VideoFormat;
  updatedAt: number;
  clips: { have: number; need: number };
  rendered: boolean;
  published: boolean;
}

export function summarize(p: MaterialProject): MaterialSummary {
  const need = p.shots.filter((s) => s.visual === 'flow');
  return {
    id: p.id, kind: p.request.kind, title: p.copy.title || MATERIAL_KINDS[p.request.kind].label, trackTitle: p.trackTitle,
    seconds: p.shots.reduce((a, s) => a + s.seconds, 0), format: p.request.format, updatedAt: p.updatedAt,
    clips: { have: need.filter((s) => s.clip).length, need: need.length }, rendered: p.render.state === 'done', published: p.published.length > 0,
  };
}
