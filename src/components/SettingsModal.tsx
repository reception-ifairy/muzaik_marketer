import React from 'react';
import { KeyRound, Cpu, AudioLines, Image as ImageIcon, CheckCircle2, AlertTriangle, CircleDashed, Loader2, RefreshCw, Trash2, Save, Database, Square, Radio, Youtube } from 'lucide-react';
import { KEY_PROVIDER_IDS, MALE_VOICES, PROVIDER_IDS, PROVIDER_INFO, type AiSettings, type KeyProvider, type ModelInfo, type ProviderStatus } from '../aiSettings';
import ImagesTab from './settings/ImagesTab';
import { MuzaikTab, YoutubeTab } from './settings/MuzaikTab';
import type { Effort } from '../types';
import { useAiSettings } from '../lib/aiSettingsContext';
import { speak, useSpeech } from '../lib/speech';
import { SETTINGS_ITEM } from '../lib/sections';
import { cn, formatDateTime } from '../lib/utils';
import { APP } from '../config';
import Sheet from './ui/Sheet';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'engine' | 'keys' | 'muzaik' | 'youtube' | 'images' | 'voice';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'engine', label: 'Silnik AI', icon: Cpu },
  { id: 'keys', label: 'Klucze API', icon: KeyRound },
  { id: 'muzaik', label: 'MuzaIK', icon: Radio },
  { id: 'youtube', label: 'YouTube', icon: Youtube },
  { id: 'images', label: 'Obrazy', icon: ImageIcon },
  { id: 'voice', label: 'Głos', icon: AudioLines },
];

const EFFORT_OPTIONS: { value: Effort; label: string; hint: string }[] = [
  { value: 'low', label: 'Szybko', hint: 'mniej wyszukiwań, najtaniej' },
  { value: 'medium', label: 'Standard', hint: 'zalecane' },
  { value: 'high', label: 'Dokładnie', hint: 'najwięcej źródeł, dłużej' },
];

