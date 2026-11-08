import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot, Plus, Send, Square, Trash2, Copy, Check, Globe, History, ArrowDown,
  AlertTriangle, MessagesSquare, Camera, X, Loader2,
} from 'lucide-react';
import type { ChatEvent, ChatMessage, ConversationSummary } from '../chat';
import type { ActivityStep, SourceLink } from '../types';
import { APP } from '../config';
import { PROVIDER_INFO } from '../aiSettings';
import { getSection } from '../lib/sections';
import { useAiSettings } from '../lib/aiSettingsContext';
import { useVoiceMessage } from '../lib/useVoiceMessage';
import { chatImageUrl, deleteConversation, getConversation, listConversations, sendChatMessage, uploadChatImage } from '../lib/chatClient';
import { resizeImage } from '../lib/resizeImage';
import { cn, hostname, safeUrl } from '../lib/utils';
import ViewHeader, { ViewBody, HeaderButton } from './shell/ViewHeader';
import SpeakButton from './voice/SpeakButton';
import { RecordButton } from './voice/VoiceMessage';
import Sheet from './ui/Sheet';
import { ActivityChips, ActivityPanel } from './ActivityTimeline';

/** A prompt sent from another view (e.g. "ask about this" on a dashboard tile). */
export interface ChatPreset {
  message: string;
  nonce: number;
}

interface ChatViewProps {
  preset?: ChatPreset | null;
}

const MAX_IMAGES = 3;

interface Attachment {
  id: string;
  preview: string; // object URL of the resized photo
}

interface SendOptions {
  imageIds?: string[];
  fresh?: boolean; // start a new conversation
}

// ⚡ marks prompts that trigger a live web search; replace with prompts that fit your project.
const QUICK_PROMPTS = [
  '⚡ Co nowego w tym tygodniu w świecie AI?',
  '⚡ Porównaj trzy najpopularniejsze menedżery haseł',
  'Pomóż mi zaplanować tydzień pracy',
  'Wyjaśnij prostymi słowami, czym jest inflacja',
];

interface Draft {
  content: string;
  steps: ActivityStep[];
  sources: SourceLink[];
  status: string;
  error: string | null;
}

const emptyDraft = (): Draft => ({ content: '', steps: [], sources: [], status: 'Łączę się…', error: null });

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(APP.locale, { hour: '2-digit', minute: '2-digit', timeZone: APP.timezone });

