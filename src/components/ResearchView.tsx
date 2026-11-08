import React from 'react';
import { Telescope, Square, AlertTriangle, CheckCircle2, CircleHelp, ListChecks, Link2, ListTree, ExternalLink, FileText } from 'lucide-react';
import type { ProgressEvent, ResearchRequest, ResearchResult } from '../types';
import { APP } from '../config';
import { getSection, TONES } from '../lib/sections';
import { streamRequest } from '../lib/api';
import { useAiSettings } from '../lib/aiSettingsContext';
import { useVoiceMessage } from '../lib/useVoiceMessage';
import { speak } from '../lib/speech';
import { cn, formatDateTime, hostname, safeUrl } from '../lib/utils';
import ViewHeader, { ViewBody, HeaderButton } from './shell/ViewHeader';
import LiveActivity from './LiveActivity';
import ActivityTimeline from './ActivityTimeline';
import { RecordButton } from './voice/VoiceMessage';
import SpeakButton from './voice/SpeakButton';
import Pager from './ui/Pager';
import Clamp from './ui/Clamp';
import Sheet from './ui/Sheet';

// Example feature: a structured web-research run. It shows the whole pattern a new feature follows:
// form -> streamRequest (SSE) -> LiveActivity while it runs -> result panels that never scroll.

export interface ResearchPreset {
  query: string;
  nonce: number; // changes on every request so the same query can be re-run
}

interface ResearchViewProps {
  preset: ResearchPreset | null;
  onOpenSettings: () => void;
  onResult: (result: ResearchResult) => void;
}

