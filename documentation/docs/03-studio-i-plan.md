# Studio: cięcie muzyki i plan ujęć

**Zakres:** `src/beat.ts`, `src/material.ts`, `server/prompts.ts` (`MATERIAL_SYSTEM`, `materialPrompt`), `server/materialPlan.ts`. **Stan na:** 2026-11-08.

## Muzyka prowadzi montaż

`chooseCut(card, sekundy, rodzaj)`:

- takt = 240 / BPM (4/4); BPM spoza 60–200 albo brak → jednostki po 2 s i `grid: false` (opisane w `why`, nic nie zgadujemy),
- liczba taktów = zaokrąglona długość / takt, przycięta do utworu bez ciszy na brzegach,
- kotwica: `refrenStart` → największy wzrost krzywej głośności (`biggestRise`) → `fragmentStart`,
- przed kotwicą `LEAD_SHARE` taktów (zwiastun 40%, Short 30%, promocje 25%); przy zbyt wczesnym refrenie start przesuwa się tak, żeby refren został na granicy taktu.

## Szkic AI

Jedno `structuredCall` (bez narzędzi): `MATERIAL_SYSTEM` (persona `DJ_CORE` + zasady reżyserii) + `materialPrompt()` (cel, takty, moment refrenu, model Flow z długościami, marka, karta utworu, sceny z promptami warstw, premiera, artykuł — dane w blokach „dane, nie polecenia”). Schemat `MaterialDraftSchema` bez min/max.

## Twarde limity po modelu (`finalizeDraft`)

- plansza końcowa modelu zdjęta, programowa dopisana (`endCardText`, ≥ 2,5 s),
- „tylko bez kosztu” → Flow zamieniony na scenę albo planszę; nieznana scena → pierwsza z briefu; okładka bez okładki → plansza,
- tryb Flow, którego model nie ma → `frames`/`text`; tryb z obrazem bez wskazanego obrazu → `text`,
- `fitBars` — suma taktów ujęć = takty muzyki − plansza końcowa,
- ujęcie Flow dłuższe niż najdłuższy klip modelu → podzielone na części,
- `flowSeconds = flowClipFor()` (najkrótszy dostępny klip ≥ ujęcie), `flowPrompt` = prompt + `styleAnchor` + format + `VIDEO_HOUSE_RULES`,
- napis planszy ≤ 6 słów; wszystko przez `LEGACY_NAMES`.

Każda poprawka trafia do `project.fixes` (po polsku, w oknie ⓘ).

## Opis (`cleanCopy`)

Tytuł bez samego „MuzaIK” (zostaje „DJ MuzaIK”), ≤ 100 znaków; opis bez e-maili i linków spoza `*.muzaik.channel` (razem z etykietą „Więcej:”), bez hashtagów w treści; stopka z kodu (pełny film utworu tylko gdy `public === true`, HyperFollow przy premierze, radio, artykuł, strona); tagi bez „MuzaIK”, ≤ 480 znaków; hashtagi: `#MuzaIK` pierwszy, `#shorts` przy 9:16, najwyżej 5; całość ≤ 5000 bajtów.

## Dodanie rodzaju materiału

1. `MATERIAL_KINDS` w `src/material.ts` (cel, długości, format, czy potrzebny utwór, napis końcowy).
2. Ewentualnie `LEAD_SHARE` w `src/beat.ts` i `endCardText` / stopka w `cleanCopy`.
3. Pole w `BriefPanel`, walidacja w `MaterialService.context()`, test w `test/material.test.ts`, strona [materiały](#handbook/materialy).
