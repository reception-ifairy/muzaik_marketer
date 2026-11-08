// Image model catalogue, shared by the server (adapters, detection, cost estimates) and the client (Settings).
// Taken from Kuźnia inspiracji (vizai-kuznia: config/forge.php, config/ai.php, the adapters' price tables and
// lang/pl/forge.php engine_notes; prices checked there on 2026-10-14/20). Providers don't publish prices or
// notes through their APIs, so this list is the source of truth for them; key detection only says which of
// these models a key can reach and which image models the provider has that aren't listed here yet.

export type ImageProvider = 'openai' | 'google' | 'replicate' | 'stability';
export type ImageModelGroup = 'fast' | 'quality' | 'top';
export type ImageAspect = '1:1' | '2:3' | '16:9';

export interface ImageModelDef {
  /** Stable id used in settings (never change it once used). */
  id: string;
  provider: ImageProvider;
  /** The provider's own model id. */
  model: string;
  label: string;
  group: ImageModelGroup;
  /** USD per picture; resolution-priced models list one price per size tier. */
  price: number | Record<string, number>;
  speed: string;
  note: string;
  /** How the size is asked for: named aspect ratios, a size tier (Gemini), OpenAI pixel sizes, or custom sizes up to longEdge. */
  sizing:
    | { kind: 'aspect'; aspects: string[] }
    | { kind: 'tier'; tiers: string[]; defaultTier: string }
    | { kind: 'openai'; quality: 'low' | 'medium' | 'high' }
    | { kind: 'openai-custom'; quality: 'low' | 'medium' | 'high'; longEdge: number };
  /** Extra provider input (e.g. FLUX 3 / FLUX 2 Pro resolution names). */
  extra?: Record<string, string | number | boolean>;
  verifiedAt: string;
}

export const IMAGE_GROUPS: { id: ImageModelGroup; label: string; tone: string }[] = [
  { id: 'fast', label: 'Szybkie i tanie', tone: '#22d3ee' },
  { id: 'quality', label: 'Jakość', tone: '#a78bfa' },
  { id: 'top', label: 'Najwyższa jakość', tone: '#fbbf24' },
];

