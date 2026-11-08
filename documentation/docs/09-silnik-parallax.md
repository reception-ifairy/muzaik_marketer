# Silnik z Parallax Studio

**Zakres:** `server/engine/audio.ts`, `server/engine/parallax.ts`, użycie w `server/render.ts` i `MaterialService.analysis()`; źródło `reception-ifairy/parallax-studio`. **Stan na:** 2026-11-08.

## Po co

Parallax Studio (generator scen w panelu muzaik, Live → Sceny → Generator) ma sprawdzony silnik: krzywą basu liczoną offline jak scena na antenie, analizę tempa i dropów oraz renderer klatek. Marketer ruszał scenę prostym przesuwaniem w ffmpeg, bez muzyki, a przy karcie bez BPM ciął na 2-sekundowe kawałki. Teraz scena w materiale porusza się tak samo jak na antenie i w generatorze, a tempo bierze się z pliku, gdy karta go nie ma.

## Przeniesione (bez kosztu, bez kluczy)

| Parallax Studio | Tu | Zmiany |
| --- | --- | --- |
| `audio/decode.ts` | `decodeMono(file, start, seconds)` | Dekodowanie tylko fragmentu utworu |
| `audio/bass.ts` | `BassFollower`, `computeBassCurve`, `lissajous` | Bez zmian (FFT 4096, AGC, obwiednia, stopa z bramką 0,11) |
| `audio/analyze.ts` | `estimateBpm`, `spectral`, `analyzeSamples`, `loudestWindow` | Wynik zawężony do BPM, pewności, dropów i głośności na sekundę |
| `render/motion.ts` | `placeLayer`, `layerRect`, `glowOpacity`, `motionConstants` | Bez kamery, pętli, strefy napisu |
| `render/frame.ts` | `FrameRenderer`, `renderParallaxShot` | Bez wtyczek i pomiaru bohatera; RGBA do ffmpeg per ujęcie |

## Jak tego używamy

- **Render**: przed ujęciami Parallax liczona jest krzywa basu wyciętego fragmentu (30 kl./s). Ujęcie od klatki `round(at × 30)` bierze z niej `bass` i `kick`, dryf liczy się z czasu wideo — ruch jest ciągły między ujęciami. Zmierzone na atrapie (stopa 124 BPM): jasność środka kadru 72–81 YAVG, szczyt ok. 3 klatki po uderzeniu (narastanie obwiedni + opóźnienie kodera MP3); render 19,4 s w dwóch formatach z trzema ujęciami Parallax ≈ 58 s.
- **Cięcie**: gdy karta nie ma BPM albo refrenu, `MaterialService.analysis()` analizuje cały plik raz (cache `data/analysis/<id>.json`). BPM z analizy tylko przy pewności ≥ 0,2 (`MIN_BPM_CONFIDENCE`), kotwica: pierwszy drop ≥ 15 s. Karta zawsze wygrywa — analiza wypełnia tylko luki. `why` mówi, skąd wzięło się tempo.

## Nieprzeniesione i dlaczego

- **Generator scen (brief → prompty v2 → obrazy OpenAI → kontrole → ocena Claude z obrazem)** — płatny, z biblioteką scen, kontrolami pikseli i laboratorium promptów. Działa w panelu muzaik i zapisuje sceny do biblioteki, którą marketer już czyta z `muzaik.db`. Kopia rozjechałaby się z oryginałem przy pierwszej poprawce promptów. **⚠️ Do sprawdzenia** (decyzja właścicielki): zamówienie nowej sceny dla materiału przez API generatora (`127.0.0.1:5178`) zamiast kopii kodu.
- **Wtyczki renderu** (napis, cząstki, widmo, VHS, atmosfera), presety kamery, pętle bez szwu — do decyzji, gdy będą potrzebne w materiałach.

> **Uwaga.** Liczby silnika (pasmo 30–150 Hz, AGC 6 s / 3 s, atak 25 ms, opadanie 280 ms, bramka stopy) muszą być takie same jak w Parallax Studio i na antenie. Poprawka tam = poprawka tu.
