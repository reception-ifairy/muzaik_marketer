import React from 'react';
import { Clapperboard, Database, Film, Layers, Music, RefreshCw, Sparkles, Youtube, AlertTriangle, CheckCircle2, Rocket, Smartphone, CalendarDays } from 'lucide-react';
import type { MuzaikOverview } from '../muzaik';
import { MATERIAL_KINDS, type MaterialKind, type MaterialSummary } from '../material';
import { getSection } from '../lib/sections';
import { cn } from '../lib/utils';
import { seconds, youtubeApi, type YoutubeStatus } from '../lib/materialsClient';
import ViewHeader, { ViewBody, HeaderButton } from './shell/ViewHeader';
import Pager from './ui/Pager';

// Centrum: what the marketer knows about the channel (read-only from muzaik.channel), quick starts, and the materials.

interface Props {
  ownerName: string;
  muzaik: MuzaikOverview | null;
  muzaikError: string | null;
  muzaikLoading: boolean;
  onReload: () => void;
  materials: MaterialSummary[];
  onStart: (kind: MaterialKind, extra?: { premiereId?: number }) => void;
  onOpen: (id: string) => void;
  onOpenSettings: () => void;
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Music; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-brand-raised border border-white/10 p-3 min-w-0">
      <p className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Icon size={13} /> {label}</p>
      <p className="mt-1 font-display text-2xl text-white">{value}</p>
      {hint && <p className="text-xs text-slate-500 truncate">{hint}</p>}
    </div>
  );
}