const VOICE_SAMPLE = 'Hej, tu DJ MuzaIK. Mam dla Ciebie plan zwiastuna — refren wchodzi na dziewiątym takcie.';

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, loadError, savePrefs } = useAiSettings();
  const [tab, setTab] = React.useState<Tab>('engine');
  const [prefsError, setPrefsError] = React.useState<string | null>(null);

  const update = async (patch: Parameters<typeof savePrefs>[0]) => {
    setPrefsError(null);
    try {
      await savePrefs(patch);
    } catch (err: any) {
      setPrefsError(err?.message || 'Nie udało się zapisać ustawienia.');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Ustawienia — ${APP.name}`} icon={SETTINGS_ITEM.icon} tone={SETTINGS_ITEM.tone} widthClass="max-w-3xl">
      <div role="tablist" aria-label="Ustawienia" className="flex gap-1 p-1 rounded-2xl bg-brand-panel border border-white/10">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 min-w-0 h-14 sm:h-12 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 text-xs sm:text-sm font-semibold',
                tab === t.id ? 'bg-violet-400/15 text-violet-200 border border-violet-400/40' : 'text-slate-400 border border-transparent active:bg-white/5',
              )}
            >
              <Icon size={18} /> {t.label}
            </button>
          );
        })}
      </div>

      {!settings ? (
        <p className="text-sm text-slate-400 flex items-center gap-2">
          {loadError ? <AlertTriangle size={16} className="text-rose-400" /> : <Loader2 size={16} className="animate-spin" />}
          {loadError ?? 'Wczytuję ustawienia…'}
        </p>
      ) : (
        <>
          {prefsError && <p className="text-sm text-rose-300">{prefsError}</p>}
          {tab === 'engine' && <EngineTab settings={settings} update={update} goToKeys={() => setTab('keys')} />}
          {tab === 'keys' && <KeysTab settings={settings} />}
          {tab === 'muzaik' && <MuzaikTab />}
          {tab === 'youtube' && <YoutubeTab />}
          {tab === 'images' && <ImagesTab settings={settings} update={update} goToKeys={() => setTab('keys')} />}
          {tab === 'voice' && <VoiceTab settings={settings} update={update} goToKeys={() => setTab('keys')} />}
        </>
      )}
    </Sheet>
  );
}

export type Update = (patch: Parameters<ReturnType<typeof useAiSettings>['savePrefs']>[0]) => Promise<void>;

function EngineTab({ settings, update, goToKeys }: { settings: AiSettings; update: Update; goToKeys: () => void }) {
  const { prefs, providers } = settings;
  const selected = prefs.engine.provider;
  const status = providers[selected];
  const textModels = status.models.filter((m) => m.kind === 'text');

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <span className="field-label">Silnik AI (wyszukiwanie i rozmowa)</span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {PROVIDER_IDS.map((p) => {
            const info = PROVIDER_INFO[p];
            const st = providers[p];
            return (
              <button
                key={p}
                type="button"
                aria-pressed={selected === p}
                onClick={() => update({ engine: { provider: p } })}
                className={cn(
                  'p-4 rounded-xl border text-left flex flex-col gap-1.5',
                  selected === p ? 'border-violet-400/60 bg-violet-400/10' : 'border-white/10 bg-brand-panel active:bg-white/5',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold text-white">
                    {info.label} <span className="text-sm font-normal text-slate-400">· {info.company}</span>
                  </span>
                  <StatusDot status={st} />
                </span>
                <span className="text-xs text-slate-400 leading-snug">{info.engineNote}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <label htmlFor="engine-model" className="field-label">Model {PROVIDER_INFO[selected].label}</label>
        {!status.configured ? (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-200 flex items-center gap-3">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="flex-1">Brak klucza {PROVIDER_INFO[selected].company} — asystent nie zadziała.</span>
            <button type="button" onClick={goToKeys} className="h-11 px-4 rounded-lg bg-amber-400 text-black font-semibold">
              Dodaj klucz
            </button>
          </div>
        ) : (
          <ModelSelect
            id="engine-model"
            models={textModels}
            value={prefs.engine.models[selected]}
            onChange={(model) => update({ engine: { models: { [selected]: model } } })}
            emptyHint="Lista modeli pojawi się po sprawdzeniu klucza (zakładka Klucze API → Sprawdź)."
          />
        )}
      </section>

      <section className="space-y-2">
        <span className="field-label">Dokładność (effort)</span>
        <div className="grid grid-cols-3 gap-2">
          {EFFORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={prefs.effort === o.value}
              onClick={() => update({ effort: o.value })}
              className={cn(
                'min-h-16 p-3 rounded-xl border text-left',
                prefs.effort === o.value ? 'border-violet-400/60 bg-violet-400/15 text-white' : 'border-white/10 bg-brand-panel text-slate-300 active:bg-white/10',
              )}
            >
              <span className="block text-base font-semibold">{o.label}</span>
              <span className="block text-xs text-slate-400">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">Każde zapytanie zużywa środki na koncie wybranego dostawcy.</p>
      </section>
    </div>
  );
}

function KeysTab({ settings }: { settings: AiSettings }) {
  return (
    <div className="space-y-3">
      {KEY_PROVIDER_IDS.map((p) => (
        <React.Fragment key={p}>
          <KeyCard provider={p} status={settings.providers[p]} />
        </React.Fragment>
      ))}
      <p className="text-xs text-slate-500 flex items-center gap-2">
        <Database size={14} />
        {settings.storage === 'mysql'
          ? 'Klucze są zapisane na serwerze w bazie MariaDB, zaszyfrowane (AES-256). Przeglądarka widzi tylko ich końcówkę.'
          : 'Klucze są zapisane na tym komputerze w zaszyfrowanym pliku ustawień.'}
      </p>
    </div>
  );
}

function KeyCard({ provider, status }: { provider: KeyProvider; status: ProviderStatus }) {
  const { saveKey, testKey, deleteKey } = useAiSettings();
  const info = PROVIDER_INFO[provider];
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState<'save' | 'test' | 'delete' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (kind: 'save' | 'test' | 'delete', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      if (kind === 'save') setValue('');
    } catch (err: any) {
      setError(err?.message || 'Coś poszło nie tak.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="p-4 rounded-xl bg-brand-panel border border-white/10 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-base font-semibold text-white">
          {info.company} <span className="text-slate-400 font-normal">· {info.label}</span>
        </span>
        <StatusBadge status={status} />
        {status.configured && (
          <span className="text-xs text-slate-500">
            {status.source === 'env' ? 'z pliku .env serwera' : 'zapisany'} · {status.hint}
            {status.testedAt && ` · sprawdzono ${formatDateTime(status.testedAt)}`}
          </span>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) run('save', () => saveKey(provider, value.trim()));
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.configured ? 'Wklej nowy klucz, aby zastąpić' : info.keyPlaceholder}
          autoComplete="off"
          aria-label={`Klucz ${info.company}`}
          className="field font-mono text-sm flex-1 min-w-0"
        />
        <button
          type="submit"
          disabled={!value.trim() || busy !== null}
          className="h-14 px-4 rounded-xl bg-cyan-400 text-black font-semibold flex items-center gap-2 disabled:opacity-40 shrink-0"
        >
          {busy === 'save' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Zapisz i sprawdź
        </button>
      </form>

      <div className="flex items-center gap-2 flex-wrap">
        {status.configured && (
          <button
            type="button"
            onClick={() => run('test', () => testKey(provider))}
            disabled={busy !== null}
            className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold text-slate-200 flex items-center gap-2 disabled:opacity-50"
          >
            {busy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sprawdź i pobierz modele
          </button>
        )}
        {status.source === 'db' && (
          <button
            type="button"
            onClick={() => run('delete', () => deleteKey(provider))}
            disabled={busy !== null}
            className="h-11 px-4 rounded-xl text-sm font-semibold text-rose-300 flex items-center gap-2 active:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 size={16} /> Usuń
          </button>
        )}
        <span className={cn('text-sm', status.status === 'error' ? 'text-rose-300' : 'text-slate-400')}>
          {error ?? status.message ?? (status.configured ? 'Klucz nie był jeszcze sprawdzany.' : `Klucz utworzysz w ${info.keyUrl}.`)}
        </span>
      </div>
    </section>
  );
}

function VoiceTab({ settings, update, goToKeys }: { settings: AiSettings; update: Update; goToKeys: () => void }) {
  const { prefs, providers } = settings;
  const google = providers.google;
  const speech = useSpeech();
  const ttsModels = google.models.filter((m) => m.kind === 'tts');
  const textModels = google.models.filter((m) => m.kind === 'text');
  const sampleId = `sample-${prefs.voice.voiceName}`;
  const sampleBusy = speech.id === sampleId && speech.status !== 'idle';

  if (!google.configured) {
    return (
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-200 flex items-center gap-3">
        <AlertTriangle size={18} className="shrink-0" />
        <span className="flex-1">Czytanie odpowiedzi i wiadomości głosowe działają przez Google Gemini. Dodaj klucz Google, aby je włączyć.</span>
        <button type="button" onClick={goToKeys} className="h-11 px-4 rounded-lg bg-amber-400 text-black font-semibold">
          Dodaj klucz
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <label htmlFor="voice-name" className="field-label">Głos lektora (męski, polski)</label>
        <div className="flex gap-2">
          <select
            id="voice-name"
            value={prefs.voice.voiceName}
            onChange={(e) => update({ voice: { voiceName: e.target.value } })}
            className="field text-base flex-1 min-w-0"
          >
            {MALE_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => speak(sampleId, VOICE_SAMPLE, prefs.voice.voiceName)}
            className="h-14 px-4 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-semibold flex items-center gap-2 shrink-0"
          >
            {!sampleBusy ? <AudioLines size={18} /> : speech.status === 'playing' ? <Square size={18} /> : <Loader2 size={18} className="animate-spin" />}
            {sampleBusy ? (speech.status === 'playing' ? 'Zatrzymaj' : 'Przygotowuję…') : 'Odsłuchaj próbkę'}
          </button>
        </div>
      </section>

      <button
        type="button"
        role="switch"
        aria-checked={prefs.voice.autoRead}
        onClick={() => update({ voice: { autoRead: !prefs.voice.autoRead } })}
        className={cn(
          'w-full min-h-16 px-4 py-2 rounded-xl border flex items-center gap-3 text-left',
          prefs.voice.autoRead ? 'bg-violet-400/10 border-violet-400/40' : 'bg-brand-panel border-white/10',
        )}
      >
        <span className={cn('w-12 h-7 rounded-full p-1 shrink-0 transition-colors', prefs.voice.autoRead ? 'bg-violet-400' : 'bg-white/15')}>
          <span className={cn('block w-5 h-5 rounded-full bg-white transition-transform', prefs.voice.autoRead && 'translate-x-5')} />
        </span>
        <span>
          <span className="block text-sm font-semibold text-slate-100">Czytaj wynik automatycznie</span>
          <span className="block text-xs text-slate-400">Po zakończeniu zadania lektor od razu przeczyta wynik.</span>
        </span>
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="space-y-2">
          <label htmlFor="tts-model" className="field-label">Model głosu (TTS)</label>
          <ModelSelect id="tts-model" models={ttsModels} value={prefs.voice.ttsModel} onChange={(m) => update({ voice: { ttsModel: m } })} emptyHint="Sprawdź klucz Google, aby pobrać modele." />
        </section>
        <section className="space-y-2">
          <label htmlFor="stt-model" className="field-label">Model rozumienia nagrań</label>
          <ModelSelect id="stt-model" models={textModels} value={prefs.stt.model} onChange={(m) => update({ stt: { model: m } })} emptyHint="Sprawdź klucz Google, aby pobrać modele." />
        </section>
      </div>
      <p className="text-xs text-slate-500">
        Wiadomość głosowa: dotknij „Nagraj”, powiedz, o co chodzi, i dotknij „Zakończ”. Nagranie (WAV) trafia do Gemini, który zapisuje wypowiedź i streszcza prośbę.
      </p>
    </div>
  );
}

function ModelSelect({ id, models, value, onChange, emptyHint }: { id: string; models: ModelInfo[]; value: string; onChange: (id: string) => void; emptyHint: string }) {
  // Keep the saved model selectable even if the fetched list doesn't include it.
  const options = models.some((m) => m.id === value) ? models : [{ id: value, label: `${value} (zapisany)`, kind: 'text' as const }, ...models];
  return (
    <div className="space-y-1">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="field text-base">
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label === m.id ? m.id : `${m.label} (${m.id})`}
          </option>
        ))}
      </select>
      {models.length === 0 && <p className="text-xs text-slate-500">{emptyHint}</p>}
    </div>
  );
}

function StatusDot({ status }: { status: ProviderStatus }) {
  const color = !status.configured ? 'bg-slate-600' : status.status === 'ok' ? 'bg-emerald-400' : status.status === 'error' ? 'bg-rose-400' : 'bg-amber-400';
  return <span className={cn('w-3 h-3 rounded-full shrink-0', color)} aria-hidden="true" />;
}

export function StatusBadge({ status }: { status: ProviderStatus }) {
  if (!status.configured) {
    return (
      <span className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 flex items-center gap-1.5">
        <CircleDashed size={14} /> brak klucza
      </span>
    );
  }
  if (status.status === 'ok') {
    return (
      <span className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-emerald-400/15 text-emerald-300 flex items-center gap-1.5">
        <CheckCircle2 size={14} /> działa
      </span>
    );
  }
  if (status.status === 'error') {
    return (
      <span className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-rose-400/15 text-rose-300 flex items-center gap-1.5">
        <AlertTriangle size={14} /> błąd
      </span>
    );
  }
  return (
    <span className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-amber-400/15 text-amber-300 flex items-center gap-1.5">
      <CircleDashed size={14} /> niesprawdzony
    </span>
  );
}
