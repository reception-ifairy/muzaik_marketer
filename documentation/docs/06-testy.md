# Testy i sprawdzanie

**Zakres:** automatyczne testy, atrapy, przejście w przeglądarce i to, czego jeszcze nie sprawdzono. **Stan na:** 2026-11-08.

## Automatyczne

```bash
npm run lint           # tsc --noEmit
npm test               # tsx --test test/*.test.ts — takty, finalizeDraft, cleanCopy, mapowanie muzaik.db, bajty audio
npm run test:handbook  # spis ↔ pliki, linki, sekrety, tabele
npm run build
npm run check:session  # na koniec sesji
```

## Atrapy (bez kosztu)

1. `node test/e2e/mock-muzaik.mjs <katalog>` — **syntetyczna** baza muzaik (utwory „Utwór testowy …”, w tym cover i utwór bez tempa), warstwy sceny, premiera, artykuł i ton 60 s w pamięci podcastów. Wypisuje zmienne `MUZAIK_*`.
2. `node test/e2e/mock-claude.mjs 4599` — Anthropic API z celowo złym szkicem (za dużo taktów, Ingredients bez obrazu, dawna nazwa, obcy link, nazwa narzędzia AI w napisie i tagu, własna plansza końcowa) oraz Gemini TTS (ton 300 Hz) na tym samym porcie.
3. Aplikacja z `ANTHROPIC_BASE_URL=http://127.0.0.1:4599`, `GEMINI_BASE_URL=http://127.0.0.1:4599`, dowolnymi `ANTHROPIC_API_KEY` i `GEMINI_API_KEY`, `DB_HOST=` i zmiennymi z punktu 1.
4. `node test/e2e/studio.e2e.mjs <adres> <login> <hasło> <katalog-zrzutów>` — Playwright: logowanie → Centrum → brief (preset, lektor) → projekt → wgranie klipu → montaż → miniatura → kontrola zasad → okno ujęcia → Ustawienia → Profil; brak przewijania strony przy 1480×800, 1480×924, 1280×720; telefon 390×844 bez przewijania w bok; brak błędów konsoli.

## Sprawdzone 2026-11-08

Wszystko powyżej na atrapach: cover odrzucony (400), poprawki `finalizeDraft` widoczne w projekcie, montaż 2 formatów, −14,2 LUFS, plansze z polskimi znakami, lektor słyszalny tylko w swoim ujęciu (pasmo 300 Hz: −11 dB w ujęciu, poniżej −42 dB poza nim), miniatura z klatki ujęcia pod refrenem.

## Czego nie sprawdzono

1. Prawdziwy Gemini TTS (barwa i tempo DJ-a) oraz `thumbnails/set` na kanale.
2. Prawdziwy silnik AI (Claude/GPT/Gemini) na prawdziwych kartach — jakość planów ujęć.
3. Prompty w samym Google Flow.
4. Prawdziwa baza `muzaik.db` (schemat sprawdzony z kodem muzaik.channel, nie z plikiem).
5. AzuraCast z kluczem marketera.
6. OAuth, wysyłka i zwiastun kanału na prawdziwym YouTube.
7. Wdrożenie na serwerze (pm2, nginx, uprawnienia odczytu).
