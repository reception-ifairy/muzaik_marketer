import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { SettingsStore } from './store';
import { decryptSecret, encryptSecret, keyHint } from './secrets';
import { audioCacheDir, publicFileSource } from './muzaikData';

// Track audio and muzaik.channel images for the edit, kept in data/audio and data/assets.
// Audio, in order: our own copy → muzaik.channel's podcast cache on this machine → AzuraCast with the marketer's OWN
// read key (Settings → MuzaIK; env AZURACAST_* as fallback; we never read muzaik.db's key) → the owner uploads the file.

const DOC = 'azuracast';
export const MAX_AUDIO_BYTES = 80 * 1024 * 1024;

interface AzuraDoc {
  baseUrl?: string;
  stationId?: string;
  key?: string; // encrypted
  hint?: string;
}

export interface AzuraStatus {
  baseUrl: string;
  stationId: string;
  hint: string | null;
  source: 'settings' | 'env' | null;
}

export class AudioError extends Error {}

/** MP3 (ID3 or frame sync), WAV, FLAC, OGG, M4A by magic bytes — anything else is refused. */
export function audioKind(buf: Buffer): 'mp3' | 'wav' | 'flac' | 'ogg' | 'm4a' | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (buf.subarray(0, 4).toString('latin1') === 'fLaC') return 'flac';
  if (buf.subarray(0, 4).toString('latin1') === 'OggS') return 'ogg';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  return null;
}

export class AudioService {
  private readonly audioDir: string;
  private readonly assetDir: string;

  constructor(private readonly store: SettingsStore, appDir: string) {
    this.audioDir = path.join(appDir, 'data', 'audio');
    this.assetDir = path.join(appDir, 'data', 'assets');
  }

  private async doc(): Promise<AzuraDoc> {
    return (await this.store.getDoc(DOC)) as AzuraDoc;
  }

  async azuraStatus(): Promise<AzuraStatus> {
    const d = await this.doc();
    const envKey = process.env.AZURACAST_API_KEY;
    return {
      baseUrl: d.baseUrl || process.env.AZURACAST_BASE_URL || 'https://radio.t1000.website',
      stationId: d.stationId || process.env.AZURACAST_STATION_ID || '1',
      hint: d.key ? d.hint ?? '••••' : envKey ? keyHint(envKey) : null,
      source: d.key ? 'settings' : envKey ? 'env' : null,
    };
  }

  async saveAzura(input: { baseUrl?: string; stationId?: string; key?: string | null }) {
    const d = await this.doc();
    const next: AzuraDoc = { ...d };
    if (typeof input.baseUrl === 'string') {
      const u = input.baseUrl.trim().replace(/\/+$/, '');
      if (u && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u)) throw new AudioError('Adres AzuraCast musi zaczynać się od https:// i nie mieć ścieżki.');
      next.baseUrl = u || undefined;
    }
    if (typeof input.stationId === 'string') {
      const s = input.stationId.trim();
      if (s && !/^\d{1,6}$/.test(s)) throw new AudioError('Numer stacji to liczba (np. 1).');
      next.stationId = s || undefined;
    }
    if (input.key === null) { delete next.key; delete next.hint; }
    else if (typeof input.key === 'string' && input.key.trim()) {
      const k = input.key.trim();
      if (!/^[\w-]{8,}:[\w-]{8,}$/.test(k)) throw new AudioError('Klucz API AzuraCast ma postać id:sekret.');
      next.key = encryptSecret(k);
      next.hint = keyHint(k);
    }
    await this.store.saveDoc(DOC, next);
    return this.azuraStatus();
  }

  private async azuraKey(): Promise<string | null> {
    const d = await this.doc();
    if (d.key) return decryptSecret(d.key);
    return process.env.AZURACAST_API_KEY || null;
  }

  private ownFile(mediaId: number): string | null {
    for (const ext of ['mp3', 'wav', 'flac', 'ogg', 'm4a']) {
      const f = path.join(this.audioDir, `${mediaId}.${ext}`);
      if (fs.existsSync(f)) return f;
    }
    return null;
  }

  /** Where the track's audio is right now, without downloading (for the UI). */
  async availability(mediaId: number): Promise<'own' | 'muzaik-cache' | 'azuracast' | 'missing'> {
    if (this.ownFile(mediaId)) return 'own';
    const cache = audioCacheDir();
    if (cache && fs.existsSync(path.join(cache, `${mediaId}.mp3`))) return 'muzaik-cache';
    return (await this.azuraKey()) ? 'azuracast' : 'missing';
  }

  /** Local path of the track's audio, fetching it once if needed. */
  async trackFile(mediaId: number, signal?: AbortSignal): Promise<string> {
    const own = this.ownFile(mediaId);
    if (own) return own;
    fs.mkdirSync(this.audioDir, { recursive: true });
    const target = path.join(this.audioDir, `${mediaId}.mp3`);
    const cache = audioCacheDir();
    const cached = cache ? path.join(cache, `${mediaId}.mp3`) : null;
    if (cached && fs.existsSync(cached)) {
      fs.copyFileSync(cached, target);
      return target;
    }
    const key = await this.azuraKey();
    if (!key) throw new AudioError('Nie mam pliku tego utworu. Wgraj go (przycisk „Wgraj plik utworu”) albo dodaj klucz AzuraCast w Ustawieniach → MuzaIK.');
    const st = await this.azuraStatus();
    const res = await fetch(`${st.baseUrl}/api/station/${st.stationId}/file/${Math.floor(mediaId)}/play`, { headers: { 'X-API-Key': key }, signal });
    if (!res.ok) throw new AudioError(`AzuraCast nie oddał pliku (HTTP ${res.status}). Sprawdź klucz i numer stacji albo wgraj plik ręcznie.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_AUDIO_BYTES || !audioKind(buf)) throw new AudioError('AzuraCast oddał coś, co nie jest plikiem audio.');
    fs.writeFileSync(target, buf);
    return target;
  }

  saveUpload(mediaId: number, buf: Buffer): string {
    const kind = audioKind(buf);
    if (!kind) throw new AudioError('To nie jest plik audio (MP3, WAV, FLAC, OGG albo M4A).');
    if (buf.length > MAX_AUDIO_BYTES) throw new AudioError('Plik jest większy niż 80 MB.');
    fs.mkdirSync(this.audioDir, { recursive: true });
    const old = this.ownFile(mediaId);
    if (old) fs.rmSync(old, { force: true });
    const target = path.join(this.audioDir, `${mediaId}.${kind}`);
    fs.writeFileSync(target, buf);
    return target;
  }

  /** A muzaik.channel public image (scene layer, cover) as a local file, cached by URL hash. */
  async publicImage(url: string, signal?: AbortSignal): Promise<string> {
    const src = publicFileSource(url);
    if (!src) throw new AudioError(`Niepoprawny adres obrazu: ${url}`);
    if ('file' in src) return src.file;
    fs.mkdirSync(this.assetDir, { recursive: true });
    const name = crypto.createHash('sha256').update(src.url).digest('hex').slice(0, 24) + path.extname(new URL(src.url).pathname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const target = path.join(this.assetDir, name);
    if (fs.existsSync(target)) return target;
    const res = await fetch(src.url, { signal });
    if (!res.ok) throw new AudioError(`muzaik.channel nie oddał obrazu ${url} (HTTP ${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) throw new AudioError('Obraz jest za duży.');
    fs.writeFileSync(target, buf);
    return target;
  }
}
