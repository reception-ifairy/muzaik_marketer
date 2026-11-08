import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_BRAND, LEGACY_NAMES, type Article, type BrandKit, type MuzaikOverview, type MuzaikStatus, type ParallaxScene, type Premiere, type TrackCard } from '../src/muzaik';

// Bridge to muzaik.channel: its SQLite database (MUZAIK_DB_PATH, default /var/www/muzaik.channel/muzaik.db) opened
// READ-ONLY. We read track cards, Parallax scenes, premieres, published articles and the brand colours — never secrets
// (AzuraCast/YouTube keys live in muzaik.db, the marketer has its own) and never write. Every read is wrapped: a missing
// table or an old schema gives an empty list and a note, not a crash. The data is cached for CACHE_MS.

const DEFAULT_DB = '/var/www/muzaik.channel/muzaik.db';
const CACHE_MS = 60_000;

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.replace(LEGACY_NAMES, 'MuzaIK').trim().slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown, max = 20) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => str(x, 200)).slice(0, max) : []);
const parse = (v: unknown): Record<string, unknown> => {
  if (typeof v !== 'string') return {};
  try {
    const p = JSON.parse(v);
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
};

export function dbPath(): string {
  return process.env.MUZAIK_DB_PATH || DEFAULT_DB;
}

/** Maps one `podcast_karty` row (dane_json + status) to a TrackCard. Exported for tests. */
export function cardFromRow(row: { media_id: number; dane_json: string; status: string }): TrackCard | null {
  const d = parse(row.dane_json);
  const title = str(d.tytul, 200);
  if (!title) return null;
  const pomiar = (d.pomiar && typeof d.pomiar === 'object' ? d.pomiar : {}) as Record<string, unknown>;
  const muzyka = (d.muzyka && typeof d.muzyka === 'object' ? d.muzyka : {}) as Record<string, unknown>;
  const yt = d.youtube && typeof d.youtube === 'object' ? (d.youtube as Record<string, unknown>) : null;
  const duration = num(d.dlugoscSek) ?? num(pomiar.dlugosc) ?? 0;
  const instrumental = Array.isArray(d.instrumentalne)
    ? (d.instrumentalne as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
    : [];
  return {
    mediaId: row.media_id,
    title,
    cover: d.cover === true,
    status: row.status,
    sound: str(d.brzmienie, 600),
    instruments: strs(d.instrumenty),
    tempo: str(d.tempo, 20),
    bpm: num(d.bpm),
    moods: strs(d.nastroj),
    vocal: str(d.wokal, 200),
    about: str(d.oCzym, 600),
    chorusStart: num(d.refrenStart),
    excerptStart: num(d.fragmentStart) ?? 0,
    instrumental,
    durationSec: duration,
    silenceStart: num(pomiar.ciszaPoczatek) ?? 0,
    silenceEnd: num(pomiar.ciszaKoniec) ?? 0,
    intro: num(pomiar.intro),
    outro: num(pomiar.outro),
    curve: Array.isArray(pomiar.krzywa) ? (pomiar.krzywa as unknown[]).filter((x): x is number => typeof x === 'number') : [],
    key: str(muzyka.tonacja, 30) || null,
    camelot: str(muzyka.camelot, 5) || null,
    energy: num(muzyka.energia),
    danceability: num(muzyka.tanecznosc),
    style: str(muzyka.styl, 300),
    genre: str(muzyka.gatunek, 60),
    youtube: yt && typeof yt.videoId === 'string'
      ? { videoId: yt.videoId, title: str(yt.tytul, 200), views: num(yt.wyswietlenia) ?? 0, public: typeof yt.publiczny === 'boolean' ? yt.publiczny : null }
      : null,
  };
}

export function sceneFromRow(row: Record<string, unknown>, onAirId: string | null): ParallaxScene | null {
  const id = typeof row.id === 'string' ? row.id : '';
  if (!id) return null;
  let layers: { url: string; depth: number }[] = [];
  try {
    const raw = JSON.parse(String(row.warstwy_json || '[]'));
    if (Array.isArray(raw)) layers = raw.filter((l) => l && typeof l.url === 'string' && typeof l.depth === 'number');
  } catch {
    layers = [];
  }
  const info = parse(row.info_json);
  const opis = (info.opis && typeof info.opis === 'object' ? info.opis : {}) as Record<string, unknown>;
  const layerInfo = Array.isArray(info.warstwy) ? (info.warstwy as Record<string, unknown>[]) : [];
  return {
    id,
    title: str(row.tytul, 120),
    accent: str(row.akcent, 20),
    intensity: num(row.intensywnosc) ?? 50,
    layers: layers.map((l, i) => ({ url: l.url, depth: l.depth, description: str(layerInfo[i]?.opis, 400), prompt: str(layerInfo[i]?.prompt, 1200) })),
    thumbnail: str(row.miniatura, 300),
    hero: str(opis.bohater, 200),
    place: str(opis.miejsce, 200),
    light: str(opis.swiatlo, 200),
    timeOfDay: str(opis.pora, 60),
    style: str(opis.styl, 200),
    moods: strs(opis.nastroj),
    palette: strs(opis.paleta).filter((c) => /^#[0-9a-f]{6}$/i.test(c)),
    onAir: id === onAirId,
  };
}

export class MuzaikData {
  private cache: { at: number; data: MuzaikOverview } | null = null;

  private open(): DatabaseSync {
    const file = dbPath();
    if (!fs.existsSync(file)) throw new Error(`Nie ma bazy muzaik.channel pod ${file} (ustaw MUZAIK_DB_PATH).`);
    return new DatabaseSync(file, { readOnly: true });
  }

  /** Runs a read; a missing table (old schema) gives the fallback instead of an error. */
  private read<T>(db: DatabaseSync, notes: string[], label: string, fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      notes.push(`${label}: ${(err as Error).message}`);
      return fallback;
    }
  }

  overview(force = false): MuzaikOverview {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.data;
    const notes: string[] = [];
    let tracks: TrackCard[] = [];
    let scenes: ParallaxScene[] = [];
    let premieres: Premiere[] = [];
    let articles: Article[] = [];
    let brand: BrandKit = { ...DEFAULT_BRAND, colors: { ...DEFAULT_BRAND.colors } };
    let connected = false;
    try {
      const db = this.open();
      connected = true;
      try {
        const setting = (key: string): string => this.read(db, [], key, () => {
          const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: unknown } | undefined;
          return typeof r?.value === 'string' ? r.value : '';
        }, '');
        tracks = this.read(db, notes, 'Karty utworów', () =>
          (db.prepare('SELECT media_id, dane_json, status FROM podcast_karty').all() as { media_id: number; dane_json: string; status: string }[])
            .map(cardFromRow).filter((c): c is TrackCard => c !== null)
            .sort((a, b) => a.title.localeCompare(b.title, 'pl')), []);
        const onAir = /\/media\/admin\/parallax\/([a-z0-9-]+)\//.exec(setting('live_obs_parallax_layers'))?.[1] ?? null;
        scenes = this.read(db, notes, 'Sceny Parallax', () =>
          (db.prepare('SELECT * FROM parallax_sceny ORDER BY created_at DESC').all() as Record<string, unknown>[])
            .map((r) => sceneFromRow(r, onAir)).filter((s): s is ParallaxScene => s !== null), []);
        premieres = this.read(db, notes, 'Premiery', () =>
          (db.prepare('SELECT * FROM premiery ORDER BY data_premiery DESC').all() as Record<string, unknown>[]).map((r) => ({
            id: Number(r.id), slug: str(r.slug, 120), title: str(r.tytul, 200), date: str(r.data_premiery, 30), description: str(r.opis, 1000),
            story: str(r.historia, 2000), cover: str(r.okladka, 300), color: str(r.kolor, 20), hyperfollowUrl: str(r.hyperfollow_url, 300),
            appleUrl: str(r.apple_url, 300), youtubeId: str(r.youtube_id, 20), visible: Number(r.widoczna) === 1,
          })), []);
        articles = this.read(db, notes, 'Magazyn', () =>
          (db.prepare("SELECT slug, tytul, dzial, streszczenie, opublikowano FROM artykuly WHERE status = 'opublikowany' ORDER BY opublikowano DESC LIMIT 60").all() as Record<string, unknown>[])
            .map((r) => ({ slug: str(r.slug, 160), title: str(r.tytul, 200), section: str(r.dzial, 40), summary: str(r.streszczenie, 600), publishedAt: str(r.opublikowano, 30) })), []);
        const hex = (v: string, d: string) => (/^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : d);
        brand = {
          colors: {
            bg: hex(setting('design_bg'), DEFAULT_BRAND.colors.bg),
            cyan: hex(setting('design_accent_cyan'), DEFAULT_BRAND.colors.cyan),
            purple: hex(setting('design_accent_purple'), DEFAULT_BRAND.colors.purple),
            pink: hex(setting('design_accent_pink'), DEFAULT_BRAND.colors.pink),
          },
          youtubeChannelId: /^UC[\w-]{20,}$/.test(setting('api_youtube_channel_id').trim()) ? setting('api_youtube_channel_id').trim() : null,
          siteUrl: DEFAULT_BRAND.siteUrl,
        };
      } finally {
        db.close();
      }
    } catch (err) {
      notes.push((err as Error).message);
    }

    const cacheDir = audioCacheDir();
    const status: MuzaikStatus = {
      connected,
      dbPath: dbPath(),
      note: notes.length ? notes.join(' · ') : null,
      counts: {
        tracks: tracks.length,
        authored: tracks.filter((t) => !t.cover).length,
        accepted: tracks.filter((t) => !t.cover && t.status === 'zaakceptowana').length,
        scenes: scenes.length,
        premieres: premieres.length,
        articles: articles.length,
      },
      audio: { cacheDir, azuracast: false },
    };
    const data: MuzaikOverview = { status, tracks, scenes, premieres, articles, brand };
    this.cache = { at: Date.now(), data };
    return data;
  }

  track(mediaId: number): TrackCard | null {
    return this.overview().tracks.find((t) => t.mediaId === mediaId) ?? null;
  }

  scene(id: string): ParallaxScene | null {
    return this.overview().scenes.find((s) => s.id === id) ?? null;
  }

  premiere(id: number): Premiere | null {
    return this.overview().premieres.find((p) => p.id === id) ?? null;
  }

  article(slug: string): Article | null {
    return this.overview().articles.find((a) => a.slug === slug) ?? null;
  }
}

/** muzaik.channel's podcast cache of track files (`<MUZAIK_PODCAST_DIR>/utwory/<id>.mp3`), when present on this machine. */
export function audioCacheDir(): string | null {
  const base = process.env.MUZAIK_PODCAST_DIR || '/var/lib/muzaik-podcast';
  const dir = path.join(base, 'utwory');
  return fs.existsSync(dir) ? dir : null;
}

/** Where muzaik.channel's public files live (scene layers, covers): local folder first, else the public site. */
export function publicFileSource(url: string): { file: string } | { url: string } | null {
  if (!url.startsWith('/') || url.includes('..')) return null;
  const dir = process.env.MUZAIK_PUBLIC_DIR || '/var/www/muzaik.channel/public';
  const file = path.join(dir, url);
  if (file.startsWith(dir) && fs.existsSync(file)) return { file };
  return { url: `${process.env.MUZAIK_SITE_URL || DEFAULT_BRAND.siteUrl}${url}` };
}
