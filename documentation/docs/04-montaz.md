# Montaż (ffmpeg)

**Zakres:** `server/render.ts`, render w tle w `server/materials.ts`. **Stan na:** 2026-11-08.

## Segmenty

Każde ujęcie → `tmp/seg-<format>-NN.mp4` o dokładnej liczbie klatek (`round(sekundy × 30)`, libx264 CRF 18, bez dźwięku):

| Ujęcie | Jak |
| --- | --- |
| Flow z klipem | skalowanie z kadrowaniem; inny kształt (16:9 ↔ 9:16) → rozmyte tło + klip w środku; `tpad` przytrzymuje ostatnią klatkę |
| Flow bez klipu | szara plansza „Ujęcie N — brak klipu z Flow” + ostrzeżenie |
| Parallax | warstwy (sharp → PNG 116% kadru) nakładane `overlay` z przesunięciem `sin`/`cos` × głębia × intensywność sceny |
| Okładka | rozmyte powiększone tło + kwadratowa okładka, powolny `zoompan` |
| Plansza | `drawCard()` (canvas 2× rozmiaru, Audiowide + Rajdhani, gradient marki, poświata), powolny `zoompan` |

Segmenty łączone `concat` (bez ponownego kodowania), potem muzyka: `-ss start -t długość`, `afade` wejście 0,05 s / wyjście 1,5 s, `loudnorm I=-14:TP=-1.5:LRA=11`, AAC 256k, `+faststart`.

## Formaty

Każdy format renderowany osobno (`VIDEO_SIZE`: 1920×1080, 1080×1920) — plansze i sceny są ułożone pod dany kształt. Zmierzone na atrapie: 16 s w dwóch formatach ≈ 40 s pracy, −14,2 LUFS.

## Praca w tle

Jeden montaż naraz (`MaterialService.rendering`); stan w projekcie (`running` z krokiem, `done` z plikami i ostrzeżeniami, `error`). Stan `running` po restarcie procesu jest pokazywany jako błąd „Render przerwany”. ffmpeg uruchamiany przez `nice -n 10`.

> **Nie rób tego.** Nie dodawaj tekstu do promptów wideo „żeby było szybciej” — napisy zawsze z `drawCard()`.
