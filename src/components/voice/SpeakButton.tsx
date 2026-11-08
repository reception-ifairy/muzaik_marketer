import React from 'react';
import { Volume2, Square, Loader2, AlertTriangle, X } from 'lucide-react';
import { speak, useSpeech, clearSpeechError } from '../../lib/speech';
import { useAiSettings } from '../../lib/aiSettingsContext';
import { cn } from '../../lib/utils';

interface SpeakButtonProps {
  id: string;
  text: string;
  label?: string;
  className?: string;
}

/** "Read aloud" with the Gemini voice. Hidden when no Google key is configured. */
export default function SpeakButton({ id, text, label = 'Przeczytaj', className }: SpeakButtonProps) {
  const { voiceReady } = useAiSettings();
  const speech = useSpeech();
  if (!voiceReady) return null;

  const mine = speech.id === id;
  const loading = mine && speech.status === 'loading';
  const playing = mine && speech.status === 'playing';

  return (
    <button
      type="button"
      onClick={() => speak(id, text)}
      aria-pressed={playing}
      className={cn(
        'h-12 px-4 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap',
        playing ? 'bg-cyan-400/15 border-cyan-400/50 text-cyan-200' : 'bg-brand-raised border-white/10 text-slate-200 active:bg-white/10',
        className,
      )}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : playing ? <Square size={18} /> : <Volume2 size={18} />}
      {loading ? 'Przygotowuję…' : playing ? 'Zatrzymaj' : label}
    </button>
  );
}

/** Shows the last text-to-speech error for a few seconds. */
export function SpeechToast() {
  const { error } = useSpeech();
  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearSpeechError, 6000);
    return () => clearTimeout(t);
  }, [error]);
  if (!error) return null;
  return (
    <div role="alert" className="fixed z-[60] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 max-w-lg w-[calc(100%-2rem)] p-3 rounded-xl bg-rose-950 border border-rose-400/40 text-rose-100 text-sm flex items-center gap-3 shadow-2xl">
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1">{error}</span>
      <button type="button" onClick={clearSpeechError} aria-label="Zamknij" className="h-11 w-11 -my-2 -mr-2 rounded-lg flex items-center justify-center active:bg-white/10">
        <X size={18} />
      </button>
    </div>
  );
}
