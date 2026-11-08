import { z } from 'zod';

// Channel profile and aesthetic presets for the director (2026-11-08), taken from the owner's Google AI Studio module
// "YT Music Teaser — MuzaIK Studio". Until the profile is configured from a script (or in Settings → Profil kanału),
// EVERY value below is a PLACEHOLDER to replace (`placeholder: true`): the UI says so and the prompt marks it as
// "dane wstępne". Fields that conflict with muzaik.channel rules were not taken over (see PROFILE_CONFLICTS) —
// the creator's name, the legacy names, links under the old name, channel statistics.
// Tracks, premieres and scenes never come from here: they are read from muzaik.db.

export type PresetId =
  | 'dark_dance_noir' | 'oldschool_kaseta' | 'storybook_botanical' | 'niebo_synthwave' | 'neon_cyber'
  | 'lofi_cieplo' | 'nostalgia_nowy_wymiar' | 'cinematic_energy' | 'retro_reggae_sunset' | 'dark_dubstep';

export interface AestheticPreset {
  id: PresetId;
  name: string;
  subtitle: string;
  description: string;
  pillar: string;
  paletteHex: string[];
  avoid: string[];
  lighting: string;
  texture: string;
}

/** Ten looks from the AI Studio module (Polish descriptions, HEX palettes, what to avoid). */
export const AESTHETIC_PRESETS: AestheticPreset[] = [
  {
    id: 'nostalgia_nowy_wymiar',
    name: 'Nostalgia w Nowym Wymiarze',
    subtitle: 'Preset flagowy kanału MuzaIK',
    description: 'Przedmioty i miejsca z lat 80./90. (walkman, automat z grami, dyskoteka, polonez nocą, blokowisko w neonie) przenikają się z futurystycznym światłem — hologramy, cząsteczki, płynne przejścia „wtedy → teraz”.',
    pillar: 'Zwiastun Kanału MuzaIK',
    paletteHex: ['#0B1D3A', '#18C4C4', '#F2A93B', '#FF3B3B', '#E2F1FF'],
    avoid: ['dominant purple', 'text', 'letters', 'logos', 'watermarks'],
    lighting: 'Sodowe ciepło lat 80. przechodzące w zimny turkusowy hologram i złote flary',
    texture: 'Analogowa taśma 35mm połączona z krystalicznym światłem cząsteczkowym'
  },
  {
    id: 'dark_dance_noir',
    name: 'Dark Dance Noir',
    subtitle: 'Nocne miasto po deszczu',
    description: 'Mokry asfalt, światło sodowe + turkusowy neon, dym, wysoki kontrast, głęboka czerń z bursztynem i szmaragdem.',
    pillar: 'Synthwave & Dark Dance',
    paletteHex: ['#071120', '#18C4C4', '#F2A93B', '#0D9488', '#F8FAFC'],
    avoid: ['dominant purple', 'magenta overload', 'text', 'logos'],
    lighting: 'Niskokluczowe światło uliczne, odbicia w kałużach, konturowy turkus',
    texture: 'Mokry asfalt, para wodna, deszcz na szkle obiektywu anamorficznego'
  },
  {
    id: 'niebo_synthwave',
    name: 'Niebo Synthwave',
    subtitle: 'Błękit nieba i złoty horyzont',
    description: 'Błękit nieba przechodzący w zachód, chmury w zwolnionym tempie, złoto + błękit + koral, lot nad chmurami. Domyślny preset dla „Błękit Nieba”.',
    pillar: 'Synthwave & Dark Dance',
    paletteHex: ['#0B1D3A', '#0284C7', '#F59E0B', '#FB7185', '#E0F2FE'],
    avoid: ['dominant purple', 'text', 'letters', 'logos'],
    lighting: 'Promienie zachodzącego słońca przebijające chmury, błękitny zmierzch',
    texture: 'Miękkie wolumetryczne chmury, delikatne ziarno filmowe, flara soczewki'
  },
  {
    id: 'storybook_botanical',
    name: 'Storybook Botanical',
    subtitle: 'Rysunek kredką i akwarela',
    description: 'Rysunek kredką na kremowym papierze, botaniczne kwiaty, miękkie światło dzienne, akwarelowe przejścia; spójny ze storyboardem 26 ujęć dla „Kwiaty Na Dłoni”.',
    pillar: 'Orchestral Folk',
    paletteHex: ['#FBF7F0', '#10B981', '#F2A93B', '#FB7185', '#1E293B'],
    avoid: ['dominant purple', 'harsh neon', 'text', 'letters', 'logos'],
    lighting: 'Miękkie, rozproszone światło dzienne padające na fakturę papieru',
    texture: 'Kremowy papier czerpany, pociągnięcia kredki ołówkowej i lawowanie akwarelą'
  },
  {
    id: 'oldschool_kaseta',
    name: 'Oldschool Kaseta',
    subtitle: 'VHS / CRT & Maskotki MuzaIK',
    description: 'Tekstura VHS/CRT, ziarno, lekka aberracja chromatyczna, ciepłe lata 80/90, animowane maskotki ekipy (kaseta, nutka, płyta CD); idealny do Pokoju gości.',
    pillar: 'Społeczność & Pokój gości',
    paletteHex: ['#0F172A', '#F59E0B', '#18C4C4', '#EF4444', '#FEF3C7'],
    avoid: ['dominant purple', 'readable text', 'platform logos'],
    lighting: 'Poświata kineskopu CRT i ciepłe lampki nocnego pokoju',
    texture: 'Linie skanowania CRT, delikatne ziarno taśmy magnetycznej, styl retro-animacji'
  },
  {
    id: 'cinematic_energy',
    name: 'Cinematic Energy',
    subtitle: 'Rozmach kinowy i złota godzina',
    description: 'Szerokie plany, slow motion, flary anamorficzne, złota godzina, klasyczny kontrast złoto + głęboki błękit nocny.',
    pillar: 'Cinematic Energy & Pop',
    paletteHex: ['#0B1D3A', '#F2A93B', '#38BDF8', '#FF4D4D', '#FFFFFF'],
    avoid: ['dominant purple', 'text', 'logos', 'watermarks'],
    lighting: 'Dramatyczne światło kontrowe złotej godziny i głęboki cień',
    texture: 'Taśma Kodak Vision3 500T, szeroki kadr anamorficzny'
  },
  {
    id: 'neon_cyber',
    name: 'Neon Cyber Club',
    subtitle: 'Futurystyczny klub i chrom',
    description: 'Futurystyczny klub, lasery, odbicia w chromie; turkus, czerwień neonowa i lodowa biel (fiolet wyłącznie jako minimalny akcent ≤10%).',
    pillar: 'Electro & Darkwave',
    paletteHex: ['#050B14', '#18C4C4', '#FF3B3B', '#E2F1FF', '#F2A93B'],
    avoid: ['dominant purple', 'text', 'letters', 'logos'],
    lighting: 'Wiązki laserów w dymie, ostre odbicia na szczotkowanym chromie',
    texture: 'Polerowany metal, szkło, mgła klubowa'
  },
  {
    id: 'lofi_cieplo',
    name: 'Lo-Fi Ciepło Radiowe',
    subtitle: 'Nocne studio i deszcz za oknem',
    description: 'Spokojny pokój nocą, ciepła lampka, krople deszczu za oknem, kręcąca się szpula; stworzony do zapowiedzi podcastu „Szkoła gatunków”.',
    pillar: 'MuzaIK Podcast — Szkoła gatunków',
    paletteHex: ['#0B1D3A', '#F59E0B', '#14B8A6', '#FDE68A', '#1E293B'],
    avoid: ['dominant purple', 'text', 'letters', 'logos'],
    lighting: 'Ciepłe światło lampy biurkowej kontrastujące z nocnym błękitem za oknem',
    texture: 'Krople deszczu na szybie, ciepłe drewno, analogowy sprzęt audio'
  },
  {
    id: 'retro_reggae_sunset',
    name: 'Retro Reggae Sunset',
    subtitle: 'Ciepła taśma i nadmorski zachód',
    description: 'Ciepła taśma filmowa, palmy i zachód słońca nad morzem, szmaragdowa zieleń + złoto + koral, luźny bujający ruch kamery.',
    pillar: 'Retro Emotion & Reggae',
    paletteHex: ['#064E3B', '#10B981', '#F59E0B', '#FB7185', '#FEF3C7'],
    avoid: ['dominant purple', 'text', 'letters', 'logos'],
    lighting: 'Ciepłe pomarańczowo-złote słońce nisko nad wodą',
    texture: 'Taśma 16mm z ciepłym halationem i lekkim ziarnem'
  },
  {
    id: 'dark_dubstep',
    name: 'Dark Dubstep Bass',
    subtitle: 'Ciężki bas w obrazie i stroboskop',
    description: 'Wstrząsy kamery na wobble, stroboskop, głęboka czerń + neonowa czerwień + lodowa biel, unoszące się w powietrzu cząsteczki pyłu.',
    pillar: 'Dark Dance & Dubstep',
    paletteHex: ['#050508', '#FF3B3B', '#E2F1FF', '#18C4C4', '#334155'],
    avoid: ['dominant purple', 'text', 'letters', 'logos'],
    lighting: 'Rytmiczny stroboskop, ostre krawędzie światła w ciemnej przestrzeni',
    texture: 'Zawieszone w powietrzu drobiny pyłu i falujące powietrze od subbasu'
  }
];

