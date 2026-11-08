import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePagedGrid } from '../../lib/usePagedGrid';
import { cn } from '../../lib/utils';

interface PagerProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => React.Key;
  minItemWidth: number;
  itemHeight: number;
  label: string;
  gap?: number;
  className?: string;
  /** Pages reset to the first one when this changes (defaults to the items array). */
  resetKey?: unknown;
}

const SWIPE_DISTANCE = 50;

/**
 * Grid that never scrolls: as many items as fit the box are shown, the rest go to further pages.
 * Pages change with a horizontal swipe or the 48px arrow buttons.
 */
export default function Pager<T>({ items, renderItem, getKey, minItemWidth, itemHeight, label, gap = 16, className, resetKey }: PagerProps<T>) {
  const { ref, cols, rows, perPage, pages } = usePagedGrid<HTMLDivElement>({ count: items.length, minItemWidth, itemHeight, gap });
  const [page, setPage] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const swipe = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // New data (e.g. a fresh search) starts from the first page.
  const reset = resetKey === undefined ? items : resetKey;
  React.useEffect(() => setPage(0), [reset]);
  const current = Math.min(page, pages - 1);

  const go = (next: number) => {
    if (next < 0 || next >= pages || next === current) return;
    setDirection(next > current ? 1 : -1);
    setPage(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipe.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
      start.moved = true;
      go(dx < 0 ? current + 1 : current - 1);
    }
  };
  // A swipe that ends on a button or link must not also click it.
  const onClickCapture = (e: React.MouseEvent) => {
    if (swipe.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    swipe.current = null;
  };

  const visible = items.slice(current * perPage, current * perPage + perPage);

  return (
    <div className={cn('h-full min-h-0 flex flex-col', className)}>
      <div
        ref={ref}
        className="flex-1 min-h-0 overflow-hidden select-none"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        // Native link/image dragging would cancel the pointer stream mid-swipe.
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={onClickCapture}
        role="region"
        aria-label={pages > 1 ? `${label}, strona ${current + 1} z ${pages}` : label}
      >
        <motion.div
          key={`${current}-${cols}-${rows}`}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="grid h-full"
          style={{
            gap,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, ${itemHeight}px))`,
          }}
        >
          {visible.map((item, i) => (
            <React.Fragment key={getKey(item, current * perPage + i)}>{renderItem(item, current * perPage + i)}</React.Fragment>
          ))}
        </motion.div>
      </div>

      {pages > 1 && (
        <div className="shrink-0 pt-3 flex items-center justify-center gap-4">
          <PageButton label="Poprzednia strona" disabled={current === 0} onClick={() => go(current - 1)}>
            <ChevronLeft size={22} />
          </PageButton>
          <div className="flex items-center gap-2 min-w-[96px] justify-center">
            {pages <= 8 ? (
              Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Strona ${i + 1}`}
                  aria-current={i === current ? 'page' : undefined}
                  className="h-11 w-6 flex items-center justify-center"
                >
                  <span className={cn('block h-2.5 rounded-full transition-all', i === current ? 'w-6 bg-cyan-400' : 'w-2.5 bg-white/25')} />
                </button>
              ))
            ) : null}
            <span data-pager-counter className="text-sm tabular-nums text-slate-400 ml-1">
              {current + 1} / {pages}
            </span>
          </div>
          <PageButton label="Następna strona" disabled={current === pages - 1} onClick={() => go(current + 1)}>
            <ChevronRight size={22} />
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-12 w-12 rounded-xl border border-white/10 bg-brand-raised text-slate-200 flex items-center justify-center active:bg-white/10 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
