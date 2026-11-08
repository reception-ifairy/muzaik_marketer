import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP } from './src/config';
import { runResearch } from './server/research';
import { toHttpError } from './server/errors';
import { createStore } from './server/store';
import { ProviderService } from './server/providers';
import { createSettingsRouter, createVoiceRouter } from './server/settingsRoutes';
import { createChatRouter } from './server/chat';
import { MuzaikData } from './server/muzaikData';
import { AudioService } from './server/audio';
import { MaterialService, createMaterialsRouter, createMuzaikRouter } from './server/materials';
import { YoutubeService, createYoutubeRouter } from './server/youtube';
import { Handbook, createHandbookRouter } from './server/handbook';
import { OptionService, createOptionsRouter } from './server/options';
import { createAuthRouter, requireOwner } from './server/auth';
import { RESEARCH_SYSTEM, researchPrompt } from './server/prompts';
import { ResearchResultSchema } from './src/schema';
import type { ResearchRequest, ResearchResult, StreamEvent } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = createStore(__dirname);
const providers = new ProviderService(store);
const options = new OptionService(store, providers, __dirname);
const muzaik = new MuzaikData();
const audio = new AudioService(store, __dirname);
const materials = new MaterialService(store, providers, muzaik, audio, __dirname);
const youtube = new YoutubeService(store, () => muzaik.overview().brand.youtubeChannelId);
const handbook = new Handbook(__dirname);

/** Opens a server-sent-events response and returns helpers to emit events and detect disconnects. */
function openEventStream<T>(res: express.Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  const send = (event: StreamEvent<T>) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  return { send, signal: controller.signal, end: () => res.end() };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  // Local-only by default; set HOST=0.0.0.0 to expose the app on the network (e.g. in a container).
  const HOST = process.env.HOST || '127.0.0.1';
  // `--production` works on every OS, unlike setting NODE_ENV inline in an npm script.
  const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  // Owner login — every other /api route requires an active session.
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireOwner);

  app.use('/api/settings', createSettingsRouter(providers));
  app.use('/api/voice', createVoiceRouter(providers));
  app.use('/api/chat', createChatRouter(store, providers, __dirname));
  app.use('/api/options', createOptionsRouter(options, openEventStream));
  app.use('/api/muzaik', createMuzaikRouter(materials));
  app.use('/api/materials', createMaterialsRouter(materials, openEventStream));
  app.use('/api/youtube', createYoutubeRouter(youtube, materials));
  app.use('/api/handbook', createHandbookRouter(handbook));

  // Example feature: structured web research, streamed as SSE (progress, activity, result).
  app.post('/api/research', async (req, res) => {
    const body = req.body ?? {};
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 500) : '';
    if (!query) return res.status(400).json({ error: 'Napisz, czego mam poszukać.' });
    const engine = await providers.resolveEngine().catch((err) => ({ error: toHttpError(err).message }));
    if ('error' in engine) return res.status(400).json({ error: engine.error });

    const request: ResearchRequest = { query, depth: body.depth === 'thorough' ? 'thorough' : 'quick' };
    const verifier = engine.provider === 'anthropic' ? await providers.googleVerifier().catch(() => undefined) : undefined;
    const deep = request.depth === 'thorough';

    const stream = openEventStream<ResearchResult>(res);
    stream.send({ type: 'status', message: `${APP.assistantName} zaczyna szukać…` });
    try {
      const { data, meta } = await runResearch(engine, {
        system: RESEARCH_SYSTEM,
        prompt: researchPrompt(request),
        schema: ResearchResultSchema,
        effort: engine.effort,
        maxSearches: deep ? 10 : 5,
        maxFetches: deep ? 6 : 3,
        onProgress: stream.send,
        signal: stream.signal,
        verifier,
      });
      stream.send({ type: 'result', data: { ...data, request, meta } });
    } catch (err) {
      const { message } = toHttpError(err, engine.provider);
      console.error('Research failed:', err);
      stream.send({ type: 'error', message });
    } finally {
      stream.end();
    }
  });

  // Body-parser errors (too large, bad JSON) as Polish JSON instead of Express's HTML page.
  app.use('/api', (err: { status?: number; type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    const message = err.type === 'entity.too.large' ? 'Plik jest za duży.' : status === 500 ? 'Błąd serwera.' : 'Nieprawidłowe zapytanie.';
    if (status === 500) console.error(err);
    res.status(status).json({ error: message });
  });

  try {
    await store.init();
  } catch (err) {
    console.error(`Nie udało się połączyć z bazą ustawień (${store.kind}):`, err instanceof Error ? err.message : err);
  }

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    if (!fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) {
      console.error('Brak zbudowanej aplikacji (folder dist). Uruchom najpierw: npm run build');
      process.exit(1);
    }
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`${APP.name} running at http://localhost:${PORT} · settings: ${store.kind}${isProduction ? '' : ' · dev'}`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} jest zajęty — zamknij inną kopię aplikacji albo ustaw inny port (PORT w pliku .env).`);
    } else {
      console.error('Nie udało się uruchomić serwera:', err.message);
    }
    process.exit(1);
  });
}

startServer();
