import React from 'react';
import {
  Copy, Check, Upload, Loader2, Trash2, Film, Layers, Image as ImageIcon, Type, Play, Download, Youtube, AlertTriangle, Pencil, Music, Info, Clapperboard,
} from 'lucide-react';
import { MATERIAL_KINDS, SHOT_ROLES, SHOT_VISUALS, type MaterialProject, type Shot, type ShotVisual } from '../../material';
import { FLOW_MODE_INFO, FLOW_URL, getFlowModel } from '../../flow';
import type { MuzaikOverview } from '../../muzaik';
import { copyText, materialsApi, muzaikApi, seconds, youtubeApi, type YoutubeStatus } from '../../lib/materialsClient';
import { TONES } from '../../lib/sections';
import { cn, safeUrl } from '../../lib/utils';
import Pager from '../ui/Pager';
import Clamp from '../ui/Clamp';
import Sheet from '../ui/Sheet';

const VISUAL_STYLE: Record<ShotVisual, { icon: typeof Film; bar: string; badge: string }> = {
  flow: { icon: Film, bar: 'bg-pink-400', badge: 'bg-pink-400/15 text-pink-200 border-pink-400/40' },
  parallax: { icon: Layers, bar: 'bg-cyan-400', badge: 'bg-cyan-400/15 text-cyan-200 border-cyan-400/40' },
  okladka: { icon: ImageIcon, bar: 'bg-amber-400', badge: 'bg-amber-400/15 text-amber-200 border-amber-400/40' },
  plansza: { icon: Type, bar: 'bg-violet-400', badge: 'bg-violet-400/15 text-violet-200 border-violet-400/40' },
};

function CopyButton({ text, label = 'Kopiuj prompt' }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}
      className="h-11 px-3 rounded-lg border border-white/10 bg-brand-raised text-sm text-slate-200 flex items-center gap-2 active:bg-white/10"
    >
      {done ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />} {done ? 'Skopiowane' : label}
    </button>
  );
}

interface Props {
  project: MaterialProject;
  muzaik: MuzaikOverview | null;
  onChange: (p: MaterialProject) => void;
}

