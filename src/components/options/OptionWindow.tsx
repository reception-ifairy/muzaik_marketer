import React from 'react';
import type { OptionGroup, OptionItem, OptionPicks, OptionSet } from '../../options';
import { cn } from '../../lib/utils';
import OptionVisual, { GroupIcon } from './OptionVisual';

// The option window, ported from Kuźnia inspiracji (studio/forge/_option-window.blade.php + forge.js). A group's
// circle opens one window centred on the screen — a native modal <dialog>, so it sits in the top layer — with big
// square thumbnails, 4 per row and 16 per page ("Brak" first), page arrows (also ← → and a swipe), ‹ › to the
// previous or next group without closing, and ⤢ for the full-size look with "Wybierz". A tap chooses and closes;
// Esc, ✕ or the dark backdrop closes.

const PER_PAGE = 16;

interface OptionWindowProps {
  set: OptionSet;
  /** The open group, or null when the window is closed. */
  groupId: string | null;
  picks: OptionPicks;
  onPick: (groupId: string, code: string) => void;
  onGroupChange: (groupId: string) => void;
  onClose: () => void;
}

type Tile = { kind: 'none' } | { kind: 'option'; option: OptionItem; index: number };

/** "1 opcja", "3 opcje", "12 opcji" (Kuźnia's options_in_group). */
function optionsCount(n: number): string {
  if (n === 1) return '1 opcja';
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${few ? 'opcje' : 'opcji'}`;
}

export default function OptionWindow({ set, groupId, picks, onPick, onGroupChange, onClose }: OptionWindowProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const zoomRef = React.useRef<HTMLDialogElement>(null);
  const groupIndex = set.groups.findIndex((g) => g.id === groupId);
  const group: OptionGroup | undefined = set.groups[groupIndex];
  const tiles: Tile[] = group ? [{ kind: 'none' }, ...group.options.map((option, index) => ({ kind: 'option' as const, option, index }))] : [];
  const pageCount = Math.max(1, Math.ceil(tiles.length / PER_PAGE));
  const [page, setPage] = React.useState(0);
  const [zoom, setZoom] = React.useState<number | null>(null);
  const swipe = React.useRef<{ x: number; y: number } | null>(null);
  const picked = group ? (picks[group.id] ?? '') : '';

  // Open on the page that holds the current choice.
  React.useEffect(() => {
    if (!group) return;
    const at = group.options.findIndex((o) => o.code === picks[group.id]);
    setPage(Math.floor((at + 1) / PER_PAGE));
    setZoom(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  React.useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (group && !d.open) d.showModal();
    if (!group && d.open) d.close();
  }, [group]);

  React.useEffect(() => {
    const z = zoomRef.current;
    if (!z) return;
    if (zoom !== null && !z.open) z.showModal();
    if (zoom === null && z.open) z.close();
  }, [zoom]);

  const stepGroup = (delta: number) => {
    const n = set.groups.length;
    onGroupChange(set.groups[(groupIndex + delta + n) % n].id);
  };
  const stepPage = (delta: number) => setPage((p) => Math.min(pageCount - 1, Math.max(0, p + delta)));
  const choose = (code: string) => {
    if (!group) return;
    onPick(group.id, code);
    setZoom(null);
    onClose();
  };

  const tone = { '--tone': group?.tone ?? '#38bdf8' } as React.CSSProperties;
  const pageTiles = tiles.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const zoomed = group && zoom !== null ? group.options[zoom] : null;
  const prev = set.groups[(groupIndex - 1 + set.groups.length) % set.groups.length];
  const next = set.groups[(groupIndex + 1) % set.groups.length];
  const roundBtn = 'w-11 h-11 shrink-0 grid place-items-center rounded-full border border-white/15 text-lg text-slate-100 hover:border-[var(--tone)] disabled:opacity-30';

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby="option-window-title"
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
        onKeyDown={(e) => {
          if (zoom !== null) return;
          if (e.key === 'ArrowLeft') stepPage(-1);
          if (e.key === 'ArrowRight') stepPage(1);
        }}
        className="m-auto p-0 border-0 bg-transparent max-w-none max-h-none overflow-visible text-slate-100"
      >
        {group && (
          <div
            style={tone}
            onPointerDown={(e) => (swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY })}
            onPointerUp={(e) => {
              const s = swipe.current;
              swipe.current = null;
              if (!s) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) > 60 && Math.abs(e.clientY - s.y) < 50) stepPage(dx < 0 ? 1 : -1);
            }}
            className="option-window grid grid-cols-1 gap-3 overflow-hidden rounded-2xl border border-white/10 bg-[#050505] p-3 sm:p-4 shadow-[0_20px_80px_-10px_rgba(0,0,0,0.95),0_0_60px_-24px_var(--tone)]"
          >
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => stepGroup(-1)} aria-label={`Poprzednia grupa: ${prev.label}`} className={roundBtn}>
                ‹
              </button>
              <span className="tone-circle is-chosen w-10 h-10 shrink-0 grid place-items-center rounded-full">
                <GroupIcon icon={group.icon} size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <h3 id="option-window-title" className="truncate font-semibold text-white">
                  {group.label}{' '}
                  <span className="font-mono text-[11px] font-normal text-slate-400">
                    {groupIndex + 1}/{set.groups.length}
                  </span>
                </h3>
                <p className="truncate text-xs text-slate-400">{group.description}</p>
              </div>
              <button type="button" onClick={() => stepGroup(1)} aria-label={`Następna grupa: ${next.label}`} className={roundBtn}>
                ›
              </button>
              <button type="button" onClick={onClose} aria-label="Zamknij" className={roundBtn}>
                ✕
              </button>
            </div>

            <div role="radiogroup" aria-label={group.label} className="grid grid-cols-4 content-start gap-2">
              {pageTiles.map((tile) => {
                const code = tile.kind === 'none' ? '' : tile.option.code;
                const checked = picked === code;
                const label = tile.kind === 'none' ? 'Brak' : tile.option.label;
                return (
                  <div key={code || '∅'} className="relative min-w-0">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      title={tile.kind === 'none' ? 'Nic nie dodaje do promptu.' : tile.option.description}
                      onClick={() => choose(code)}
                      className="w-full grid content-start gap-1 text-left"
                    >
                      <span className="option-thumb relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-brand-raised text-3xl text-slate-500">
                        {tile.kind === 'none' ? '∅' : <OptionVisual group={group} option={tile.option} />}
                      </span>
                      <span className={cn('line-clamp-2 h-8 text-[11px] font-semibold leading-4', checked ? 'text-[var(--tone)]' : 'text-slate-100')}>{label}</span>
                    </button>
                    {checked && (
                      <span aria-hidden="true" className="absolute top-1 right-1 w-6 h-6 rounded-full grid place-items-center bg-[var(--tone)] text-black text-xs font-bold pointer-events-none">
                        ✓
                      </span>
                    )}
                    {tile.kind === 'option' && (
                      <button
                        type="button"
                        onClick={() => setZoom(tile.index)}
                        aria-label={`Powiększ: ${tile.option.label}`}
                        className="absolute left-1 top-1 w-8 h-8 grid place-items-center rounded-full border border-white/15 bg-black/75 text-xs text-slate-100 shadow-[0_0_14px_-4px_var(--tone)] backdrop-blur-md hover:border-[var(--tone)]"
                      >
                        ⤢
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => stepPage(-1)} disabled={page === 0} aria-label="Poprzednia strona" className={roundBtn}>
                ←
              </button>
              <div className="flex flex-wrap items-center justify-center gap-1.5" aria-live="polite">
                {pageCount > 1 &&
                  Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      aria-label={`Strona ${i + 1}`}
                      aria-current={i === page ? 'page' : undefined}
                      className={cn('h-2.5 rounded-full transition-all', i === page ? 'w-6 bg-[var(--tone)]' : 'w-2.5 bg-white/25')}
                    />
                  ))}
                <span className="ml-1 font-mono text-[11px] text-slate-400">
                  {pageCount > 1 ? `Strona ${page + 1} z ${pageCount} · ` : ''}
                  {optionsCount(group.options.length)}
                </span>
              </div>
              <button type="button" onClick={() => stepPage(1)} disabled={page >= pageCount - 1} aria-label="Następna strona" className={roundBtn}>
                →
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* A closer look at one option: the full picture (or its drawn swatch), its description and "Wybierz". */}
      <dialog
        ref={zoomRef}
        aria-labelledby="option-zoom-title"
        onCancel={(e) => {
          e.preventDefault();
          setZoom(null);
        }}
        onClick={(e) => e.target === e.currentTarget && setZoom(null)}
        onKeyDown={(e) => {
          if (!group || zoom === null) return;
          const n = group.options.length;
          if (e.key === 'ArrowLeft') setZoom((zoom - 1 + n) % n);
          if (e.key === 'ArrowRight') setZoom((zoom + 1) % n);
        }}
        className="option-zoom m-auto max-h-[calc(100dvh-1rem)] w-[min(56rem,calc(100vw-1rem))] max-w-none overflow-hidden rounded-2xl border border-white/10 bg-black p-0 text-slate-100 shadow-2xl"
      >
        {group && zoomed && zoom !== null && (
          <div style={tone} className="grid max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-widest text-[var(--tone)]">{group.label}</p>
                <h2 id="option-zoom-title" className="truncate text-lg font-semibold text-white">
                  {zoomed.label}
                </h2>
                <p className="text-sm text-slate-400">{zoomed.description}</p>
              </div>
              <button type="button" onClick={() => setZoom(null)} aria-label="Zamknij" className={roundBtn}>
                ✕
              </button>
            </div>
            <div className="relative grid min-h-0 place-items-center">
              <span className="block aspect-square h-[min(60dvh,32rem,calc(100vw-2rem))] max-w-full overflow-hidden rounded-xl border-2 border-[var(--tone)] shadow-[0_0_60px_-20px_var(--tone)]">
                <OptionVisual group={group} option={zoomed} large />
              </span>
              <button
                type="button"
                onClick={() => setZoom((zoom - 1 + group.options.length) % group.options.length)}
                aria-label="Poprzednia"
                className="absolute left-1 top-1/2 -translate-y-1/2 w-12 h-12 grid place-items-center rounded-full border border-white/15 bg-black/70 text-xl backdrop-blur-md hover:border-[var(--tone)]"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setZoom((zoom + 1) % group.options.length)}
                aria-label="Następna"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 grid place-items-center rounded-full border border-white/15 bg-black/70 text-xl backdrop-blur-md hover:border-[var(--tone)]"
              >
                ›
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-slate-400">
                {zoom + 1} z {group.options.length}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setZoom(null)} className="min-h-11 rounded-full border border-white/15 px-4 text-sm">
                  Zamknij
                </button>
                <button type="button" onClick={() => choose(zoomed.code)} className="min-h-11 rounded-full bg-[var(--tone)] px-6 text-sm font-semibold text-black shadow-[0_0_24px_-6px_var(--tone)]">
                  Wybierz
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
