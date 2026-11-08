import { ThinkingLevel, type GenerateContentResponse } from '@google/genai';
import { googleClient } from '../googleClient';
import type { Effort } from '../../src/config';
import { ResearchError } from '../errors';
import { jsonSchemaFor, type Engine } from '../research';

const THINKING: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

// Gemini 3+ can return schema-constrained JSON in the same call as Google Search / URL context.
const supportsToolsWithSchema = (model: string) => /^gemini-(3|4)/.test(model);
const supportsThinkingLevel = (model: string) => /^gemini-(3|4)/.test(model);

export const googleEngine: Engine = {
  async research(cfg, opts, userPrompt, log) {
    const ai = googleClient(cfg.apiKey);
    log.status('Szukam w Google…');

    const stream = await ai.models.generateContentStream({
      model: cfg.model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: opts.system,
        tools: [{ googleSearch: {} }, { urlContext: {} }],
        thinkingConfig: { includeThoughts: true, ...(supportsThinkingLevel(cfg.model) ? { thinkingLevel: THINKING[opts.effort] } : {}) },
        ...(supportsToolsWithSchema(cfg.model)
          ? { responseMimeType: 'application/json', responseJsonSchema: jsonSchemaFor(opts.schema) }
          : {}),
        abortSignal: opts.signal,
      },
    });

    let text = '';
    for await (const chunk of stream) {
      // Thought summaries go to the activity timeline; only the answer text is parsed.
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (!part.text) continue;
        if (part.thought) log.thinking(part.text);
        else text += part.text;
      }
      collect(chunk, log);
    }
    if (!text.trim()) {
      throw new ResearchError('Gemini nie zwrócił odpowiedzi (mogła zostać zablokowana przez filtry bezpieczeństwa). Spróbuj inaczej sformułować zapytanie.', 422);
    }
    return text;
  },

  async structure(cfg, schema, notes, signal) {
    const ai = googleClient(cfg.apiKey);
    const response = await ai.models.generateContent({
      model: cfg.model,
      contents: [{ role: 'user', parts: [{ text: notes }] }],
      config: { responseMimeType: 'application/json', responseJsonSchema: jsonSchemaFor(schema), abortSignal: signal },
    });
    try {
      return JSON.parse(response.text ?? '');
    } catch {
      return null;
    }
  },
};

function collect(chunk: GenerateContentResponse, log: Parameters<Engine['research']>[3]) {
  const candidate = chunk.candidates?.[0];
  const grounding = candidate?.groundingMetadata;
  for (const q of grounding?.webSearchQueries ?? []) {
    if (!log.searches.includes(q)) {
      log.searches.push(q);
      log.google(q);
    }
  }
  // Search grounding links are Google redirect URLs; titles are usually the site's domain.
  const titles: string[] = [];
  for (const c of grounding?.groundingChunks ?? []) {
    log.source(c.web?.uri, c.web?.title);
    if (c.web?.title) titles.push(c.web.title);
  }
  if (titles.length) log.googleResult(`Znalezione strony:\n${[...new Set(titles)].slice(0, 8).map((t) => `• ${t}`).join('\n')}`);
  for (const m of candidate?.urlContextMetadata?.urlMetadata ?? []) {
    if (m.retrievedUrl) {
      log.fetch(m.retrievedUrl);
      log.fetched(m.retrievedUrl, m.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS' ? 'Strona przeczytana' : 'Nie udało się otworzyć strony');
      log.source(m.retrievedUrl);
    }
  }
}
