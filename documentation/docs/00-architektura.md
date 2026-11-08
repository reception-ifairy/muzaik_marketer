# Architektura

**Zakres:** skąd wyrosła aplikacja, moduły serwera i klienta, przepływ jednego materiału. **Stan na:** 2026-11-08.

## Skąd

Zbudowana na szablonie `reception-ifairy/template` (Express + Vite + React 19 + Tailwind 4 + TypeScript, logowanie właścicielki, ustawienia AI z szyfrowanymi kluczami, rozmowa, badanie, głos Gemini, obrazy). Z `reception-ifairy/vizai_marketer` przeniesione tylko samodzielne części: katalog Google Flow (`src/flow.ts`), Handbook (`server/handbook.ts`, `src/components/HandbookView.tsx`, test, `check:session`) i wzór OAuth/wysyłki YouTube (`server/youtube.ts`, zredukowany). Reszta VizAI (piny, Shopify, kampanie) jest związana z danymi sklepu i celowo nie została przeniesiona.

## Moduły

| Plik | Rola |
| --- | --- |
| `src/muzaik.ts` | Typy danych z muzaik.channel (karta utworu, scena, premiera, artykuł, marka) |
| `src/material.ts` | Rodzaje materiałów, formaty, schemat szkicu AI (`MaterialDraftSchema`), projekt (`MaterialProject`) |
| `src/beat.ts` | Siatka taktów: `chooseCut`, `fitBars`, `endCardBars` (czyste, testy) |
| `src/flow.ts` | `FLOW_MODELS`, `FLOW_CHECKED`, `flowClipFor`, `VIDEO_HOUSE_RULES` |
| `server/muzaikData.ts` | Most do `muzaik.db` tylko do odczytu |
| `server/audio.ts` | Pliki utworów (własne, pamięć podcastów, AzuraCast) i obrazy muzaik.channel |
| `server/materialPlan.ts` | `finalizeDraft` i `cleanCopy` — twarde limity po modelu (czyste, testy) |
| `server/materials.ts` | `/api/materials` i `/api/muzaik`: projekt, klipy, render w tle, eksport .md |
| `server/render.ts` | Montaż ffmpeg i plansze (`@napi-rs/canvas`, kroje OFL w `server/fonts/`) |
| `server/youtube.ts` | OAuth tylko kanału MuzaIK, wysyłka prywatna, zwiastun kanału |
| `server/prompts.ts` | `DJ_CORE`, `MATERIAL_SYSTEM`, `materialPrompt()`, `CHAT_SYSTEM`, `RESEARCH_SYSTEM` |
| `src/components/studio/` | `StudioView`, `BriefPanel`, `ProjectView` |
| `src/components/Dashboard.tsx` | Centrum |
| `src/components/settings/MuzaikTab.tsx` | Zakładki MuzaIK (AzuraCast) i YouTube |

## Przepływ materiału

1. `BriefPanel` → `POST /api/materials/design` (SSE).
2. `MaterialService.context()` sprawdza utwór (cover → 400), premierę, artykuł, sceny; `chooseCut()` wycina fragment do taktów.
3. `structuredCall(engine, MaterialDraftSchema, MATERIAL_SYSTEM + materialPrompt())` — jedno zapytanie bez narzędzi.
4. `finalizeDraft()` — takty, długości i tryby Flow, dostępne obrazy, plansza końcowa programu, `cleanCopy()`.
5. Zapis dokumentów `materials` (indeks) i `material_<id>` w `SettingsStore`.
6. Właścicielka wgrywa klipy (`PUT /api/materials/:id/shots/:shot/clip`).
7. `POST /api/materials/:id/render` uruchamia `renderProject()` w tle; klient odpytuje `GET /api/materials/:id` co 2 s.
8. `POST /api/youtube/publish/:id` (potwierdzenie + odpowiedź „dla dzieci”) → wysyłka prywatna, opcjonalnie zwiastun kanału.
