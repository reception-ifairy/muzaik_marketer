import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import type { SettingsStore } from './store';
import { decryptSecret, encryptSecret, keyHint } from './secrets';
import type { MaterialService } from './materials';

// YouTube for the finished material (pattern from VizAI Marketer server/youtube.ts + ytUploads.ts, reduced to what the
// studio needs): OAuth with the owner's own Google Cloud client (Settings → YouTube, encrypted; env YOUTUBE_CLIENT_ID /
// YOUTUBE_CLIENT_SECRET fallback), ONLY the MuzaIK channel is accepted (YOUTUBE_CHANNEL_ID, else muzaik.db's
// api_youtube_channel_id). Writes — a private upload and "set as channel trailer" — run only on the owner's click, each
// after a fresh check that the token belongs to that channel. channels.update deletes omitted brandingSettings fields,
// so the trailer change re-reads the channel and sends everything back with one field changed.

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = () => process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3';
const UPLOAD_API = () => process.env.YOUTUBE_UPLOAD_BASE || 'https://www.googleapis.com/upload/youtube/v3';
const DOC = 'youtube_auth';
const STATE_TTL = 10 * 60 * 1000;
const CHUNK = 16 * 1024 * 1024;

interface AuthDoc {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  channelId?: string;
  channelTitle?: string;
  connectedAt?: string;
  error?: string | null;
}

export interface YoutubeStatus {
  clientConfigured: boolean;
  clientHint: string | null;
  expectedChannel: string | null;
  connected: boolean;
  channelTitle: string | null;
  error: string | null;
}

export class YoutubeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export class YoutubeService {
  private states = new Map<string, number>();
  private access: { token: string; expires: number } | null = null;
  private uploading = false;

  constructor(private readonly store: SettingsStore, private readonly channelFromMuzaik: () => string | null) {}

  expectedChannel(): string | null {
    return process.env.YOUTUBE_CHANNEL_ID?.trim() || this.channelFromMuzaik();
  }

  private async auth(): Promise<AuthDoc> {
    return (await this.store.getDoc(DOC)) as AuthDoc;
  }

  private async client(): Promise<{ id: string; secret: string } | null> {
    const d = await this.auth();
    const secret = d.clientSecret ? decryptSecret(d.clientSecret) : null;
    if (d.clientId && secret) return { id: d.clientId, secret };
    const id = process.env.YOUTUBE_CLIENT_ID?.trim();
    const s = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    return id && s ? { id, secret: s } : null;
  }

  async status(): Promise<YoutubeStatus> {
    const d = await this.auth();
    const c = await this.client();
    return {
      clientConfigured: Boolean(c), clientHint: c ? keyHint(c.id.replace('.apps.googleusercontent.com', '')) : null,
      expectedChannel: this.expectedChannel(), connected: Boolean(d.refreshToken && c && !d.error),
      channelTitle: d.channelTitle ?? null, error: d.error ?? null,
    };
  }

  async saveClient(clientId: string, clientSecret: string) {
    const id = clientId.trim();
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new YoutubeError('Client ID powinien kończyć się na .apps.googleusercontent.com.');
    if (clientSecret.trim().length < 10) throw new YoutubeError('Wklej Client secret z Google Cloud.');
    const d = await this.auth();
    await this.store.saveDoc(DOC, { ...(d.clientId && d.clientId !== id ? {} : d), clientId: id, clientSecret: encryptSecret(clientSecret.trim()), error: null });
    this.access = null;
  }

  redirectUri(req: express.Request): string {
    return process.env.YOUTUBE_REDIRECT_URI?.trim() || `${req.protocol}://${req.get('host')}/api/youtube/callback`;
  }

  async authorizationUrl(req: express.Request): Promise<string> {
    const c = await this.client();
    if (!c) throw new YoutubeError('Najpierw wklej Client ID i Client secret (Ustawienia → YouTube).');
    if (!this.expectedChannel()) throw new YoutubeError('Nie znam ID kanału MuzaIK — ustaw YOUTUBE_CHANNEL_ID albo sprawdź połączenie z bazą muzaik.channel.');
    const now = Date.now();
    for (const [s, t] of this.states) if (now - t > STATE_TTL) this.states.delete(s);
    const state = crypto.randomBytes(16).toString('hex');
    this.states.set(state, now);
    return `${AUTH_URL}?${new URLSearchParams({
      client_id: c.id, redirect_uri: this.redirectUri(req), response_type: 'code', scope: SCOPES.join(' '),
      access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true', state,
    })}`;
  }

