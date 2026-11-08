import React from 'react';
import { notifySessionExpired } from './utils';

// One shared player for Gemini text-to-speech, so starting a new reading stops the previous one
// and every "read aloud" button can show whether it is the one playing.

export interface SpeechState {
  status: 'idle' | 'loading' | 'playing';
  id: string | null;
  error: string | null;
}

let state: SpeechState = { status: 'idle', id: null, error: null };
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | null = null;
let controller: AbortController | null = null;
const cache = new Map<string, string>(); // text + voice -> object URL
const CACHE_LIMIT = 12;

function set(next: Partial<SpeechState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function stopSpeech() {
  controller?.abort();
  controller = null;
  if (audio) {
    audio.pause();
    audio = null;
  }
  set({ status: 'idle', id: null });
}

/** Reads `text` aloud; calling again with the same id while it plays stops it. */
export async function speak(id: string, text: string, voiceName?: string) {
  if (state.id === id && state.status !== 'idle') return stopSpeech();
  stopSpeech();
  set({ status: 'loading', id, error: null });

  const cacheKey = `${voiceName ?? ''}|${text}`;
  try {
    let url = cache.get(cacheKey);
    if (!url) {
      controller = new AbortController();
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceName }),
        signal: controller.signal,
      });
      if (res.status === 401) notifySessionExpired();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Nie udało się przygotować głosu.');
      }
      url = URL.createObjectURL(await res.blob());
      cache.set(cacheKey, url);
      if (cache.size > CACHE_LIMIT) {
        const [oldestKey, oldestUrl] = cache.entries().next().value!;
        URL.revokeObjectURL(oldestUrl);
        cache.delete(oldestKey);
      }
    }
    if (state.id !== id) return; // stopped or replaced while loading
    const player = new Audio(url);
    audio = player;
    player.onended = () => audio === player && set({ status: 'idle', id: null });
    await player.play();
    set({ status: 'playing' });
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    audio = null;
    set({ status: 'idle', id: null, error: err?.message || 'Nie udało się odtworzyć głosu.' });
  }
}

export function clearSpeechError() {
  set({ error: null });
}

export function useSpeech(): SpeechState {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
