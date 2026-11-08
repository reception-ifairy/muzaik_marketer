import React from 'react';
import { Mic, Loader2, Search, PencilLine, RotateCcw, X, AlertTriangle } from 'lucide-react';
import type { VoiceQuery } from '../../aiSettings';
import type { useVoiceMessage } from '../../lib/useVoiceMessage';
import { cn } from '../../lib/utils';

type Recorder = ReturnType<typeof useVoiceMessage>;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Record / stop / processing button for a Gemini voice message. */
export function RecordButton({ recorder, className, compact = false }: { recorder: Recorder; className?: string; compact?: boolean }) {
  const { state, seconds, start, stop } = recorder;
  const recording = state === 'recording';
  const processing = state === 'processing';
  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={processing}
      aria-label={recording ? 'Zakończ nagrywanie' : 'Nagraj wiadomość głosową'}
      className={cn(
        'h-12 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap disabled:opacity-80',
        recording ? 'bg-rose-500 text-white' : 'bg-white/5 border border-white/10 text-slate-200 active:bg-white/10',
        className,
      )}
    >
      {processing ? (
        <Loader2 size={18} className="animate-spin" />
      ) : recording ? (
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
        </span>
      ) : (
        <Mic size={18} />
      )}
      {!compact && (processing ? 'Słucham…' : recording ? `Zakończ ${clock(seconds)}` : 'Nagraj')}
      {compact && recording && clock(seconds)}
    </button>
  );
}

/** What Gemini understood from the recording, with the next steps. */
export function VoiceResultCard({
  recorder,
  onSearch,
  onUse,
}: {
  recorder: Recorder;
  onSearch: (v: VoiceQuery) => void;
  onUse: (v: VoiceQuery) => void;
}) {
  const { state, result, error, start, reset } = recorder;

  if (state === 'recording') {
    return (
      <div className="rounded-xl p-3 border border-rose-400/40 bg-rose-500/10 text-sm text-rose-100 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
        Nagrywam — powiedz, o co chcesz zapytać. Dotknij „Zakończ”, gdy skończysz (maks. {recorder.maxSeconds} s).
      </div>
    );
  }
  if (state === 'processing') {
    return (
      <div className="rounded-xl p-3 border border-sky-400/40 bg-sky-400/5 text-sm text-sky-100 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin shrink-0" /> Gemini słucha nagrania i rozpoznaje pytanie…
      </div>
    );
  }
  if (state === 'error' && error) {
    return (
      <div className="rounded-xl p-3 border border-rose-400/30 bg-rose-500/10 text-sm text-rose-200 flex items-center gap-3">
        <AlertTriangle size={18} className="shrink-0" />
        <span className="flex-1">{error}</span>
        <button type="button" onClick={reset} aria-label="Zamknij" className="h-11 w-11 -my-2 rounded-lg flex items-center justify-center active:bg-white/10">
          <X size={18} />
        </button>
      </div>
    );
  }
  if (state !== 'done' || !result) return null;

  return (
    <div className="rounded-xl p-3 border border-sky-400/40 bg-sky-400/5 space-y-3">
      <p className="text-sm text-slate-400">
        Usłyszałem: <span className="text-slate-100 italic">„{result.transcript}”</span>
      </p>
      {result.query ? (
        <p className="min-h-8 px-3 py-1 rounded-lg bg-sky-400/15 text-sky-100 text-sm font-semibold">{result.query}</p>
      ) : (
        <p className="text-sm text-amber-300">Nie usłyszałem prośby — nagraj jeszcze raz.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {result.query && (
          <>
            <button type="button" onClick={() => onSearch(result)} className="h-12 px-4 rounded-xl bg-cyan-400 text-black font-semibold flex items-center gap-2">
              <Search size={18} /> Szukaj od razu
            </button>
            <button type="button" onClick={() => onUse(result)} className="h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-semibold flex items-center gap-2">
              <PencilLine size={18} /> Wstaw do formularza
            </button>
          </>
        )}
        <button type="button" onClick={start} className="h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-semibold flex items-center gap-2">
          <RotateCcw size={16} /> Nagraj ponownie
        </button>
        <button type="button" onClick={reset} className="h-12 px-4 rounded-xl text-slate-400 font-semibold">
          Anuluj
        </button>
      </div>
    </div>
  );
}
