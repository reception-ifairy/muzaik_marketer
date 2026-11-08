import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Engine } from '../research';
import { APP } from '../../src/config';

// Reasoning effort is only accepted by reasoning models; older chat models reject the field.
const supportsReasoning = (model: string) => /^(gpt-5|gpt-6|o\d)/.test(model);

export const openaiEngine: Engine = {
  async research(cfg, opts, userPrompt, log) {
    const client = new OpenAI({ apiKey: cfg.apiKey });
    log.status('Szukam w sieci (OpenAI)…');

    const stream = client.responses.stream(
      {
        model: cfg.model,
        instructions: opts.system,
        input: userPrompt,
        tools: [
          {
            type: 'web_search',
            user_location: { type: 'approximate', country: APP.userLocation.country, city: APP.userLocation.city, timezone: APP.userLocation.timezone },
            search_context_size: opts.effort,
          },
        ],
        include: ['web_search_call.action.sources'],
        ...(supportsReasoning(cfg.model) ? { reasoning: { effort: opts.effort, summary: 'auto' as const } } : {}),
        max_output_tokens: 32000,
      },
      { signal: opts.signal },
    );

    stream.on('response.reasoning_summary_text.delta', (event) => log.thinking(event.delta));
    stream.on('response.output_item.done', (event) => {
      const item = event.item;
      if (item.type !== 'web_search_call') return;
      const action = item.action;
      if (action.type === 'search') {
        for (const q of action.queries ?? (action.query ? [action.query] : [])) log.search(q);
        for (const s of action.sources ?? []) log.source(s.url);
        log.searchResults((action.sources ?? []).map((s) => hostOf(s.url)));
      } else if (action.url) {
        log.fetch(action.url);
      }
    });

    const response = await stream.finalResponse();
    const texts: string[] = [];
    for (const item of response.output) {
      if (item.type !== 'message') continue;
      for (const part of item.content) {
        if (part.type !== 'output_text') continue;
        texts.push(part.text);
        for (const a of part.annotations) {
          if (a.type === 'url_citation') log.source(a.url, a.title);
        }
      }
    }
    return texts.join('\n');
  },

  async structure(cfg, schema, notes, signal) {
    const client = new OpenAI({ apiKey: cfg.apiKey });
    const response = await client.responses.parse(
      {
        model: cfg.model,
        input: notes,
        text: { format: zodTextFormat(schema, 'result') },
        ...(supportsReasoning(cfg.model) ? { reasoning: { effort: 'low' as const } } : {}),
      },
      { signal },
    );
    return response.output_parsed ?? null;
  },
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
