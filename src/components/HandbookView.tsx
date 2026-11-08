import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, ChevronLeft, ChevronRight, Code2, ListTree, Loader2, Search, X } from 'lucide-react';
import { getSection } from '../lib/sections';
import { apiCall } from '../lib/api';
import { cn, safeUrl } from '../lib/utils';
import ViewHeader, { ViewBody, HeaderButton } from './shell/ViewHeader';
import Sheet from './ui/Sheet';

// Handbook (2026-11-06, copied from muzaik's /admin/handbook + /admin/docs): the owner's handbook and the technical
// docs from documentation/, read from disk by the server on every visit (server/handbook.ts). Address = #handbook/<slug>
// or #docs/<slug>; links inside pages use the same form, links to views (#studio) switch the view.

type SetId = 'handbook' | 'docs';
interface Entry {
  set: SetId;
  slug: string;
  title: string;
  description: string;
  part: string;
  view: string | null;
}
interface Index {
  updated: string;
  handbook: Entry[];
  docs: Entry[];
}
interface Page extends Entry {
  markdown: string;
  prev: Pick<Entry, 'set' | 'slug' | 'title'> | null;
  next: Pick<Entry, 'set' | 'slug' | 'title'> | null;
}

const VIEW_LABEL: Record<string, string> = { '#pulpit': 'Centrum', '#studio': 'Studio', '#rozmowa': 'Rozmowa', '#badanie': 'Badanie', '#styl': 'Styl' };

function readRoute(): { set: SetId; slug: string | null } {
  const [head, slug] = window.location.hash.slice(1).split('/');
  return { set: head === 'docs' ? 'docs' : 'handbook', slug: slug && /^[a-z0-9-]+$/.test(slug) ? slug : null };
}
const href = (set: SetId, slug: string) => `#${set}/${slug}`;
const anchorId = (text: string) => `h-${text.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}`;
const textOf = (node: React.ReactNode): string =>
  typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : React.isValidElement(node) ? textOf((node.props as { children?: React.ReactNode }).children) : '';

/** Callout tone from its bold opening word (Uwaga / Wskazówka / Przykład / Koszt / Nie rób tego / ⚠️ Do sprawdzenia). */
function calloutTone(text: string): string {
  const t = text.trim().toLowerCase();
  if (t.startsWith('uwaga') || t.startsWith('⚠')) return 'border-amber-400/60 bg-amber-400/[0.07]';
  if (t.startsWith('nie rób')) return 'border-rose-400/60 bg-rose-400/[0.07]';
  if (t.startsWith('koszt')) return 'border-orange-400/60 bg-orange-400/[0.07]';
  if (t.startsWith('wskazówka') || t.startsWith('przykład')) return 'border-emerald-400/60 bg-emerald-400/[0.07]';
  return 'border-cyan-400/40 bg-white/[0.03]';
}

