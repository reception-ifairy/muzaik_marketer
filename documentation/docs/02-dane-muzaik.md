# Dane z muzaik.channel

**Zakres:** `server/muzaikData.ts`, `server/audio.ts`; co czytamy z `muzaik.db`, jak to mapujemy i czego nie dotykamy. **Stan na:** 2026-11-08.

## Zasada

`muzaik.db` otwierana przez `new DatabaseSync(path, { readOnly: true })`. **Nigdy zapis.** Nie czytamy sekretów (klucze AzuraCast, tokeny YouTube, hasła) — marketer ma własne klucze. Każdy odczyt jest w `read()`: brak tabeli albo stary schemat daje pustą listę i notatkę w Centrum, nie błąd. Wynik w pamięci na 60 s (`?refresh=1` czyta od nowa).

## Tabele

| Tabela / klucz | Co bierzemy | Typ |
| --- | --- | --- |
| `podcast_karty` | `dane_json` (karta utworu, pomiar, dosłuch AI, film YouTube), `status` | `TrackCard` |
| `parallax_sceny` | warstwy (`warstwy_json`), opis i prompty (`info_json`), miniatura | `ParallaxScene` |
| `premiery` | tytuł, data, opis, historia, okładka, link HyperFollow | `Premiere` |
| `artykuly` | tylko `status = 'opublikowany'`: slug, tytuł, dział, streszczenie | `Article` |
| `settings` | `design_bg`, `design_accent_*` (kolory marki), `live_obs_parallax_layers` (scena na wizji), `api_youtube_channel_id` | `BrandKit` |

## Mapowanie kart (`cardFromRow`)

Pola z muzaik (`lib/podcast/muzyka.ts`): `tytul`, `cover`, `bpm`, `refrenStart`, `fragmentStart`, `instrumentalne`, `dlugoscSek`, `pomiar.{ciszaPoczatek, ciszaKoniec, intro, outro, krzywa}`, `muzyka.{tonacja, camelot, energia, tanecznosc, styl, gatunek}`, `youtube.{videoId, tytul, wyswietlenia, publiczny}`. Tekstu piosenki **nie** bierzemy (nie trafia do promptów wideo). Wszystkie teksty przechodzą przez zamianę `LEGACY_NAMES` (DarkaIK, Istrella → MuzaIK).

> **Uwaga.** Rodzaj utworu (`cover`) liczy muzaik.channel (`lib/rodzaj-utworu.ts`). Marketer go tylko czyta: covery nie są pokazywane w Studiu, a `MaterialService.context()` odrzuca je z 400.

## Audio i obrazy

`AudioService.trackFile(id)`: `data/audio/<id>.*` → `<MUZAIK_PODCAST_DIR>/utwory/<id>.mp3` (kopiowany do `data/audio`) → AzuraCast `GET /api/station/<id>/file/<media>/play` z kluczem marketera → błąd z prośbą o wgranie pliku. Wgranie (`PUT /api/muzaik/tracks/:id/audio`) sprawdza bajty magiczne (MP3, WAV, FLAC, OGG, M4A), ≤ 80 MB.

`publicImage(url)`: tylko ścieżki `/media/...`; najpierw `MUZAIK_PUBLIC_DIR`, inaczej pobranie z `MUZAIK_SITE_URL` do `data/assets/<sha>`. Przeglądarka dostaje obrazy przez `GET /api/muzaik/image?url=` (nosniff).
