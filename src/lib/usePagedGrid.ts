import React from 'react';

interface PagedGridOptions {
  count: number;
  minItemWidth: number;
  itemHeight: number;
  gap: number;
}

/** Measures the element and works out how many fixed-size items fit per page (columns × rows). */
export function usePagedGrid<T extends HTMLElement>({ count, minItemWidth, itemHeight, gap }: PagedGridOptions) {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((size.width + gap) / (minItemWidth + gap)));
  const rows = Math.max(1, Math.floor((size.height + gap) / (itemHeight + gap)));
  const perPage = cols * rows;
  const pages = Math.max(1, Math.ceil(count / perPage));

  return { ref, cols, rows, perPage, pages };
}
