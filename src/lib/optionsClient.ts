import type { OptionSet, OptionsState, SampleEstimate, SampleRun, SampleTarget } from '../options';
import type { ProgressEvent } from '../types';
import { streamRequest } from './api';
import { notifySessionExpired } from './utils';

async function call<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (res.status === 401) notifySessionExpired();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd serwera (${res.status}).`);
  return data as T;
}

/** /api/options — see server/options.ts. */
export const optionsApi = {
  state: () => call<OptionsState>('GET', '/api/options'),
  setActive: (id: string) => call<OptionsState>('PUT', '/api/options/active', { id }),
  save: (set: OptionSet) => call<OptionsState>('POST', '/api/options/sets', { set }),
  remove: (id: string) => call<OptionsState>('DELETE', `/api/options/sets/${encodeURIComponent(id)}`),
  /** One text-engine call; the proposal is not saved until the owner accepts it. */
  propose: (body: { context: string; groupCount: number; perGroup: number }, signal?: AbortSignal) =>
    call<{ set: OptionSet }>('POST', '/api/options/propose', body, signal).then((r) => r.set),
  estimate: (id: string, only?: SampleTarget[]) => call<SampleEstimate>('POST', `/api/options/sets/${encodeURIComponent(id)}/estimate`, { only }),
  /** PAID: makes the thumbnails. `confirmedUsd` is the estimate the owner accepted. */
  makeSamples: (id: string, confirmedUsd: number, only: SampleTarget[] | undefined, onProgress: (e: ProgressEvent) => void, signal: AbortSignal) =>
    streamRequest<SampleRun>(`/api/options/sets/${encodeURIComponent(id)}/samples`, { confirmedUsd, only }, onProgress, signal),
};
