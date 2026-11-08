import { z } from 'zod';
import { APP, type Effort } from '../src/config';
import type { Provider } from '../src/aiSettings';
import type { ProgressEvent, ResearchMeta, SourceLink } from '../src/types';
import { ResearchError } from './errors';
import { anthropicEngine } from './engines/anthropic';
import { openaiEngine } from './engines/openai';
import { googleEngine } from './engines/google';
import type { Verifier } from './verify';
import { Activity } from './activity';

const MAX_SOURCES = 30;

export interface EngineConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface ResearchOptions<T extends z.ZodType> {
  system: string;
  prompt: string;
  schema: T;
  effort: Effort;
  maxSearches: number;
  maxFetches: number;
  onProgress: (event: ProgressEvent) => void;
  signal?: AbortSignal;
  /** Extra Google cross-check the engine may call (Claude only). */
  verifier?: Verifier;
}

/** Collects what an engine searched and read, and the text it wrote, while it works. */
export class ResearchLog {
  readonly searches: string[] = [];
  readonly fetchedPages: string[] = [];
  private sources = new Map<string, SourceLink>();
  readonly texts: string[] = [];
  readonly activity: Activity;

  constructor(private onProgress: (event: ProgressEvent) => void) {
    this.activity = new Activity((step) => onProgress({ type: 'activity', step }));
  }

  search(query: string) {
    if (!query || this.searches.includes(query)) return;
    this.searches.push(query);
    this.onProgress({ type: 'search', query });
    this.activity.search(query);
  }

  searchResults(titles: string[]) {
    this.activity.searchResults(titles);
  }

  thinking(delta: string) {
    this.activity.think(delta);
  }

  google(query: string) {
    this.onProgress({ type: 'google', query });
    this.activity.google(query);
  }

  googleResult(text: string) {
    this.activity.googleResult(text);
  }

  fetch(url: string) {
    if (!url || this.fetchedPages.includes(url)) return;
    this.fetchedPages.push(url);
    this.onProgress({ type: 'fetch', url });
    this.activity.fetch(url);
  }

  fetched(url: string, title: string | null) {
    this.activity.fetched(url, title);
  }

  source(url: string | undefined | null, title?: string | null) {
    if (!url || this.sources.has(url)) return;
    let fallbackTitle = url;
    try {
      fallbackTitle = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // keep raw url
    }
    this.sources.set(url, { url, title: title || fallbackTitle });
  }

  status(message: string) {
    this.onProgress({ type: 'status', message });
  }

  sourceList(): SourceLink[] {
    return [...this.sources.values()].slice(0, MAX_SOURCES);
  }
}

export interface Engine {
  /** Runs the web research turn and returns the model's final text (which should end with JSON). */
  research<T extends z.ZodType>(cfg: EngineConfig, opts: ResearchOptions<T>, userPrompt: string, log: ResearchLog): Promise<string>;
  /** Tool-less call that turns research notes into the schema (validated by the caller); null if the model couldn't. */
  structure<T extends z.ZodType>(cfg: EngineConfig, schema: T, notes: string, signal?: AbortSignal): Promise<unknown>;
}

const ENGINES: Record<Provider, Engine> = {
  anthropic: anthropicEngine,
  openai: openaiEngine,
  google: googleEngine,
};

/**
 * Runs a web research turn with the selected provider and returns the result validated against
 * `schema`. The model is asked to end with a JSON object; if that JSON doesn't validate, a second,
 * tool-less call with structured outputs converts the research transcript into the schema.
 */
export async function runResearch<T extends z.ZodType>(
  cfg: EngineConfig,
  opts: ResearchOptions<T>,
): Promise<{ data: z.infer<T>; meta: ResearchMeta }> {
  const engine = ENGINES[cfg.provider];
  const log = new ResearchLog(opts.onProgress);
  const userPrompt =
    `${todayLine()}\n\n${opts.prompt}\n\nNa końcu odpowiedzi podaj WYŁĄCZNIE obiekt JSON zgodny z tym schematem (bez komentarzy):\n` +
    JSON.stringify(z.toJSONSchema(opts.schema));

  const transcript = await engine.research(cfg, opts, userPrompt, log);
  log.activity.flush();
  const meta: ResearchMeta = {
    searchedAt: new Date().toISOString(),
    model: cfg.model,
    searches: log.searches,
    fetchedPages: log.fetchedPages,
    sources: log.sourceList(),
    activity: log.activity.steps,
  };

  const direct = opts.schema.safeParse(withOptionalDefaults(extractLastJson(transcript)));
  if (direct.success) return { data: direct.data, meta };

  log.status('Porządkuję wyniki…');
  const notes =
    'Przekształć poniższe notatki z wyszukiwania w obiekt zgodny ze schematem. ' +
    'Używaj wyłącznie faktów, liczb i linków obecnych w notatkach lub na liście źródeł — niczego nie dopisuj. ' +
    'Brakujące liczby ustaw na null.\n\n' +
    `<notatki>\n${transcript}\n</notatki>\n\n<zrodla>\n${meta.sources.map((s) => `${s.title} — ${s.url}`).join('\n')}\n</zrodla>`;
  const structured = await engine.structure(cfg, opts.schema, notes, opts.signal);
  const parsed = opts.schema.safeParse(structured);
  if (!parsed.success) {
    throw new ResearchError('Nie udało się uporządkować wyników. Spróbuj ponownie.');
  }
  return { data: parsed.data, meta };
}

/**
 * Hook for filling fields models tend to omit (e.g. a new optional array) before validation, so an
 * otherwise valid answer isn't rejected and doesn't cost a second structuring call. Add per-schema
 * defaults here when you extend a schema.
 */
function withOptionalDefaults(value: unknown): unknown {
  return value;
}

/** A single tool-less structured call on the given engine, validated with Zod; null if it failed validation. */
export async function structuredCall<T extends z.ZodType>(cfg: EngineConfig, schema: T, prompt: string, signal?: AbortSignal): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await ENGINES[cfg.provider].structure(cfg, schema, prompt, signal));
  return parsed.success ? parsed.data : null;
}

/** JSON Schema for providers' structured outputs (drops the `$schema` marker some APIs reject). */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** Returns the last top-level `{...}` JSON object in the text, or null. */
export function extractLastJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.length ? fenced.reverse() : [];

  // Scan backwards for balanced braces as a fallback to fenced blocks.
  const end = text.lastIndexOf('}');
  if (end !== -1) {
    let depth = 0;
    let inString = false;
    for (let i = end; i >= 0; i--) {
      const ch = text[i];
      if (ch === '"' && text[i - 1] !== '\\') inString = !inString;
      if (inString) continue;
      if (ch === '}') depth++;
      else if (ch === '{' && --depth === 0) {
        candidates.push(text.slice(i, end + 1));
        break;
      }
    }
  }

  for (const c of candidates) {
    try {
      return JSON.parse(c.trim());
    } catch {
      // try next candidate
    }
  }
  return null;
}

function todayLine(): string {
  const today = new Date().toLocaleDateString(APP.locale, {
    timeZone: APP.timezone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `Dzisiejsza data: ${today}.`;
}
