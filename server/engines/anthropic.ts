import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Engine } from '../research';
import { runClaudeLoop } from '../claudeLoop';

export const anthropicEngine: Engine = {
  async research(cfg, opts, userPrompt, log) {
    return runClaudeLoop({
      apiKey: cfg.apiKey,
      model: cfg.model,
      system: opts.system,
      messages: [{ role: 'user', content: userPrompt }],
      effort: opts.effort,
      maxSearches: opts.maxSearches,
      maxFetches: opts.maxFetches,
      verifier: opts.verifier,
      signal: opts.signal,
      hooks: {
        search: (q) => log.search(q),
        searchResults: (titles) => log.searchResults(titles),
        fetch: (u) => log.fetch(u),
        fetched: (u, t) => log.fetched(u, t),
        google: (q) => log.google(q),
        googleResult: (text) => log.googleResult(text),
        thinking: (delta) => log.thinking(delta),
        source: (u, t) => log.source(u, t),
        status: (m) => log.status(m),
      },
    });
  },

  async structure(cfg, schema, notes, signal) {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const structured = await client.messages.parse(
      {
        model: cfg.model,
        max_tokens: 16000,
        output_config: { effort: 'low', format: zodOutputFormat(schema) },
        messages: [{ role: 'user', content: notes }],
      },
      { signal },
    );
    if (structured.stop_reason === 'refusal') return null;
    return structured.parsed_output ?? null;
  },
};
