import express from 'express';
import OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';
import { APP } from '../src/config';
import type { ChatEvent, ChatMessage } from '../src/chat';
import type { SourceLink } from '../src/types';
import type { SettingsStore } from './store';
import type { ProviderService } from './providers';
import { runClaudeLoop } from './claudeLoop';
import { googleClient } from './googleClient';
import { toHttpError } from './errors';
import { Activity } from './activity';
import { ChatImages, type StoredImage } from './chatImages';
import { CHAT_SYSTEM } from './prompts';

const HISTORY_TURNS = 20;
const MAX_MESSAGE = 4000;
const MAX_SOURCES = 12;
const MAX_IMAGES = 3;

const httpUrl = (u: string | null | undefined) => {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

function titleFrom(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60)}…`;
}

/** History as strictly alternating turns (failed replies are skipped, so same-role neighbours are merged). */
function historyTurns(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages.slice(-HISTORY_TURNS * 2)) {
    if (m.status === 'error' || !m.content.trim()) continue;
    const content = m.content.slice(0, MAX_MESSAGE);
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else turns.push({ role: m.role, content });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

/**
 * /api/chat — conversations (list/get/rename/delete), photo uploads and the streamed assistant reply.
 * Each provider streams text + activity; the reply is saved in `finally`, so a disconnect never loses it.
 */
export function createChatRouter(store: SettingsStore, providers: ProviderService, appDir: string): express.Router {
  const router = express.Router();
  const images = new ChatImages(appDir);

  router.post('/images', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '6mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Brak zdjęcia.' });
    try {
      res.json({ id: images.save(req.body).id });
    } catch {
      res.status(400).json({ error: 'To nie jest obsługiwane zdjęcie (JPEG, PNG lub WebP do 6 MB).' });
    }
  });

  router.get('/images/:id', (req, res) => {
    const image = images.load(req.params.id);
    if (!image) return res.status(404).end();
    res
      .set({ 'Content-Type': image.type, 'Cache-Control': 'private, max-age=31536000', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" })
      .send(image.data);
  });

  router.get('/conversations', async (_req, res) => {
    try {
      res.json(await store.listConversations(50));
    } catch (err) {
      res.status(500).json({ error: toHttpError(err).message });
    }
  });

  router.get('/conversations/:id', async (req, res) => {
    try {
      const conv = await store.getConversation(req.params.id);
      if (!conv) return res.status(404).json({ error: 'Nie znaleziono rozmowy.' });
      res.json(conv);
    } catch (err) {
      res.status(500).json({ error: toHttpError(err).message });
    }
  });

  router.patch('/conversations/:id', async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
    if (!title) return res.status(400).json({ error: 'Podaj tytuł.' });
    try {
      await store.renameConversation(req.params.id, title);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: toHttpError(err).message });
    }
  });

  router.delete('/conversations/:id', async (req, res) => {
    try {
      await store.deleteConversation(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: toHttpError(err).message });
    }
  });

  router.post('/', async (req, res) => {
    let text = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, MAX_MESSAGE) : '';
    const imageIds: string[] = Array.isArray(req.body?.imageIds) ? req.body.imageIds.filter((x: unknown) => typeof x === 'string').slice(0, MAX_IMAGES) : [];
    const attached = imageIds.map((id) => images.load(id)).filter((img): img is StoredImage => Boolean(img));
    if (!text && attached.length) text = 'Co widzisz na tym zdjęciu?';
    if (!text) return res.status(400).json({ error: 'Napisz wiadomość albo dodaj zdjęcie.' });
    const engine = await providers.resolveEngine().catch((err) => ({ error: toHttpError(err).message }));
    if ('error' in engine) return res.status(400).json({ error: engine.error });

    let conv = typeof req.body?.conversationId === 'string' ? await store.getConversation(req.body.conversationId) : null;
    if (!conv) conv = { ...(await store.createConversation(titleFrom(text))), messages: [] };
    const history = historyTurns(conv.messages);
    const userMessage = await store.addMessage(conv.id, {
      role: 'user', content: text, sources: [], steps: [], status: 'complete', images: attached.map((i) => i.id),
    });

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
    const send = (event: ChatEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const ping = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15_000);

    // Everything the reply produces, saved even if the client disconnects.
    let content = '';
    const sources: SourceLink[] = [];
    let status: ChatMessage['status'] = 'complete';
    const activity = new Activity((step) => send({ type: 'activity', step }));

    const addSource = (url: string | null | undefined, title?: string | null) => {
      const safe = httpUrl(url);
      if (!safe || sources.some((s) => s.url === safe) || sources.length >= MAX_SOURCES) return;
      sources.push({ url: safe, title: title || new URL(safe).hostname.replace(/^www\./, '') });
    };
    const delta = (t: string) => {
      content += t;
      send({ type: 'delta', text: t });
    };

    send({ type: 'conversation', id: conv.id, title: conv.title, userMessageId: userMessage.id, content: text, images: userMessage.images ?? [] });
    try {
      const system = `${CHAT_SYSTEM}\n\nDzisiejsza data: ${new Date().toLocaleDateString(APP.locale, { timeZone: APP.timezone, dateStyle: 'long' })}.`;
      const b64 = (img: StoredImage) => img.data.toString('base64');
      send({ type: 'status', text: 'Analizuję pytanie…' });

      if (engine.provider === 'anthropic') {
        await runClaudeLoop({
          apiKey: engine.apiKey,
          model: engine.model,
          system,
          messages: [
            ...(history as Anthropic.Beta.BetaMessageParam[]),
            {
              role: 'user',
              content: [
                ...attached.map((img) => ({
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: img.type as 'image/jpeg' | 'image/png' | 'image/webp', data: b64(img) },
                })),
                { type: 'text' as const, text },
              ],
            },
          ],
          effort: engine.effort,
          maxSearches: 6,
          maxFetches: 4,
          verifier: await providers.googleVerifier().catch(() => undefined),
          signal: controller.signal,
          hooks: {
            text: delta,
            thinking: (t) => activity.think(t),
            search: (q) => activity.search(q),
            searchResults: (titles) => activity.searchResults(titles),
            fetch: (u) => activity.fetch(u),
            fetched: (u, t) => activity.fetched(u, t),
            google: (q) => activity.google(q),
            googleResult: (t) => activity.googleResult(t),
            source: addSource,
            status: (m) => send({ type: 'status', text: m }),
          },
        });
      } else if (engine.provider === 'openai') {
        const client = new OpenAI({ apiKey: engine.apiKey });
        const stream = client.responses.stream(
          {
            model: engine.model,
            instructions: system,
            input: [
              ...history.map((t) => ({ role: t.role, content: t.content })),
              {
                role: 'user' as const,
                content: [
                  ...attached.map((img) => ({ type: 'input_image' as const, image_url: `data:${img.type};base64,${b64(img)}`, detail: 'auto' as const })),
                  { type: 'input_text' as const, text },
                ],
              },
            ],
            tools: [{ type: 'web_search', user_location: { type: 'approximate', country: APP.userLocation.country, timezone: APP.userLocation.timezone } }],
            ...(/^(gpt-5|gpt-6|o\d)/.test(engine.model) ? { reasoning: { effort: engine.effort, summary: 'auto' as const } } : {}),
            max_output_tokens: 12000,
            store: false,
          },
          { signal: controller.signal },
        );
        stream.on('response.output_text.delta', (e) => delta(e.delta));
        stream.on('response.reasoning_summary_text.delta', (e) => activity.think(e.delta));
        stream.on('response.output_item.done', (e) => {
          if (e.item.type !== 'web_search_call') return;
          const action = e.item.action;
          if (action.type === 'search') {
            for (const q of action.queries ?? (action.query ? [action.query] : [])) activity.search(q);
            activity.searchResults((action.sources ?? []).map((src) => hostLabel(src.url)));
          } else if (action.url) activity.fetch(action.url);
        });
        stream.on('response.output_text.annotation.added', (e) => {
          const a = e.annotation as { type?: string; url?: string; title?: string };
          if (a.type === 'url_citation') addSource(a.url, a.title);
        });
        await stream.finalResponse();
      } else {
        const ai = googleClient(engine.apiKey);
        const stream = await ai.models.generateContentStream({
          model: engine.model,
          contents: [
            ...history.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
            { role: 'user', parts: [...attached.map((img) => ({ inlineData: { mimeType: img.type, data: b64(img) } })), { text }] },
          ],
          config: {
            systemInstruction: system,
            tools: [{ googleSearch: {} }],
            thinkingConfig: { includeThoughts: true },
            abortSignal: controller.signal,
          },
        });
        const seen = new Set<string>();
        for await (const chunk of stream) {
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            if (!part.text) continue;
            if (part.thought) activity.think(part.text);
            else delta(part.text);
          }
          const grounding = chunk.candidates?.[0]?.groundingMetadata;
          for (const q of grounding?.webSearchQueries ?? []) {
            if (!seen.has(q)) {
              seen.add(q);
              activity.google(q);
            }
          }
          const titles: string[] = [];
          for (const c of grounding?.groundingChunks ?? []) {
            addSource(c.web?.uri, c.web?.title);
            if (c.web?.title) titles.push(c.web.title);
          }
          if (titles.length) activity.googleResult(`Znalezione strony:\n${[...new Set(titles)].slice(0, 8).map((t) => `• ${t}`).join('\n')}`);
        }
      }

      if (!content.trim()) {
        status = 'error';
        send({ type: 'fail', message: 'Asystent nie zwrócił odpowiedzi. Spróbuj zapytać inaczej.' });
      }
    } catch (err) {
      status = content.trim() ? 'partial' : 'error';
      if (!controller.signal.aborted) {
        console.error('Chat failed:', err);
        send({ type: 'fail', message: toHttpError(err, engine.provider).message });
      }
    } finally {
      clearInterval(ping);
      if (sources.length) send({ type: 'sources', items: sources });
      try {
        activity.flush();
        const saved = await store.addMessage(conv.id, { role: 'assistant', content, sources, steps: activity.steps, status });
        send({ type: 'saved', messageId: saved.id, status });
      } catch (err) {
        console.error('Saving chat reply failed:', err);
      }
      send({ type: 'done' });
      res.end();
    }
  });

  return router;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