export default function ProjectView({ project, muzaik, onChange }: Props) {
  const [openShot, setOpenShot] = React.useState<string | null>(null);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState<string | null>(null);
  const total = project.shots.reduce((a, s) => a + s.seconds, 0);
  const flowShots = project.shots.filter((s) => s.visual === 'flow');
  const have = flowShots.filter((s) => s.clip).length;
  const model = getFlowModel(project.request.flowModel);
  const scene = (id: string | null) => (id ? muzaik?.scenes.find((s) => s.id === id) ?? null : null);

  // Poll while rendering.
  React.useEffect(() => {
    if (project.render.state !== 'running') return;
    const t = setInterval(() => { materialsApi.get(project.id).then((r) => onChange(r.material)).catch(() => undefined); }, 2000);
    return () => clearInterval(t);
  }, [project.id, project.render.state, onChange]);

  const upload = async (shot: Shot, file: File) => {
    setError(null);
    setUploading((u) => ({ ...u, [shot.id]: 0 }));
    try {
      const r = await materialsApi.uploadClip(project.id, shot.id, file, (s) => setUploading((u) => ({ ...u, [shot.id]: s })));
      onChange(r.material);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading((u) => { const n = { ...u }; delete n[shot.id]; return n; });
    }
  };

  const shot = project.shots.find((s) => s.id === openShot) ?? null;

  return (
    <div className="md:h-full grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem] gap-4 min-h-0">
      <div className="flex flex-col gap-3 min-h-0">
        {/* Summary + timeline */}
        <section className="panel p-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-slate-400">
                {MATERIAL_KINDS[project.request.kind].label} · {project.request.format} · {seconds(total)} · {project.shots.length} ujęć{project.trackTitle ? ` · „${project.trackTitle}”` : ''}
              </p>
              <Clamp onMore={() => setInfoOpen(true)} moreLabel="Pomysł, muzyka i poprawki programu" className="mt-1 text-[15px] text-slate-200">
                {project.concept}
              </Clamp>
            </div>
            <button type="button" onClick={() => setInfoOpen(true)} aria-label="Szczegóły projektu" className="h-11 w-11 rounded-xl border border-white/10 flex items-center justify-center text-slate-300 shrink-0 active:bg-white/10">
              <Info size={18} />
            </button>
          </div>
          <div className="mt-3 flex h-9 rounded-lg overflow-hidden border border-white/10" role="list" aria-label="Oś czasu ujęć">
            {project.shots.map((s, i) => {
              const v = VISUAL_STYLE[s.visual];
              const dropHere = project.cut?.dropAt != null && project.cut.dropAt >= s.at && project.cut.dropAt < s.at + s.seconds;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="listitem"
                  onClick={() => setOpenShot(s.id)}
                  style={{ flexGrow: s.seconds }}
                  className={cn('relative basis-0 min-w-0 border-r border-black/60 text-[11px] font-semibold text-black/80 flex items-center justify-center', v.bar, s.visual === 'flow' && !s.clip && 'opacity-50')}
                  aria-label={`Ujęcie ${i + 1}, ${SHOT_VISUALS[s.visual].label}, ${seconds(s.seconds)}`}
                >
                  {i + 1}
                  {dropHere && <span className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${((project.cut!.dropAt! - s.at) / s.seconds) * 100}%` }} />}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 flex flex-wrap gap-x-4">
            {(Object.keys(VISUAL_STYLE) as ShotVisual[]).filter((v) => project.shots.some((s) => s.visual === v)).map((v) => (
              <span key={v} className="flex items-center gap-1"><span className={cn('w-2.5 h-2.5 rounded-sm', VISUAL_STYLE[v].bar)} /> {SHOT_VISUALS[v].label}</span>
            ))}
            {project.cut?.dropAt != null && <span className="flex items-center gap-1"><span className="w-0.5 h-3 bg-white" /> refren</span>}
          </p>
        </section>

        {error && <p className="text-sm text-rose-300 flex items-center gap-2 shrink-0"><AlertTriangle size={16} /> {error}</p>}

        <Pager
          items={project.shots}
          label="Ujęcia"
          minItemWidth={260}
          itemHeight={236}
          gap={12}
          className="h-[500px] md:h-auto md:flex-1 min-h-0"
          getKey={(s) => s.id}
          renderItem={(s) => {
            const i = project.shots.indexOf(s);
            const v = VISUAL_STYLE[s.visual];
            const Icon = v.icon;
            const sc = scene(s.sceneId);
            const up = uploading[s.id];
            return (
              <article className="panel h-full p-3 flex flex-col gap-2 min-h-0">
                <header className="flex items-center gap-2">
                  <span className="font-display font-semibold text-white">#{i + 1}</span>
                  <span className="text-xs font-mono text-slate-400 flex-1 truncate">{seconds(s.at)}–{seconds(s.at + s.seconds)} · {s.bars} {project.cut?.grid === false ? 'jedn.' : 'takt.'} · {SHOT_ROLES[s.role]}</span>
                  <span className={cn('h-7 px-2 rounded-md border text-xs flex items-center gap-1', v.badge)}><Icon size={13} />{s.visual === 'flow' ? `Flow ${s.flowSeconds ?? '?'} s` : s.visual === 'plansza' ? 'Plansza' : s.visual === 'okladka' ? 'Okładka' : 'Parallax'}</span>
                </header>
                <button type="button" onClick={() => setOpenShot(s.id)} className="text-left text-sm text-slate-300 flex-1 min-h-0 flex items-start">
                  <span className="line-clamp-4">
                  {s.visual === 'plansza' ? <span className="text-violet-200 font-semibold">„{(s.cardText ?? '').replace(/\n/g, ' / ')}” </span> : null}
                  {s.visual === 'parallax' && sc ? <span className="text-cyan-200">Scena „{sc.title}”. </span> : null}
                  {s.note}
                  </span>
                </button>
                {s.visual === 'flow' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <CopyButton text={s.flowPrompt} />
                    {s.clip ? (
                      <>
                        <span className="h-11 px-2 rounded-lg bg-emerald-400/15 border border-emerald-400/40 text-emerald-200 text-sm flex items-center gap-1"><Check size={15} /> klip</span>
                        <button type="button" onClick={() => materialsApi.removeClip(project.id, s.id).then((r) => onChange(r.material)).catch((e) => setError(e.message))} aria-label="Usuń klip" className="h-11 w-11 rounded-lg border border-white/10 flex items-center justify-center text-slate-400 active:bg-white/10"><Trash2 size={15} /></button>
                      </>
                    ) : (
                      <label className="h-11 px-3 rounded-lg border border-pink-400/40 bg-pink-400/10 text-pink-100 text-sm flex items-center gap-2 cursor-pointer active:bg-pink-400/20">
                        {up !== undefined ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {up !== undefined ? `${Math.round(up * 100)}%` : 'Wgraj klip'}
                        <input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" disabled={up !== undefined} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(s, f); }} />
                      </label>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 h-11 flex items-center">{s.fixed ? 'Plansza końcowa programu' : 'Render programu — bez klipu, bez kosztu'}</p>
                )}
              </article>
            );
          }}
        />
      </div>

      {/* Right column: copy, render, publish */}
      <div className="flex flex-col gap-3 min-h-0">
        <section className="panel p-4 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-white flex-1 truncate">Opis na YouTube</h3>
            <button type="button" onClick={() => setCopyOpen(true)} className="h-11 px-3 rounded-lg border border-white/10 text-sm text-slate-200 flex items-center gap-2 active:bg-white/10"><Pencil size={15} /> Edytuj</button>
          </div>
          <p className="mt-2 text-[15px] text-white font-semibold line-clamp-2">{project.copy.title}</p>
          <p className="mt-1 text-sm text-slate-400 line-clamp-3 whitespace-pre-line">{project.copy.description}</p>
        </section>
        <RenderPanel project={project} onChange={onChange} flowHave={have} flowNeed={flowShots.length} />
        <PublishPanel project={project} onChange={onChange} />
      </div>

      <Sheet open={Boolean(shot)} onClose={() => setOpenShot(null)} title={shot ? `Ujęcie ${project.shots.indexOf(shot) + 1}` : ''} icon={Clapperboard} tone={TONES.pink} widthClass="max-w-3xl">
        {shot && <ShotDetails key={shot.id} project={project} shot={shot} sceneTitle={scene(shot.sceneId)?.title ?? null} sceneThumb={scene(shot.sceneId)?.thumbnail ?? null} modelLabel={model.label} onChange={onChange} />}
      </Sheet>
      <Sheet open={copyOpen} onClose={() => setCopyOpen(false)} title="Opis na YouTube" icon={Youtube} tone={TONES.pink} widthClass="max-w-3xl">
        <CopyEditor project={project} onSaved={(p) => { onChange(p); setCopyOpen(false); }} />
      </Sheet>
      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title="Projekt" icon={Info} tone={TONES.pink} widthClass="max-w-3xl">
        <div className="flex flex-col gap-4 text-[15px] text-slate-200">
          <div><span className="field-label">Pomysł</span><p>{project.concept}</p></div>
          <div><span className="field-label">Hak (pierwsze 2 s)</span><p>{project.hook}</p></div>
          {project.cut && (
            <div>
              <span className="field-label">Muzyka</span>
              <p className="flex gap-2"><Music size={16} className="mt-1 shrink-0 text-pink-300" />{project.cut.why} Fragment {seconds(project.cut.start)}–{seconds(project.cut.end)} utworu.</p>
            </div>
          )}
          <div><span className="field-label">Wspólny styl (dopisany do każdego promptu)</span><p className="font-mono text-sm text-slate-300">{project.styleAnchor}</p></div>
          {project.fixes.length > 0 && (
            <div>
              <span className="field-label">Co poprawił program</span>
              <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">{project.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-slate-500 font-mono">Model: {project.model} · Google Flow: {model.label}</p>
        </div>
      </Sheet>
    </div>
  );
}

function ShotDetails({ project, shot, sceneTitle, sceneThumb, modelLabel, onChange }: { project: MaterialProject; shot: Shot; sceneTitle: string | null; sceneThumb: string | null; modelLabel: string; onChange: (p: MaterialProject) => void }) {
  const [prompt, setPrompt] = React.useState(shot.flowPrompt);
  const [cardText, setCardText] = React.useState(shot.cardText ?? '');
  const [note, setNote] = React.useState(shot.note);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = prompt !== shot.flowPrompt || cardText !== (shot.cardText ?? '') || note !== shot.note;
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await materialsApi.update(project.id, { shots: [{ id: shot.id, flowPrompt: prompt, cardText, note }] });
      onChange(r.material);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-mono text-slate-400">{seconds(shot.at)}–{seconds(shot.at + shot.seconds)} · {shot.bars} {project.cut?.grid === false ? 'jedn.' : 'takt.'} · {SHOT_ROLES[shot.role]} · {SHOT_VISUALS[shot.visual].label}</p>
      <label className="block">
        <span className="field-label">Notatka</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={shot.fixed} className="field h-24 py-3 resize-none" />
      </label>
      {shot.visual === 'flow' && (
        <>
          <div className="rounded-xl bg-brand-raised border border-white/10 p-3 text-sm text-slate-300">
            <p><b className="text-white">Google Flow · {modelLabel}</b>: klip {shot.flowSeconds ?? '?'} s ({FLOW_MODE_INFO[shot.mode].label}). {FLOW_MODE_INFO[shot.mode].howTo}</p>
            {shot.reference && <p className="mt-1">Obraz do Flow: <b className="text-white">{shot.reference}</b></p>}
            {(shot.flowSeconds ?? 0) > shot.seconds && <p className="mt-1">Ujęcie trwa {seconds(shot.seconds)} — program przytnie klip od początku.</p>}
            <a href={safeUrl(FLOW_URL) ?? '#'} target="_blank" rel="noreferrer" className="mt-1 inline-block underline text-pink-200">Otwórz Google Flow</a>
          </div>
          <label className="block">
            <span className="field-label">Prompt do Flow (angielski)</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="field h-40 py-3 font-mono text-sm resize-none" />
          </label>
          <div className="flex gap-2"><CopyButton text={prompt} /></div>
          {shot.clip && (
            <video src={materialsApi.clipUrl(project.id, shot.id, shot.clip)} controls muted className={cn('rounded-xl bg-black max-h-80', project.request.format === '9:16' ? 'w-48' : 'w-full')} />
          )}
        </>
      )}
      {shot.visual === 'plansza' && (
        <label className="block">
          <span className="field-label">Napis na planszy (najwyżej 6 słów)</span>
          <input value={cardText} onChange={(e) => setCardText(e.target.value)} disabled={shot.fixed} className="field h-12" />
          {shot.fixed && <p className="mt-1 text-xs text-slate-500">Plansza końcowa jest pisana przez program (wezwanie i adres muzaik.channel).</p>}
        </label>
      )}
      {shot.visual === 'parallax' && (
        <div className="flex items-center gap-3">
          {sceneThumb && <img src={muzaikApi.imageUrl(sceneThumb)} alt="" className="w-40 rounded-lg" />}
          <p className="text-sm text-slate-300">Scena „{sceneTitle ?? '?'}” — warstwy poruszają się jak na antenie, każda z inną głębią. Render programu, bez kosztu.</p>
        </div>
      )}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!shot.fixed && (
        <button type="button" onClick={save} disabled={!dirty || saving} className="h-12 rounded-xl bg-pink-400 text-black font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
          {saving && <Loader2 size={16} className="animate-spin" />} Zapisz zmiany ujęcia
        </button>
      )}
    </div>
  );
}

function CopyEditor({ project, onSaved }: { project: MaterialProject; onSaved: (p: MaterialProject) => void }) {
  const [title, setTitle] = React.useState(project.copy.title);
  const [description, setDescription] = React.useState(project.copy.description);
  const [tags, setTags] = React.useState(project.copy.tags.join(', '));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await materialsApi.update(project.id, { copy: { title, description, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), hashtags: project.copy.hashtags } });
      onSaved(r.material);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <label className="block"><span className="field-label">Tytuł ({title.length}/100)</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="field h-12" /></label>
      <label className="block">
        <span className="field-label">Opis</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="field h-64 py-3 resize-none" />
        <span className="text-xs text-slate-500">Stopkę z linkami i hashtagi ({project.copy.hashtags.join(' ')}) program dopisuje sam przy zapisie.</span>
      </label>
      <label className="block"><span className="field-label">Tagi (po przecinku)</span><input value={tags} onChange={(e) => setTags(e.target.value)} className="field h-12" /></label>
      <div className="flex gap-2"><CopyButton text={`${title}\n\n${description}`} label="Kopiuj tytuł i opis" /></div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button type="button" onClick={save} disabled={saving} className="h-12 rounded-xl bg-pink-400 text-black font-semibold flex items-center justify-center gap-2">
        {saving && <Loader2 size={16} className="animate-spin" />} Zapisz opis
      </button>
    </div>
  );
}

function RenderPanel({ project, onChange, flowHave, flowNeed }: { project: MaterialProject; onChange: (p: MaterialProject) => void; flowHave: number; flowNeed: number }) {
  const [error, setError] = React.useState<string | null>(null);
  const r = project.render;
  const start = async () => {
    setError(null);
    try { onChange((await materialsApi.render(project.id)).material); } catch (err) { setError((err as Error).message); }
  };
  const main = r.state === 'done' ? r.files.find((f) => f.format === project.request.format) ?? r.files[0] : null;
  return (
    <section className="panel p-4 flex flex-col gap-2 min-h-0 md:flex-1">
      <div className="flex items-center gap-2 shrink-0">
        <h3 className="font-display font-semibold text-white flex-1">Montaż</h3>
        <span className="text-xs font-mono text-slate-400">klipy Flow: {flowHave}/{flowNeed}</span>
      </div>
      {r.state === 'running' ? (
        <p className="text-sm text-cyan-200 flex items-center gap-2 shrink-0"><Loader2 size={16} className="animate-spin" /> {r.step}</p>
      ) : (
        <button type="button" onClick={start} className="h-12 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 shrink-0">
          <Play size={18} /> {r.state === 'done' ? 'Zmontuj ponownie' : flowHave < flowNeed ? 'Zmontuj podgląd' : 'Zmontuj film'}
        </button>
      )}
      {flowHave < flowNeed && r.state !== 'running' && <p className="text-xs text-slate-400 shrink-0">Brakujące klipy będą w podglądzie szarymi planszami.</p>}
      {r.state === 'error' && <p className="text-sm text-rose-300 shrink-0">{r.message}</p>}
      {error && <p className="text-sm text-rose-300 shrink-0">{error}</p>}
      {r.state === 'done' && main && (
        <>
          <video key={`${main.name}-${r.at}`} src={`${materialsApi.fileUrl(project.id, main.name)}?t=${r.at}`} controls className="max-h-64 md:max-h-none md:flex-1 min-h-0 w-full rounded-xl bg-black object-contain" />
          <div className="flex flex-wrap gap-2 shrink-0">
            {r.files.map((f) => (
              <a key={f.name} href={materialsApi.fileUrl(project.id, f.name, true)} className="h-11 px-3 rounded-lg border border-white/10 text-sm text-slate-200 flex items-center gap-2 active:bg-white/10">
                <Download size={15} /> {f.format} · {seconds(f.seconds)} · {(f.bytes / 1048576).toFixed(1).replace('.', ',')} MB
              </a>
            ))}
          </div>
          {r.warnings.length > 0 && <p className="text-xs text-amber-300 shrink-0 line-clamp-2">{r.warnings.join(' ')}</p>}
        </>
      )}
    </section>
  );
}

function PublishPanel({ project, onChange }: { project: MaterialProject; onChange: (p: MaterialProject) => void }) {
  const [status, setStatus] = React.useState<YoutubeStatus | null>(null);
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState('');
  const [kids, setKids] = React.useState<boolean | null>(null);
  const [asTrailer, setAsTrailer] = React.useState(project.request.kind === 'zwiastun');
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { youtubeApi.status().then(setStatus).catch(() => setStatus(null)); }, []);
  const files = project.render.state === 'done' ? project.render.files : [];
  React.useEffect(() => { if (files.length && !files.some((f) => f.name === file)) setFile(files[0].name); }, [files, file]);
  const send = async () => {
    if (kids === null) return;
    setSending(true);
    setError(null);
    try {
      const r = await youtubeApi.publish(project.id, { file, madeForKids: kids, asChannelTrailer: asTrailer && project.request.kind === 'zwiastun', confirm: true });
      onChange(r.material);
      setResult(`Wysłane jako prywatny film (ID ${r.videoId}).${r.trailer ? ' Ustawiony jako zwiastun kanału.' : ''}${r.trailerError ? ` Zwiastun kanału nie ustawiony: ${r.trailerError}` : ''}`);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="panel p-4 shrink-0 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Youtube size={18} className="text-rose-400" />
        <h3 className="font-display font-semibold text-white flex-1">YouTube</h3>
        <span className="text-xs text-slate-400 truncate">{status?.connected ? status.channelTitle : 'niepołączony'}</span>
      </div>
      {project.published.length > 0 && <p className="text-xs text-emerald-300">Wysłane: {project.published.map((p) => `${p.format} (${p.videoId})${p.asChannelTrailer ? ' · zwiastun kanału' : ''}`).join(', ')}</p>}
      {result && <p className="text-xs text-emerald-300">{result}</p>}
      <button type="button" onClick={() => setOpen(true)} disabled={!files.length || !status?.connected} className="h-12 rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-100 font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
        <Youtube size={18} /> Wyślij jako prywatny…
      </button>
      {!status?.connected && <p className="text-xs text-slate-500">Połącz kanał w Ustawieniach → YouTube.</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Wysyłka na YouTube" icon={Youtube} tone={TONES.rose} widthClass="max-w-xl">
        <div className="flex flex-col gap-4 text-[15px] text-slate-200">
          <p>Film trafi na kanał <b>{status?.channelTitle}</b> jako <b>prywatny</b> — widzisz go tylko Ty, publikujesz go w YouTube Studio.</p>
          <label className="block">
            <span className="field-label">Plik</span>
            <select value={file} onChange={(e) => setFile(e.target.value)} className="field h-12">
              {files.map((f) => <option key={f.name} value={f.name}>{f.format} · {f.name}</option>)}
            </select>
          </label>
          <div>
            <span className="field-label">Czy film jest przeznaczony dla dzieci?</span>
            <div className="flex gap-2" role="radiogroup">
              {([[false, 'Nie, nie jest dla dzieci'], [true, 'Tak, jest dla dzieci']] as const).map(([v, l]) => (
                <button key={l} type="button" role="radio" aria-checked={kids === v} onClick={() => setKids(v)} className={cn('h-12 px-3 rounded-xl border text-sm font-semibold', kids === v ? 'bg-rose-400/15 border-rose-400/50 text-rose-100' : 'bg-brand-raised border-white/10 text-slate-300')}>{l}</button>
              ))}
            </div>
          </div>
          {project.request.kind === 'zwiastun' && (
            <label className="flex items-center gap-3 min-h-11">
              <input type="checkbox" checked={asTrailer} onChange={(e) => setAsTrailer(e.target.checked)} className="w-5 h-5" />
              <span>Ustaw jako zwiastun kanału dla niesubskrybentów (zadziała, gdy film będzie publiczny)</span>
            </label>
          )}
          <p className="text-sm text-slate-400">Tytuł: „{project.copy.title}”. Opis i tagi z panelu „Opis na YouTube”.</p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button type="button" onClick={send} disabled={kids === null || sending || !file} className="h-12 rounded-xl bg-rose-500 text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
            {sending && <Loader2 size={16} className="animate-spin" />} {sending ? 'Wysyłam…' : 'Wyślij jako prywatny'}
          </button>
        </div>
      </Sheet>
    </section>
  );
}
