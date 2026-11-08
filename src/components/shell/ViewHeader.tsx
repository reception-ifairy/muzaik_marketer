import React from 'react';
import type { SectionDef } from '../../lib/sections';
import { cn } from '../../lib/utils';

interface ViewHeaderProps {
  section: SectionDef;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}

export default function ViewHeader({ section, subtitle, children }: ViewHeaderProps) {
  const Icon = section.icon;
  return (
    <header className="shrink-0 h-16 px-4 md:px-5 flex items-center gap-3 md:gap-4">
      <span className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', section.tone.soft, section.tone.text)}>
        <Icon size={22} />
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="font-display font-semibold text-xl text-white leading-tight truncate">{section.label}</h2>
        <p className="text-sm text-slate-400 truncate">{subtitle ?? section.subtitle}</p>
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </header>
  );
}

/** Body below the header: locked to the viewport from md up, scrollable on phones where forms can't fit. */
export function ViewBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex-1 min-h-0 overflow-y-auto md:overflow-hidden px-4 pb-4 md:px-5 md:pb-5', className)}>{children}</div>;
}

export function HeaderButton({
  onClick,
  children,
  tone = 'neutral',
  disabled,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'danger' | 'amber';
  disabled?: boolean;
  label?: string;
}) {
  const styles = {
    neutral: 'bg-brand-raised border-white/10 text-slate-200 active:bg-white/10',
    primary: 'bg-cyan-400 border-cyan-400 text-black active:bg-cyan-300',
    danger: 'bg-rose-500/15 border-rose-400/40 text-rose-300 active:bg-rose-500/25',
    amber: 'bg-amber-400/15 border-amber-400/40 text-amber-300 active:bg-amber-400/25',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn('h-12 px-4 rounded-xl border text-sm font-semibold flex items-center gap-2 whitespace-nowrap disabled:opacity-50', styles)}
    >
      {children}
    </button>
  );
}