  async complete(req: express.Request): Promise<string> {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const started = this.states.get(state);
    this.states.delete(state);
    if (!started || Date.now() - started > STATE_TTL) throw new YoutubeError('Logowanie wygasło albo nie pochodzi z tej aplikacji. Połącz jeszcze raz.');
    if (typeof req.query.error === 'string') throw new YoutubeError(req.query.error === 'access_denied' ? 'Odmówiono dostępu w oknie Google.' : `Google zwrócił błąd: ${req.query.error}.`);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const c = await this.client();
    if (!code || !c) throw new YoutubeError('Brak kodu logowania albo danych klienta OAuth.');
    const res = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: this.redirectUri(req), grant_type: 'authorization_code' }),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!res.ok || !data.access_token || !data.refresh_token) throw new YoutubeError(`Google nie wydał tokenu: ${data.error_description || data.error || 'brak tokenu odświeżania'}.`);
    const ch = ((await this.get(data.access_token, 'channels', { part: 'snippet', mine: 'true' })) as { items?: { id: string; snippet?: { title?: string } }[] }).items?.[0];
    const expected = this.expectedChannel();
    if (!ch || ch.id !== expected) {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => undefined);
      throw new YoutubeError(`Wybrano kanał „${ch?.snippet?.title ?? 'bez kanału'}”, a ta aplikacja przyjmuje tylko kanał MuzaIK (${expected}). Połącz ponownie i wybierz właściwy kanał.`);
    }
    const d = await this.auth();
    await this.store.saveDoc(DOC, { ...d, refreshToken: encryptSecret(data.refresh_token), channelId: ch.id, channelTitle: ch.snippet?.title ?? ch.id, connectedAt: new Date().toISOString(), error: null });
    this.access = { token: data.access_token, expires: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000 };
    return ch.snippet?.title ?? ch.id;
  }

  async disconnect() {
    const d = await this.auth();
    const t = d.refreshToken ? decryptSecret(d.refreshToken) : null;
    if (t) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => undefined);
    await this.store.saveDoc(DOC, { clientId: d.clientId, clientSecret: d.clientSecret, error: null });
    this.access = null;
  }

  private async token(): Promise<string> {
    if (this.access && this.access.expires > Date.now()) return this.access.token;
    const d = await this.auth();
    const c = await this.client();
    const refresh = d.refreshToken ? decryptSecret(d.refreshToken) : null;
    if (!c || !refresh) throw new YoutubeError('YouTube nie jest połączony (Ustawienia → YouTube).');
    const res = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: refresh, grant_type: 'refresh_token' }),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !data.access_token) {
      if (data.error === 'invalid_grant') {
        await this.store.saveDoc(DOC, { ...d, error: 'Dostęp do YouTube wygasł albo został cofnięty. Połącz ponownie.' });
        throw new YoutubeError('Dostęp do YouTube wygasł albo został cofnięty. Połącz ponownie.');
      }
      throw new YoutubeError(`Nie udało się odświeżyć dostępu do YouTube (${data.error || res.status}).`, 502);
    }
    this.access = { token: data.access_token, expires: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000 };
    return data.access_token;
  }

  /** A token whose channel is MuzaIK — checked fresh before every write. */
  private async writeToken(): Promise<string> {
    const t = await this.token();
    const ch = ((await this.get(t, 'channels', { part: 'id', mine: 'true' })) as { items?: { id: string }[] }).items?.[0];
    if (!ch || ch.id !== this.expectedChannel()) throw new YoutubeError('Token nie należy do kanału MuzaIK. Połącz ponownie i wybierz właściwy kanał.');
    return t;
  }

  private async get(token: string, resource: string, params: Record<string, string>): Promise<unknown> {
    const res = await fetch(`${API()}/${resource}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) throw new YoutubeError(`YouTube API ${res.status}: ${data.error?.message ?? 'błąd'}`, 502);
    return data;
  }

  /** Resumable upload, always private. madeForKids must be answered by the owner (no default). */
  async uploadPrivate(file: string, meta: { title: string; description: string; tags: string[]; madeForKids: boolean }): Promise<string> {
    if (this.uploading) throw new YoutubeError('Trwa już inna wysyłka — poczekaj na jej koniec.', 409);
    this.uploading = true;
    try {
      const token = await this.writeToken();
      const size = fs.statSync(file).size;
      const start = await fetch(`${UPLOAD_API()}/videos?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(size) },
        body: JSON.stringify({
          snippet: { title: meta.title.slice(0, 100), description: meta.description.slice(0, 5000), tags: meta.tags, categoryId: '10', defaultLanguage: 'pl' },
          status: { privacyStatus: 'private', selfDeclaredMadeForKids: meta.madeForKids, embeddable: true },
        }),
      });
      const session = start.headers.get('location');
      if (!start.ok || !session) throw new YoutubeError(`YouTube nie przyjął wysyłki (HTTP ${start.status}): ${(await start.text()).slice(0, 300)}`, 502);
      const fd = fs.openSync(file, 'r');
      try {
        let offset = 0;
        for (;;) {
          const len = Math.min(CHUNK, size - offset);
          const buf = Buffer.alloc(len);
          fs.readSync(fd, buf, 0, len, offset);
          let res: Response | null = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            res = await fetch(session, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Length': String(len), 'Content-Range': `bytes ${offset}-${offset + len - 1}/${size}` }, body: buf }).catch(() => null);
            if (res && res.status < 500) break;
            await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
          }
          if (!res) throw new YoutubeError('Sieć przerwała wysyłkę na YouTube.', 502);
          if (res.status === 308) {
            const range = res.headers.get('range');
            offset = range ? Number(range.split('-')[1]) + 1 : offset + len;
            continue;
          }
          const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
          if (!res.ok || !data.id) throw new YoutubeError(`YouTube odrzucił film: ${data.error?.message ?? res.status}`, 502);
          return data.id;
        }
      } finally {
        fs.closeSync(fd);
      }
    } finally {
      this.uploading = false;
    }
  }

  /** Sets the video as the channel trailer for non-subscribers; every other branding field is sent back unchanged. */
  async setChannelTrailer(videoId: string): Promise<void> {
    if (!/^[\w-]{11}$/.test(videoId)) throw new YoutubeError('Zły identyfikator filmu.');
    const token = await this.writeToken();
    const fresh = ((await this.get(token, 'channels', { part: 'brandingSettings', mine: 'true' })) as { items?: { id: string; brandingSettings?: Record<string, unknown> }[] }).items?.[0];
    if (!fresh) throw new YoutubeError('Nie udało się odczytać kanału.', 502);
    const branding = JSON.parse(JSON.stringify(fresh.brandingSettings ?? {})) as { channel?: Record<string, unknown> };
    branding.channel = { ...(branding.channel ?? {}), unsubscribedTrailer: videoId };
    const res = await fetch(`${API()}/channels?part=brandingSettings`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fresh.id, brandingSettings: branding }),
    });
    if (!res.ok) throw new YoutubeError(`YouTube nie ustawił zwiastuna: ${(await res.text()).slice(0, 300)}`, 502);
  }
}

