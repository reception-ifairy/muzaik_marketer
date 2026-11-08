import React from 'react';
import { Check, Clapperboard, Music, Upload, Loader2, AlertTriangle, Wand2 } from 'lucide-react';
import { MATERIAL_KINDS, MATERIAL_KIND_IDS, type MaterialKind, type MaterialRequest, type VideoFormat } from '../../material';
import { FLOW_MODELS, DEFAULT_FLOW_MODEL } from '../../flow';
import { AESTHETIC_PRESETS, getPreset } from '../../profile';
import type { MuzaikOverview, TrackCard } from '../../muzaik';
import { AUDIO_LABEL, muzaikApi, type AudioAvailability } from '../../lib/materialsClient';
import { cn } from '../../lib/utils';
import Pager from '../ui/Pager';

// The brief: what to make, from which track and scenes. Covers are not offered (Content ID); the server refuses them too.

export interface BriefPreset {
  kind: MaterialKind;
  trackId?: number | null;
  premiereId?: number | null;
  /** Variant of an existing project: same sources, other length/format. */
  seconds?: number;
  format?: VideoFormat;
  sceneIds?: string[];
  preset?: string | null;
  voiceover?: boolean;
  notes?: string;
  nonce: number;
}

interface Props {
  muzaik: MuzaikOverview | null;
  preset: BriefPreset | null;
  busy: boolean;
  engineReady: boolean;
  onOpenSettings: () => void;
  onSubmit: (req: Partial<MaterialRequest>) => void;
}

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      className={cn('h-11 px-3 rounded-xl border text-sm font-semibold', active ? 'bg-pink-400/15 border-pink-400/50 text-pink-100' : 'bg-brand-raised border-white/10 text-slate-300 active:bg-white/10')}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="min-h-11 flex items-center gap-3 text-left text-sm text-slate-300">
      <span className={cn('w-11 h-6 rounded-full p-0.5 transition-colors shrink-0', on ? 'bg-pink-400' : 'bg-white/15')}>
        <span className={cn('block w-5 h-5 rounded-full bg-white transition-transform', on && 'translate-x-5')} />
      </span>
      <span>{children}</span>
    </button>
  );
}

