import React from 'react';
import { Loader2, ListTree, ChevronRight } from 'lucide-react';
import type { ActivityStep, ProgressEvent } from '../types';
import { TONES } from '../lib/sections';
import { cn } from '../lib/utils';
import { APP } from '../config';
import Sheet from './ui/Sheet';
import Pager from './ui/Pager';
import ActivityTimeline, { ActivityChips, KIND_STYLE, stepTitle } from './ActivityTimeline';

const RECENT = 6;

/** Latest version of every activity step (updates reuse the id), in order. */
export function stepsFromEvents(events: ProgressEvent[]): ActivityStep[] {
  const byId = new Map<number, ActivityStep>();
  for (const e of events) if (e.type === 'activity') byId.set(e.step.id, e.step);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function CompactRow({ step, live, onOpen }: { step: ActivityStep; live: boolean; onOpen: () => void }) {
  const s = KIND_STYLE[step.kind];
  const Icon = s.icon;
  const thinking = step.kind === 'think';
  return (
    <button type="button" onClick={onOpen} className="w-full min-h-12 px-3 py-2 rounded-xl bg-brand-raised flex items-start gap-3 text-left active:bg-white/10">
      <span className={cn('w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0', s.tone)}>
        {live ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn('block text-[11px] font-mono uppercase tracking-wider', s.tone)}>{s.verb}</span>
        <span className={cn('block text-sm text-slate-200', live && thinking ? 'line-clamp-3' : 'truncate')}>
          {thinking ? (step.detail || '…').replace(/\s+/g, ' ').slice(-400) : stepTitle(step)}
        </span>
      </span>
      {step.detail && !thinking && <ChevronRight size={18} className="text-slate-500 shrink-0 mt-1.5" />}
    </button>
  );
}

/** Progress while a long AI task runs: what the model is doing right now, without scrolling. */
export default function LiveActivity({ events, hint, toneClass = 'text-sky-400' }: { events: ProgressEvent[]; hint: string; toneClass?: string }) {
  const [open, setOpen] = React.useState<ActivityStep | null>(null);
  const [all, setAll] = React.useState(false);
  const status = [...events].reverse().find((e) => e.type === 'status');
  const steps = stepsFromEvents(events);
  const recent = steps.slice(-RECENT);

  return (
    <section className="panel h-full p-6 flex flex-col items-center gap-5 min-h-0">
      <div className="flex flex-col items-center text-center gap-3 shrink-0">
        <Loader2 size={36} className={cn('animate-spin', toneClass)} />
        <h3 className="font-display text-2xl font-semibold text-white">{status?.type === 'status' ? status.message : 'Łączę się…'}</h3>
        <div className="flex flex-wrap justify-center gap-1.5 min-h-5">
          {steps.length ? <ActivityChips steps={steps} live /> : <span className="text-sm text-slate-400">To potrwa zwykle 1–3 minuty.</span>}
        </div>
      </div>
      <ul className="w-full max-w-2xl flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
        {recent.map((step, i) => (
          <li key={step.id}>
            <CompactRow step={step} live={i === recent.length - 1} onOpen={() => setOpen(step)} />
          </li>
        ))}
      </ul>
      <div className="shrink-0 flex flex-col items-center gap-2">
        {steps.length > RECENT && (
          <button type="button" onClick={() => setAll(true)} className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-slate-200 flex items-center gap-2">
            <ListTree size={16} /> Wszystkie kroki ({steps.length})
          </button>
        )}
        <p className="text-sm text-slate-500 text-center max-w-xl">{hint}</p>
      </div>

      <StepSheet step={open} onClose={() => setOpen(null)} />
      <Sheet open={all} onClose={() => setAll(false)} title={`Co robi ${APP.assistantName}`} icon={ListTree} tone={TONES.indigo}>
        <ActivityTimeline steps={steps} live />
      </Sheet>
    </section>
  );
}

export function StepSheet({ step, onClose }: { step: ActivityStep | null; onClose: () => void }) {
  const [shown, setShown] = React.useState<ActivityStep | null>(step);
  React.useEffect(() => {
    if (step) setShown(step);
  }, [step]);
  const s = step ?? shown;
  const style = s ? KIND_STYLE[s.kind] : KIND_STYLE.think;
  return (
    <Sheet open={Boolean(step)} onClose={onClose} title={s ? style.verb : ''} icon={style.icon} tone={TONES.indigo}>
      {s && (
        <>
          {s.kind !== 'think' && <p className="text-base text-slate-100 break-words">{s.label}</p>}
          <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{s.detail || 'Brak szczegółów.'}</p>
        </>
      )}
    </Sheet>
  );
}

/** Finished timeline inside a fixed-height panel: rows page instead of scrolling, details open in a sheet. */
export function ActivityPager({ steps }: { steps: ActivityStep[] }) {
  const [open, setOpen] = React.useState<ActivityStep | null>(null);
  if (!steps.length) return <p className="text-sm text-slate-400">Brak zapisanych kroków dla tego wyniku.</p>;
  return (
    <>
      <Pager
        items={steps}
        getKey={(s) => s.id}
        minItemWidth={2000}
        itemHeight={60}
        gap={8}
        label="Kroki AI"
        renderItem={(step) => <CompactRow step={step} live={false} onOpen={() => setOpen(step)} />}
      />
      <StepSheet step={open} onClose={() => setOpen(null)} />
    </>
  );
}