const CONFIDENCE = {
  high: { label: 'Wysoka pewność', style: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/40', icon: CheckCircle2 },
  medium: { label: 'Średnia pewność', style: 'bg-amber-400/15 text-amber-300 border-amber-400/40', icon: CircleHelp },
  low: { label: 'Niska pewność', style: 'bg-rose-400/15 text-rose-300 border-rose-400/40', icon: AlertTriangle },
} as const;

export default function ResearchView({ preset, onOpenSettings, onResult }: ResearchViewProps) {
  const section = getSection('badanie');
  const { engineReady, voiceReady, settings } = useAiSettings();
  const [query, setQuery] = React.useState('');
  const [depth, setDepth] = React.useState<ResearchRequest['depth']>('quick');
  const [loading, setLoading] = React.useState(false);
  const [events, setEvents] = React.useState<ProgressEvent[]>([]);
  const [result, setResult] = React.useState<ResearchResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const run = React.useCallback(
    async (q: string, d: ResearchRequest['depth']) => {
      if (!q.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      setResult(null);
      setEvents([]);
      try {
        const data = await streamRequest<ResearchResult>('/api/research', { query: q.trim(), depth: d }, (e) => setEvents((prev) => [...prev, e]), controller.signal);
        setResult(data);
        onResult(data);
        if (settings?.prefs.voice.autoRead && voiceReady) speak(`research-${data.meta.searchedAt}`, data.summary);
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError(err?.message || 'Coś poszło nie tak.');
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [onResult, settings, voiceReady],
  );

  // Requests from other views (dashboard) start straight away.
  React.useEffect(() => {
    if (!preset) return;
    setQuery(preset.query);
    run(preset.query, depth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const recorder = useVoiceMessage((v) => {
    if (!v.query) return;
    recorder.reset();
    setQuery(v.query);
    run(v.query, depth);
  });

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  return (
    <>
      <ViewHeader section={section}>
        {loading && (
          <HeaderButton tone="danger" onClick={stop}>
            <Square size={16} /> Przerwij
          </HeaderButton>
        )}
      </ViewHeader>
      <ViewBody className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(query, depth);
          }}
          className="panel p-3 flex flex-col md:flex-row gap-3 shrink-0"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="O co chcesz zapytać? np. Jakie są wymagania wizowe do Japonii dla obywateli UK?"
            aria-label="Pytanie"
            className="field text-lg flex-1 min-w-0"
            disabled={loading}
          />
          <div className="flex gap-2 shrink-0">
            <div role="radiogroup" aria-label="Dokładność" className="flex p-1 rounded-xl bg-brand-raised border border-white/10">
              {(
                [
                  ['quick', 'Szybko'],
                  ['thorough', 'Dokładnie'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={depth === id}
                  onClick={() => setDepth(id)}
                  className={cn('h-12 px-3 rounded-lg text-sm font-semibold', depth === id ? 'bg-sky-400/20 text-sky-200' : 'text-slate-400')}
                >
                  {label}
                </button>
              ))}
            </div>
            {voiceReady && <RecordButton recorder={recorder} className="h-14 shrink-0" compact />}
            <button
              type="submit"
              disabled={loading || !query.trim() || !engineReady}
              className="h-14 px-5 rounded-xl bg-cyan-400 text-black font-semibold flex items-center gap-2 disabled:opacity-40 active:bg-cyan-300"
            >
              <Telescope size={20} /> Zbadaj
            </button>
          </div>
        </form>

        {!engineReady && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-200 flex items-center gap-3 shrink-0">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="flex-1">Wybrany silnik AI nie ma klucza API.</span>
            <button type="button" onClick={onOpenSettings} className="h-11 px-4 rounded-lg bg-amber-400 text-black font-semibold">
              Ustawienia
            </button>
          </div>
        )}
        {error && (
          <p className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/30 text-sm text-rose-200 flex items-center gap-2 shrink-0">
            <AlertTriangle size={16} className="shrink-0" /> {error}
          </p>
        )}

        <div className="flex-1 min-h-0">
          {loading ? (
            <LiveActivity events={events} hint={`${APP.assistantName} szuka w sieci i czyta źródła. Możesz w tym czasie przejść do innego widoku.`} />
          ) : result ? (
            <ResultPanels result={result} />
          ) : (
            <EmptyState />
          )}
        </div>
      </ViewBody>
    </>
  );
}

function EmptyState() {
  return (
    <div className="panel h-full p-8 flex flex-col items-center justify-center text-center gap-3">
      <span className={cn('w-16 h-16 rounded-2xl flex items-center justify-center', TONES.sky.soft, TONES.sky.text)}>
        <Telescope size={32} />
      </span>
      <h3 className="font-display text-2xl font-semibold text-white">Zadaj pytanie</h3>
      <p className="text-base text-slate-400 max-w-xl">
        {APP.assistantName} przeszuka sieć, otworzy najlepsze źródła i poda uporządkowaną odpowiedź: wniosek, najważniejsze punkty i fakty z linkami.
      </p>
    </div>
  );
}

function ResultPanels({ result }: { result: ResearchResult }) {
  const [sheet, setSheet] = React.useState<'summary' | 'activity' | null>(null);
  const conf = CONFIDENCE[result.confidence];
  const ConfIcon = conf.icon;

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-12 md:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
      <section className="panel p-5 md:col-span-7 flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span className={cn('h-8 px-3 rounded-lg border text-sm font-semibold flex items-center gap-1.5', conf.style)}>
            <ConfIcon size={16} /> {conf.label}
          </span>
          <span className="text-xs font-mono text-slate-500">
            {formatDateTime(result.meta.searchedAt)} · {result.meta.model} · {result.meta.searches.length} wyszukiwań · {result.meta.fetchedPages.length} stron
          </span>
        </div>
        <h3 className="font-display text-2xl font-semibold text-white shrink-0">{result.title}</h3>
        <Clamp onMore={() => setSheet('summary')} className="flex-1">
          <p className="text-base text-slate-200 leading-relaxed whitespace-pre-line">{result.summary}</p>
        </Clamp>
        <div className="flex gap-2 shrink-0">
          <SpeakButton id={`research-${result.meta.searchedAt}`} text={result.summary} />
          <button type="button" onClick={() => setSheet('activity')} className="h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-slate-200 flex items-center gap-2">
            <ListTree size={16} /> Co robił {APP.assistantName}
          </button>
        </div>
      </section>

      <section className="panel p-5 md:col-span-5 flex flex-col gap-3 min-h-0">
        <PanelTitle icon={ListChecks} title="Najważniejsze" />
        <ul className="flex-1 min-h-0 overflow-hidden space-y-2">
          {result.keyPoints.map((p, i) => (
            <li key={i} className="text-sm text-slate-200 flex gap-2">
              <span className="text-sky-400 font-bold">•</span> <span>{p}</span>
            </li>
          ))}
        </ul>
        {result.openQuestions.length > 0 && (
          <p className="text-xs text-amber-200/90 shrink-0">
            <span className="font-semibold">Do sprawdzenia:</span> {result.openQuestions.join(' · ')}
          </p>
        )}
      </section>

      <section className="panel p-5 md:col-span-7 flex flex-col gap-3 min-h-[240px] md:min-h-0">
        <PanelTitle icon={FileText} title={`Fakty (${result.facts.length})`} />
        <div className="flex-1 min-h-0">
          <Pager
            items={result.facts}
            getKey={(f, i) => `${f.label}-${i}`}
            minItemWidth={260}
            itemHeight={96}
            gap={10}
            label="Fakty"
            renderItem={(f) => {
              const href = safeUrl(f.sourceUrl);
              return (
                <div className="h-full p-3 rounded-xl bg-brand-raised border border-white/5 flex flex-col gap-1 min-w-0">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-sky-300 truncate">{f.label}</span>
                  <span className="text-sm text-slate-100 line-clamp-2">{f.value}</span>
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-auto text-xs text-cyan-300 flex items-center gap-1 truncate">
                      {hostname(href)} <ExternalLink size={12} className="shrink-0" />
                    </a>
                  )}
                </div>
              );
            }}
          />
        </div>
      </section>

      <section className="panel p-5 md:col-span-5 flex flex-col gap-3 min-h-[200px] md:min-h-0">
        <PanelTitle icon={Link2} title={`Źródła (${result.meta.sources.length})`} />
        <div className="flex-1 min-h-0">
          <Pager
            items={result.meta.sources}
            getKey={(s) => s.url}
            minItemWidth={2000}
            itemHeight={48}
            gap={6}
            label="Źródła"
            renderItem={(s) => {
              const href = safeUrl(s.url);
              return href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="h-full px-3 rounded-xl bg-brand-raised border border-white/5 flex items-center gap-3 min-w-0 active:bg-white/10">
                  <span className="text-xs font-mono text-slate-500 shrink-0">{hostname(href)}</span>
                  <span className="text-sm text-slate-200 truncate">{s.title}</span>
                </a>
              ) : null;
            }}
          />
        </div>
      </section>

      <Sheet open={sheet === 'summary'} onClose={() => setSheet(null)} title={result.title} icon={Telescope} tone={TONES.sky}>
        <p className="text-base text-slate-200 leading-relaxed whitespace-pre-line">{result.summary}</p>
      </Sheet>
      <Sheet open={sheet === 'activity'} onClose={() => setSheet(null)} title={`Co robił ${APP.assistantName}`} icon={ListTree} tone={TONES.indigo}>
        {result.meta.activity?.length ? <ActivityTimeline steps={result.meta.activity} /> : <p className="text-sm text-slate-400">Brak zapisanych kroków.</p>}
      </Sheet>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: React.ComponentType<{ size?: number }>; title: string }) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400 shrink-0">
      <Icon size={16} /> {title}
    </h4>
  );
}
