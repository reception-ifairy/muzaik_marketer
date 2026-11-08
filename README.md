# Szablon aplikacji AI

Gotowy punkt startowy dla kolejnych projektów: struktura, styl i ustawienia AI wyjęte z **M9 Cartwise** (`reception-ifairy/blackfriday`), bez części zakupowej.

## Co jest w środku

- **Logowanie właściciela** — aplikacja i jej API działają dopiero po zalogowaniu (sesja 7 dni, blokada po 5 złych próbach).
- **Ustawienia AI** — wybór silnika (Claude / GPT / Gemini), model z listy pobranej kluczem, dokładność (effort). Klucze zapisywane na serwerze, zaszyfrowane (AES-256), z testem jednym kliknięciem; przeglądarka widzi tylko ich końcówkę.
- **Badanie** (moduł przykładowy) — asystent przeszukuje sieć, czyta strony i zwraca uporządkowany wynik: wniosek, najważniejsze punkty, fakty z linkami, źródła i poziom pewności. Na żywo widać, co robi („Co robi asystent”).
- **Rozmowa** — czat z historią, wyszukiwaniem w sieci, źródłami, zdjęciami i Markdown; działa z każdym z trzech silników.
- **Modele obrazów** (Ustawienia → Obrazy) — katalog 14 modeli z Kuźni inspiracji (OpenAI GPT Image, Google Gemini Image, FLUX przez Replicate, Stability AI) z ceną, szybkością i opisem. Po wpisaniu klucza aplikacja sprawdza, które modele są dla niego dostępne, i pokazuje nowe modele dostawcy, których katalog jeszcze nie zna („nowy — bez ceny”). Modele można włączać i wyłączać, wybrać domyślny i model miniaturek (domyślnie FLUX Schnell, $0,003).
- **Styl — okno opcji z miniaturkami** (z Kuźni) — kółka grup otwierają okno na środku ekranu: 16 dużych miniaturek na stronę, strony strzałkami lub przesunięciem palca, ‹ › do sąsiedniej grupy, ⤢ powiększenie z „Wybierz”. Na start zestaw z Kuźni (9 grup, 137 miniaturek). **Zbuduj dla projektu**: opisujesz projekt, AI proponuje grupy i opcje, zatwierdzasz, a miniaturki tworzy model obrazów — zawsze po pokazaniu kosztu i Twoim potwierdzeniu.
- **Głos** (Google Gemini) — czytanie odpowiedzi na głos i wiadomości głosowe zamiast pisania.
- **Styl tablet-first** — czarne tło, kolor każdej sekcji, pasek ikon z lewej (na telefonie u dołu), strona nigdy się nie przewija: listy dzielą się na strony (przesunięcie palcem), długie teksty otwierają się w oknie.
- **Instalator Windows** — `start.cmd` / `start.ps1`: instalacja, pytanie o login i hasło, start i otwarcie przeglądarki.
- **Dokumenty dla Claude Code** — `CLAUDE.md` (architektura, zasady, przepis na nową funkcję, testy bez wydawania pieniędzy na API) i `HANDOFF.md` (szkielet dokumentu przekazania).

## Nowy projekt z szablonu

1. Na GitHubie: **Use this template → Create a new repository** (przycisk pojawia się, gdy w *Settings* tego repozytorium zaznaczone jest **Template repository**), albo po prostu skopiuj repozytorium.
2. W `src/config.ts` ustaw nazwę aplikacji, nazwę asystenta, krótkie `id` (prefiks tabel i pliku ustawień), język i lokalizację. Zmień też `<title>` w `index.html` i `name` w `package.json`.
3. Wypełnij `HANDOFF.md` (co to za projekt) — Claude Code przeczyta go na starcie.
4. Dodaj własne funkcje według przepisu w `CLAUDE.md` → „Adding a feature”. Moduł „Badanie” może zostać jako wzór albo zostać zastąpiony.

Najprościej poprosić Claude Code: *„To nowy projekt z szablonu. Aplikacja ma robić …; ustaw config, wypełnij HANDOFF i dodaj pierwszą funkcję.”*

## Uruchomienie na Windows (PowerShell)

1. Zainstaluj **Node.js 20 lub nowszy** (jednorazowo): `winget install OpenJS.NodeJS.LTS`, potem otwórz PowerShell ponownie.
2. W folderze projektu uruchom `.\start.ps1` albo kliknij dwukrotnie **`start.cmd`**.

Przy pierwszym uruchomieniu skrypt zainstaluje zależności, zapyta o klucz Anthropic API (można pominąć — klucze dodasz w aplikacji), o login i hasło do logowania, zbuduje aplikację i otworzy przeglądarkę pod adresem http://localhost:3000. Zatrzymanie: **Ctrl+C**.

| Polecenie | Co robi |
|---|---|
| `.\start.ps1 -Port 3001` | inny port, gdy 3000 jest zajęty |
| `.\start.ps1 -SetKey` | zmiana klucza Anthropic w `.env` |
| `.\start.ps1 -SetPassword` | zmiana hasła do logowania |
| `.\start.ps1 -NoBrowser` | bez automatycznego otwierania przeglądarki |
| `.\start.ps1 -Reinstall` | ponowna instalacja zależności |
| `.\start.ps1 -Dev` | tryb deweloperski (zmiany w kodzie widoczne od razu) |

Aplikacja działa tylko na tym komputerze (nasłuchuje na 127.0.0.1).

## Uruchomienie ręczne (macOS / Linux / Windows)

```bash
npm install
cp .env.example .env         # ustaw OWNER_LOGIN, OWNER_PASSWORD i SESSION_SECRET
npm run dev                  # tryb deweloperski: http://localhost:3000
npm run build && npm start   # wersja zbudowana
npm run lint                 # sprawdzenie typów
```

Klucze API: Anthropic — console.anthropic.com, OpenAI — platform.openai.com, Google (Gemini, także głos) — aistudio.google.com, Replicate (FLUX) — replicate.com → API tokens, Stability AI — platform.stability.ai. Każde zapytanie zużywa środki na koncie wybranego dostawcy; obrazy powstają tylko po potwierdzeniu kosztu.

## Mapa plików

| Gdzie | Co |
|---|---|
| `src/config.ts` | tożsamość aplikacji — pierwszy plik do zmiany |
| `server.ts`, `server/` | serwer: logowanie, ustawienia AI, silniki, badanie, rozmowa, głos, zapis danych |
| `server/prompts.ts` | wszystkie prompty (po polsku) |
| `src/schema.ts` | schematy wyników AI (Zod) |
| `src/lib/sections.ts` | lista widoków: nazwa, ikona, kolor |
| `src/imageModels.ts` | katalog modeli obrazów: ceny, opisy, rozmiary |
| `src/options.ts`, `src/data/starterOptions.json`, `public/options/starter/` | zestawy opcji i miniaturki zestawu startowego |
| `server/images/`, `server/options.ts` | adaptery dostawców obrazów, wykrywanie modeli, zestawy opcji i płatne miniaturki |
| `src/components/options/` | okno opcji, powiększenie, kreator zestawu AI, tworzenie miniaturek |
| `src/components/` | widoki i komponenty; `shell/` (nawigacja), `ui/` (Pager, Sheet, Clamp), `voice/`, `settings/` |
| `src/index.css` | motyw, czcionki, wspólne klasy |
| `start.ps1`, `start.cmd` | instalator Windows |
