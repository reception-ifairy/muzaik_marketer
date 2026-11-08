import type { ProgressEvent, StreamEvent } from '../types';
import { notifySessionExpired } from './utils';

/**
 * POSTs to an SSE endpoint and resolves with the `result` event's data.
 * Progress events are forwarded to `onProgress` as they arrive.
 */
export async function streamRequest<T>(
  url: string,
  body: unknown,
  onProgress: (event: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 401) notifySessionExpired();
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Błąd serwera (${response.status}).`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as StreamEvent<T>;
      if (event.type === 'result') return event.data;
      if (event.type === 'error') throw new Error(event.message);
      onProgress(event);
    }
  }
  throw new Error('Połączenie z serwerem zostało przerwane przed otrzymaniem wyniku.');
}

/** JSON request to the app's API; a Polish error message from the server becomes the thrown Error. */
export async function apiCall<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
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

/** Raw upload (a file as the request body), JSON answer. */
export async function uploadFile<T>(url: string, file: Blob, onProgress?: (share: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status === 401) notifySessionExpired();
      let data: { error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new Error(data.error || (xhr.status === 413 ? 'Plik jest za duży.' : `Błąd serwera (${xhr.status}).`)));
    };
    xhr.onerror = () => reject(new Error('Sieć przerwała wysyłkę pliku.'));
    xhr.send(file);
  });
}
