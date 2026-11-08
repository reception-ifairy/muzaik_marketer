# Moduł z Google AI Studio

**Zakres:** analiza paczki „YT Music Teaser — MuzaIK Studio” (Google AI Studio, React + Express + `@google/genai`) i co z niej przeniesiono. **Stan na:** 2026-11-08.

## Co to było

Jednoekranowe „studio reżyserskie”: profil kanału w `localStorage` (+ import/eksport JSON), 10 presetów estetycznych, tryby `analyze / storyboard / shot / thumbnail / publish / variants` na Gemini z promptem „Reżyser zwiastunów MuzaIK”, 5-aktowy storyboard z polami kamery, napisu i lektora, walidator 7 zasad, opcjonalne generowanie obrazów, wideo (Omni Flash) i lektora (TTS) przez API, pobieranie danych kanału z YouTube (API v3 albo RSS/oEmbed). Paczka nie była uruchamiana — tylko czytana.

## Przeniesione

| Z modułu | Tu |
| --- | --- |
| `AESTHETIC_PRESETS` (10) | `src/profile.ts`, wybór w briefie, blok w `materialPrompt`, zapis w `request.preset` |
| `DEFAULT_PROFILE` | `PLACEHOLDER_PROFILE` (`placeholder: true`), doc `channel_profile`, `/api/muzaik/profile`, Ustawienia → Profil, import/eksport JSON |
| Prompt reżysera: muza ≠ twórczyni, fiolet ≤ 15%, akty, maskotki, seria | `materialPrompt` (profil, preset, akty), `purpleRule()` dopisywane do promptów Flow i miniatury |
| Pola ujęcia: kamera, obiektyw, światło, przejście, `overlay_text`, `voiceover_pl` | `ShotDraftSchema`: `camera`, `light`, `transition`, `overlayText`, `voiceover`; kamera i światło w `flowPrompt` |
| Napisy osobną warstwą | `drawOverlay` + `addOverlay` w `server/render.ts` |
| Lektor DJ MuzaIK (TTS) | `MaterialService.voiceovers()` → `synthesizeSpeech(…, DJ_VOICE_STYLE)`, cache `vo/<shot>-<hash>.wav`, miks z `sidechaincompress` |
| Tryb `thumbnail` | `thumbnail.prompt` + `overlayOptions`; `drawThumbnail` (1280×720 JPEG ≤ 2 MB), `POST /api/materials/:id/thumbnail`, `thumbnails/set` przy wysyłce |
| `publish.pinned_comment_pl` | `copy.pinnedComment` (bez linków) |
| Walidator 7 zasad | `selfCheck()` w `server/materialPlan.ts` — 10 punktów, przeliczany po każdej zmianie (`project.checks`) |
| Tryb `variants` | przycisk „Wariant” (brief z tym samym utworem, scenami, presetem i pomysłem) |
| Zakaz nazw narzędzi AI w treściach publicznych | `AI_TOOL_NAMES`: tagi/hashtagi czyszczone, napisy i lektor usuwane, w tytule i opisie — błąd w kontroli |

## Nieprzeniesione i dlaczego

- **Generowanie wideo przez API (Omni Flash)** — decyzja: na razie tylko prompty do Flow.
- **Podglądy kadrów przez API obrazów** — widok Styl już robi płatne obrazy po potwierdzeniu ceny; osobny przycisk przy ujęciu — do decyzji.
- **Pobieranie kanału z YouTube (RSS/oEmbed/API v3)** — muzaik.db ma już filmy utworów (`youtube` w kartach); drugie źródło niepotrzebne.
- **Utwory, kalendarz premier, okładki z profilu** — prawdą jest muzaik.db.
- **Stan w `localStorage`** — projekty i profil są w `SettingsStore`.
- **Sprzeczne dane** — lista `PROFILE_CONFLICTS` (imię, dawna nazwa, linki pod nią, statystyki, covery „is_cleared”, głos opisu, fiolet, sklep).

> **Uwaga.** Wartości profilu są placeholderami do wymiany (prośba właścicielki). Prompt dostaje je z dopiskiem „dane wstępne — kierunek, nie fakty”, dopóki `placeholder` jest `true`.