export default function ChatView({ preset }: ChatViewProps) {
  const section = getSection('rozmowa');
  const { engineReady, voiceReady, settings } = useAiSettings();
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [input, setInput] = React.useState('');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const sending = draft !== null;

  const recorder = useVoiceMessage((v) => {
    recorder.reset();
    setInput((prev) => (prev ? `${prev} ${v.transcript}` : v.transcript));
    textareaRef.current?.focus();
  });

  const refreshList = React.useCallback(() => {
    listConversations()
      .then(setConversations)
      .catch((err) => setLoadError(err.message));
  }, []);
  React.useEffect(refreshList, [refreshList]);

  // Follow the reply as it streams, unless the user scrolled up to read.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [messages, draft, atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const open = async (id: string) => {
    if (sending) return;
    setHistoryOpen(false);
    setLoadError(null);
    try {
      const conv = await getConversation(id);
      setActiveId(conv.id);
      setMessages(conv.messages);
      setAtBottom(true);
    } catch (err: any) {
      setLoadError(err.message);
    }
  };

  const startNew = () => {
    if (sending) return;
    setActiveId(null);
    setMessages([]);
    setHistoryOpen(false);
    textareaRef.current?.focus();
  };

  const remove = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    await deleteConversation(id).catch(() => {});
    if (activeId === id) startNew();
    refreshList();
  };

  const addPhotos = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, MAX_IMAGES - attachments.length);
    if (!list.length) return;
    setUploading(true);
    setLoadError(null);
    try {
      for (const file of list) {
        const blob = await resizeImage(file);
        const { id } = await uploadChatImage(blob);
        setAttachments((prev) => [...prev, { id, preview: URL.createObjectURL(blob) }]);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Nie udało się dodać zdjęcia.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = (id: string) =>
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((a) => a.id !== id);
    });

  const send = async (text: string, opts: SendOptions = {}) => {
    const message = text.trim();
    const imageIds = opts.imageIds ?? [];
    if ((!message && !imageIds.length) || sending) return;
    setInput('');
    setAtBottom(true);
    const local: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      // Replaced by the server's version of the text when it answers.
      content: message || 'Co widzisz na tym zdjęciu?',
      images: imageIds,
      sources: [], steps: [], status: 'complete', createdAt: new Date().toISOString(),
    };
    const conversationId = opts.fresh ? null : activeId;
    if (opts.fresh) {
      setActiveId(null);
      setMessages([local]);
    } else {
      setMessages((m) => [...m, local]);
    }
    const d = emptyDraft();
    setDraft(d);
    const controller = new AbortController();
    controllerRef.current = controller;
    let current = d;
    const patch = (fn: (prev: Draft) => Draft) => {
      current = fn(current);
      setDraft(current);
    };

    const onEvent = (e: ChatEvent) => {
      switch (e.type) {
        case 'conversation':
          setActiveId(e.id);
          setMessages((m) => m.map((x) => (x.id === local.id ? { ...x, content: e.content || x.content, images: e.images ?? x.images } : x)));
          break;
        case 'status':
          patch((p) => ({ ...p, status: e.text }));
          break;
        case 'activity':
          patch((p) => {
            const exists = p.steps.some((s) => s.id === e.step.id);
            return {
              ...p,
              steps: exists ? p.steps.map((s) => (s.id === e.step.id ? e.step : s)) : [...p.steps, e.step],
              status: exists ? p.status : stepStatus(e.step),
            };
          });
          break;
        case 'delta':
          patch((p) => ({ ...p, content: p.content + e.text, status: 'Piszę odpowiedź…' }));
          break;
        case 'sources':
          patch((p) => ({ ...p, sources: e.items }));
          break;
        case 'fail':
          patch((p) => ({ ...p, error: e.message }));
          break;
        case 'saved':
          setMessages((m) => [
            ...m,
            {
              id: e.messageId, role: 'assistant', content: current.content, sources: current.sources,
              steps: current.steps, status: e.status, createdAt: new Date().toISOString(),
            },
          ]);
          break;
      }
    };

    try {
      await sendChatMessage({ conversationId, message, imageIds }, onEvent, controller.signal);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages((m) => [
          ...m,
          { ...local, id: `err-${Date.now()}`, role: 'assistant', content: current.content, status: 'error', steps: current.steps, sources: current.sources },
        ]);
        setLoadError(err?.message || 'Nie udało się wysłać wiadomości.');
      }
    } finally {
      controllerRef.current = null;
      setDraft(null);
      refreshList();
    }
  };

  const sendComposer = () => {
    const ids = attachments.map((a) => a.id);
    attachments.forEach((a) => URL.revokeObjectURL(a.preview));
    setAttachments([]);
    send(input, { imageIds: ids });
  };

  // A prompt sent from another view starts a fresh conversation.
  React.useEffect(() => {
    if (!preset) return;
    if (sending) {
      setLoadError(`${APP.assistantName} jeszcze odpowiada — poczekaj albo zatrzymaj odpowiedź i spróbuj ponownie.`);
      return;
    }
    send(preset.message, { fresh: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  const stop = () => controllerRef.current?.abort();
  const engine = settings?.prefs.engine;
  const lastFailed = messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].status === 'error';

  return (
    <>
      <ViewHeader
        section={section}
        subtitle={
          <span className="font-mono text-xs">
            ~/rozmowa · {engine ? `${PROVIDER_INFO[engine.provider].label} ${engine.models[engine.provider]}` : '…'}
            {voiceReady && engine?.provider === 'anthropic' ? ' · + Google dla pewności' : ''}
          </span>
        }
      >
        <span className="md:hidden">
          <HeaderButton onClick={() => setHistoryOpen(true)} label="Historia rozmów">
            <History size={18} />
          </HeaderButton>
        </span>
        <HeaderButton tone="primary" onClick={startNew} disabled={sending}>
          <Plus size={18} /> Nowa rozmowa
        </HeaderButton>
      </ViewHeader>

      <ViewBody className="flex gap-4 md:overflow-hidden">
        <aside className="hidden md:flex w-72 shrink-0 panel p-3 flex-col gap-2 min-h-0">
          <ConversationList items={conversations} activeId={activeId} confirmDelete={confirmDelete} onOpen={open} onDelete={remove} />
        </aside>

        <section className="relative flex-1 min-w-0 min-h-[60vh] md:min-h-0 flex flex-col rounded-2xl border border-white/10 bg-brand-panel overflow-hidden">
          {/* The conversation transcript is the one place that scrolls, like any messenger. */}
          <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-5 flex flex-col gap-5" data-chat-scroll>
            {messages.length === 0 && !draft && <EmptyState />}
            {messages.map((m) => (
              <React.Fragment key={m.id}>
                <MessageView message={m} />
              </React.Fragment>
            ))}
            {draft && <DraftView draft={draft} />}
            {lastFailed && !draft && (
              <button
                type="button"
                onClick={() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                  if (lastUser) send(lastUser.content, { imageIds: lastUser.images });
                }}
                className="self-center h-11 px-4 rounded-xl border border-dashed border-amber-400/60 text-amber-300 font-mono text-xs"
              >
                Brak odpowiedzi — spróbuj ponownie
              </button>
            )}
          </div>

          {!atBottom && (
            <button
              type="button"
              onClick={() => setAtBottom(true)}
              className="absolute left-1/2 -translate-x-1/2 bottom-36 h-10 px-4 rounded-full bg-brand-raised border border-white/10 text-sm text-slate-200 flex items-center gap-1 shadow-xl z-10"
            >
              <ArrowDown size={16} /> najnowsze
            </button>
          )}

          <Composer
            input={input}
            setInput={setInput}
            sending={sending}
            disabled={!engineReady}
            onSend={sendComposer}
            onStop={stop}
            attachments={attachments}
            uploading={uploading}
            onPickPhoto={() => fileRef.current?.click()}
            onRemovePhoto={removePhoto}
            onPrompt={(p) => send(p.replace(/^⚡\s*/, ''))}
            showPrompts={messages.length === 0 && !draft}
            textareaRef={textareaRef}
            recorder={voiceReady ? recorder : null}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            multiple
            hidden
            onChange={(e) => addPhotos(e.target.files)}
            data-chat-photo-input
          />
          {(loadError || !engineReady) && (
            <p className="px-4 pb-2 text-xs font-mono text-rose-300 flex items-center gap-1.5">
              <AlertTriangle size={14} /> {loadError ?? 'Wybrany silnik AI nie ma klucza — dodaj go w Ustawieniach.'}
            </p>
          )}
        </section>
      </ViewBody>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Historia rozmów" icon={MessagesSquare} tone={section.tone}>
        <ConversationList items={conversations} activeId={activeId} confirmDelete={confirmDelete} onOpen={open} onDelete={remove} />
      </Sheet>
    </>
  );
}

function stepStatus(step: ActivityStep): string {
  switch (step.kind) {
    case 'think':
      return `${APP.assistantName} myśli…`;
    case 'search':
      return `Szukam: ${step.label}`;
    case 'fetch':
      return `Czytam stronę: ${hostname(step.label)}`;
    case 'google':
      return `Google sprawdza: ${step.label}`;
  }
}

function ConversationList({
  items, activeId, confirmDelete, onOpen, onDelete,
}: {
  items: ConversationSummary[];
  activeId: string | null;
  confirmDelete: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!items.length) return <p className="text-sm text-slate-500 p-2">Tu pojawią się Twoje rozmowy.</p>;
  return (
    <ul className="flex flex-col gap-1 min-h-0 overflow-hidden">
      {items.slice(0, 12).map((c) => (
        <li key={c.id} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className={cn(
              'flex-1 min-w-0 min-h-14 px-3 py-2 rounded-xl border text-left',
              c.id === activeId ? 'border-indigo-400/50 bg-indigo-400/10' : 'border-transparent active:bg-white/5',
            )}
          >
            <span className="block text-sm text-slate-100 truncate">{c.title}</span>
            <span className="block text-[11px] font-mono text-slate-500">
              {new Date(c.updatedAt).toLocaleDateString(APP.locale, { day: 'numeric', month: 'short' })} · {timeOf(c.updatedAt)} · {c.messageCount} wiad.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(c.id)}
            aria-label={confirmDelete === c.id ? 'Potwierdź usunięcie rozmowy' : 'Usuń rozmowę'}
            className={cn('h-11 w-11 shrink-0 rounded-lg flex items-center justify-center', confirmDelete === c.id ? 'bg-rose-500 text-white' : 'text-slate-500 active:bg-white/10')}
          >
            <Trash2 size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <>
      <div className="self-center max-w-[90%] bg-amber-500/10 border border-dashed border-amber-400/60 text-amber-300 px-4 py-2 rounded-2xl text-[11px] font-mono text-center">
        Nowa rozmowa · zapisywana na Twoim koncie
      </div>
      <div className="self-start max-w-[92%] sm:max-w-[78%]">
        <MetaRow time={new Date().toISOString()} />
        <div className="px-4 py-3 text-base leading-relaxed bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-none markdown-body">
          <p>
            Cześć! Jestem <strong>{APP.assistantName}</strong>. Zapytaj o cokolwiek — gdy trzeba, sam wyszukam aktualne informacje w sieci i podam źródła.
            Możesz też dołączyć zdjęcie albo nagrać pytanie głosem.
          </p>
        </div>
      </div>
    </>
  );
}

function MetaRow({ time, steps }: { time: string; steps?: ActivityStep[] }) {
  return (
    <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500 flex-wrap">
      <span className="w-5 h-5 rounded-full bg-indigo-400/20 text-indigo-300 flex items-center justify-center">
        <Bot size={12} />
      </span>
      <span className="font-mono">{APP.assistantName} · {timeOf(time)}</span>
      {steps && <ActivityChips steps={steps} />}
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => {
          const safe = safeUrl(href);
          return safe ? (
            <a href={safe} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <>{children}</>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = React.useState(false);
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[92%] sm:max-w-[78%] flex flex-col items-end gap-1.5">
        {Boolean(message.images?.length) && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            {message.images!.map((id) => (
              <img key={id} src={chatImageUrl(id)} alt="Zdjęcie dołączone do wiadomości" className="w-32 h-32 rounded-xl object-cover bg-white/5 border border-cyan-400/25" />
            ))}
          </div>
        )}
        <div className="px-4 py-3 text-base leading-relaxed bg-cyan-400/10 border border-cyan-400/25 rounded-2xl rounded-tr-none whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    );
  }
  const copy = () => {
    navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="self-start max-w-[92%] sm:max-w-[78%]">
      <MetaRow time={message.createdAt} steps={message.steps} />
      <ActivityPanel steps={message.steps} />
      {message.content ? (
        <div className="mt-2 px-4 py-3 text-base leading-relaxed bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-none markdown-body break-words">
          <Markdown text={message.content} />
          {message.status === 'partial' && <p className="text-xs font-mono text-amber-300">(odpowiedź przerwana)</p>}
        </div>
      ) : (
        <div className="px-4 py-3 text-sm font-mono text-rose-300 bg-rose-500/10 border border-rose-400/30 rounded-2xl rounded-tl-none">Brak odpowiedzi.</div>
      )}
      <Sources sources={message.sources} />
      {message.content && (
        <div className="mt-1 flex items-center gap-1">
          <SpeakButton id={`chat-${message.id}`} text={message.content.replace(/[*_#>`|]/g, '')} className="h-10 px-3 text-xs" />
          <button type="button" onClick={copy} className="h-10 px-3 rounded-xl text-xs text-slate-400 flex items-center gap-1.5 active:bg-white/5">
            {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />} {copied ? 'Skopiowano' : 'Kopiuj'}
          </button>
        </div>
      )}
    </div>
  );
}

function DraftView({ draft }: { draft: Draft }) {
  return (
    <div className="self-start max-w-[92%] sm:max-w-[78%]">
      <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500 flex-wrap">
        <span className="w-5 h-5 rounded-full bg-indigo-400/20 text-indigo-300 flex items-center justify-center">
          <Bot size={12} />
        </span>
        <span className="font-mono">{APP.assistantName} · teraz</span>
        <ActivityChips steps={draft.steps} live />
      </div>
      <ActivityPanel steps={draft.steps} live={!draft.content} />
      {draft.content ? (
        <div className="mt-2 px-4 py-3 text-base leading-relaxed bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-none markdown-body break-words">
          <Markdown text={draft.content} />
        </div>
      ) : (
        <div className="mt-2 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-none flex items-center gap-3 min-w-0">
          <span className="flex gap-1 shrink-0">
            {[0, 0.2, 0.4].map((d) => (
              <span key={d} className="w-[7px] h-[7px] bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />
            ))}
          </span>
          <span className="text-[12px] font-mono text-emerald-300/90 truncate">⚡ {draft.status}</span>
        </div>
      )}
      {draft.content && <p className="mt-1 text-[11px] font-mono text-emerald-300/80 truncate">⚡ {draft.status}</p>}
      {draft.error && <p className="mt-2 text-sm text-rose-300 font-mono">{draft.error}</p>}
      <Sources sources={draft.sources} />
    </div>
  );
}

function Sources({ sources }: { sources: SourceLink[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s) => {
        const href = safeUrl(s.url);
        if (!href) return null;
        return (
          <a
            key={s.url}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-2.5 rounded-lg border border-sky-400/25 text-sky-200/90 text-[12px] flex items-center gap-1 max-w-[16rem] truncate active:bg-sky-500/10"
          >
            <Globe size={12} className="shrink-0" /> <span className="truncate">{s.title || hostname(href)}</span>
          </a>
        );
      })}
    </div>
  );
}

function Composer({
  input, setInput, sending, disabled, onSend, onStop, onPrompt, showPrompts, textareaRef, recorder, attachments, uploading, onPickPhoto, onRemovePhoto,
}: {
  attachments: Attachment[];
  uploading: boolean;
  onPickPhoto: () => void;
  onRemovePhoto: (id: string) => void;
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  disabled: boolean;
  onSend: () => void;
  onStop: () => void;
  onPrompt: (p: string) => void;
  showPrompts: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  recorder: ReturnType<typeof useVoiceMessage> | null;
}) {
  // Auto-grow up to ~5 lines.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden';
  }, [input, textareaRef]);

  return (
    <div className="shrink-0 px-3 md:px-5 pt-3 pb-3 border-t border-white/5 bg-gradient-to-t from-black/60 to-transparent">
      {showPrompts && (
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={onPickPhoto}
            disabled={disabled || uploading}
            className="h-11 px-4 rounded-full border border-indigo-400/40 text-indigo-200 bg-indigo-500/10 text-sm whitespace-nowrap font-medium disabled:opacity-40 flex items-center gap-2"
          >
            <Camera size={16} /> Zapytaj o zdjęcie
          </button>
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPrompt(p)}
              disabled={disabled}
              className={cn(
                'h-11 px-4 rounded-full border text-sm whitespace-nowrap font-medium disabled:opacity-40 max-w-full truncate',
                p.startsWith('⚡') ? 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10' : 'border-white/10 text-slate-300 bg-white/5',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {recorder && recorder.state === 'processing' && <p className="mb-2 text-xs font-mono text-sky-200">Gemini słucha nagrania…</p>}
      {recorder && recorder.state === 'error' && <p className="mb-2 text-xs font-mono text-rose-300">{recorder.error}</p>}
      {(attachments.length > 0 || uploading) && (
        <div className="flex gap-2 mb-2 items-center">
          {attachments.map((a) => (
            <div key={a.id} className="relative">
              <img src={a.preview} alt="Dołączone zdjęcie" className="w-16 h-16 rounded-xl object-cover border border-white/10" />
              <button
                type="button"
                onClick={() => onRemovePhoto(a.id)}
                aria-label="Usuń zdjęcie"
                className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-black border border-white/20 text-slate-200 flex items-center justify-center after:absolute after:-inset-1.5 after:content-['']"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {uploading && (
            <span className="w-16 h-16 rounded-xl border border-dashed border-white/20 text-slate-400 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" />
            </span>
          )}
          <span className="text-xs font-mono text-slate-500">{attachments.length}/{MAX_IMAGES} · zdjęcia trafią do asystenta razem z pytaniem</span>
        </div>
      )}
      <div className="flex gap-2 items-end bg-white/5 border border-white/10 rounded-2xl px-3 py-2 focus-within:border-cyan-400/60 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.1)] transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={attachments.length ? 'Dopisz pytanie do zdjęcia (opcjonalnie)…' : 'Napisz, o co chcesz zapytać…'}
          aria-label="Wiadomość do asystenta"
          className="flex-1 bg-transparent outline-none text-base text-white resize-none min-h-12 max-h-[140px] py-3 leading-relaxed placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={onPickPhoto}
          disabled={disabled || uploading || attachments.length >= MAX_IMAGES}
          aria-label="Dodaj zdjęcie"
          className="h-12 w-12 shrink-0 rounded-xl bg-white/5 border border-white/10 text-indigo-200 flex items-center justify-center disabled:opacity-40 active:bg-white/10"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        </button>
        {recorder && <RecordButton recorder={recorder} compact className="h-12 w-12 px-0 shrink-0" />}
        {sending ? (
          <button type="button" onClick={onStop} aria-label="Zatrzymaj" className="h-12 w-12 shrink-0 rounded-xl bg-rose-500/80 text-white flex items-center justify-center">
            <Square size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={(!input.trim() && !attachments.length) || disabled || uploading}
            aria-label="Wyślij"
            className="h-12 w-12 shrink-0 rounded-xl bg-cyan-400 text-black flex items-center justify-center disabled:opacity-40 active:scale-95"
          >
            <Send size={18} />
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] font-mono text-slate-500 text-center">{APP.assistantName} może się mylić · ważne informacje sprawdzaj w źródłach</p>
    </div>
  );
}
