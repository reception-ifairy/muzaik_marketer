import { z } from 'zod';

// Option sets: groups of visual choices (style, lighting, palette…) shown as thumbnails in the option window.
// Ported from Kuźnia inspiracji (config/forge_options.php + lang/pl/forge.php). The starter set is Kuźnia's own
// (src/data/starterOptions.json, samples in public/options/starter/); a project can ask the AI for its own set
// (server/options.ts → propose) and have its thumbnails made with an image model (paid, after a cost check).

/** Lucide icons an option group may use (a fixed list, so AI-proposed sets can't name arbitrary components). */
export const GROUP_ICONS = [
  'Palette', 'Landmark', 'Brush', 'Crown', 'Sun', 'Smile', 'SwatchBook', 'Frame', 'Music', 'Camera', 'Shapes', 'Sparkles',
  'Layers', 'Lamp', 'Sofa', 'Shirt', 'Leaf', 'Mountain', 'Building2', 'Gem', 'Type', 'Wand2', 'Flower2', 'Star',
] as const;

/** Group colours (from Kuźnia's tones), offered to the AI by hex. */
export const GROUP_TONES = ['#a78bfa', '#fbbf24', '#fb7185', '#fb923c', '#38bdf8', '#f472b6', '#a3e635', '#22d3ee', '#34d399', '#e879f9', '#facc15', '#60a5fa'] as const;

const slug = z.string().regex(/^[a-z0-9_]{1,40}$/);

export const OptionItemSchema = z.object({
  code: slug.describe('Krótki kod: małe litery, cyfry, podkreślenia'),
  label: z.string().describe('Nazwa po polsku, 1–3 słowa'),
  description: z.string().describe('Jedno zdanie po polsku: jak ta opcja zmienia obraz'),
  prompt: z.string().describe('Krótka fraza po angielsku dopisywana do promptu modelu obrazów'),
  colors: z.array(z.string()).nullable().describe('Tylko w grupie typu palette: 3–5 kolorów hex, np. "#D4AF37"; w innych null'),
  sample: z.string().nullable().describe('Adres miniaturki; przy propozycji zawsze null'),
});

export const OptionGroupSchema = z.object({
  id: slug,
  label: z.string().describe('Nazwa grupy po polsku'),
  description: z.string().describe('Jedno krótkie zdanie po polsku: czego dotyczy grupa'),
  promptLabel: z.string().nullable().describe('Angielska nazwa grupy w prompcie, np. "Lighting"; null gdy fraza mówi sama za siebie'),
  kind: z.enum(['sample', 'palette', 'diagram']).describe('sample = miniaturka tworzona modelem obrazów; palette = kółko z kolorów (bez kosztu)'),
  tone: z.string().describe('Kolor grupy (hex) z dozwolonej listy'),
  icon: z.enum(GROUP_ICONS).describe('Ikona grupy z dozwolonej listy'),
  options: z.array(OptionItemSchema),
});

export const OptionSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What the project is about — the AI built the set from it. */
  context: z.string(),
  /** Neutral English subject shared by every sample picture, so differences between options are easy to see. */
  motif: z.string(),
  source: z.enum(['starter', 'ai']),
  createdAt: z.string(),
  groups: z.array(OptionGroupSchema),
});

export type OptionItem = z.infer<typeof OptionItemSchema>;
export type OptionGroup = z.infer<typeof OptionGroupSchema>;
export type OptionSet = z.infer<typeof OptionSetSchema>;
export type GroupIcon = (typeof GROUP_ICONS)[number];

/** group id -> option code ("" or missing = none). */
export type OptionPicks = Record<string, string>;

export const STARTER_SET_ID = 'starter';

/** GET /api/options: the starter set first, then the project's own sets. */
export interface OptionsState {
  activeId: string;
  sets: OptionSet[];
}

/** POST /api/options/sets/:id/estimate — what making the thumbnails would cost with the sample model. */
export interface SampleEstimate {
  setId: string;
  count: number;
  priceEach: number;
  totalUsd: number;
  model: { id: string; label: string } | null;
  /** Why thumbnails can't be made right now (no key, model disabled…), or null when ready. */
  blocker: string | null;
}

/** The `result` of a thumbnail run. */
export interface SampleRun {
  set: OptionSet;
  made: number;
  failed: number;
  spentUsd: number;
}

export type SampleTarget = { group: string; code: string };

/** Closes every image prompt (Kuźnia's house rules): full canvas, no text, no franchise characters, no real people. */
export const IMAGE_HOUSE_RULES =
  'Full-bleed artwork that fills the whole canvas, with no border, frame or white margin. No text, letters, numbers, logos, watermarks or signatures. No film, cartoon, game or franchise characters, and no real, identifiable people.';

export function withImageRules(prompt: string): string {
  const p = prompt.trim();
  return p.includes(IMAGE_HOUSE_RULES) ? p : `${p} ${IMAGE_HOUSE_RULES}`.trim();
}

/** The whole image prompt: the owner's description, then the chosen options, then the house rules. */
export function composeImagePrompt(description: string, set: OptionSet, picks: OptionPicks): string {
  const desc = description.trim().replace(/\.*$/, '');
  return withImageRules([desc ? `${desc}.` : '', optionsClause(set, picks)].filter(Boolean).join(' '));
}

/**
 * The sentence the chosen options add to an image prompt, in group order, e.g.
 * "Style: realistic, true-to-life detail. Lighting: warm golden-hour light." — "Brak" adds nothing.
 */
export function optionsClause(set: OptionSet, picks: OptionPicks): string {
  const parts: string[] = [];
  for (const group of set.groups) {
    const option = group.options.find((o) => o.code === picks[group.id]);
    if (!option) continue;
    parts.push(`${group.promptLabel ? `${group.promptLabel}: ` : ''}${option.prompt.replace(/\.+$/, '')}.`);
  }
  return parts.join(' ');
}

/** Options whose thumbnail must be made with an image model (palettes and diagrams are drawn). */
export function missingSamples(set: OptionSet): { group: OptionGroup; option: OptionItem }[] {
  return set.groups.filter((g) => g.kind === 'sample').flatMap((group) => group.options.filter((o) => !o.sample).map((option) => ({ group, option })));
}
