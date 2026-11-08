import React from 'react';
import { Brain, Globe, FileText, ShieldCheck, ChevronDown, Loader2, ListTree, type LucideIcon } from 'lucide-react';
import type { ActivityKind, ActivityStep } from '../types';
import { cn, hostname } from '../lib/utils';
import { APP } from '../config';

type Step = ActivityStep;

export const KIND_STYLE: Record<ActivityKind, { verb: string; short: string; icon: LucideIcon; tone: string; chip: string }> = {
  think: { verb: 'Myślenie', short: 'myślenie', icon: Brain, tone: 'text-indigo-300', chip: 'border-indigo-400/40 text-indigo-200 bg-indigo-500/10' },
  search: { verb: 'Szukam w sieci', short: 'web', icon: Globe, tone: 'text-sky-300', chip: 'border-sky-400/40 text-sky-200 bg-sky-500/10' },
  fetch: { verb: 'Czytam stronę', short: 'strona', icon: FileText, tone: 'text-emerald-300', chip: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' },
  google: { verb: 'Google sprawdza', short: 'Google', icon: ShieldCheck, tone: 'text-amber-300', chip: 'border-amber-400/40 text-amber-200 bg-amber-500/10' },
};

/** "3× myślenie · 5× web …" counts per kind. */
export function ActivityChips({ steps, live = false }: { steps: Step[]; live?: boolean }) {
  const counts = (Object.keys(KIND_STYLE) as ActivityKind[])
    .map((kind) => ({ kind, n: steps.filter((s) => s.kind === kind).length }))
    .filter((c) => c.n > 0);
  return (
    <>
      {counts.map(({ kind, n }) => {
        const s = KIND_STYLE[kind];
        const Icon = s.icon;
        return (
          <span key={kind} className={cn('font-mono text-[10px] h-5 px-1.5 rounded border flex items-center gap-1', s.chip, live && 'animate-pulse')}>
            <Icon size={10} /> {s.short}
            {n > 1 ? ` ×${n}` : ''}
          </span>
        );
      })}
    </>
  );
}

export function stepTitle(step: Step): string {
  if (step.kind === 'think') return 'Myślenie';
  if (step.kind === 'fetch') {
    try {
      const url = new URL(step.label);
      return `${hostname(step.label)}${url.pathname.length > 1 ? url.pathname.slice(0, 50) : ''}`;
    } catch {
      return step.label;
    }
  }
  return step.label;
}

/** One row of the timeline: icon, what happened, and the detail on tap. */
export function ActivityRow({ step, live, open, onToggle }: { step: Step; live: boolean; open: boolean; onToggle: () => void }) {
  const s = KIND_STYLE[step.kind];
  const Icon = s.icon;
  const hasDetail = Boolean(step.detail);
  return (
    <li className="rounded-xl bg-white/[0.04] border border-white/5 overflow-hidden">
      <button type="button" onClick={onToggle} disabled={!hasDetail} aria-expanded={hasDetail ? open : undefined} className="w-full min-h-12 px-3 py-2 flex items-center gap-3 text-left">
        <span className={cn('w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0', s.tone)}>
          {live ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className={cn('block text-[11px] font-mono uppercase tracking-wider', s.tone)}>{s.verb}</span>
          <span className="block text-sm text-slate-200 truncate">{step.kind === 'think' ? (step.detail || '…').replace(/\s+/g, ' ').slice(0, 120) : stepTitle(step)}</span>
        </span>
        {hasDetail && <ChevronDown size={18} className={cn('text-slate-500 shrink-0 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && hasDetail && <p className="px-4 pb-3 pl-14 text-sm text-slate-400 whitespace-pre-line leading-relaxed">{step.detail}</p>}
    </li>
  );
}

/**
 * The full "what the assistant did" timeline, rows expandable inline. While live, the newest step spins and
 * the current thought stays open so it reads like the model working.
 */
export default function ActivityTimeline({ steps, live = false, className }: { steps: Step[]; live?: boolean; className?: string }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const keyOf = (s: Step, i: number) => String(s.id ?? `i${i}`);
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <ol className={cn('flex flex-col gap-1.5', className)}>
      {steps.map((step, i) => {
        const key = keyOf(step, i);
        const isLast = i === steps.length - 1;
        return (
          <React.Fragment key={key}>
            <ActivityRow step={step} live={live && isLast} open={open.has(key) || (live && isLast && step.kind === 'think')} onToggle={() => toggle(key)} />
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/** Collapsible "Co robił asystent (n)" header with the timeline inside (chat). */
export function ActivityPanel({ steps, live = false }: { steps: Step[]; live?: boolean }) {
  const [expanded, setExpanded] = React.useState(live);
  React.useEffect(() => {
    if (live) setExpanded(true);
  }, [live]);
  if (!steps.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-indigo-400/25 bg-indigo-950/20 overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="w-full min-h-11 px-3 py-2 flex items-center gap-2 text-left">
        <ListTree size={16} className="text-indigo-300 shrink-0" />
        <span className="text-[12px] font-semibold text-indigo-200">{live ? `${APP.assistantName} pracuje` : `Co robił ${APP.assistantName}`}</span>
        <span className="font-mono text-[10px] text-slate-500">{steps.length} kroków</span>
        <span className="flex-1" />
        <span className="hidden sm:flex gap-1">
          <ActivityChips steps={steps} live={live} />
        </span>
        <ChevronDown size={18} className={cn('text-slate-500 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && <ActivityTimeline steps={steps} live={live} className="px-2 pb-2" />}
    </div>
  );
}
