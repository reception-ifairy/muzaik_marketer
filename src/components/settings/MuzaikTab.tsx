import React from 'react';
import { Loader2, Radio, Youtube, Save, Unplug, Link2 } from 'lucide-react';
import { apiCall } from '../../lib/api';
import { youtubeApi, type YoutubeStatus } from '../../lib/materialsClient';

// Settings → MuzaIK: the marketer's own AzuraCast read key (to fetch track files for the edit) and the YouTube connection.
// Keys are write-only: the server answers with a hint, never the key.

interface AzuraStatus {
  baseUrl: string;
  stationId: string;
  hint: string | null;
  source: 'settings' | 'env' | null;
}

export function MuzaikTab() {
  const [st, setSt] = React.useState<AzuraStatus | null>(null);
  const [baseUrl, setBaseUrl] = React.useState('');
  const [stationId, setStationId] = React.useState('');
  const [key, setKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  React.useEffect(() => {
    apiCall<AzuraStatus>('GET', '/api/muzaik/azuracast').then((s) => { setSt(s); setBaseUrl(s.baseUrl); setStationId(s.stationId); }).catch((e) => setMsg(e.message));
  }, []);
  const save = async (remove = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const s = await apiCall<AzuraStatus>('PUT', '/api/muzaik/azuracast', remove ? { key: null } : { baseUrl, stationId, key: key || undefined });
      setSt(s);
      setKey('');
      setMsg(remove ? 'Klucz usunięty.' : 'Zapisane.');
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><Radio size={18} className="text-cyan-300" /><h3 className="font-display font-semibold text-white">AzuraCast — pliki utworów</h3></div>
      <p className="text-sm text-slate-400">
        Do montażu potrzebny jest plik utworu. Aplikacja najpierw szuka go w pamięci podcastów muzaik.channel na tym serwerze; gdy go tam nie ma, pobiera go z AzuraCast <b>własnym</b> kluczem (tylko odczyt — utwórz osobny klucz w AzuraCast: Moje konto → Klucze API). Zawsze możesz też wgrać plik w Studio.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8rem] gap-3">
        <label className="block"><span className="field-label">Adres AzuraCast</span><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="field h-12" /></label>
        <label className="block"><span className="field-label">Nr stacji</span><input value={stationId} onChange={(e) => setStationId(e.target.value)} className="field h-12" inputMode="numeric" /></label>
      </div>
      <label className="block">
        <span className="field-label">Klucz API {st?.hint ? `(zapisany: ${st.hint}${st.source === 'env' ? ', z pliku .env' : ''})` : '(brak)'}</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" placeholder="id:sekret" className="field h-12" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => save()} disabled={busy} className="h-12 px-4 rounded-xl bg-violet-400 text-black font-semibold flex items-center gap-2 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Zapisz</button>
        {st?.source === 'settings' && <button type="button" onClick={() => save(true)} disabled={busy} className="h-12 px-4 rounded-xl border border-rose-400/40 text-rose-300">Usuń klucz</button>}
      </div>
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </div>
  );
}

export function YoutubeTab() {
  const [st, setSt] = React.useState<YoutubeStatus | null>(null);
  const [clientId, setClientId] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  React.useEffect(() => { youtubeApi.status().then(setSt).catch((e) => setMsg(e.message)); }, []);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setSt(await youtubeApi.saveClient(clientId, secret));
      setClientId('');
      setSecret('');
      setMsg('Dane klienta zapisane. Teraz „Połącz z YouTube”.');
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><Youtube size={18} className="text-rose-400" /><h3 className="font-display font-semibold text-white">Kanał YouTube MuzaIK</h3></div>
      <p className="text-sm text-slate-400">
        Gotowe filmy wysyłasz stąd jako <b>prywatne</b> (publikujesz je sama w YouTube Studio). Potrzebny jest klient OAuth z Google Cloud (typ „Web application”, adres powrotu <span className="font-mono">{`${window.location.origin}/api/youtube/callback`}</span>). Aplikacja przyjmuje tylko kanał {st?.expectedChannel ?? 'MuzaIK'}.
      </p>
      <p className="text-sm">
        Stan: {st?.connected ? <span className="text-emerald-300">połączony — {st.channelTitle}</span> : <span className="text-amber-300">niepołączony</span>}
        {st?.error && <span className="block text-rose-300">{st.error}</span>}
      </p>
      <label className="block"><span className="field-label">Client ID {st?.clientHint ? `(zapisany: ${st.clientHint})` : ''}</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} className="field h-12" placeholder="….apps.googleusercontent.com" /></label>
      <label className="block"><span className="field-label">Client secret</span><input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" autoComplete="off" className="field h-12" /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy || !clientId || !secret} className="h-12 px-4 rounded-xl bg-violet-400 text-black font-semibold flex items-center gap-2 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Zapisz klienta</button>
        {st?.clientConfigured && <a href="/api/youtube/connect" className="h-12 px-4 rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-100 font-semibold flex items-center gap-2"><Link2 size={16} /> {st.connected ? 'Połącz ponownie' : 'Połącz z YouTube'}</a>}
        {st?.connected && <button type="button" onClick={async () => setSt(await youtubeApi.disconnect())} className="h-12 px-4 rounded-xl border border-white/10 text-slate-300 flex items-center gap-2"><Unplug size={16} /> Rozłącz</button>}
      </div>
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </div>
  );
}