export const PRESET_IDS = AESTHETIC_PRESETS.map((p) => p.id);

export function getPreset(id: string | null | undefined): AestheticPreset | null {
  return AESTHETIC_PRESETS.find((p) => p.id === id) ?? null;
}

export const ChannelProfileSchema = z.object({
  /** true = values are placeholders from the AI Studio module, not yet confirmed. */
  placeholder: z.boolean(),
  slogan: z.string(),
  concept: z.string(),
  pillars: z.array(z.object({ name: z.string(), preset: z.string() })),
  secondary: z.array(z.string()),
  channelTeaserPreset: z.string(),
  youtubeHandle: z.string(),
  series: z.array(z.object({ name: z.string(), format: z.string(), firstEpisode: z.string() })),
  mascots: z.object({ count: z.number(), names: z.array(z.string()), style: z.string() }),
  visualStyle: z.string(),
  visualNever: z.array(z.string()),
  /** Link name → URL; only names listed in descriptionLinks may appear in YouTube descriptions. */
  links: z.record(z.string(), z.string()),
  descriptionLinks: z.array(z.string()),
  /** Who speaks in YouTube descriptions: the creator (1st person, feminine — muzaik rule since 23.10) or DJ MuzaIK. */
  descriptionVoice: z.enum(['tworczyni', 'dj']),
  djVoice: z.string(),
  /** Women in shots are artistic muses, never the creator's portrait. */
  museMotif: z.string(),
  /** Purple/magenta at most as an accent (share of the frame, %). */
  purpleMaxPercent: z.number(),
  updatedAt: z.string().nullable(),
});

