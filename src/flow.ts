
// Google Flow catalogue (ported from VizAI Marketer, src/ads.ts): models, clip lengths and modes.
// Flow changes often: models, clip lengths and modes live only here, with FLOW_CHECKED. Prompts and post-filters follow it.

/** Google Flow — where the owner pastes the prompts (the owner's link; Flow's help pages also use labs.google/fx/tools/flow). */
export const FLOW_URL = 'https://flow.google.com/';

/** When the catalogue below was checked against Flow's help pages (support.google.com/flow/answer/16352836). */
export const FLOW_CHECKED = '5 listopada 2026';

export type FlowMode = 'text' | 'frames' | 'ingredients';

export interface FlowModel {
  id: string;
  label: string;
  /** Clip lengths Flow offers, in seconds. */
  seconds: number[];
  /** Lengths allowed with Ingredients (reference images); empty = Ingredients not supported. */
  ingredientsSeconds: number[];
  modes: FlowMode[];
  /** Polish note for the owner (price tier, retirement, quirks). */
  note: string;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Video models in Google Flow (checked FLOW_CHECKED). Flow changes often: when a model is added or retired,
 * edit this list — the prompts, the length of each scene and the allowed modes follow it.
 */
export const FLOW_MODELS: FlowModel[] = [
  {
    id: 'omni-flash-1.2',
    label: 'Omni Flash 1.2 · plan płatny',
    seconds: range(3, 15),
    ingredientsSeconds: range(3, 15),
    modes: ['text', 'frames', 'ingredients'],
    note: 'Klipy 3–15 s, Ingredients, głosy (@Voice), przedłużanie (Extend). Wymaga planu Google AI Plus/Pro/Ultra.',
  },
  {
    id: 'omni-flash-1.2-free',
    label: 'Omni Flash 1.2 · plan darmowy',
    seconds: range(3, 10),
    ingredientsSeconds: range(3, 10),
    modes: ['text', 'frames', 'ingredients'],
    note: 'Klipy 3–10 s, bez przedłużania (Extend).',
  },
  {
    id: 'veo-3.1-lite',
    label: 'Veo 3.1 Lite',
    seconds: [4, 6, 8],
    ingredientsSeconds: [8],
    modes: ['text', 'frames', 'ingredients'],
    note: 'Tani, 720p. Klipy 4, 6 lub 8 s; z Ingredients tylko 8 s.',
  },
  {
    id: 'veo-3.1-fast',
    label: 'Veo 3.1 Fast',
    seconds: [4, 6, 8],
    ingredientsSeconds: [8],
    modes: ['text', 'frames', 'ingredients'],
    note: 'Klipy 4, 6 lub 8 s; z Ingredients tylko 8 s. Wycofywany 5 grudnia 2026.',
  },
  {
    id: 'veo-3.1-quality',
    label: 'Veo 3.1 Quality',
    seconds: [4, 6, 8],
    ingredientsSeconds: [],
    modes: ['text', 'frames'],
    note: 'Najwyższa jakość, bez Ingredients (obraz tylko przez klatkę startową). Wycofywany 5 grudnia 2026.',
  },
];

export const DEFAULT_FLOW_MODEL = 'omni-flash-1.2';

export function getFlowModel(id: string | undefined): FlowModel {
  return FLOW_MODELS.find((m) => m.id === id) ?? FLOW_MODELS.find((m) => m.id === DEFAULT_FLOW_MODEL)!;
}

export const FLOW_MODE_INFO: Record<FlowMode, { label: string; howTo: string }> = {
  text: { label: 'Tekst → wideo', howTo: 'Wklej prompt do pola tekstowego, bez obrazów.' },
  frames: { label: 'Klatka → wideo', howTo: 'Dodaj obraz jako klatkę startową (np. warstwę sceny Parallax albo okładkę), potem wklej prompt wideo.' },
  ingredients: { label: 'Składniki → wideo', howTo: 'Przeciągnij wskazane obrazy (warstwy sceny, okładka) do pola promptu (Ingredients), potem wklej prompt.' },
};

export const VIDEO_HOUSE_RULES =
  'No on-screen text, captions, subtitles, letters, logos or watermarks. No film, cartoon, game or franchise characters, and no real, identifiable people.';

export function withVideoRules(prompt: string): string {
  const p = prompt.trim();
  return p.includes(VIDEO_HOUSE_RULES) ? p : `${p} ${VIDEO_HOUSE_RULES}`.trim();
}

/** Shortest clip length the model offers that is at least `seconds` long, or null when even the longest is shorter. */
export function flowClipFor(model: FlowModel, seconds: number, mode: FlowMode): number | null {
  const lengths = mode === 'ingredients' ? model.ingredientsSeconds : model.seconds;
  return [...lengths].sort((a, b) => a - b).find((l) => l >= seconds - 1e-6) ?? null;
}

export function maxFlowClip(model: FlowModel, mode: FlowMode): number {
  const lengths = mode === 'ingredients' ? model.ingredientsSeconds : model.seconds;
  return lengths.length ? Math.max(...lengths) : 0;
}
