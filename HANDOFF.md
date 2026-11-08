# HANDOFF — MuzaIK Marketer

Repozytorium: `reception-ifairy/muzaik_marketer` (gałąź `main`). Zasady pracy z kodem: `CLAUDE.md`. Pełna dokumentacja: `documentation/` (w aplikacji: Handbook), historia: `documentation/docs/CHANGELOG.md`.

## Co to jest

Marketing wideo kanału MuzaIK: DJ MuzaIK projektuje zwiastun kanału i materiały (Shorts, premiery, promocje), muzyka prowadzi montaż (cięcie do taktów), klipy z Google Flow wgrywa właścicielka, program montuje 16:9 i 9:16 i wysyła na YouTube jako prywatny. Dane kanału tylko do odczytu z `muzaik.db`.

## Stan na 8 listopada 2026

| Obszar | Stan |
|---|---|
| Studio (brief → plan ujęć → klipy → montaż) | gotowe, sprawdzone na atrapach (muzaik + Claude) i w Playwright |
| Most do muzaik.db, pliki utworów | gotowe; niesprawdzone na prawdziwej bazie |
| YouTube (OAuth, wysyłka prywatna, zwiastun kanału) | gotowe; niesprawdzone na żywo |
| Z modułu AI Studio: profil (placeholdery), presety, lektor, napisy, miniatura, kontrola zasad, warianty | gotowe, sprawdzone na atrapach; lektor i miniatura na YouTube niesprawdzone na żywo |
| Silnik z Parallax Studio (krzywa basu, analiza tempa, renderer klatek) | gotowe, testy syntetyczne + pomiar na atrapie |
| Handbook i dokumentacja | gotowe (`test:handbook`) |
| Wdrożenie na serwerze muzaik (pm2, nginx, subdomena) | do zrobienia |

## Zawsze za zgodą właścicielki

Każda wysyłka na YouTube i ustawienie zwiastuna kanału, każdy płatny obraz (widok Styl). Nigdy: zapis do muzaik.channel, czytanie jego sekretów.

## Otwarte zadania

- [ ] Wdrożenie na serwerze muzaik (subdomena, pm2 `muzaik-marketer`, nginx, prawa odczytu `muzaik.db`).
- [ ] Pierwszy prawdziwy zwiastun: sprawdzić plan DJ-a na prawdziwych kartach i prompty w Google Flow.
- [ ] Plansza końcowa z portretem Twórczyni (decyzja: dozwolony z podpisem).
- [ ] Decyzja: nowe sceny dla materiału przez API generatora Parallax Studio (zamiast kopii płatnego generatora).
- [ ] Konfiguracja profilu kanału ze skryptu (dziś dane wstępne z modułu AI Studio).
- [ ] Decyzje: głos opisu, rola fioletu, sklep w opisach, podglądy kadrów przez API (`documentation/docs/07-decyzje.md`).
