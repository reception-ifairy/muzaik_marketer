import React from 'react';
import Dashboard from './components/Dashboard';
import ResearchView, { type ResearchPreset } from './components/ResearchView';
import ChatView, { type ChatPreset } from './components/ChatView';
import StyleView from './components/StyleView';
import HandbookView from './components/HandbookView';
import StudioView from './components/studio/StudioView';
import type { BriefPreset } from './components/studio/BriefPanel';
import { materialsApi, useMuzaik } from './lib/materialsClient';
import type { MaterialKind, MaterialSummary } from './material';
import LoginScreen from './components/LoginScreen';
import SettingsModal from './components/SettingsModal';
import NavRail from './components/shell/NavRail';
import { SpeechToast } from './components/voice/SpeakButton';
import type { OwnerUser, ResearchResult } from './types';
import { APP } from './config';
import { SESSION_EXPIRED_EVENT } from './lib/utils';
import { loadJson, saveJson } from './lib/settings';
import { VIEW_IDS, type ViewId } from './lib/sections';
import { useHashView } from './lib/useHashView';
import { AiSettingsProvider, useAiSettings } from './lib/aiSettingsContext';
import { stopSpeech } from './lib/speech';
import { PROVIDER_INFO } from './aiSettings';

const RECENT_KEY = `${APP.id}_recent_research`;
const MAX_RECENT = 20;

export default function App() {
  const [user, setUser] = React.useState<OwnerUser | null>(null);
  const [checkingSession, setCheckingSession] = React.useState(true);

  React.useEffect(() => {
    document.title = APP.name;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));

    const handleExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      setUser(null);
    }
  };

  if (checkingSession) {
    return (
      <div className="h-full flex items-center justify-center bg-brand-bg">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  return (
    <AiSettingsProvider>
      <OwnerDashboard
        user={user}
        onLogout={() => {
          stopSpeech();
          handleLogout();
        }}
      />
    </AiSettingsProvider>
  );
}

function OwnerDashboard({ user, onLogout }: { user: OwnerUser; onLogout: () => void }) {
  const [view, navigate] = useHashView<ViewId>(VIEW_IDS, 'pulpit');
  const [researchPreset] = React.useState<ResearchPreset | null>(null);
  const [chatPreset] = React.useState<ChatPreset | null>(null);
  const [recent, setRecent] = React.useState<ResearchResult[]>(() => loadJson(RECENT_KEY, []));
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const { settings, engineReady } = useAiSettings();
  const engine = settings?.prefs.engine;
  const engineLabel = engine ? `${PROVIDER_INFO[engine.provider].label} · ${engine.models[engine.provider]}` : 'Wczytuję…';
  const openSettings = React.useCallback(() => setSettingsOpen(true), []);

  const addRecent = React.useCallback((result: ResearchResult) => {
    setRecent((prev) => {
      const next = [result, ...prev.filter((r) => r.request.query.toLowerCase() !== result.request.query.toLowerCase())].slice(0, MAX_RECENT);
      saveJson(RECENT_KEY, next);
      return next;
    });
  }, []);

  const muzaik = useMuzaik();
  const [materials, setMaterials] = React.useState<MaterialSummary[]>([]);
  const [studioPreset, setStudioPreset] = React.useState<BriefPreset | null>(null);
  const [openMaterial, setOpenMaterial] = React.useState<{ id: string; nonce: number } | null>(null);
  const loadMaterials = React.useCallback(() => {
    materialsApi.list().then((r) => setMaterials(r.materials)).catch(() => undefined);
  }, []);
  React.useEffect(() => { loadMaterials(); }, [loadMaterials]);

  const startMaterial = (kind: MaterialKind, extra?: { premiereId?: number }) => {
    setStudioPreset({ kind, premiereId: extra?.premiereId, nonce: Date.now() });
    navigate('studio');
  };
  const openStudio = (id: string) => {
    setOpenMaterial({ id, nonce: Date.now() });
    navigate('studio');
  };

  const ownerName = user.login.charAt(0).toUpperCase() + user.login.slice(1);

  return (
    <div className="h-full flex flex-col md:flex-row bg-brand-bg text-slate-100 overflow-hidden">
      <NavRail
        view={view}
        onNavigate={navigate}
        engineReady={engineReady}
        ownerName={ownerName}
        engineLabel={engineLabel}
        onOpenSettings={openSettings}
        onLogout={onLogout}
      />

      {/* Views stay mounted (only hidden), so a long research run or chat reply survives switching views. */}
      <main className="relative flex-1 min-w-0 min-h-0">
        <ViewSlot active={view === 'pulpit'}>
          <Dashboard
            ownerName={ownerName}
            muzaik={muzaik.data}
            muzaikError={muzaik.error}
            muzaikLoading={muzaik.loading}
            onReload={() => muzaik.reload(true)}
            materials={materials}
            onStart={startMaterial}
            onOpen={openStudio}
            onOpenSettings={openSettings}
          />
        </ViewSlot>
        <ViewSlot active={view === 'studio'}>
          <StudioView muzaik={muzaik.data} openId={openMaterial} preset={studioPreset} onOpenSettings={openSettings} onChanged={loadMaterials} />
        </ViewSlot>
        <ViewSlot active={view === 'badanie'}>
          <ResearchView preset={researchPreset} onOpenSettings={openSettings} onResult={addRecent} />
        </ViewSlot>
        <ViewSlot active={view === 'rozmowa'}>
          <ChatView preset={chatPreset} />
        </ViewSlot>
        <ViewSlot active={view === 'styl'}>
          <StyleView onOpenSettings={openSettings} />
        </ViewSlot>
        <ViewSlot active={view === 'handbook'}>
          <HandbookView active={view === 'handbook'} />
        </ViewSlot>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SpeechToast />
    </div>
  );
}

function ViewSlot({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <section aria-hidden={!active} className={active ? 'absolute inset-0 flex flex-col' : 'hidden'}>
      {children}
    </section>
  );
}