export type ChannelProfile = z.infer<typeof ChannelProfileSchema>;

export const PLACEHOLDER_PROFILE: ChannelProfile = {
  placeholder: true,
  slogan: 'MuzaIK – Nostalgia w Nowym Wymiarze',
  concept: 'Reinterpretacje inspirowane muzyką lat 80. i 90. w nowym, często mroczniejszym i bardziej emocjonalnym brzmieniu — przeszłość spotyka się z przyszłością. Każdy utwór to osobna historia i emocja.',
  pillars: [
    { name: 'Synthwave & Dark Dance', preset: 'niebo_synthwave / dark_dance_noir' },
    { name: 'Cinematic Energy & Pop', preset: 'cinematic_energy' },
    { name: 'Retro Emotion & Reggae', preset: 'retro_reggae_sunset' },
    { name: 'Dark Dance & Dubstep', preset: 'dark_dubstep' },
  ],
  secondary: ['Darkwave', 'Slowdance', 'Electro', 'Orchestral Folk'],
  channelTeaserPreset: 'nostalgia_nowy_wymiar',
  youtubeHandle: '@muza_ik',
  series: [{ name: 'Szkoła gatunków', format: 'MuzaIK Podcast', firstEpisode: 'Dark dance' }],
  mascots: {
    count: 9,
    names: ['Kasetka Kasia (kaseta)', 'Nutka Nela (nutka)', 'Cedek Cezary (płyta CD)', 'Winyl Wiktor (winyl)', 'Syntek (syntezator)', 'Mikrofon Maks (mikrofon)', 'Słuchawka Sonia (słuchawki retro)', 'Walkman Wojtek (walkman)', 'Głośnik Gabi (kolumna basowa)'],
    style: 'postacie-ikony z rękami i nogami, oldschool; cameo, przejścia albo plansza końcowa',
  },
  visualStyle: 'maksymalnie kolorowe, żywe, nasycone; częsty motyw: kobieca postać-muza',
  visualNever: ['tekst/litery w generowanym obrazie', 'logotypy platform', 'dominujący fiolet', 'twarz twórczyni'],
  links: {
    website: 'https://muzaik.channel',
    radio: 'https://muzaik.channel/radio',
    magazine: 'https://muzaik.channel/magazyn',
    spotify: 'https://open.spotify.com/artist/1OjBhDDXPON4d9tHcGSUKn',
    shop: 'https://store.vizai.art',
  },
  descriptionLinks: ['website', 'radio', 'magazine'],
  descriptionVoice: 'tworczyni',
  djVoice: 'ciepły, nocny, radiowy, pewny siebie; o sobie w 1. osobie',
  museMotif: 'Postać kobieca w kadrze to artystyczna muza, nigdy portret twórczyni; twarzy twórczyni nie pokazujemy.',
  purpleMaxPercent: 15,
  updatedAt: null,
};

