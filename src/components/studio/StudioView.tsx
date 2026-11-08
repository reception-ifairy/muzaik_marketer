import React from 'react';
import { ArrowLeft, FileDown, Square, Trash2 } from 'lucide-react';
import type { MaterialProject, MaterialRequest } from '../../material';
import type { MuzaikOverview } from '../../muzaik';
import type { ProgressEvent } from '../../types';
import { getSection } from '../../lib/sections';
import { useAiSettings } from '../../lib/aiSettingsContext';
import { materialsApi } from '../../lib/materialsClient';
import ViewHeader, { ViewBody, HeaderButton } from '../shell/ViewHeader';
import LiveActivity from '../LiveActivity';
import BriefPanel, { type BriefPreset } from './BriefPanel';
import ProjectView from './ProjectView';

// Studio: the brief (no project open) or one project. Designing streams status lines from the server (SSE).

interface Props {
  muzaik: MuzaikOverview | null;
  openId: { id: string; nonce: number } | null;
  preset: BriefPreset | null;
  onOpenSettings: () => void;
  onChanged: () => void;
}

export default function StudioView({ muzaik, openId, preset, onOpenSettings, onChanged }: Props) {
  const section = getSection('studio');
  const { engineReady } = useAiSettings();
  const [project, setProject] = React.useState<MaterialProject | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [events, setEvents] = React.useState<ProgressEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!openId) return;
    materialsApi.get(openId.id).then((r) => { setProject(r.material); setError(null); }).catch((e) => setError(e.message));
  }, [openId?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (preset) setProject(null);
  }, [preset?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const design = async (req: Partial<MaterialRequest>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      const p = await materialsApi.design(req, (e) => setEvents((prev) => [...prev, e]), controller.signal);
      setProject(p);
      onChanged();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const change = React.useCallback((p: MaterialProject) => { setProject(p); onChanged(); }, [onChanged]);

  const remove = async () => {
    if (!project || !window.confirm('Usunąć ten materiał razem z wgranymi klipami i filmami?')) return;
    try {
      await materialsApi.remove(project.id);
      setProject(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <ViewHeader section={section} subtitle={project ? project.copy.title : undefined}>
        {busy && <HeaderButton tone="danger" onClick={() => { abortRef.current?.abort(); setBusy(false); }}><Square size={16} /> Przerwij</HeaderButton>}
        {project && (
          <>
            <HeaderButton onClick={() => setProject(null)} label="Nowy materiał"><ArrowLeft size={16} /> <span className="hidden sm:inline">Nowy materiał</span></HeaderButton>
            <a href={materialsApi.exportUrl(project.id)} aria-label="Pobierz prompty (.md)" className="h-12 px-4 rounded-xl border bg-brand-raised border-white/10 text-slate-200 text-sm font-semibold flex items-center gap-2 whitespace-nowrap active:bg-white/10">
              <FileDown size={16} /> <span className="hidden sm:inline">Prompty .md</span>
            </a>
            <HeaderButton tone="danger" onClick={remove} label="Usuń materiał"><Trash2 size={16} /></HeaderButton>
          </>
        )}
      </ViewHeader>
      <ViewBody className="flex flex-col gap-3">
        {error && <p className="text-sm text-rose-300 shrink-0" role="alert">{error}</p>}
        <div className="md:flex-1 min-h-0">
          {project ? (
            <ProjectView project={project} muzaik={muzaik} onChange={change} />
          ) : (
            <>
              {busy && <LiveActivity events={events} hint="DJ MuzaIK słucha karty utworu i rozpisuje ujęcia na takty…" toneClass="text-pink-400" />}
              {/* Kept mounted while designing, so a failed run leaves the brief as it was. */}
              <div className={busy ? 'hidden' : 'md:h-full'}>
                <BriefPanel muzaik={muzaik} preset={preset} busy={busy} engineReady={engineReady} onOpenSettings={onOpenSettings} onSubmit={design} />
              </div>
            </>
          )}
        </div>
      </ViewBody>
    </>
  );
}
