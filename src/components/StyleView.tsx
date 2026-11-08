import React from 'react';
import { Wand2, ImagePlus, Trash2, Copy, Check, X, AlertTriangle, Loader2, Eraser } from 'lucide-react';
import { STARTER_SET_ID, composeImagePrompt, type OptionPicks, type OptionSet, type OptionsState } from '../options';
import { APP } from '../config';
import { getSection } from '../lib/sections';
import { optionsApi } from '../lib/optionsClient';
import { loadJson, saveJson } from '../lib/settings';
import { cn } from '../lib/utils';
import ViewHeader, { ViewBody, HeaderButton } from './shell/ViewHeader';
import OptionWindow from './options/OptionWindow';
import OptionVisual, { GroupIcon } from './options/OptionVisual';
import BuildOptionsSheet from './options/BuildOptionsSheet';
import SamplesSheet from './options/SamplesSheet';

// Example feature: option sets in the option window (ported from Kuźnia inspiracji). Group circles open the
// window; the choices plus a description make an image prompt. There is no generator here on purpose — a project
// that needs one passes composeImagePrompt(...) to server/images/generate.ts after showing the cost.

const PICKS_KEY = `${APP.id}_option_picks`;
const DESCRIPTION_KEY = `${APP.id}_image_description`;

export default function StyleView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const section = getSection('styl');
  const [state, setState] = React.useState<OptionsState | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [allPicks, setAllPicks] = React.useState<Record<string, OptionPicks>>(() => loadJson(PICKS_KEY, {}));
  const [description, setDescription] = React.useState<string>(() => loadJson(DESCRIPTION_KEY, ''));
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState<'build' | 'samples' | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    optionsApi.state().then(setState, (err) => setLoadError(err?.message || 'Nie udało się wczytać opcji.'));
  }, []);

  const set = state?.sets.find((s) => s.id === state.activeId) ?? null;
  const picks = set ? (allPicks[set.id] ?? {}) : {};

  const setPicks = (next: OptionPicks) => {
    if (!set) return;
    const all = { ...allPicks, [set.id]: next };
    setAllPicks(all);
    saveJson(PICKS_KEY, all);
  };
  const pick = (groupId: string, code: string) => setPicks({ ...picks, [groupId]: code });

  const replaceSet = (updated: OptionSet) => setState((s) => (s ? { ...s, sets: s.sets.map((x) => (x.id === updated.id ? updated : x)) } : s));

  const switchSet = async (id: string) => {
    setBusy(true);
    try {
      setState(await optionsApi.setActive(id));
    } catch (err: any) {
      setLoadError(err?.message || 'Nie udało się przełączyć zestawu.');
    } finally {
      setBusy(false);
    }
  };

  const removeSet = async () => {
    if (!set || set.id === STARTER_SET_ID) return;
    if (!window.confirm(`Usunąć zestaw „${set.name}” razem z jego miniaturkami?`)) return;
    setBusy(true);
    try {
      setState(await optionsApi.remove(set.id));
    } catch (err: any) {
      setLoadError(err?.message || 'Nie udało się usunąć zestawu.');
    } finally {
      setBusy(false);
    }
  };

  const prompt = set ? composeImagePrompt(description, set, picks) : '';
  const chosen = set ? set.groups.flatMap((g) => {
    const option = g.options.find((o) => o.code === picks[g.id]);
    return option ? [{ group: g, option }] : [];
  }) : [];
  const missing = set ? set.groups.filter((g) => g.kind === 'sample').reduce((n, g) => n + g.options.filter((o) => !o.sample).length, 0) : 0;
  const isStarter = set?.id === STARTER_SET_ID;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the prompt is still selectable
    }
  };

  return (
    <>
      <ViewHeader section={section}>
        <HeaderButton tone="primary" onClick={() => setSheet('build')} label="Zbuduj opcje dla projektu">
          <Wand2 size={16} /> <span className="hidden sm:inline">Zbuduj dla projektu</span>
        </HeaderButton>
      </ViewHeader>
      <ViewBody className="flex flex-col md:flex-row gap-4">
        {!state || !set ? (
          <p className="text-sm text-slate-400 flex items-center gap-2">
            {loadError ? <AlertTriangle size={16} className="text-rose-400" /> : <Loader2 size={16} className="animate-spin" />}
            {loadError ?? 'Wczytuję opcje…'}
          </p>
        ) : (
          <>
            <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
              <div className="panel p-3 flex flex-wrap items-center gap-2 shrink-0">
                <label htmlFor="option-set" className="sr-only">Zestaw opcji</label>
                <select id="option-set" value={set.id} disabled={busy} onChange={(e) => switchSet(e.target.value)} className="field h-12 text-base flex-1 min-w-[12rem]">
                  {state.sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {!isStarter && (
                  <>
                    <HeaderButton tone={missing ? 'amber' : 'neutral'} onClick={() => setSheet('samples')}>
                      <ImagePlus size={16} /> Miniaturki{missing ? ` (${missing})` : ''}
                    </HeaderButton>
                    <HeaderButton tone="danger" onClick={removeSet} disabled={busy} label="Usuń zestaw">
                      <Trash2 size={16} />
                    </HeaderButton>
                  </>
                )}
              </div>

              <div className="panel p-3 md:p-4 flex-1 min-h-0">
                <ul className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-3 lg:grid-cols-5 gap-x-2 gap-y-3">
                  {set.groups.map((g) => {
                    const option = g.options.find((o) => o.code === picks[g.id]);
                    return (
                      <li key={g.id} style={{ '--tone': g.tone } as React.CSSProperties}>
                        <button type="button" onClick={() => setOpenGroup(g.id)} aria-haspopup="dialog" className="w-full flex flex-col items-center gap-1.5 text-center min-w-0">
                          <span className={cn('tone-circle w-16 h-16 lg:w-20 lg:h-20 rounded-full grid place-items-center overflow-hidden', option && 'is-chosen', openGroup === g.id && 'is-open')}>
                            {option ? <OptionVisual group={g} option={option} round /> : <GroupIcon icon={g.icon} size={26} />}
                          </span>
                          <span className="text-sm font-semibold text-slate-100 truncate max-w-full">{g.label}</span>
                          <span className={cn('text-[11px] truncate max-w-full', option ? 'text-[var(--tone)]' : 'text-slate-500')}>{option ? option.label : 'Brak'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <aside className="md:w-[24rem] shrink-0 flex flex-col gap-3 min-h-0">
              <section className="panel p-3 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="field-label mb-0">Wybrane ({chosen.length})</span>
                  {chosen.length > 0 && (
                    <button type="button" onClick={() => setPicks({})} className="h-9 px-3 rounded-lg text-xs font-semibold text-slate-300 flex items-center gap-1.5 active:bg-white/10">
                      <Eraser size={14} /> Wyczyść
                    </button>
                  )}
                </div>
                {chosen.length === 0 ? (
                  <p className="text-xs text-slate-500">Dotknij kółka grupy, żeby wybrać opcję z miniaturek.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {chosen.map(({ group, option }) => (
                      <li key={group.id} style={{ '--tone': group.tone } as React.CSSProperties} className="h-9 pl-1 pr-1 rounded-full border border-white/15 bg-white/5 text-xs text-slate-100 flex items-center gap-1.5 max-w-full">
                        <span className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                          <OptionVisual group={group} option={option} round />
                        </span>
                        <span className="truncate">{option.label}</span>
                        <button type="button" onClick={() => pick(group.id, '')} aria-label={`Usuń ${option.label}`} className="w-7 h-7 rounded-full grid place-items-center text-slate-400 active:bg-white/10 shrink-0">
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel p-3 space-y-2 flex-1 min-h-0 flex flex-col">
                <label htmlFor="image-description" className="field-label">Opis obrazu</label>
                <textarea
                  id="image-description"
                  value={description}
                  maxLength={600}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    saveJson(DESCRIPTION_KEY, e.target.value);
                  }}
                  rows={3}
                  placeholder="np. Kubek z ręcznie robionej ceramiki na drewnianym stole"
                  className="field h-auto py-3 resize-none shrink-0"
                />
                <div className="flex items-center justify-between gap-2 shrink-0">
                  <span className="field-label mb-0">Prompt dla modelu obrazów</span>
                  <button type="button" onClick={copy} className="h-9 px-3 rounded-lg text-xs font-semibold text-slate-300 flex items-center gap-1.5 active:bg-white/10">
                    {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />} {copied ? 'Skopiowano' : 'Kopiuj'}
                  </button>
                </div>
                <p className="flex-1 min-h-16 overflow-y-auto text-xs font-mono leading-relaxed text-slate-400 bg-brand-raised rounded-xl p-3 select-text">{prompt}</p>
              </section>
            </aside>

            <OptionWindow set={set} groupId={openGroup} picks={picks} onPick={pick} onGroupChange={setOpenGroup} onClose={() => setOpenGroup(null)} />
            <SamplesSheet open={sheet === 'samples'} set={set} onClose={() => setSheet(null)} onUpdated={replaceSet} onOpenSettings={onOpenSettings} />
          </>
        )}
      </ViewBody>
      <BuildOptionsSheet
        open={sheet === 'build'}
        onClose={() => setSheet(null)}
        initialContext={set && !isStarter ? set.context : ''}
        onSaved={(next) => {
          setState(next);
          setSheet('samples');
        }}
      />
    </>
  );
}
