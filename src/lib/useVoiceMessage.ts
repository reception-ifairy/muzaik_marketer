import React from 'react';
import type { VoiceQuery } from '../aiSettings';
import { notifySessionExpired } from './utils';

const MAX_SECONDS = 60;
const TARGET_RATE = 16_000;

export type VoiceMessageState = 'idle' | 'recording' | 'processing' | 'done' | 'error';

/**
 * Records a voice message (like "record a voice message" in Google AI Studio), converts it to
 * 16 kHz mono WAV and lets Gemini transcribe it and sum up the request.
 */
export function useVoiceMessage(onResult?: (result: VoiceQuery) => void) {
  const [state, setState] = React.useState<VoiceMessageState>('idle');
  const [seconds, setSeconds] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<VoiceQuery | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const cancelledRef = React.useRef(false);
  const onResultRef = React.useRef(onResult);
  onResultRef.current = onResult;

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = React.useCallback(() => {
    clearTimer();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const start = React.useCallback(async () => {
    setError(null);
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Ta przeglądarka nie pozwala nagrywać dźwięku.');
      setState('error');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError('Brak dostępu do mikrofonu. Zezwól na mikrofon dla tej strony w ustawieniach przeglądarki.');
      setState('error');
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    cancelledRef.current = false;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      if (cancelledRef.current) {
        setState('idle');
        return;
      }
      setState('processing');
      try {
        const wav = await toWav16k(new Blob(chunks, { type: recorder.mimeType }));
        const res = await fetch('/api/voice/transcribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'audio/wav' },
          body: wav,
        });
        if (res.status === 401) notifySessionExpired();
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Nie udało się rozpoznać nagrania.');
        setResult(data as VoiceQuery);
        setState('done');
        onResultRef.current?.(data as VoiceQuery);
      } catch (err: any) {
        setError(err?.message || 'Nie udało się rozpoznać nagrania.');
        setState('error');
      }
    };

    recorder.start();
    setSeconds(0);
    setState('recording');
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 250);
  }, [stop]);

  const cancel = React.useCallback(() => {
    cancelledRef.current = true;
    stop();
    setResult(null);
    setError(null);
    setState('idle');
  }, [stop]);

  const reset = React.useCallback(() => {
    setResult(null);
    setError(null);
    setState('idle');
  }, []);

  React.useEffect(
    () => () => {
      cancelledRef.current = true;
      clearTimer();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    [],
  );

  return { state, seconds, error, result, start, stop, cancel, reset, maxSeconds: MAX_SECONDS };
}

/** Decodes whatever the browser recorded (usually WebM/Opus) and re-encodes it as 16-bit PCM WAV. */
async function toWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
    const offline = new OfflineAudioContext(1, length, TARGET_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), TARGET_RATE);
  } finally {
    ctx.close();
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
