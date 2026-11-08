import React from 'react';
import { ImagePlus, Loader2, AlertTriangle, Square, CheckCircle2, Settings } from 'lucide-react';
import { formatUsd } from '../../imageModels';
import type { OptionSet, SampleEstimate, SampleRun, SampleTarget } from '../../options';
import type { ProgressEvent } from '../../types';
import { optionsApi } from '../../lib/optionsClient';
import { TONES } from '../../lib/sections';
import { cn } from '../../lib/utils';
import Sheet from '../ui/Sheet';

// Thumbnails for an option set, made with the sample image model (Settings → Obrazy). PAID: the sheet always
// shows the estimate first and the run starts only on the button that names the cost; the server re-checks that
// the cost is still the one confirmed. Pictures appear as they're made; "Zatrzymaj" stops after the current one.

type SampleEvent = Extract<ProgressEvent, { type: 'sample' }>;

interface SamplesSheetProps {
  open: boolean;
  set: OptionSet;
  onClose: () => void;
  onUpdated: (set: OptionSet) => void;
  onOpenSettings: () => void;
}

export default function SamplesSheet({ open, set, onClose, onUpdated, onOpenSettings }: SamplesSheetProps) {
  const [mode, setMode] = React.useState<'missing' | 'all'>('missing');
  const [estimate, setEstimate] = React.useState<SampleEstimate | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [events, setEvents] = React.useState<SampleEvent[]>([]);
  const [status, setStatus] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SampleRun | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const sampleGroups = set.groups.filter((g) => g.kind === 'sample');
  const allTargets: SampleTarget[] = sampleGroups.flatMap((g) => g.options.map((o) => ({ group: g.id, code: o.code })));
  const only = mode === 'all' ? allTargets : undefined;
  const missing = sampleGroups.reduce((n, g) => n + g.options.filter((o) => !o.sample).length, 0);

  const loadEstimate = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEstimate(await optionsApi.estimate(set.id, mode === 'all' ? allTargets : undefined));
    } catch (err: any) {
      setError(err?.message || 'Nie udało się policzyć kosztu.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id, mode]);

  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    setEvents([]);
    setStatus(null);
    loadEstimate();
  }, [open, loadEstimate]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (!estimate || estimate.blocker) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setEvents([]);
    setResult(null);
    try {
      const done = await optionsApi.makeSamples(
        set.id,
        estimate.totalUsd,
        only,
        (e) => {
          if (e.type === 'sample') setEvents((prev) => [...prev, e]);
          if (e.type === 'status') setStatus(e.message);
        },
        controller.signal,
      );
      setResult(done);
      onUpdated(done.set);
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Tworzenie miniaturek przerwane.');
      // Whatever was made before the stop is already saved — reload the set.
      optionsApi.state().then((s) => {
        const fresh = s.sets.find((x) => x.id === set.id);
        if (fresh) onUpdated(fresh);
      }, () => undefined);
    } finally {
      abortRef.current = null;
      setRunning(false);
      setStatus(null);
      loadEstimate();
    }
  };

  const last = events[events.length - 1];
  const spent = result?.spentUsd ?? last?.spentUsd ?? 0;
  const labelOf = (e: SampleEvent) => set.groups.find((g) => g.id === e.group)?.options.find((o) => o.code === e.code)?.label ?? e.code;

  const footer = (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      {running ? (
        <button type="button" onClick={() => abortRef.current?.abort()} className="h-12 px-4 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-300 text-sm font-semibold flex items-center gap-2">
          <Square size={16} /> Zatrzymaj
        </button>
      ) : (
        <>
          <button type="button" onClick={onClose} className="h-12 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-slate-200">
            Zamknij
          </button>
          <button
            type="button"
            onClick={run}
            disabled={loading || !estimate || Boolean(estimate.blocker)}
            className="h-12 px-5 rounded-xl bg-pink-400 text-black text-sm font-semibold flex items-center gap-2 disabled:opacity-40"
          >
            <ImagePlus size={18} /> {estimate && !estimate.blocker ? `Twórz · ${formatUsd(estimate.totalUsd)}` : 'Twórz'}
          </button>
        </>
      )}
    </div>
  );

  return (
    <Sheet open={open} onClose={running ? () => undefined : onClose} title={`Miniaturki — ${set.name}`} icon={ImagePlus} tone={TONES.pink} widthClass="max-w-2xl" footer={footer}>
      <div role="radiogroup" aria-label="Które miniaturki" className="grid grid-cols-2 gap-2">
        {(
          [
            ['missing', `Brakujące (${missing})`, 'tylko opcje bez obrazka'],
            ['all', `Wszystkie od nowa (${allTargets.length})`, 'zastępuje obecne miniaturki'],
          ] as const
        ).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            disabled={running}
            onClick={() => setMode(id)}
            className={cn('min-h-16 p-3 rounded-xl border text-left', mode === id ? 'border-pink-400/60 bg-pink-400/10' : 'border-white/10 bg-brand-panel')}
          >
            <span className="block text-sm font-semibold text-white">{label}</span>
            <span className="block text-xs text-slate-400">{hint}</span>
          </button>
        ))}
      </div>

      <section className="p-4 rounded-xl bg-brand-panel border border-white/10 space-y-1" aria-live="polite">
        {loading || !estimate ? (
          <p className="text-sm text-slate-400 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Liczę koszt…
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              {estimate.count} {estimate.count === 1 ? 'miniaturka' : 'miniaturek'} × {formatUsd(estimate.priceEach)}
              {estimate.model && <> · model {estimate.model.label}</>}
            </p>
            <p className="font-display text-3xl font-semibold text-white">{formatUsd(estimate.totalUsd)}</p>
            <p className="text-xs text-slate-500">Szacunek z cennika w katalogu modeli; dostawca nalicza opłatę za każdy zrobiony obraz.</p>
            {estimate.blocker && (
              <p className="pt-2 text-sm text-amber-200 flex items-center gap-2 flex-wrap">
                <AlertTriangle size={16} className="shrink-0" /> {estimate.blocker}
                {!estimate.model && (
                  <button type="button" onClick={onOpenSettings} className="h-10 px-3 rounded-lg bg-amber-400 text-black text-sm font-semibold flex items-center gap-1.5">
                    <Settings size={15} /> Ustawienia
                  </button>
                )}
              </p>
            )}
          </>
        )}
      </section>

      {error && (
        <p className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/30 text-sm text-rose-200 flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </p>
      )}

      {(running || events.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300 flex items-center gap-2">
              {running ? <Loader2 size={16} className="animate-spin text-pink-300" /> : <CheckCircle2 size={16} className="text-emerald-300" />}
              {status ?? (last ? `${last.done} z ${last.total}` : 'Zaczynam…')}
            </span>
            <span className="font-mono text-slate-400">wydano {formatUsd(spent)}</span>
          </div>
          {last && (
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-pink-400 transition-all" style={{ width: `${(last.done / last.total) * 100}%` }} />
            </div>
          )}
          <ul className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {events.map((e) => (
              <li key={`${e.group}/${e.code}/${e.done}`} className="space-y-1 min-w-0">
                <span className="block aspect-square rounded-lg overflow-hidden bg-brand-raised border border-white/10">
                  {e.url ? <img src={e.url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full grid place-items-center text-rose-300"><AlertTriangle size={18} /></span>}
                </span>
                <span className={cn('block text-[11px] truncate', e.error ? 'text-rose-300' : 'text-slate-300')} title={e.error ?? undefined}>
                  {labelOf(e)}
                </span>
              </li>
            ))}
          </ul>
          {result && (
            <p className="text-sm text-slate-300">
              Gotowe: {result.made} {result.failed ? `· nieudane: ${result.failed}` : ''} · koszt {formatUsd(result.spentUsd)}
            </p>
          )}
          {events.find((e) => e.error) && <p className="text-xs text-rose-300">{events.find((e) => e.error)!.error}</p>}
        </section>
      )}
    </Sheet>
  );
}