/** What the AI Studio module said that muzaik.channel rules forbid — not taken over; shown to the owner to decide. */
export const PROFILE_CONFLICTS: string[] = [
  'Imię twórczyni („Beti”) — muzaik.channel mówi o autorce wyłącznie „Twórczyni MuzaIK”, bez imienia.',
  'Projekt siostrzany „DarkaIK” i angielska wersja dla jego publiczności — to dawna nazwa tej samej autorki, której kanał nigdy nie używa.',
  'Linki bandlab/suno pod dawną nazwą „istrella” — pominięte (dawna nazwa).',
  'Statystyki kanału (subskrypcje, filmy, wyświetlenia) — nie trafiają do treści; liczby kanału nie są cytowane.',
  'Zwiastuny coverów z flagą „is_cleared” — tu tylko utwory autorskie (decyzja z planu; Content ID).',
  'Opis YouTube głosem DJ-a w 3. osobie o twórczyni — muzaik.channel od 23.10 pisze opisy w 1. osobie, w rodzaju żeńskim. Do wyboru w profilu („Głos opisu”).',
  'Ograniczenie fioletu do akcentu — kolory marki muzaik.channel to cyan, fiolet i róż. Prompty wideo ograniczają fiolet; plansze programu biorą kolory marki z muzaik.db.',
  'Sklep store.vizai.art w linkach — w profilu jest, ale domyślnie nie trafia do opisów (włącz w „Linki w opisie”, jeśli to ten sam ekosystem).',
];

/** Merge a stored/imported profile over the placeholder; anything invalid falls back field by field. */
export function normalizeProfile(raw: unknown): ChannelProfile {
  const base = { ...PLACEHOLDER_PROFILE };
  if (!raw || typeof raw !== 'object') return base;
  const merged = { ...base, ...(raw as Record<string, unknown>) };
  const parsed = ChannelProfileSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(ChannelProfileSchema.shape) as (keyof ChannelProfile)[]) {
    const one = ChannelProfileSchema.shape[key].safeParse((raw as Record<string, unknown>)[key]);
    if (one.success) out[key] = one.data;
  }
  return out as ChannelProfile;
}
