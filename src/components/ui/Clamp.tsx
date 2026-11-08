import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ClampProps {
  children: React.ReactNode;
  onMore: () => void;
  moreLabel?: string;
  className?: string;
}

/** Fills the available height and cuts the content off; a "read all" button appears only when something is hidden. */
export default function Clamp({ children, onMore, moreLabel = 'Czytaj całość', className }: ClampProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 2);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div className={cn('min-h-0 flex flex-col', className)}>
      <div ref={ref} className="relative flex-1 min-h-0 overflow-hidden" data-clamp>
        {children}
        {overflowing && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-brand-panel to-transparent" />}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={onMore}
          className="shrink-0 mt-2 h-11 self-start px-3 -ml-3 rounded-xl text-sm font-semibold text-cyan-300 flex items-center gap-1 active:bg-white/5"
        >
          {moreLabel} <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
