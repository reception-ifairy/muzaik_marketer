import React from 'react';
import { Bot, Menu, ChevronLeft, type LucideIcon } from 'lucide-react';
import { SECTIONS, SETTINGS_ITEM, LOGOUT_ITEM, type ViewId, type Tone } from '../../lib/sections';
import { APP } from '../../config';
import { cn } from '../../lib/utils';

interface NavRailProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  /** Optional counters shown on a view's icon (e.g. unread items). */
  badges?: Partial<Record<ViewId, number>>;
  engineReady: boolean;
  ownerName: string;
  engineLabel: string;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/**
 * Touch navigation. Tablet/desktop: a left rail with icons only; the menu button expands it over the
 * content (so page layouts don't reflow) to show labels and the profile. Phone: a bottom bar.
 */
export default function NavRail({ view, onNavigate, badges = {}, engineReady, ownerName, engineLabel, onOpenSettings, onLogout }: NavRailProps) {
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const pick = (fn: () => void) => () => {
    setExpanded(false);
    fn();
  };

  return (
    <>
      {/* Tablet / desktop rail */}
      <aside className="hidden md:block relative w-20 shrink-0 h-full z-40">
        {expanded && <div className="fixed inset-0 bg-black/70" onClick={() => setExpanded(false)} aria-hidden="true" />}
        <nav
          aria-label="Nawigacja"
          className={cn(
            'absolute inset-y-0 left-0 flex flex-col gap-1 p-3 bg-black border-r border-white/10 transition-[width] duration-200 overflow-hidden',
            expanded ? 'w-72 shadow-2xl' : 'w-20',
          )}
        >
          <RailButton
            icon={expanded ? ChevronLeft : Menu}
            label={expanded ? 'Zwiń menu' : 'Rozwiń menu'}
            expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            ariaExpanded={expanded}
          />

          <div className="flex items-center gap-3 h-14 my-1">
            <span className="relative w-14 h-14 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-slate-100">
              <Bot size={26} />
              <span
                className={cn('absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-[3px] border-black', engineReady ? 'bg-emerald-400' : 'bg-amber-400')}
              />
            </span>
            {expanded && (
              <div className="min-w-0">
                <p className="font-display font-semibold text-white leading-tight">{APP.name}</p>
                <p className={cn('text-xs', engineReady ? 'text-emerald-300' : 'text-amber-300')}>
                  {engineReady ? 'Silnik AI gotowy' : 'Brak klucza dla silnika'}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {SECTIONS.map((s) => (
              <React.Fragment key={s.id}>
                <RailButton
                  icon={s.icon}
                  tone={s.tone}
                  label={s.label}
                  active={view === s.id}
                  expanded={expanded}
                  badge={badges[s.id] || undefined}
                  onClick={pick(() => onNavigate(s.id))}
                />
              </React.Fragment>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {expanded && (
              <div className="mt-3 p-4 rounded-2xl bg-brand-panel border border-white/10 text-sm text-slate-400 space-y-1 whitespace-nowrap">
                <p className="text-white font-semibold">{ownerName}</p>
                <p className="text-xs text-slate-500 pt-1 truncate">Silnik: {engineLabel}</p>
              </div>
            )}
          </div>

          <RailButton icon={SETTINGS_ITEM.icon} tone={SETTINGS_ITEM.tone} label={SETTINGS_ITEM.label} expanded={expanded} onClick={pick(onOpenSettings)} />
          <RailButton icon={LOGOUT_ITEM.icon} tone={LOGOUT_ITEM.tone} label={LOGOUT_ITEM.label} expanded={expanded} onClick={pick(onLogout)} />
        </nav>
      </aside>

      {/* Phone bottom bar */}
      <nav
        aria-label="Nawigacja"
        className="md:hidden order-last shrink-0 h-16 grid border-t border-white/10 bg-black"
        style={{ gridTemplateColumns: `repeat(${SECTIONS.length}, minmax(0, 1fr))` }}
      >
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = view === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onNavigate(s.id)}
              aria-label={s.label}
              aria-current={active ? 'page' : undefined}
              className="relative flex items-center justify-center"
            >
              <span className={cn('w-14 h-11 rounded-2xl flex items-center justify-center', active ? cn(s.tone.soft, s.tone.text) : s.tone.text, !active && 'opacity-70')}>
                <Icon size={22} />
              </span>
              {Boolean(badges[s.id]) && <Badge count={badges[s.id]!} className="top-1.5 right-3" />}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function RailButton({
  icon: Icon,
  label,
  onClick,
  expanded,
  tone,
  active = false,
  badge,
  ariaExpanded,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  expanded: boolean;
  tone?: Tone;
  active?: boolean;
  badge?: number;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? undefined : label}
      aria-current={active ? 'page' : undefined}
      aria-expanded={ariaExpanded}
      className={cn(
        'relative h-14 shrink-0 rounded-2xl flex items-center gap-4 border transition-colors',
        expanded ? 'w-full px-4' : 'w-14 justify-center',
        active && tone ? cn(tone.soft, tone.border) : 'border-transparent active:bg-white/10',
      )}
    >
      <Icon size={24} className={cn('shrink-0', tone ? tone.text : 'text-slate-300')} />
      {expanded && (
        <span className={cn('flex-1 text-left text-base whitespace-nowrap', active && tone ? cn(tone.text, 'font-semibold') : 'text-slate-200')}>
          {label}
        </span>
      )}
      {badge !== undefined && (expanded ? <span className="text-sm tabular-nums text-pink-300">{badge}</span> : <Badge count={badge} className="top-1 right-1" />)}
    </button>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn('absolute min-w-5 h-5 px-1 rounded-full bg-pink-500 text-white text-xs font-bold flex items-center justify-center', className)}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
