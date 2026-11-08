// Data read from muzaik.channel (its SQLite database, read-only): what the marketer is allowed to know about the channel.
// Shapes are a subset of muzaik.channel's own types (lib/podcast/muzyka.ts KartaUtworu, lib/parallax-sceny.ts, lib/premiery,
// lib/marka.ts). The server bridge is server/muzaikData.ts; nothing here is ever written back.

/** One track of the radio library with its card (listening notes, measurement, AI listening for DJ sets). */
export interface TrackCard {
  mediaId: number;
  title: string;
  /** true = a cover. Covers never go into marketing videos (Content ID) — the bridge marks them, the studio refuses them. */
  cover: boolean;
  /** muzaik.channel status: only 'zaakceptowana' cards are offered by default. */
  status: string;
  sound: string;
  instruments: string[];
  tempo: string;
  bpm: number | null;
  moods: string[];
  vocal: string;
  about: string;
  /** Refrain entry (s from the start) or null. */
  chorusStart: number | null;
  /** Best moment for an excerpt (s) — muzaik's podcast uses it. */
  excerptStart: number;
  /** Stretches without vocals [from, to] in seconds. */
  instrumental: [number, number][];
  durationSec: number;
  /** From the file measurement (muzaik `pomiar`): silence at both ends, intro/outro, 32-point loudness curve 0–1. */
  silenceStart: number;
  silenceEnd: number;
  intro: number | null;
  outro: number | null;
  curve: number[];
  /** From the AI listening (muzaik `muzyka`). */
  key: string | null;
  camelot: string | null;
  energy: number | null;
  danceability: number | null;
  style: string;
  genre: string;
  /** Full video of the track on the channel (public only), for the description link. */
  youtube: { videoId: string; title: string; views: number; public: boolean | null } | null;
}

export interface ParallaxScene {
  id: string;
  title: string;
  accent: string;
  intensity: number;
  /** Layer image URLs on muzaik.channel (`/media/admin/parallax/<id>/…`) with their depth (0.2 background … 1.35 at the camera). */
  layers: { url: string; depth: number; description: string; prompt: string }[];
  thumbnail: string;
  /** Scene description from Parallax Studio. */
  hero: string;
  place: string;
  light: string;
  timeOfDay: string;
  style: string;
  moods: string[];
  palette: string[];
  /** true = the scene currently on air in OBS. */
  onAir: boolean;
}

export interface Premiere {
  id: number;
  slug: string;
  title: string;
  date: string;
  description: string;
  story: string;
  cover: string;
  color: string;
  hyperfollowUrl: string;
  appleUrl: string;
  youtubeId: string;
  visible: boolean;
}

export interface Article {
  slug: string;
  title: string;
  section: string;
  summary: string;
  publishedAt: string;
}

export interface BrandKit {
  colors: { bg: string; cyan: string; purple: string; pink: string };
  /** Expected YouTube channel id (muzaik `api_youtube_channel_id`), not a secret. */
  youtubeChannelId: string | null;
  siteUrl: string;
}

export interface MuzaikStatus {
  connected: boolean;
  dbPath: string;
  note: string | null;
  counts: { tracks: number; authored: number; accepted: number; scenes: number; premieres: number; articles: number };
  audio: { cacheDir: string | null; azuracast: boolean };
}

export interface MuzaikOverview {
  status: MuzaikStatus;
  tracks: TrackCard[];
  scenes: ParallaxScene[];
  premieres: Premiere[];
  articles: Article[];
  brand: BrandKit;
}

export const DEFAULT_BRAND: BrandKit = {
  colors: { bg: '#030409', cyan: '#22d3ee', purple: '#a855f7', pink: '#ec4899' },
  youtubeChannelId: null,
  siteUrl: 'https://muzaik.channel',
};

/** Legacy names of the same author: never in any output (muzaik.channel rule). */
export const LEGACY_NAMES = /\b(darka\s*ik|darkaik|istrella)\b/gi;
