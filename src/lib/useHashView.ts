import React from 'react';

/** Hash prefixes that open another view (technical docs live in the Handbook view). */
const HASH_ALIASES: Record<string, string> = { docs: 'handbook' };

/**
 * Current view kept in the URL hash (#rozmowa). Each navigation pushes a history entry,
 * so the Android back gesture returns to the previous view instead of leaving the app.
 */
export function useHashView<T extends string>(views: readonly T[], fallback: T, aliases: Partial<Record<string, T>> = HASH_ALIASES as Partial<Record<string, T>>): [T, (view: T) => void] {
  const read = React.useCallback((): T => {
    // A view may have a sub-path (#handbook/plan-kampanii); #docs/<slug> belongs to the handbook view.
    const head = window.location.hash.slice(1).split(/[/?]/)[0];
    const hash = (aliases[head] ?? head) as T;
    return views.includes(hash) ? hash : fallback;
  }, [views, fallback, aliases]);

  const [view, setView] = React.useState<T>(read);

  React.useEffect(() => {
    const sync = () => setView(read());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [read]);

  const navigate = React.useCallback(
    (next: T) => {
      if (next === read()) return;
      history.pushState(null, '', `#${next}`);
      setView(next);
    },
    [read],
  );

  return [view, navigate];
}
