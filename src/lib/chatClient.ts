import type { ChatEvent, Conversation, ConversationSummary } from '../chat';
import { notifySessionExpired } from './utils';

async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) notifySessionExpired();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Błąd serwera (${res.status}).`);
  return data as T;
}

export const listConversations = () => fetch('/api/chat/conversations', { credentials: 'same-origin' }).then((r) => json<ConversationSummary[]>(r));
export const getConversation = (id: string) => fetch(`/api/chat/conversations/${id}`, { credentials: 'same-origin' }).then((r) => json<Conversation>(r));
export const deleteConversation = (id: string) =>
  fetch(`/api/chat/conversations/${id}`, { method: 'DELETE', credentials: 'same-origin' }).then((r) => json<{ ok: boolean }>(r));

/** Uploads a (resized) photo for the next message; returns its id. */
export const uploadChatImage = (blob: Blob) =>
  fetch('/api/chat/images', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob }).then((r) =>
    json<{ id: string }>(r),
  );

export const chatImageUrl = (id: string) => `/api/chat/images/${encodeURIComponent(id)}`;

/** Sends a message and calls `onEvent` for every SSE event until the server closes the stream. */
export async function sendChatMessage(
  body: { conversationId: string | null; message: string; imageIds?: string[] },
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    await json(res);
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
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
      if (line) onEvent(JSON.parse(line.slice(6)) as ChatEvent);
    }
  }
}