export default function Dashboard({ ownerName, muzaik, muzaikError, muzaikLoading, onReload, materials, onStart, onOpen, onOpenSettings }: Props) {
  const section = getSection('pulpit');
  const [yt, setYt] = React.useState<YoutubeStatus | null>(null);
  const [ytNote, setYtNote] = React.useState<string | null>(null);
  React.useEffect(() => {
    youtubeApi.status().then(setYt).catch(() => setYt(null));
    // OAuth callback lands on #pulpit?youtube=ok / youtube_error=…
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (q.get('youtube') === 'ok') setYtNote('Kanał YouTube połączony.');
    if (q.get('youtube_error')) setYtNote(q.get('youtube_error'));
  }, []);
  const st = muzaik?.status;
  const upcoming = (muzaik?.premieres ?? []).filter((p) => p.visible && p.date && p.date >= new Date().toISOString().slice(0, 10)).slice(-3).reverse();

  return (
    <>
      <ViewHeader section={section} subtitle={`Cześć, ${ownerName}. DJ MuzaIK czeka na brief.`}>
        <HeaderButton onClick={onReload} disabled={muzaikLoading} label="Odśwież dane muzaik.channel"><RefreshCw size={16} className={cn(muzaikLoading && 'animate-spin')} /> Odśwież</HeaderButton>
      </ViewHeader>
      <ViewBody>
        <div className="md:h-full grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 min-h-0">
          <div className="flex flex-col gap-4 min-h-0">
            <section className="panel p-4 shrink-0" aria-label="Dane kanału">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-cyan-300" />
                <h3 className="font-display font-semibold text-white flex-1">muzaik.channel</h3>
                {st?.connected ? <span className="text-xs text-emerald-300 flex items-center gap-1"><CheckCircle2 size={14} /> tylko odczyt</span> : <span className="text-xs text-amber-300 flex items-center gap-1"><AlertTriangle size={14} /> brak połączenia</span>}
              </div>
              {muzaikError && <p className="mt-2 text-sm text-rose-300">{muzaikError}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat icon={Music} label="Utwory autorskie" value={st?.counts.authored ?? '—'} hint={st ? `${st.counts.accepted} z kartą zaakceptowaną` : undefined} />
                <Stat icon={Layers} label="Sceny Parallax" value={st?.counts.scenes ?? '—'} hint={muzaik?.scenes.find((s) => s.onAir)?.title ? `na wizji: ${muzaik.scenes.find((s) => s.onAir)!.title}` : undefined} />
                <Stat icon={CalendarDays} label="Premiery" value={st?.counts.premieres ?? '—'} hint={upcoming[0] ? `najbliższa: ${upcoming[0].title}` : undefined} />
                <Stat icon={Sparkles} label="Artykuły" value={st?.counts.articles ?? '—'} hint="opublikowane w Magazynie" />
              </div>
              {st?.note && <p className="mt-2 text-xs text-amber-300 line-clamp-2" title={st.note}>{st.note}</p>}
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Youtube size={16} className="text-rose-400" />
                <span className="flex-1 truncate text-slate-300">{yt?.connected ? `YouTube: ${yt.channelTitle}` : 'YouTube niepołączony'}</span>
                {!yt?.connected && <button type="button" onClick={onOpenSettings} className="h-11 px-3 rounded-lg border border-white/10 text-slate-200 active:bg-white/10">Ustawienia</button>}
              </div>
              {ytNote && <p className="mt-1 text-xs text-slate-300">{ytNote}</p>}
            </section>

            <section className="panel p-4 flex-1 min-h-0 flex flex-col gap-2" aria-label="Szybki start">
              <h3 className="font-display font-semibold text-white">Szybki start</h3>
              <button type="button" onClick={() => onStart('zwiastun')} className="min-h-14 rounded-xl bg-pink-400 text-black font-semibold flex items-center gap-3 px-4">
                <Rocket size={20} /> <span className="text-left">Zwiastun kanału<span className="block text-xs font-normal">16:9, 30 s, na stronę kanału dla nowych widzów</span></span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onStart('short')} className="min-h-12 rounded-xl border border-white/10 bg-brand-raised text-slate-200 font-semibold flex items-center gap-2 px-3 active:bg-white/10"><Smartphone size={17} /> Short z utworu</button>
                <button type="button" onClick={() => onStart('utwor-dnia')} className="min-h-12 rounded-xl border border-white/10 bg-brand-raised text-slate-200 font-semibold flex items-center gap-2 px-3 active:bg-white/10"><Music size={17} /> Utwór dnia</button>
                <button type="button" onClick={() => onStart('radio')} className="min-h-12 rounded-xl border border-white/10 bg-brand-raised text-slate-200 font-semibold flex items-center gap-2 px-3 active:bg-white/10"><Clapperboard size={17} /> Promo radia</button>
                <button type="button" onClick={() => onStart('premiera', upcoming[0] ? { premiereId: upcoming[0].id } : undefined)} className="min-h-12 rounded-xl border border-white/10 bg-brand-raised text-slate-200 font-semibold flex items-center gap-2 px-3 active:bg-white/10"><CalendarDays size={17} /> Premiera</button>
              </div>
            </section>
          </div>

          <section className="panel p-4 flex flex-col gap-3 min-h-[420px] md:min-h-0" aria-label="Materiały">
            <div className="flex items-center gap-2 shrink-0">
              <Film size={18} className="text-pink-300" />
              <h3 className="font-display font-semibold text-white flex-1">Twoje materiały</h3>
              <span className="text-xs font-mono text-slate-400">{materials.length}</span>
            </div>
            {materials.length ? (
              <Pager
                items={materials}
                label="Materiały"
                minItemWidth={250}
                itemHeight={150}
                gap={12}
                className="flex-1 min-h-0"
                getKey={(m) => m.id}
                renderItem={(m) => (
                  <button type="button" onClick={() => onOpen(m.id)} className="h-full w-full text-left rounded-xl bg-brand-raised border border-white/10 p-3 flex flex-col gap-1 active:bg-white/10">
                    <span className="text-xs font-mono text-pink-300">{MATERIAL_KINDS[m.kind].label} · {m.format} · {seconds(m.seconds)}</span>
                    <span className="text-[15px] font-semibold text-white line-clamp-2">{m.title}</span>
                    {m.trackTitle && <span className="text-sm text-slate-400 truncate">„{m.trackTitle}”</span>}
                    <span className="mt-auto flex gap-2 text-xs">
                      {m.clips.need > 0 && <span className={cn('px-2 py-1 rounded-md border', m.clips.have === m.clips.need ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-slate-400')}>klipy {m.clips.have}/{m.clips.need}</span>}
                      {m.rendered && <span className="px-2 py-1 rounded-md border border-cyan-400/40 text-cyan-200">zmontowany</span>}
                      {m.published && <span className="px-2 py-1 rounded-md border border-rose-400/40 text-rose-200">na YouTube</span>}
                    </span>
                  </button>
                )}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-slate-400">
                <Clapperboard size={40} className="text-pink-300" />
                <p className="max-w-sm">Nie ma jeszcze materiałów. Zacznij od zwiastuna kanału — DJ MuzaIK dobierze fragment utworu do taktów i rozpisze ujęcia.</p>
              </div>
            )}
          </section>
        </div>
      </ViewBody>
    </>
  );
}

