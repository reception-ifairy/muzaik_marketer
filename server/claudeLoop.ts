import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { APP, type Effort } from '../src/config';
import { ResearchError } from './errors';
import { untrusted, type Verifier } from './verify';

// Agent loop shared by search and chat: Anthropic-hosted web_search/web_fetch, plus client tools
// we run here (Google cross-check via Gemini, plus any ClientTool a feature passes in).

const MAX_TURNS = 12; // pause_turn resumes + client tool rounds
const MAX_GOOGLE_CALLS = 4;

export interface ClientTool<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: T;
  run: (input: z.infer<T>, signal?: AbortSignal) => Promise<string>;
}

export interface ClaudeLoopHooks {
  search?: (query: string) => void;
  searchResults?: (titles: string[]) => void;
  fetch?: (url: string) => void;
  fetched?: (url: string, title: string | null) => void;
  google?: (query: string) => void;
  googleResult?: (text: string) => void;
  source?: (url: string, title: string | null) => void;
  text?: (delta: string) => void;
  thinking?: (delta: string) => void;
  status?: (message: string) => void;
}

export interface ClaudeLoopOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort: Effort;
  maxSearches: number;
  maxFetches: number;
  verifier?: Verifier;
  tools?: ClientTool[];
  signal?: AbortSignal;
  hooks: ClaudeLoopHooks;
}

const GoogleInput = z.object({ query: z.string().min(2).max(300) });

export const GOOGLE_TOOL_DESCRIPTION =
  'Dodatkowe wyszukiwanie w Google (przez Gemini z Google Search), niezależne od web_search. ' +
  'Użyj, gdy chcesz potwierdzić fakt z innego źródła albo gdy web_search dał mało wyników. ' +
  'Zwraca krótki raport z faktami i listę źródeł (linki Google są przekierowaniami — nie podawaj ich jako głównych linków).';

/** Runs Claude until it finishes, resuming paused server-tool turns and answering client tools. Returns the final text. */
export async function runClaudeLoop(opts: ClaudeLoopOptions): Promise<string> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const messages = [...opts.messages];
  const clientTools: ClientTool[] = [...(opts.tools ?? [])];
  if (opts.verifier) {
    const verifier = opts.verifier;
    let calls = 0;
    clientTools.push({
      name: 'google_search',
      description: GOOGLE_TOOL_DESCRIPTION,
      schema: GoogleInput,
      run: async ({ query }, signal) => {
        if (++calls > MAX_GOOGLE_CALLS) return 'Limit dodatkowych wyszukiwań Google w tej odpowiedzi został wyczerpany.';
        opts.hooks.google?.(query);
        const { text, sources } = await verifier(query, signal);
        opts.hooks.googleResult?.(text || 'Brak wyników.');
        for (const s of sources) opts.hooks.source?.(s.url, s.title);
        const list = sources.map((s) => `- ${s.title}: ${s.url}`).join('\n');
        return untrusted('GOOGLE', `${text || 'Brak wyników.'}${list ? `\n\nŹródła:\n${list}` : ''}`);
      },
    });
  }

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: opts.maxSearches, user_location: APP.userLocation },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: opts.maxFetches },
    ...clientTools.map(
      (t): Anthropic.Beta.BetaTool => ({
        name: t.name,
        description: t.description,
        input_schema: z.toJSONSchema(t.schema) as Anthropic.Beta.BetaTool.InputSchema,
        eager_input_streaming: true,
      }),
    ),
  ];

  let finalText = '';
  let jsonRetries = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: opts.model,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        // Summarised thinking feeds the "what the assistant is doing" timeline.
        thinking: { type: 'adaptive', ...(opts.hooks.thinking ? { display: 'summarized' as const } : {}) },
        output_config: { effort: opts.effort },
        tools,
        messages,
      },
      { signal: opts.signal },
    );

    stream.on('streamEvent', (event) => {
      if (event.type !== 'content_block_delta') return;
      if (event.delta.type === 'text_delta') opts.hooks.text?.(event.delta.text);
      else if (event.delta.type === 'thinking_delta') opts.hooks.thinking?.(event.delta.thinking);
    });
    stream.on('contentBlock', (block) => {
      if (block.type === 'server_tool_use') {
        const input = block.input as { query?: string; url?: string };
        if (block.name === 'web_search' && input.query) opts.hooks.search?.(input.query);
        else if (block.name === 'web_fetch' && input.url) opts.hooks.fetch?.(input.url);
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        opts.hooks.searchResults?.(block.content.map((r) => r.title || r.url));
      } else if (block.type === 'web_fetch_tool_result' && block.content.type === 'web_fetch_result') {
        opts.hooks.fetched?.(block.content.url, block.content.content.title ?? null);
      }
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming an unparseable tool input rejects here; retry that turn only.
      if (err instanceof Anthropic.APIError || err instanceof Anthropic.APIUserAbortError || jsonRetries++ >= 2) throw err;
      continue;
    }

    let turnText = '';
    for (const block of message.content) {
      if (block.type === 'text') {
        turnText += block.text;
        for (const c of block.citations ?? []) {
          if (c.type === 'web_search_result_location') opts.hooks.source?.(c.url, c.title);
        }
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) opts.hooks.source?.(r.url, r.title);
      } else if (block.type === 'web_fetch_tool_result' && block.content.type === 'web_fetch_result') {
        opts.hooks.source?.(block.content.url, block.content.content.title ?? null);
      }
    }
    finalText += turnText;

    if (message.stop_reason === 'refusal') {
      throw new ResearchError('Model odmówił wykonania tego zadania. Spróbuj inaczej sformułować pytanie.', 422);
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      opts.hooks.status?.('Kontynuuję wyszukiwanie…');
      continue;
    }
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (message.stop_reason !== 'tool_use' || !toolUses.length) break;

    messages.push({ role: 'assistant', content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const tool = clientTools.find((t) => t.name === use.name);
      const parsed = tool?.schema.safeParse(use.input);
      if (!tool || !parsed?.success) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Nieprawidłowe wywołanie narzędzia.' });
        continue;
      }
      try {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: await tool.run(parsed.data, opts.signal) });
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        console.error(`Tool ${use.name} failed:`, err);
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Narzędzie chwilowo nie działa — kontynuuj bez niego.' });
      }
    }
    messages.push({ role: 'user', content: results });
    // Text written before the tool call is kept; the answer continues in the next turn.
    finalText += '\n';
  }
  return finalText;
}
