# YouTube: wysyłka i zwiastun kanału

**Zakres:** `server/youtube.ts`, panel „YouTube” w `ProjectView`, zakładka Ustawienia → YouTube. **Stan na:** 2026-11-08.

## Połączenie

Klient OAuth właścicielki (doc `youtube_auth`, zaszyfrowany; zapas `YOUTUBE_CLIENT_*`). Zakresy: `youtube.upload`, `youtube.force-ssl`. Przyjmowany kanał: `YOUTUBE_CHANNEL_ID` albo `api_youtube_channel_id` z `muzaik.db`; inny kanał → cofnięcie tokenu i komunikat. Trasy: `/api/youtube/{status,client,connect,callback,disconnect}`.

## Wysyłka

`POST /api/youtube/publish/:id` wymaga `confirm: true`, odpowiedzi `madeForKids` (bez domyślnej) i pliku z bieżącego renderu. Przed każdym zapisem `writeToken()` sprawdza, że token należy do kanału MuzaIK. Wysyłka wznawialna kawałkami 16 MB z ponowieniami, zawsze `privacyStatus: 'private'`, kategoria 10 (Muzyka), `defaultLanguage: 'pl'`. Wynik w `project.published`.

## Zwiastun kanału

`setChannelTrailer(videoId)`: świeży `channels.list part=brandingSettings`, zmiana tylko `channel.unsubscribedTrailer`, `channels.update` z całym obiektem — YouTube kasuje pominięte pola `brandingSettings` (to samo ostrzeżenie co w muzaik `lib/yt-kanal/kanal.ts`). Błąd zwiastuna nie cofa wysyłki — wraca jako `trailerError`.

> **⚠️ Do sprawdzenia.** Wysyłka i zwiastun nie były jeszcze uruchomione na prawdziwym kanale. Nie wiadomo, czy YouTube przyjmie prywatny film jako zwiastun.
