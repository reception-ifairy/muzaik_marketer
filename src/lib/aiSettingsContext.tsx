import React from 'react';
import type { AiPrefs, AiSettings, KeyProvider } from '../aiSettings';
import { notifySessionExpired } from './utils';

interface AiSettingsApi {
  settings: AiSettings | null;
  loadError: string | null;
  /** The selected search engine has a key. */
  engineReady: boolean;
  /** A Google key exists, so voice (TTS + voice messages) works. */
  voiceReady: boolean;
  refresh: () => Promise<void>;
  saveKey: (provider: KeyProvider, key: string) => Promise<AiSettings>;
  testKey: (provider: KeyProvider) => Promise<AiSettings>;
  deleteKey: (provider: KeyProvider) => Promise<AiSettings>;
  savePrefs: (patch: DeepPartial<AiPrefs>) => Promise<AiSettings>;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const Ctx = React.createContext<AiSettingsApi | null>(null);

async function call(method: string, url: string, body?: unknown): Promise<AiSettings> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) notifySessionExpired();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd serwera (${res.status}).`);
  return data as AiSettings;
}

export function AiSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<AiSettings | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const apply = React.useCallback((next: AiSettings) => {
    setSettings(next);
    setLoadError(null);
    return next;
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      apply(await call('GET', '/api/settings'));
    } catch (err: any) {
      setLoadError(err?.message || 'Nie udało się wczytać ustawień.');
    }
  }, [apply]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const api = React.useMemo<AiSettingsApi>(() => {
    const engine = settings?.prefs.engine.provider;
    return {
      settings,
      loadError,
      engineReady: Boolean(engine && settings?.providers[engine].configured),
      voiceReady: Boolean(settings?.providers.google.configured),
      refresh,
      saveKey: async (p, key) => apply(await call('PUT', `/api/settings/keys/${p}`, { key })),
      testKey: async (p) => apply(await call('POST', `/api/settings/keys/${p}/test`)),
      deleteKey: async (p) => apply(await call('DELETE', `/api/settings/keys/${p}`)),
      savePrefs: async (patch) => apply(await call('PUT', '/api/settings/prefs', patch)),
    };
  }, [settings, loadError, refresh, apply]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAiSettings(): AiSettingsApi {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useAiSettings must be used inside AiSettingsProvider');
  return ctx;
}
