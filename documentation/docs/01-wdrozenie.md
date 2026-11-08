# Wdrożenie

**Zakres:** zmienne środowiskowe, gdzie uruchamiać, katalogi danych, wymagania systemowe. **Stan na:** 2026-11-08.

## Gdzie

Decyzja: na **serwerze muzaik.channel** — aplikacja czyta `muzaik.db`, pliki scen i pamięć podcastów bezpośrednio z dysku. Proponowany adres: osobna subdomena (np. marketer.muzaik.channel) za nginx, proces pm2 `muzaik-marketer`, serwer na `127.0.0.1` (domyślnie). **⚠️ Do sprawdzenia:** subdomena, port i konfiguracja nginx nie są jeszcze ustawione.

## Wymagania

- Node 22 (`node:sqlite` do odczytu bazy), `ffmpeg` i `ffprobe` w PATH.
- `@napi-rs/canvas` (plansze) i `sharp` instalują się z npm.

## Zmienne

| Zmienna | Domyślnie | Opis |
| --- | --- | --- |
| `OWNER_LOGIN`, `OWNER_PASSWORD`, `SESSION_SECRET` | — | Logowanie właścicielki (z szablonu) |
| `MUZAIK_DB_PATH` | `/var/www/muzaik.channel/muzaik.db` | Baza muzaik.channel, otwierana tylko do odczytu |
| `MUZAIK_PUBLIC_DIR` | `/var/www/muzaik.channel/public` | Pliki scen i okładek; gdy pliku nie ma — pobranie z `MUZAIK_SITE_URL` |
| `MUZAIK_SITE_URL` | `https://muzaik.channel` | Strona kanału (zapas dla obrazów, stopka opisu) |
| `MUZAIK_PODCAST_DIR` | `/var/lib/muzaik-podcast` | Pamięć podcastów; pliki `utwory/<id>.mp3` |
| `AZURACAST_BASE_URL`, `AZURACAST_STATION_ID`, `AZURACAST_API_KEY` | `https://radio.t1000.website`, `1`, — | Zapas dla zakładki MuzaIK (klucz tylko do odczytu) |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI` | — | Zapas dla zakładki YouTube |
| `YOUTUBE_CHANNEL_ID` | z `muzaik.db` (`api_youtube_channel_id`) | Jedyny przyjmowany kanał |
| `YOUTUBE_API_BASE`, `YOUTUBE_UPLOAD_BASE` | API Google | Atrapy w testach |

## Dane

`data/` (poza gitem): ustawienia i klucze (`muzaik_marketer-settings.json`, gdy nie ma `DB_*`), `audio/<id>.*` (kopie utworów), `assets/` (pobrane obrazy), `materials/<id>/` (klipy i gotowe MP4, tymczasowe segmenty w `tmp/` kasowane po montażu).

> **Uwaga.** Użytkownik procesu musi mieć prawo **odczytu** `muzaik.db` (i plików `-wal`/`-shm`) oraz katalogów scen. Nie dawaj mu prawa zapisu do katalogu muzaik.channel.

## Aktualizacja

```bash
npm install
npm run lint && npm test && npm run test:handbook && npm run build
pm2 restart muzaik-marketer
```

Restart przerywa trwający montaż (projekt pokaże „Render przerwany” — wystarczy zmontować ponownie).
