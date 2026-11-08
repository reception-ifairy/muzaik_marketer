import React from 'react';
import { Wand2, Loader2, X, Trash2, Save, AlertTriangle } from 'lucide-react';
import type { OptionSet, OptionsState } from '../../options';
import { PROVIDER_INFO } from '../../aiSettings';
import { useAiSettings } from '../../lib/aiSettingsContext';
import { optionsApi } from '../../lib/optionsClient';
import { TONES } from '../../lib/sections';
import Sheet from '../ui/Sheet';
import { GroupIcon } from './OptionVisual';

// "Zbuduj opcje dla projektu": the owner describes the project, the text engine proposes groups and options
// (one call, no web search), the owner trims the proposal and saves it. Thumbnails come next (SamplesSheet).

interface BuildOptionsSheetProps {
  open: boolean;
  onClose: () => void;
  initialContext: string;
  onSaved: (state: OptionsState, set: OptionSet) => void;
}

export default function BuildOptionsSheet({ open, onClose, initialContext, onSaved }: BuildOptionsSheetProps) {
  const { settings, engineReady } = useAiSettings();
  const [context, setContext] = React.useState(initialContext);
  const [groupCount, setGroupCount] = React.useState(6);
  const [perGroup, setPerGroup] = React.useState(8);
  const [busy, setBusy] = React.useState<'propose' | 'save' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<OptionSet | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (open) {
      setContext((c) => c || initialContext);
      setError(null);
    } else {
      abortRef.current?.abort();
    }
  }, [open, initialContext]);

  const engine = settings?.prefs.engine;
  const engineLabel = engine ? `${PROVIDER_INFO[engine.provider].label} · ${engine.models[engine.provider]}` : '…';

  const propose = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy('propose');
    setError(null);
    try {
      setDraft(await optionsApi.propose({ context: context.trim(), groupCount, perGroup }, controller.signal));
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Nie udało się zaproponować zestawu.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    const set = { ...draft, groups: draft.groups.filter((g) => g.options.length > 0) };
    setBusy('save');
    setError(null);
    try {
      const state = await optionsApi.save(set);
      setDraft(null);
      onSaved(state, state.sets.find((s) => s.id === set.id) ?? set);
    } catch (err: any) {
      setError(err?.message || 'Nie udało się zapisać zestawu.');
    } finally {
      setBusy(null);
    }
  };

  const editGroups = (fn: (groups: OptionSet['groups']) => OptionSet['groups']) => setDraft((d) => (d ? { ...d, groups: fn(d.groups) } : d));

  const footer = draft ? (
    <div className="flex gap-2 justify-end flex-wrap">
      <button type="button" onClick={() => setDraft(null)} disabled={busy !== null} className="h-12 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-slate-200">
        Odrzuć i zacznij od nowa
      </button>
      <button type="button" onClick={save} disabled={busy !== null || !draft.groups.some((g) => g.options.length)} className="h-12 px-5 rounded-xl bg-pink-400 text-black text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
        {busy === 'save' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Zapisz zestaw
      </button>
    </div>
  ) : (
    <div className="flex gap-2 justify-end">
      <button
        type="button"
        onClick={propose}
        disabled={busy !== null || context.trim().length < 10 || !engineReady}
        className="h-12 px-5 rounded-xl bg-pink-400 text-black text-sm font-semibold flex items-center gap-2 disabled:opacity-40"
      >
        {busy === 'propose' ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />} {busy === 'propose' ? 'AI układa opcje…' : 'Zaproponuj opcje'}
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Zbuduj opcje dla projektu" icon={Wand2} tone={TONES.pink} widthClass="max-w-3xl" footer={footer}>
      {error && (
        <p className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/30 text-sm text-rose-200 flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </p>
      )}

      {!draft ? (
        <div className="space-y-4">
          <section className="space-y-2">
            <label htmlFor="opt-context" className="field-label">O czym jest projekt?</label>
            <textarea
              id="opt-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={6}
              maxLength={2000}
              disabled={busy !== null}
              placeholder="np. Sklep z ręcznie robioną ceramiką. Potrzebuję zdjęć produktów do katalogu i na Pinterest: kubki, misy, wazony; klimat spokojny, naturalny."
              className="field h-auto py-3 resize-none leading-relaxed"
            />
          </section>
          <div className="grid grid-cols-2 gap-3">
            <section className="space-y-1">
              <label htmlFor="opt-groups" className="field-label">Grupy</label>
              <select id="opt-groups" value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))} className="field text-base">
                {[3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>
                    {n} grup
                  </option>
                ))}
              </select>
            </section>
            <section className="space-y-1">
              <label htmlFor="opt-per-group" className="field-label">Opcji w grupie</label>
              <select id="opt-per-group" value={perGroup} onChange={(e) => setPerGroup(Number(e.target.value))} className="field text-base">
                {[4, 6, 8, 12, 16].map((n) => (
                  <option key={n} value={n}>
                    {n} opcji
                  </option>
                ))}
              </select>
            </section>
          </div>
          <p className="text-xs text-slate-400">
            {engineReady
              ? `Jedno zapytanie do silnika tekstowego (${engineLabel}), bez wyszukiwania w sieci — zwykle kilka centów. Zestaw nie zapisze się, dopóki go nie zatwierdzisz; miniaturki tworzysz osobno, po sprawdzeniu kosztu.`
              : 'Najpierw dodaj klucz silnika AI w Ustawieniach.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <section className="space-y-1">
              <label htmlFor="opt-name" className="field-label">Nazwa zestawu</label>
              <input id="opt-name" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="field" />
            </section>
            <section className="space-y-1">
              <label htmlFor="opt-motif" className="field-label">Motyw miniaturek (po angielsku)</label>
              <input id="opt-motif" value={draft.motif} maxLength={160} onChange={(e) => setDraft({ ...draft, motif: e.target.value })} className="field text-sm" />
            </section>
          </div>
          <p className="text-xs text-slate-400">Usuń grupy i opcje, których nie chcesz. Motyw pojawi się na każdej miniaturce, żeby różnice między opcjami były dobrze widoczne.</p>
          <ul className="space-y-3">
            {draft.groups.map((g) => (
              <li key={g.id} className="p-3 rounded-xl bg-brand-panel border border-white/10 space-y-2" style={{ '--tone': g.tone } as React.CSSProperties}>
                <div className="flex items-center gap-3">
                  <span className="tone-circle w-10 h-10 rounded-full grid place-items-center shrink-0">
                    <GroupIcon icon={g.icon} size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">
                      {g.label} {g.kind === 'palette' && <span className="text-xs font-normal text-slate-400">· paleta (bez kosztu)</span>}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{g.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => editGroups((gs) => gs.filter((x) => x.id !== g.id))}
                    aria-label={`Usuń grupę ${g.label}`}
                    className="w-11 h-11 rounded-xl grid place-items-center text-rose-300 active:bg-rose-500/10 shrink-0"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {g.options.map((o) => (
                    <li key={o.code} title={`${o.description}\n${o.prompt}`} className="h-9 pl-3 pr-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200 flex items-center gap-1 max-w-full">
                      {o.colors?.length ? <span className="w-3 h-3 rounded-full shrink-0" style={{ background: o.colors[0] }} /> : null}
                      <span className="truncate">{o.label}</span>
                      <button
                        type="button"
                        onClick={() => editGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, options: x.options.filter((y) => y.code !== o.code) } : x)))}
                        aria-label={`Usuń opcję ${o.label}`}
                        className="w-7 h-7 rounded-md grid place-items-center text-slate-400 active:bg-white/10 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