export function trackLine(t: TrackCard): string {
  return [t.genre, t.bpm ? `${t.bpm} BPM` : null, t.moods.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
}

export default function BriefPanel({ muzaik, preset, busy, engineReady, onOpenSettings, onSubmit }: Props) {
  const [kind, setKind] = React.useState<MaterialKind>('zwiastun');
  const info = MATERIAL_KINDS[kind];
  const [seconds, setSeconds] = React.useState(info.defaultSeconds);
  const [format, setFormat] = React.useState<VideoFormat>(info.defaultFormat);
  const [alsoOther, setAlsoOther] = React.useState(true);
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [flowModel, setFlowModel] = React.useState(DEFAULT_FLOW_MODEL);
  const [trackId, setTrackId] = React.useState<number | null>(null);
  const [premiereId, setPremiereId] = React.useState<number | null>(null);
  const [articleSlug, setArticleSlug] = React.useState<string | null>(null);
  const [sceneIds, setSceneIds] = React.useState<string[]>([]);
  const [topic, setTopic] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [look, setLook] = React.useState<string>('');
  const [voiceover, setVoiceover] = React.useState(false);
  const [audio, setAudio] = React.useState<AudioAvailability | null>(null);
  const [uploading, setUploading] = React.useState<number | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const tracks = React.useMemo(
    () => (muzaik?.tracks ?? []).filter((t) => !t.cover).sort((a, b) => Number(b.status === 'zaakceptowana') - Number(a.status === 'zaakceptowana') || a.title.localeCompare(b.title, 'pl')),
    [muzaik],
  );
  const track = tracks.find((t) => t.mediaId === trackId) ?? null;
  const scenes = muzaik?.scenes ?? [];

  const pickKind = (k: MaterialKind) => {
    setKind(k);
    setSeconds(MATERIAL_KINDS[k].defaultSeconds);
    setFormat(MATERIAL_KINDS[k].defaultFormat);
  };

  React.useEffect(() => {
    if (!preset) return;
    pickKind(preset.kind);
    if (preset.trackId !== undefined) setTrackId(preset.trackId);
    if (preset.premiereId !== undefined) setPremiereId(preset.premiereId);
    if (preset.seconds) setSeconds(preset.seconds);
    if (preset.format) setFormat(preset.format);
    if (preset.sceneIds) setSceneIds(preset.sceneIds);
    if (preset.preset !== undefined) setLook(preset.preset ?? '');
    if (preset.voiceover !== undefined) setVoiceover(preset.voiceover);
    if (preset.notes !== undefined) setNotes(preset.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  // Default scene: the one on air.
  React.useEffect(() => {
    if (!sceneIds.length && scenes.length) {
      const onAir = scenes.find((s) => s.onAir) ?? scenes[0];
      setSceneIds([onAir.id]);
    }
  }, [scenes, sceneIds.length]);

  React.useEffect(() => {
    setAudio(null);
    setUploadError(null);
    if (trackId == null) return;
    let alive = true;
    muzaikApi.audio(trackId).then((r) => alive && setAudio(r.availability)).catch(() => alive && setAudio(null));
    return () => { alive = false; };
  }, [trackId]);

  const upload = async (file: File) => {
    if (trackId == null) return;
    setUploading(0);
    setUploadError(null);
    try {
      const r = await muzaikApi.uploadAudio(trackId, file, (s) => setUploading(s));
      setAudio(r.availability);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const premiere = muzaik?.premieres.find((p) => p.id === premiereId) ?? null;
  const missing =
    (info.needsTrack && !track) ? 'Wybierz utwór — muzyka prowadzi montaż.'
      : kind === 'premiera' && !premiere ? 'Wybierz premierę.'
        : kind === 'magazyn' && !articleSlug ? 'Wybierz artykuł.'
          : !engineReady ? 'Brak silnika AI — dodaj klucz w Ustawieniach.'
            : null;

  const submit = () => {
    if (missing || busy) return;
    onSubmit({ kind, seconds, format, alsoOther, freeOnly, flowModel, trackId, premiereId: kind === 'premiera' ? premiereId : null, articleSlug: kind === 'magazyn' ? articleSlug : null, sceneIds, topic, notes, preset: look || null, voiceover });
  };

  return (
    <div className="md:h-full grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] gap-4 min-h-0">
      {/* 1. What */}
      <section className="panel p-4 flex flex-col gap-4 min-h-0" aria-label="Rodzaj materiału">
        <div>
          <span className="field-label">Co robimy</span>
          <div role="radiogroup" aria-label="Rodzaj" className="grid grid-cols-2 gap-2">
            {MATERIAL_KIND_IDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => pickKind(k)}>{MATERIAL_KINDS[k].label}</Chip>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-400 line-clamp-2">{info.goal}</p>
        </div>
        <div>
          <span className="field-label">Długość</span>
          <div role="radiogroup" aria-label="Długość" className="flex flex-wrap gap-2">
            {info.seconds.map((s) => <Chip key={s} active={seconds === s} onClick={() => setSeconds(s)}>{s} s</Chip>)}
          </div>
        </div>
        <div>
          <span className="field-label">Format</span>
          <div role="radiogroup" aria-label="Format" className="flex gap-2">
            <Chip active={format === '16:9'} onClick={() => setFormat('16:9')}>16:9 · YouTube</Chip>
            <Chip active={format === '9:16'} onClick={() => setFormat('9:16')}>9:16 · Shorts</Chip>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Toggle on={alsoOther} onChange={setAlsoOther}>Zrób też drugi format ({format === '16:9' ? '9:16' : '16:9'})</Toggle>
          <Toggle on={freeOnly} onChange={setFreeOnly}>Tylko bez kosztu — sceny Parallax, okładka i plansze, bez Flow</Toggle>
          <Toggle on={voiceover} onChange={setVoiceover}>Lektor DJ MuzaIK — kilka krótkich kwestii (Gemini TTS przy montażu, płatne wg cennika Google)</Toggle>
        </div>
      </section>

      {/* 2. From what */}
      <section className="panel p-4 flex flex-col gap-3 min-h-0" aria-label="Źródła">
        {kind === 'premiera' && (
          <label className="block shrink-0">
            <span className="field-label">Premiera</span>
            <select value={premiereId ?? ''} onChange={(e) => setPremiereId(e.target.value ? Number(e.target.value) : null)} className="field h-12">
              <option value="">— wybierz —</option>
              {(muzaik?.premieres ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}{p.date ? ` · ${p.date}` : ''}</option>)}
            </select>
          </label>
        )}
        {kind === 'magazyn' && (
          <label className="block shrink-0">
            <span className="field-label">Artykuł Magazynu</span>
            <select value={articleSlug ?? ''} onChange={(e) => setArticleSlug(e.target.value || null)} className="field h-12">
              <option value="">— wybierz —</option>
              {(muzaik?.articles ?? []).map((a) => <option key={a.slug} value={a.slug}>{a.title}</option>)}
            </select>
          </label>
        )}
        <label className="block shrink-0">
          <span className="field-label">Utwór {info.needsTrack ? '' : '(opcjonalnie)'} · tylko autorskie</span>
          <select value={trackId ?? ''} onChange={(e) => setTrackId(e.target.value ? Number(e.target.value) : null)} className="field h-12" aria-label="Utwór">
            <option value="">— wybierz —</option>
            {tracks.map((t) => <option key={t.mediaId} value={t.mediaId}>{t.title}{t.status !== 'zaakceptowana' ? ' (karta niezaakceptowana)' : ''}</option>)}
          </select>
        </label>
        {track && (
          <div className="rounded-xl bg-brand-raised border border-white/10 p-3 shrink-0 text-sm">
            <p className="text-slate-200 flex items-center gap-2"><Music size={15} className="text-pink-300 shrink-0" /> <span className="truncate">{trackLine(track) || 'Karta bez gatunku i tempa'}</span></p>
            <p className="mt-1 text-slate-400 line-clamp-2">{track.sound || track.about || 'Karta nie ma opisu brzmienia.'}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-mono', audio === 'missing' ? 'text-amber-300' : 'text-slate-400')}>{audio ? AUDIO_LABEL[audio] : 'sprawdzam plik…'}</span>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading !== null} className="h-11 px-3 rounded-lg border border-white/10 text-sm text-slate-200 flex items-center gap-2 active:bg-white/10">
                {uploading !== null ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {uploading !== null ? `${Math.round(uploading * 100)}%` : 'Wgraj plik utworu'}
              </button>
              <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            </div>
            {uploadError && <p className="mt-1 text-sm text-rose-300">{uploadError}</p>}
          </div>
        )}
        {(kind === 'szkola' || kind === 'radio' || kind === 'zwiastun') && (
          <label className="block shrink-0">
            <span className="field-label">Temat (opcjonalnie)</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} className="field h-12" placeholder={kind === 'szkola' ? 'np. Lekcja 2: skąd się wziął dark dance' : 'np. nocna jazda przez neonowe miasto'} />
          </label>
        )}
        <div className="h-64 md:h-auto md:flex-1 min-h-0 flex flex-col">
          <span className="field-label">Sceny Parallax (kotwica stylu, darmowe ujęcia) · {sceneIds.length}/4</span>
          {scenes.length ? (
            <Pager
              items={scenes}
              label="Sceny"
              minItemWidth={130}
              itemHeight={112}
              gap={8}
              className="flex-1 min-h-0"
              getKey={(s) => s.id}
              renderItem={(s) => {
                const on = sceneIds.includes(s.id);
                return (
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSceneIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id].slice(-4)))}
                    className={cn('relative h-full w-full rounded-xl overflow-hidden border text-left', on ? 'border-pink-400' : 'border-white/10')}
                  >
                    {s.thumbnail ? <img src={muzaikApi.imageUrl(s.thumbnail)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <span className="absolute inset-0 bg-brand-raised" />}
                    <span className="absolute inset-x-0 bottom-0 p-1.5 bg-black/70 text-xs text-white truncate">{s.onAir ? '● ' : ''}{s.title}</span>
                    {on && <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-pink-400 text-black flex items-center justify-center"><Check size={14} /></span>}
                  </button>
                );
              }}
            />
          ) : (
            <p className="text-sm text-slate-500">Brak scen w bibliotece muzaik.channel — materiał użyje klipów z Flow i plansz.</p>
          )}
        </div>
      </section>

      {/* 3. Notes + go */}
      <section className="panel p-4 flex flex-col gap-3 min-h-0" aria-label="Wskazówki i start">
        <label className="block shrink-0">
          <span className="field-label">Preset estetyczny</span>
          <select value={look} onChange={(e) => setLook(e.target.value)} className="field h-12" aria-label="Preset estetyczny">
            <option value="">{kind === 'zwiastun' ? 'Z profilu kanału (flagowy)' : 'Dobierze DJ (wg utworu i sceny)'}</option>
            {AESTHETIC_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.subtitle}</option>)}
          </select>
          {getPreset(look) && (
            <span className="mt-1.5 flex items-center gap-1.5">
              {getPreset(look)!.paletteHex.map((c) => <span key={c} className="w-5 h-5 rounded-md border border-white/20" style={{ background: c }} title={c} />)}
              <span className="text-xs text-slate-400 line-clamp-1 ml-1">{getPreset(look)!.lighting}</span>
            </span>
          )}
        </label>
        {!freeOnly && (
          <label className="block shrink-0">
            <span className="field-label">Model w Google Flow</span>
            <select value={flowModel} onChange={(e) => setFlowModel(e.target.value)} className="field h-12">
              {FLOW_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        <label className="md:flex-1 min-h-0 flex flex-col">
          <span className="field-label">Wskazówki dla DJ-a (opcjonalnie)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1500} className="field h-auto flex-1 min-h-28 py-3 resize-none" placeholder="np. więcej deszczu i świateł miasta, bez kosmosu; zacznij od zbliżenia na kasetę" />
        </label>
        <p className="text-sm text-slate-400 shrink-0">
          Program wytnie fragment utworu do pełnych taktów, a DJ MuzaIK rozpisze ujęcia z promptami do Google Flow. Planszę końcową i stopkę opisu dopisze program.
        </p>
        {missing && (
          <p className="text-sm text-amber-300 flex items-start gap-2 shrink-0">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {missing}
            {!engineReady && <button type="button" onClick={onOpenSettings} className="underline">Ustawienia</button>}
          </p>
        )}
        <button type="button" onClick={submit} disabled={Boolean(missing) || busy} className="h-14 rounded-xl bg-pink-400 text-black font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-40 shrink-0">
          {busy ? <Loader2 size={20} className="animate-spin" /> : <Wand2 size={20} />} Zaprojektuj {info.label.toLowerCase()}
        </button>
        <p className="text-xs text-slate-500 flex items-center gap-1.5 shrink-0"><Clapperboard size={13} /> Projekt to jedno zapytanie do silnika AI. Klipy z Flow generujesz sama, na swoim planie Google — render i plansze nic nie kosztują.</p>
      </section>
    </div>
  );
}