const FLUX_ASPECTS = ['1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3'];
const STABILITY_ASPECTS = ['16:9', '1:1', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'];

export const IMAGE_MODELS: ImageModelDef[] = [
  // Fast and cheap
  {
    id: 'flux_schnell', provider: 'replicate', model: 'black-forest-labs/flux-schnell', label: 'FLUX Schnell', group: 'fast',
    price: 0.003, speed: '1–3 s', sizing: { kind: 'aspect', aspects: FLUX_ASPECTS }, verifiedAt: '2026-08-01',
    note: 'Najtańszy i błyskawiczny; słabszy w detalach. W Kuźni robi miniaturki opcji — domyślny model do miniaturek.',
  },
  {
    id: 'sd35_turbo', provider: 'stability', model: 'sd3.5-large-turbo', label: 'SD3.5 Large Turbo', group: 'fast',
    price: 0.04, speed: '3–5 s', sizing: { kind: 'aspect', aspects: STABILITY_ASPECTS }, verifiedAt: '2026-08-01',
    note: 'Bardzo szybki szkic z malarską fakturą: sprawdzisz pomysł i kompozycję, zanim wydasz więcej.',
  },
  {
    id: 'stable_core', provider: 'stability', model: 'stable-image-core', label: 'Stable Image Core', group: 'fast',
    price: 0.03, speed: '3–6 s', sizing: { kind: 'aspect', aspects: STABILITY_ASPECTS }, verifiedAt: '2026-07-23',
    note: 'Najtańszy z jakością na próbę: szybki, poprawny obraz, żeby zobaczyć, czy opis i opcje idą w dobrą stronę.',
  },
  {
    id: 'flux_pro', provider: 'replicate', model: 'black-forest-labs/flux-1.1-pro', label: 'FLUX 1.1 Pro', group: 'fast',
    price: 0.04, speed: '5–10 s', sizing: { kind: 'aspect', aspects: FLUX_ASPECTS }, verifiedAt: '2026-07-23',
    note: 'Szybki realizm: zdjęciowe światło i materiały w kilka sekund, ok. 1,4 MP. Dobry na Pinteresta.',
  },
  // Quality
  {
    id: 'gemini_flash', provider: 'google', model: 'gemini-nano-banana-2.1', label: 'Gemini Flash Image 2.1', group: 'quality',
    price: { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 }, speed: '15–30 s', sizing: { kind: 'tier', tiers: ['1K', '2K', '4K'], defaultTier: '2K' }, verifiedAt: '2026-10-14',
    note: 'Najnowszy Gemini: najlepsza jakość za tę cenę i najlepiej słucha opcji stylu i klimatu; 4K do dużych wydruków.',
  },
  {
    id: 'gpt_standard', provider: 'openai', model: 'gpt-image-2', label: 'GPT Image 2', group: 'quality',
    price: 0.053, speed: '20–40 s', sizing: { kind: 'openai', quality: 'medium' }, verifiedAt: '2026-07-23',
    note: 'Pewne, czyste ilustracje, które dokładnie trzymają się opisu; do 1536 px, szersze kształty docina.',
  },
  {
    id: 'gpt25_flare', provider: 'openai', model: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare', group: 'quality',
    price: 0.06, speed: '15–40 s', sizing: { kind: 'openai-custom', quality: 'medium', longEdge: 2048 }, verifiedAt: '2026-10-14',
    note: 'Najnowszy OpenAI, szybki: prawdziwy kształt do 2048 px (2:3 i 16:9 bez docinania), czysta kompozycja.',
  },
  {
    id: 'gpt25_sunburst', provider: 'openai', model: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst', group: 'quality',
    price: 0.06, speed: '30–60 s', sizing: { kind: 'openai-custom', quality: 'medium', longEdge: 2048 }, verifiedAt: '2026-10-14',
    note: 'Najdokładniejszy OpenAI: drobne detale i złożone sceny z wieloma rzeczami z opisu; wolniejszy.',
  },
  {
    id: 'flux3', provider: 'replicate', model: 'black-forest-labs/flux-3-image', label: 'FLUX 3', group: 'quality',
    price: 0.05, speed: '15–30 s', sizing: { kind: 'aspect', aspects: FLUX_ASPECTS }, extra: { resolution: '2k' }, verifiedAt: '2026-10-14',
    note: 'Najnowszy FLUX: fotograficzny realizm, światło i faktury jak z aparatu, 2K. Najlepszy do „prawdziwych zdjęć”.',
  },
  {
    id: 'flux2_pro', provider: 'replicate', model: 'black-forest-labs/flux-2-pro', label: 'FLUX 2 Pro', group: 'quality',
    price: 0.045, speed: '10–25 s', sizing: { kind: 'aspect', aspects: FLUX_ASPECTS }, extra: { resolution: '2 MP' }, verifiedAt: '2026-10-14',
    note: 'Realistyczne materiały (drewno, metal, tkanina, kamień) i spójne kolory, 2 MP; tani realizm.',
  },
  {
    id: 'sd35_large', provider: 'stability', model: 'sd3.5-large', label: 'SD3.5 Large', group: 'quality',
    price: 0.065, speed: '5–10 s', sizing: { kind: 'aspect', aspects: STABILITY_ASPECTS }, verifiedAt: '2026-08-03',
    note: 'Pełna jakość Stability: wyraźne style artystyczne i faktury, dobry do malarskich i graficznych opcji.',
  },
  {
    id: 'stable_ultra', provider: 'stability', model: 'stable-image-ultra', label: 'Stable Image Ultra', group: 'quality',
    price: 0.08, speed: '8–15 s', sizing: { kind: 'aspect', aspects: STABILITY_ASPECTS }, verifiedAt: '2026-07-23',
    note: 'Bogate faktury (olej, akwarela) i nastrojowe światło, ok. 1,5 MP. Do obrazów „jak namalowane”.',
  },
  // Top quality
  {
    id: 'gemini_pro', provider: 'google', model: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image', group: 'top',
    price: { '1K': 0.134, '2K': 0.134, '4K': 0.24 }, speed: '30–60 s', sizing: { kind: 'tier', tiers: ['1K', '2K', '4K'], defaultTier: '2K' }, verifiedAt: '2026-07-23',
    note: 'Najwyższa jakość i najspójniejsze detale, 2K. Do najlepszych pomysłów, które chcesz wydrukować.',
  },
  {
    id: 'flux_ultra', provider: 'replicate', model: 'black-forest-labs/flux-1.1-pro-ultra', label: 'FLUX 1.1 Pro Ultra', group: 'top',
    price: 0.06, speed: '10–20 s', sizing: { kind: 'aspect', aspects: FLUX_ASPECTS }, verifiedAt: '2026-08-03',
    note: 'Wysoka rozdzielczość (ok. 4 MP) w kilkanaście sekund; ostre detale do druku w dużym formacie.',
  },
];

export const DEFAULT_IMAGE_MODEL = 'gemini_flash';
export const DEFAULT_SAMPLE_MODEL = 'flux_schnell';

export function getImageModel(id: string): ImageModelDef | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

/** Price of one picture; for size-tiered models the given tier (or the cheapest). */
export function imagePrice(model: ImageModelDef, tier?: string): number {
  if (typeof model.price === 'number') return model.price;
  if (tier && model.price[tier] !== undefined) return model.price[tier];
  return Math.min(...Object.values(model.price));
}

/** "$0,034" — Polish decimal comma, three places under a dollar (prices per picture are cents). */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(amount < 1 ? 3 : 2).replace('.', ',')}`;
}

/** Provider image model ids that count as "image models" when a key lists its models (for "new model" detection). */
export function looksLikeImageModel(provider: ImageProvider, id: string): boolean {
  if (IMAGE_MODELS.some((m) => m.provider === provider && m.model === id)) return true;
  if (provider === 'openai') return /^(gpt-image|dall-e)/.test(id);
  if (provider === 'google') return /(image|imagen|nano-banana)/.test(id) && !/(embedding|tts|audio)/.test(id);
  return true;
}
