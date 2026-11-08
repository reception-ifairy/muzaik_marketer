import express from 'express';
import { KEY_PROVIDER_IDS, PROVIDER_INFO, type KeyProvider } from '../src/aiSettings';
import type { ProviderService } from './providers';
import { synthesizeSpeech, understandVoiceMessage } from './voice';
import { toHttpError } from './errors';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~4 min of 16 kHz mono WAV; the client stops at 60 s

function providerParam(req: express.Request): KeyProvider | null {
  const p = req.params.provider as KeyProvider;
  return KEY_PROVIDER_IDS.includes(p) ? p : null;
}

/** /api/settings — owner-only AI configuration. Keys are write-only: responses carry only a hint. */
export function createSettingsRouter(providers: ProviderService): express.Router {
  const router = express.Router();

  const send = async (res: express.Response) => res.json(await providers.getSettings());
  const fail = (res: express.Response, err: unknown, provider?: KeyProvider) => {
    const { status, message } = toHttpError(err, provider);
    console.error('Settings error:', err);
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  };

  router.get('/', async (_req, res) => {
    try {
      await send(res);
    } catch (err) {
      fail(res, err);
    }
  });

  router.put('/prefs', async (req, res) => {
    try {
      await providers.savePrefs(req.body ?? {});
      await send(res);
    } catch (err) {
      fail(res, err);
    }
  });

  router.put('/keys/:provider', async (req, res) => {
    const provider = providerParam(req);
    if (!provider) return res.status(404).json({ error: 'Nieznany dostawca.' });
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (key.length < 10 || key.length > 400 || /\s/.test(key)) {
      return res.status(400).json({ error: `To nie wygląda na klucz ${PROVIDER_INFO[provider].company}. Wklej cały klucz bez spacji.` });
    }
    try {
      await providers.saveKey(provider, key);
      await send(res);
    } catch (err) {
      fail(res, err, provider);
    }
  });

  router.post('/keys/:provider/test', async (req, res) => {
    const provider = providerParam(req);
    if (!provider) return res.status(404).json({ error: 'Nieznany dostawca.' });
    try {
      await providers.testKey(provider);
      await send(res);
    } catch (err) {
      fail(res, err, provider);
    }
  });

  router.delete('/keys/:provider', async (req, res) => {
    const provider = providerParam(req);
    if (!provider) return res.status(404).json({ error: 'Nieznany dostawca.' });
    try {
      await providers.deleteKey(provider);
      await send(res);
    } catch (err) {
      fail(res, err, provider);
    }
  });

  return router;
}

/** /api/voice — Gemini text-to-speech and voice-message understanding. */
export function createVoiceRouter(providers: ProviderService): express.Router {
  const router = express.Router();

  const googleKey = async (res: express.Response) => {
    const key = await providers.getKey('google');
    if (!key) res.status(400).json({ error: 'Głos wymaga klucza Google (Gemini). Dodaj go w Ustawieniach → Klucze API.' });
    return key;
  };

  const abortOnClose = (res: express.Response) => {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    return controller.signal;
  };

  router.post('/tts', express.json({ limit: '64kb' }), async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const key = await googleKey(res);
    if (!key) return;
    try {
      const prefs = await providers.getPrefs();
      const voice = typeof req.body?.voiceName === 'string' ? req.body.voiceName : prefs.voice.voiceName;
      const wav = await synthesizeSpeech(key, prefs.voice.ttsModel, voice, text, abortOnClose(res));
      res.set({ 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }).send(wav);
    } catch (err) {
      const { status, message } = toHttpError(err, 'google');
      console.error('TTS failed:', err);
      if (!res.headersSent) res.status(status === 499 ? 499 : status).json({ error: message });
    }
  });

  router.post('/transcribe', express.raw({ type: ['audio/wav', 'audio/x-wav', 'audio/wave'], limit: MAX_AUDIO_BYTES }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000) {
      return res.status(400).json({ error: 'Nagranie jest puste albo za krótkie.' });
    }
    const key = await googleKey(res);
    if (!key) return;
    try {
      const prefs = await providers.getPrefs();
      res.json(await understandVoiceMessage(key, prefs.stt.model, req.body, abortOnClose(res)));
    } catch (err) {
      const { status, message } = toHttpError(err, 'google');
      console.error('Transcription failed:', err);
      if (!res.headersSent) res.status(status).json({ error: message });
    }
  });

  return router;
}
