import React from 'react';
import { apiCall, streamRequest, uploadFile } from './api';
import type { MuzaikOverview } from '../muzaik';
import type { MaterialProject, MaterialRequest, MaterialSummary } from '../material';
import type { ProgressEvent } from '../types';

// Client side of the studio: muzaik.channel data, material projects, uploads, render polling, YouTube.

export type AudioAvailability = 'own' | 'muzaik-cache' | 'azuracast' | 'missing';

export const AUDIO_LABEL: Record<AudioAvailability, string> = {
  own: 'plik utworu jest w aplikacji',
  'muzaik-cache': 'plik z pamięci podcastów muzaik.channel',
  azuracast: 'pobiorę z AzuraCast przy renderze',
  missing: 'brak pliku — wgraj MP3 albo dodaj klucz AzuraCast',
};

export interface YoutubeStatus {
  clientConfigured: boolean;
  clientHint: string | null;
  expectedChannel: string | null;
  connected: boolean;
  channelTitle: string | null;
  error: string | null;
}

export const muzaikApi = {
  overview: (refresh = false) => apiCall<MuzaikOverview>('GET', `/api/muzaik${refresh ? '?refresh=1' : ''}`),
  audio: (id: number) => apiCall<{ availability: AudioAvailability }>('GET', `/api/muzaik/tracks/${id}/audio`),
  uploadAudio: (id: number, file: File, onProgress?: (s: number) => void) => uploadFile<{ availability: AudioAvailability }>(`/api/muzaik/tracks/${id}/audio`, file, onProgress),
  imageUrl: (url: string) => `/api/muzaik/image?url=${encodeURIComponent(url)}`,
};

export const materialsApi = {
  list: () => apiCall<{ materials: MaterialSummary[] }>('GET', '/api/materials'),
  get: (id: string) => apiCall<{ material: MaterialProject }>('GET', `/api/materials/${id}`),
  design: (req: Partial<MaterialRequest>, onProgress: (e: ProgressEvent) => void, signal?: AbortSignal) =>
    streamRequest<MaterialProject>('/api/materials/design', req, onProgress, signal),
  update: (id: string, body: unknown) => apiCall<{ material: MaterialProject }>('PATCH', `/api/materials/${id}`, body),
  remove: (id: string) => apiCall<{ ok: true }>('DELETE', `/api/materials/${id}`),
  uploadClip: (id: string, shot: string, file: File, onProgress?: (s: number) => void) =>
    uploadFile<{ material: MaterialProject }>(`/api/materials/${id}/shots/${shot}/clip`, file, onProgress),
  removeClip: (id: string, shot: string) => apiCall<{ material: MaterialProject }>('DELETE', `/api/materials/${id}/shots/${shot}/clip`),
  clipUrl: (id: string, shot: string, clip: string) => `/api/materials/${id}/shots/${shot}/clip?v=${encodeURIComponent(clip)}`,
  render: (id: string) => apiCall<{ material: MaterialProject }>('POST', `/api/materials/${id}/render`),
  fileUrl: (id: string, name: string, download = false) => `/api/materials/${id}/files/${encodeURIComponent(name)}${download ? '?download=1' : ''}`,
  exportUrl: (id: string) => `/api/materials/${id}/export.md`,
};

export const youtubeApi = {
  status: () => apiCall<YoutubeStatus>('GET', '/api/youtube/status'),
  saveClient: (clientId: string, clientSecret: string) => apiCall<YoutubeStatus>('PUT', '/api/youtube/client', { clientId, clientSecret }),
  disconnect: () => apiCall<YoutubeStatus>('POST', '/api/youtube/disconnect'),
  publish: (id: string, body: { file: string; madeForKids: boolean; asChannelTrailer: boolean; confirm: true }) =>
    apiCall<{ videoId: string; trailer: boolean; trailerError: string | null; material: MaterialProject }>('POST', `/api/youtube/publish/${id}`, body),
};

/** muzaik.channel overview, loaded once and refreshable; shared by Centrum and Studio through props. */
export function useMuzaik() {
  const [data, setData] = React.useState<MuzaikOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      setData(await muzaikApi.overview(refresh));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function seconds(n: number): string {
  return `${n.toFixed(n % 1 === 0 ? 0 : 1).replace('.', ',')} s`;
}
