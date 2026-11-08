# CLAUDE.md — MuzaIK Marketer (built on the AI app template)

**This project:** "MuzaIK Marketer" — DJ MuzaIK as video director for the MuzaIK music channel (muzaik.channel). First the channel trailer, then marketing videos (Shorts, premiere teasers, radio / Szkoła gatunków / Magazyn promos, track of the day). Music leads the edit: the code cuts the track to whole bars (BPM from the track card), the AI plans shots on that grid (Google Flow prompts + free rendered shots: animated Parallax scenes, covers, text cards), the owner generates Flow clips and uploads them, ffmpeg renders 16:9 + 9:16, YouTube upload is private and owner-clicked. State: `HANDOFF.md`. Docs: `documentation/` (Handbook view; read `docs/00-architektura.md` and `docs/07-decyzje.md` before larger changes; every change = handbook + docs page + `docs/CHANGELOG.md` + `handbook/co-nowego.md`).

### Project rules (on top of the template rules below)

- **muzaik.channel is read-only**: `server/muzaikData.ts` opens `muzaik.db` with `readOnly: true`; never write there, never read its secrets (AzuraCast/YouTube keys) — the marketer has its own.
- **Only authored tracks** in materials (Content ID): covers are hidden in the UI and refused by `MaterialService.context()`.
- **Channel copy rules** (`cleanCopy`): never „DarkaIK”/„Istrella” (`LEGACY_NAMES`), YouTube copy in the creator's voice (first person, feminine), no bare „MuzaIK” in titles (keep „DJ MuzaIK”, muzaik.channel, #MuzaIK), links only to *.muzaik.channel, no names of other artists, no listener/view counts.
- **Hard limits by code, never the model**: bar grid (`src/beat.ts`), Flow clip lengths/modes (`FLOW_MODELS` in `src/flow.ts` with `FLOW_CHECKED`), end card text, footer, hashtags (`server/materialPlan.ts`).
- **Text in video is drawn by code** (`drawCard`, Audiowide/Rajdhani OFL in `server/fonts/`), never by a video model; Flow prompts end with `VIDEO_HOUSE_RULES`.
- **Channel profile values are placeholders** until the owner confirms them (`placeholder: true`); the prompt marks them as direction, not facts. Never take tracks/dates from the profile — muzaik.db is the source. `selfCheck()` (10 rules) runs after every change; keep it in sync when adding rules.
- **YouTube writes** only on the owner's click, always `private`, made-for-kids answered explicitly, token channel checked before each write.
- Commands added: `npm test` (tsx --test test/*.test.ts), `npm run test:handbook`, `npm run check:session`; mocks and the Playwright walk-through in `test/e2e/` (see `documentation/docs/06-testy.md`).

---

Template base — starter for single-owner AI web apps: Express + Vite + React 19 + Tailwind 4 + TypeScript, owner login, multi-provider AI settings (Claude / GPT / Gemini) with encrypted keys, live web research with an activity timeline, chat with history, Gemini voice, image models (OpenAI / Gemini / Replicate FLUX / Stability) with an option window of thumbnails, and a one-click Windows installer (`start.ps1`). Extracted from M9 Cartwise (`reception-ifairy/blackfriday`), which shows the same patterns in a full product.

When this repo is a **new project made from the template**, first read `HANDOFF.md` (project state) and `src/config.ts` (app identity). If `HANDOFF.md` still has the template placeholders, ask the owner what the project is before building features.

## Commands

```bash
npm install
npm run dev        # Express + Vite middleware (HMR) on http://localhost:3000
npm run build      # Vite build to dist/
npm start          # serves dist/ (tsx server.ts --production)
npm run lint       # tsc --noEmit — the only automated check; must pass before committing
```

Windows end-user entry point: `start.ps1` (or double-click `start.cmd`). See README.

## Architecture

```
src/config.ts           APP identity: name, tagline, assistantName, id (storage prefix), locale, timezone, web-search location. Edit first in a new project.
server.ts               Express app: auth gate, routers, the example /api/research (SSE), Vite/dist serving, Polish body-parser errors
server/auth.ts          Owner login: HMAC-signed httpOnly cookie, /api/auth/{me,login,logout}, lockout; env OWNER_LOGIN/OWNER_PASSWORD/SESSION_SECRET
server/research.ts      Provider-neutral research: ResearchLog (searches/pages/sources/activity), extractLastJson, structured-output fallback via engine.structure(), structuredCall()
server/engines/         anthropic.ts (via claudeLoop), openai.ts (Responses API web_search), google.ts (Google Search + URL context)
server/claudeLoop.ts    Shared Claude agent loop: web_search/web_fetch + client tools (ClientTool with Zod schema; google_search via Gemini when a Google key exists), pause_turn, eager input streaming, thinking/text hooks
server/verify.ts        Google cross-check (Gemini + googleSearch) offered to Claude as google_search; untrusted() fences external text
server/activity.ts      Activity timeline ("Co robi asystent"): think/search/fetch/google steps, emitted whole by id (thinking throttled)
server/chat.ts          /api/chat: conversations (list/get/rename/delete), photo upload, streamed reply (SSE ChatEvent) for all three providers, saved in finally
server/chatImages.ts    Photos attached in chat: magic-byte check (JPEG/PNG/WebP only, ≤6 MB), data/uploads/<uuid>, served with nosniff + CSP
server/providers.ts     Keys (store -> env fallback), key test = list models (free), prefs normalisation, resolveEngine(), googleVerifier()
server/store.ts         SettingsStore: MariaDB (<APP.id>_api_keys, _settings, _conversations, _messages) when DB_* set, else data/<APP.id>-settings.json
server/secrets.ts       AES-256-GCM for stored keys (SETTINGS_SECRET, fallback derived from SESSION_SECRET)
server/voice.ts         Gemini TTS (WAV) and voice-message understanding (WAV in -> { transcript, query })
server/settingsRoutes.ts /api/settings (keys write-only, prefs) and /api/voice (tts, transcribe)
server/errors.ts        Provider error -> Polish message; provider 401 is mapped to 400
server/prompts.ts       All prompts (Polish): RESEARCH_SYSTEM, researchPrompt(), CHAT_SYSTEM, shared DATA_RULES; optionSetPrompt(), samplePrompt()
server/images/          generate.ts (text-to-image adapters: OpenAI Images, Gemini generateContent, Replicate predictions, Stability v2beta — every call PAID), detect.ts (Replicate/Stability key test + model detection), http.ts (base URLs, ProviderHttpError)
server/options.ts       Option sets (/api/options): starter set (read-only), AI proposal via structuredCall, save/delete/active, paid thumbnail run (estimate -> confirmedUsd must match -> SSE), sample files in data/options/<set>/<group>/<code>.webp
src/schema.ts           Zod schemas shared by server (validation, structured outputs) and client (types) — example: ResearchResultSchema
src/types.ts            Request/response/meta types, SSE event union (ProgressEvent/StreamEvent), ActivityStep, OwnerUser
src/aiSettings.ts       Providers (text: Provider; keys: KeyProvider adds replicate/stability), prefs (engine, effort, voice, stt, image), defaults, voices
src/imageModels.ts      Image model catalogue (from Kuźnia inspiracji): provider model id, group, USD price (per size tier for Gemini), speed, Polish note, sizing; formatUsd, imagePrice
src/options.ts          Option-set schema, GROUP_ICONS/GROUP_TONES, optionsClause/composeImagePrompt, IMAGE_HOUSE_RULES, API types; src/data/starterOptions.json = Kuźnia's 9 groups (samples in public/options/starter/)
src/chat.ts             Chat message/conversation/event types
src/lib/api.ts          Client SSE reader (POST + text/event-stream); 401 -> notifySessionExpired()
src/lib/aiSettingsContext.tsx  React context over /api/settings (engineReady, voiceReady, save/test/delete key, savePrefs)
src/lib/sections.ts     View list: id, label, subtitle, lucide icon, colour Tone. Rail, phone bar, headers read it.
src/lib/useHashView.ts  Current view in the URL hash; each navigation pushes history (Android back works)
src/lib/speech.ts / useVoiceMessage.ts  Shared TTS player; recorder -> 16 kHz WAV -> /api/voice/transcribe
src/lib/settings.ts     localStorage helpers (per-device conveniences only) — every access wrapped in try/catch
src/App.tsx             Login gate -> locked single-screen shell: NavRail + views (#pulpit #studio #rozmowa #badanie #styl #handbook); views stay mounted (hidden) so running work survives
src/profile.ts          Channel profile (placeholders from the owner's AI Studio module until configured; PROFILE_CONFLICTS = what was not taken over) and 10 aesthetic presets
src/muzaik.ts / src/material.ts / src/beat.ts / src/flow.ts   MuzaIK data types; material kinds, AI draft schema, project; bar grid (chooseCut, fitBars); Google Flow catalogue
server/muzaikData.ts    Read-only bridge to muzaik.db (track cards, Parallax scenes, premieres, published articles, brand colours)
server/audio.ts         Track audio (own copy → muzaik podcast cache → AzuraCast with the marketer's own key → upload) and muzaik public images
server/materialPlan.ts  finalizeDraft (bars, Flow lengths/modes, available pictures, end card) and cleanCopy (channel copy rules) — pure, tested
server/materials.ts     /api/materials (design SSE, edit, clips, background render, files, export.md) and /api/muzaik
server/render.ts        ffmpeg edit: per-shot segments (Flow clip / Parallax / cover / card), concat, music −14 LUFS, both formats natively
server/youtube.ts       OAuth for the MuzaIK channel only, private resumable upload, set channel trailer (brandingSettings re-read)
server/handbook.ts      /api/handbook (documentation/ read from disk)
src/components/studio/  StudioView (brief | project), BriefPanel, ProjectView (timeline, shots Pager, copy, render, publish)
src/components/shell/   NavRail (icon rail, expands over content; bottom bar on phones), ViewHeader/ViewBody/HeaderButton
src/components/ui/      Pager (paged grid + swipe, never scrolls), Sheet (modal details, Esc/backdrop), Clamp (cut text + "read all")
src/components/options/ OptionWindow (native <dialog>, 4×4 thumbnails, pages, ‹ › groups, ⤢ zoom + "Wybierz"), OptionVisual (sample / palette / composition diagram / icon), BuildOptionsSheet (AI proposal -> review -> save), SamplesSheet (cost -> "Twórz · $x" -> live progress)
src/components/         Dashboard, ResearchView (example feature), ChatView, StyleView (option window example), LiveActivity/ActivityTimeline, SettingsModal (+ settings/ImagesTab), LoginScreen, voice/
start.ps1 / start.cmd   Windows installer/launcher
```

Data flow of the example feature: `ResearchView` -> `streamRequest('/api/research')` -> `runResearch(engine, …)` -> the engine streams searches/pages/thinking (forwarded as `activity` events, shown by `LiveActivity`) -> final text ends with JSON -> validated with Zod; if invalid, `engine.structure()` makes a tool-less structured-output call -> `result` event.

## Adding a feature (the recipe)

1. **Schema** in `src/schema.ts` (Zod; types, enums, `.nullable()`, `.describe()` — no min/max/length, structured outputs reject them). Export the inferred type via `src/types.ts`.
2. **Prompt** in `server/prompts.ts`. Reuse `DATA_RULES`. End-of-answer JSON is added by `runResearch`.
3. **Route** in `server.ts` (or its own `server/<feature>Routes.ts` for more than one endpoint): validate input, `providers.resolveEngine()`, `openEventStream`, `runResearch(...)` (web) or `structuredCall(...)` (no web), post-filter anything that must be exact (never trust the model for hard limits), send `result`.
4. **View**: add the id to `ViewId` and an entry to `SECTIONS` in `src/lib/sections.ts`, a component in `src/components/`, and a `<ViewSlot>` in `src/App.tsx`. Follow `ResearchView`: form -> `streamRequest` -> `LiveActivity` while running -> result panels with `Pager`/`Clamp`/`Sheet`.
5. Persist per-owner data through `SettingsStore` (`getDoc/saveDoc` for JSON documents; add tables/methods for real records), not localStorage.
6. `npm run lint`, `npm run build`, then the checks in "Testing" below.

## Rules that matter

- **No invented data.** Facts, numbers and URLs come only from web results or the owner. Prompts say "null when unknown". Never add hardcoded "example" data or a fallback generator that looks real.
- **UI copy is Polish** (owner's language). Code, comments, commit messages are English.
- **HTTP 401 means "owner session expired"** — the client logs out on it. Use 400/403 for everything else (a missing or invalid AI key is 400).
- **Every `/api/*` route except `/api/auth/*` is behind `requireOwner`.**
- **Links from model output** are rendered only through `safeUrl()` (http/https only). External text given to a model as tool output goes through `untrusted()`.
- **Server binds to `127.0.0.1`** by default (`HOST` env overrides). Keep it local-first.
- **Keys never reach the browser**: responses carry only a hint (`sk-…a1b2`).
- **Every paid image call waits for the owner.** Show the cost first (`imagePrice`/estimate) and start only on a button that names it; the thumbnail route refuses to run unless `confirmedUsd` equals the current estimate. Never generate images in the background, on page load or in tests against real keys.
- **Image prompts** always end with `IMAGE_HOUSE_RULES` (no text/logos, no franchise characters, no real people; masters only public domain, died 1955 or earlier).
- **`start.ps1` must stay UTF-8 with BOM + CRLF** (Windows PowerShell 5.1 reads BOM-less files as ANSI and breaks Polish text). `.gitattributes` enforces CRLF. When editing it from Python, open with `encoding='utf-8-sig', newline=''`. Write `.env` as UTF-8 *without* BOM (dotenv would read the BOM into the first key). Keep it PowerShell 5.1-compatible: no `??`, no ternary, no `-AsPlainText`.

## AI providers

- The owner picks one **engine** in Settings (Claude / GPT / Gemini) plus its model from a list fetched with the key, and an effort (`low|medium|high`). Voice (TTS) and voice messages always use **Google Gemini**.
- Keys are saved via `PUT /api/settings/keys/:provider`, encrypted, then immediately tested by listing models. Env keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) are a fallback.
- Claude gets an extra client tool `google_search` (Gemini grounded search) whenever a Google key exists; results come back fenced by `untrusted()`. Max 4 calls per answer.
- Every engine gets the same prompt ending with the JSON schema; its final text is parsed with `extractLastJson`, and if that fails `engine.structure()` makes a tool-less structured-output call. Results are always validated with Zod.
- OpenAI: Responses API, `{type: 'web_search'}` with `user_location` from `APP.userLocation`, `include: ['web_search_call.action.sources']`; `reasoning.effort` only for gpt-5/6/o-models. Gemini: `googleSearch` + `urlContext` tools; on Gemini 3+/4 the same call also sets `responseJsonSchema`. Gemini grounding URLs are Google redirect links.
- Mock base URLs for tests: `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GEMINI_BASE_URL`.

## Image models and the option window

- Catalogue in `src/imageModels.ts` is the source of truth for prices and notes (providers don't publish them via API). Key test ("Katalog + wykrywanie"): OpenAI/Google model lists (image ids get `kind: 'image'`), Replicate `GET /v1/account` + `GET /v1/models/{owner}/{name}` per catalogue model + the `text-to-image` collection, Stability `GET /v1/user/account` + `/v1/user/balance`. Image models a key reaches that the catalogue lacks show in Settings → Obrazy as "nowy — bez ceny"; to use one, add it with a price to the catalogue.
- `providers.resolveImageModel(id)` returns the model + key or a Polish reason (disabled, no key, key can't see it). Prefs: `image.defaultModel`, `image.sampleModel` (thumbnails, default FLUX Schnell $0.003), `image.disabled`.
- Option sets live in the `option_sets` doc (`{activeId, sets}`); the starter set is never stored or changed. A proposal is one `structuredCall` with a regex-free schema, then `sanitizeProposal` fixes slugs, tones (unique), palette colours (hex, max one palette group) and caps (9 groups × 16 options). Saved sets never take sample URLs from the client.
- Thumbnails: `samplePrompt(motif, promptLabel, option.prompt)` — the option first, then the shared motif, then house rules; 1:1, cheapest tier, resized with sharp to 256 px WebP. One run per set at a time; key/billing errors (400/401/402/403/404/429) stop the run.
- Option window behaviour (from Kuźnia): 16 per page with "Brak" first, ← → keys and swipe for pages, ‹ › for groups, tap chooses and closes, Esc/✕/backdrop close, ⤢ zoom with ‹ › and "Wybierz". Width `min(94vw, 60rem, 100dvh − 21rem)` so 4 rows always fit.
- Mock base URLs: `OPENAI_BASE_URL`, `GEMINI_BASE_URL`, `REPLICATE_BASE_URL`, `STABILITY_BASE_URL`.

## Claude API usage (server/claudeLoop.ts, server/engines/anthropic.ts)

- `@anthropic-ai/sdk` 1.x; it sends the key as `Authorization: Bearer` (not `x-api-key`) — matters when mocking.
- Default model `claude-opus-5-5` (override with `ANTHROPIC_MODEL` or in Settings). Thinking is always on for this model (`thinking: {type: 'adaptive'}`, `display: 'summarized'` feeds the timeline); depth via `output_config.effort`. Do not send `thinking: {type: "disabled"}`, `budget_tokens`, `temperature`, or forced `tool_choice` — they 400 on this model.
- Tools: `web_search_20260209` (with `user_location`) and `web_fetch_20260209`. Do not add a separate `code_execution` tool. Client tools set `eager_input_streaming: true` and are validated with Zod before running.
- Uses `client.beta.messages.stream` with `betas: ['server-side-fallback-2026-07-01']` and `fallbacks: 'default'` (server-side refusal fallback). Checks `stop_reason === 'refusal'` before using output.
- `pause_turn`: the assistant content is pushed back and the call repeated (max 12 turns incl. client tool rounds).
- Structured outputs (`output_config.format`) only in the second, tool-less call.

## Testing without spending API credit

There is no test suite. Verify changes with:
1. `npm run lint` and `npm run build`.
2. A local mock of the providers (`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GEMINI_BASE_URL`, `REPLICATE_BASE_URL`, `STABILITY_BASE_URL`): for Claude `GET /v1/models` + `POST /v1/messages` (streamed SSE when `stream: true`, plain JSON for `messages.parse`); image endpoints as listed above (return small PNGs made with sharp; Gemini's model list uses `supportedGenerationMethods`). Run with `DB_HOST=` empty so test keys go to the file store.
3. Playwright against the running app (Chromium is preinstalled in cloud sessions): login -> dashboard -> research -> chat -> settings -> logout, at 1480×800 (no page scroll, no horizontal overflow) and 390×844.
   Voice messages can be tested in Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
4. For `start.ps1`: parse with `[System.Management.Automation.Language.Parser]::ParseFile` and run it under PowerShell 7 in a pseudo-terminal on a clean copy (no `node_modules`, `dist`, `.env`).

## UI rules (tablet-first)

- Target device: Galaxy Tab S11 Ultra, landscape, Chrome tab — about **1480×800 CSS px**. Also check 1480×924 and 1280×720.
- **The page never scrolls** from `md` up (`html, body { overflow: hidden }`). Every view must fit; lists go through `Pager` (pages + swipe), long model text through `Clamp` + `Sheet`. Only a `Sheet` body may scroll, as a last resort. On phones (< `md`) `ViewBody` scrolls. The chat transcript (`[data-chat-scroll]`) scrolls internally, like any messenger.
- Touch targets ≥ 44px (main actions 48–56px), body text ≥ 14px, no hover-only information.
- Black background, per-section colour (`Tone`) from `src/lib/sections.ts`, **no decorative images** (icons from lucide only; option thumbnails are content, not decoration). Option groups use `--tone` with `.tone-circle` / `.option-window` / `.option-thumb` from `src/index.css`. Fonts: Inter (text), Space Grotesk (headings, `font-display`), JetBrains Mono (metadata). Shared classes in `src/index.css`: `.panel`, `.field`, `.field-label`, `.markdown-body`.
- Chat look: bubbles, mono metadata row, live step chips, source chips (from CannaTinker).