export default function HandbookView({ active }: { active: boolean }) {
  const section = getSection('handbook');
  const [index, setIndex] = React.useState<Index | null>(null);
  const [route, setRoute] = React.useState(readRoute);
  const [page, setPage] = React.useState<Page | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<{ entry: Entry; snippet: string }[] | null>(null);
  const [tocOpen, setTocOpen] = React.useState(false);
  const articleRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  // The index and the page are re-read whenever the view is opened, so an edited .md shows up without a reload.
  React.useEffect(() => {
    if (!active) return;
    apiCall<Index>('GET', '/api/handbook').then(setIndex, (err) => setError(err.message));
  }, [active]);

  const slug = route.slug ?? (route.set === 'docs' ? index?.docs[0]?.slug : index?.handbook[0]?.slug) ?? null;
  React.useEffect(() => {
    if (!active || !slug) return;
    setLoading(true);
    setError(null);
    apiCall<Page>('GET', `/api/handbook/${route.set}/${slug}`)
      .then((p) => {
        setPage(p);
        articleRef.current?.scrollTo({ top: 0 });
      }, (err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [active, route.set, slug]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setHits(null);
    const t = setTimeout(() => apiCall<{ entry: Entry; snippet: string }[]>('GET', `/api/handbook/search?q=${encodeURIComponent(q)}`).then(setHits, () => setHits([])), 250);
    return () => clearTimeout(t);
  }, [query]);

  const go = (set: SetId, s: string) => {
    setTocOpen(false);
    if (window.location.hash !== href(set, s)) history.pushState(null, '', href(set, s));
    setRoute({ set, slug: s });
  };

  const headings = React.useMemo(() => (page ? [...page.markdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/[`*_]/g, '').trim()) : []), [page]);

  const toc = (
    <Toc
      index={index}
      set={route.set}
      current={slug}
      query={query}
      hits={hits}
      onQuery={setQuery}
      onSet={(set) => {
        const first = index?.[set][0];
        if (first) go(set, first.slug);
      }}
      onGo={go}
    />
  );

  return (
    <>
      <ViewHeader section={section} subtitle={index ? `${index.handbook.length} stron handbooka · ${index.docs.length} dokumentów · stan na ${index.updated}` : section.subtitle}>
        <span className="lg:hidden">
          <HeaderButton onClick={() => setTocOpen(true)} label="Spis treści">
            <ListTree size={16} /> Spis
          </HeaderButton>
        </span>
      </ViewHeader>
      <ViewBody className="flex gap-4">
        <aside className="hidden lg:flex w-80 shrink-0 panel p-3 flex-col min-h-0">{toc}</aside>
        <section className="flex-1 min-w-0 min-h-[70vh] md:min-h-0 panel flex flex-col overflow-hidden">
          <div ref={articleRef} className="flex-1 min-h-0 overflow-y-auto px-5 md:px-8 py-6">
            {error && <p className="text-sm text-rose-300">{error}</p>}
            {!page && loading && (
              <p className="text-sm text-slate-400 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Wczytuję…
              </p>
            )}
            {page && (
              <article className="max-w-3xl mx-auto">
                <p className="text-xs font-mono uppercase tracking-wider text-emerald-300/80">
                  {page.set === 'docs' ? 'Dokumentacja techniczna' : `Handbook · ${page.part}`}
                </p>
                <h1 className="mt-1 font-display text-2xl md:text-3xl font-semibold text-white">{page.title}</h1>
                <p className="mt-1 text-slate-400">{page.description}</p>
                {page.view && VIEW_LABEL[page.view] && (
                  <a href={page.view} className="mt-3 inline-flex h-11 px-4 rounded-xl border border-emerald-400/40 bg-emerald-400/10 text-emerald-100 text-sm font-semibold items-center gap-2">
                    Otwórz: {VIEW_LABEL[page.view]} <ChevronRight size={15} />
                  </a>
                )}
                {headings.length > 2 && (
                  <nav aria-label="Na tej stronie" className="mt-4 flex flex-wrap gap-1.5">
                    {headings.map((h) => (
                      <button key={h} type="button" onClick={() => document.getElementById(anchorId(h))?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="min-h-9 px-2.5 rounded-lg border border-white/10 text-xs text-slate-300 active:bg-white/10">
                        {h}
                      </button>
                    ))}
                  </nav>
                )}
                <div className="handbook markdown-body mt-6">
                  <PageMarkdown text={page.markdown} />
                </div>
                <div className="mt-10 pt-4 border-t border-white/10 grid grid-cols-2 gap-3">
                  {page.prev ? (
                    <button type="button" onClick={() => go(page.prev!.set, page.prev!.slug)} className="min-h-14 px-3 rounded-xl border border-white/10 text-left flex items-center gap-2 active:bg-white/10">
                      <ChevronLeft size={18} className="shrink-0 text-slate-400" />
                      <span className="min-w-0">
                        <span className="block text-[11px] font-mono text-slate-500">Poprzednia</span>
                        <span className="block text-sm text-slate-100 truncate">{page.prev.title}</span>
                      </span>
                    </button>
                  ) : (
                    <span />
                  )}
                  {page.next && (
                    <button type="button" onClick={() => go(page.next!.set, page.next!.slug)} className="min-h-14 px-3 rounded-xl border border-white/10 text-right flex items-center justify-end gap-2 active:bg-white/10">
                      <span className="min-w-0">
                        <span className="block text-[11px] font-mono text-slate-500">Następna</span>
                        <span className="block text-sm text-slate-100 truncate">{page.next.title}</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-slate-400" />
                    </button>
                  )}
                </div>
              </article>
            )}
          </div>
        </section>
      </ViewBody>
      <Sheet open={tocOpen} onClose={() => setTocOpen(false)} title="Spis treści" icon={ListTree} tone={section.tone}>
        <div className="h-[70vh] flex flex-col">{toc}</div>
      </Sheet>
    </>
  );
}

function Toc({
  index, set, current, query, hits, onQuery, onSet, onGo,
}: {
  index: Index | null;
  set: SetId;
  current: string | null;
  query: string;
  hits: { entry: Entry; snippet: string }[] | null;
  onQuery: (q: string) => void;
  onSet: (s: SetId) => void;
  onGo: (s: SetId, slug: string) => void;
}) {
  const parts = React.useMemo(() => {
    const list = index?.[set] ?? [];
    const out: { part: string; items: Entry[] }[] = [];
    for (const e of list) {
      const last = out[out.length - 1];
      if (last?.part === e.part) last.items.push(e);
      else out.push({ part: e.part, items: [e] });
    }
    return out;
  }, [index, set]);
  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10 shrink-0">
        {(['handbook', 'docs'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={set === s} onClick={() => onSet(s)} className={cn('h-10 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5', set === s ? 'bg-emerald-400 text-black' : 'text-slate-300 active:bg-white/10')}>
            {s === 'handbook' ? <BookOpen size={15} /> : <Code2 size={15} />} {s === 'handbook' ? 'Handbook' : 'Dokumentacja'}
          </button>
        ))}
      </div>
      <label className="relative shrink-0">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Szukaj w obu zbiorach…" aria-label="Szukaj w handbooku i dokumentacji" className="field h-11 text-sm pl-9 pr-10" />
        {query && (
          <button type="button" onClick={() => onQuery('')} aria-label="Wyczyść" className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 grid place-items-center text-slate-400">
            <X size={15} />
          </button>
        )}
      </label>
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {hits ? (
          hits.length ? (
            <ul className="flex flex-col gap-1">
              {hits.map(({ entry, snippet }) => (
                <li key={`${entry.set}/${entry.slug}`}>
                  <button type="button" onClick={() => onGo(entry.set, entry.slug)} className="w-full min-h-11 px-3 py-2 rounded-xl text-left active:bg-white/10 hover:bg-white/5">
                    <span className="block text-sm text-slate-100">{entry.title}</span>
                    <span className="block text-[11px] font-mono text-slate-500">{entry.set === 'docs' ? 'Dokumentacja' : 'Handbook'}</span>
                    <span className="block text-xs text-slate-400 line-clamp-2">{snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 p-2">Nic nie znaleziono.</p>
          )
        ) : (
          parts.map((p) => (
            <div key={p.part} className="mb-3">
              {set === 'handbook' && <p className="px-3 mb-1 text-[11px] font-mono uppercase tracking-wider text-slate-500">{p.part}</p>}
              <ul className="flex flex-col gap-0.5">
                {p.items.map((e) => (
                  <li key={e.slug}>
                    <button
                      type="button"
                      onClick={() => onGo(e.set, e.slug)}
                      aria-current={e.slug === current ? 'page' : undefined}
                      title={e.description}
                      className={cn('w-full min-h-11 px-3 py-2 rounded-xl text-left text-sm', e.slug === current ? 'bg-emerald-400/15 text-emerald-100 border border-emerald-400/40' : 'text-slate-300 border border-transparent active:bg-white/10 hover:bg-white/5')}
                    >
                      {e.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PageMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => <h2 id={anchorId(textOf(children))}>{children}</h2>,
        a: ({ href: link, children }) => {
          if (link?.startsWith('#')) return <a href={link}>{children}</a>;
          const safe = safeUrl(link);
          return safe ? (
            <a href={safe} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <>{children}</>
          );
        },
        blockquote: ({ children }) => <blockquote className={cn('rounded-r-xl py-2 pr-3', calloutTone(textOf(children)))}>{children}</blockquote>,
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
        img: () => null,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