export function createYoutubeRouter(yt: YoutubeService, materials: MaterialService): express.Router {
  const router = express.Router();
  const fail = (res: express.Response, err: unknown) => res.status(err instanceof YoutubeError ? err.status : 500).json({ error: (err as Error).message });

  router.get('/status', async (_req, res) => res.json(await yt.status()));
  router.put('/client', async (req, res) => {
    try { await yt.saveClient(String(req.body?.clientId ?? ''), String(req.body?.clientSecret ?? '')); res.json(await yt.status()); } catch (err) { fail(res, err); }
  });
  router.get('/connect', async (req, res) => {
    try { res.redirect(await yt.authorizationUrl(req)); } catch (err) { res.redirect(`/#pulpit?youtube_error=${encodeURIComponent((err as Error).message)}`); }
  });
  router.get('/callback', async (req, res) => {
    try { await yt.complete(req); res.redirect('/#pulpit?youtube=ok'); } catch (err) { res.redirect(`/#pulpit?youtube_error=${encodeURIComponent((err as Error).message)}`); }
  });
  router.post('/disconnect', async (_req, res) => { await yt.disconnect(); res.json(await yt.status()); });

  /** Owner's click: upload one rendered file as PRIVATE; optionally set it as the channel trailer right after. */
  router.post('/publish/:id', async (req, res) => {
    try {
      const p = await materials.get(req.params.id);
      if (!p) return res.status(404).json({ error: 'Nie ma takiego materiału.' });
      if (req.body?.confirm !== true) return res.status(400).json({ error: 'Wysyłka wymaga potwierdzenia.' });
      if (typeof req.body?.madeForKids !== 'boolean') return res.status(400).json({ error: 'Odpowiedz, czy film jest przeznaczony dla dzieci.' });
      const name = String(req.body?.file ?? '');
      const file = materials.renderedFile(p, name);
      if (!file || p.render.state !== 'done') return res.status(400).json({ error: 'Najpierw wyrenderuj film.' });
      const format = p.render.files.find((f) => f.name === name)!.format;
      const videoId = await yt.uploadPrivate(file, { title: p.copy.title, description: p.copy.description, tags: p.copy.tags, madeForKids: req.body.madeForKids });
      let trailer = false;
      let trailerError: string | null = null;
      if (req.body?.asChannelTrailer === true && p.request.kind === 'zwiastun') {
        try { await yt.setChannelTrailer(videoId); trailer = true; } catch (err) { trailerError = (err as Error).message; }
      }
      await materials.markPublished(p.id, { videoId, format, at: Date.now(), asChannelTrailer: trailer });
      res.json({ videoId, trailer, trailerError, material: await materials.get(p.id) });
    } catch (err) {
      fail(res, err);
    }
  });
  return router;
}
