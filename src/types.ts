import type { ResearchResultCore } from './schema';

export type { Fact, ResearchResultCore } from './schema';
export type { Effort } from './config';

export interface SourceLink {
  title: string;
  url: string;
}

/** One thing the AI did while answering: a thought, a web search, a page it read, a Google cross-check. */
export type ActivityKind = 'think' | 'search' | 'fetch' | 'google';

export interface ActivityStep {
  id: number;
  kind: ActivityKind;
  label: string;
  detail: string;
}

/** What a research run looked at; attached to every result. */
export interface ResearchMeta {
  searchedAt: string;
  model: string;
  searches: string[];
  fetchedPages: string[];
  sources: SourceLink[];
  activity?: ActivityStep[];
}

// Example feature: web research ("Badanie").
export interface ResearchRequest {
  query: string;
  depth: 'quick' | 'thorough';
}

export interface ResearchResult extends ResearchResultCore {
  request: ResearchRequest;
  meta: ResearchMeta;
}

// Server-sent events streamed by long-running endpoints (e.g. /api/research)
export type ProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'search'; query: string }
  | { type: 'fetch'; url: string }
  | { type: 'google'; query: string }
  | { type: 'activity'; step: ActivityStep }
  /** Option-set thumbnails (POST /api/options/sets/:id/samples): one finished (or failed) picture. */
  | { type: 'sample'; group: string; code: string; url: string | null; error: string | null; done: number; total: number; spentUsd: number };

export type StreamEvent<T> =
  | ProgressEvent
  | { type: 'result'; data: T }
  | { type: 'error'; message: string };

export interface OwnerUser {
  login: string;
  role: 'owner';
}
