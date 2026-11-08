# Miniatura, lektor i kontrola zasad

Te elementy przyszły z modułu „YT Music Teaser” z Google AI Studio. Pomagają dokończyć materiał: wygląd całości, głos DJ-a, miniaturę i sprawdzenie zasad kanału.

**Gdzie:** [Studio](#studio) · **Potrzebne:** do lektora klucz Google (Gemini)

## Preset estetyczny

W briefie wybierasz jeden z 10 presetów (np. „Nostalgia w Nowym Wymiarze”, „Dark Dance Noir”, „Niebo Synthwave”, „Oldschool Kaseta”). Preset to paleta HEX, światło, faktura i lista rzeczy do unikania — DJ trzyma się go w każdym ujęciu. Bez wyboru: zwiastun kanału bierze preset z [profilu kanału](#handbook/profil-kanalu), inne materiały dobiera DJ.

## Lektor DJ MuzaIK

Przełącznik „Lektor DJ MuzaIK” w briefie. DJ dopisze 2–4 krótkie kwestie w spokojniejszych ujęciach. Program skraca każdą do czasu ujęcia (ok. 11 znaków na sekundę). Przy montażu głos powstaje w Gemini TTS (głos z Ustawień → Głos), a muzyka przycisza się pod nim.

> **Koszt.** Lektor to płatne wywołanie Gemini TTS przy montażu (kilka krótkich zdań). Nagrania są zapamiętane — ponowny montaż bez zmian w tekście nie kosztuje drugi raz.

## Napisy na obrazie

Ujęcie może mieć krótki napis (najwyżej 5 słów) — program nakłada go na dole kadru krojem kanału. Edytujesz go w oknie ujęcia; pusty = bez napisu.

## Miniatura

**Opis na YouTube → Miniatura**: wybierz napis (DJ proponuje 3, najwyżej 3 słowa) i tło — klatkę z filmu (ujęcie z obrazem przy refrenie), scenę Parallax albo okładkę premiery. **Zrób miniaturę** daje JPEG 1280×720 — bez kosztu. Przy wysyłce na YouTube możesz ją od razu ustawić.

> **Wskazówka.** Pod spodem jest prompt na własne tło (np. Nano Banana we Flow) — bez tekstu, z miejscem na napis.

## Kontrola zasad

Przycisk z tarczą (np. „9/10”) przy opisie projektu. Program sprawdza po każdej zmianie:

| Zasada | Co znaczy czerwone / żółte |
| --- | --- |
| Bez nazw narzędzi AI | W tytule, opisie, napisach albo lektorze jest np. „Suno”, „Gemini” |
| Bez dawnych nazw i imienia | Pojawiła się dawna nazwa albo imię twórczyni |
| Zakaz tekstu w promptach | Ktoś ręcznie usunął klauzulę z promptu |
| Fiolet tylko jako akcent | Prompt bez reguły fioletu (żółte) |
| Długość ujęć = muzyka | Ujęcia nie składają się w fragment utworu |
| Daty tylko z danych | W tekście jest data, której nie ma w premierze (żółte) |
| Utwór autorski | Cover |
| Linki z listy | Link spoza muzaik.channel i linków zaznaczonych w profilu |
| Tytuł do 60 znaków | Dłuższy tytuł zostanie ucięty w wynikach (żółte) |
| Klipy z Flow | Brakuje klipów (żółte) |

## Przypięty komentarz i warianty

- **Przypięty komentarz** — w „Opis na YouTube → Edytuj”. YouTube nie pozwala go przypiąć z aplikacji: skopiuj go, dodaj i przypnij w YouTube.
- **Wariant** (nagłówek projektu) — otwiera brief z tym samym utworem, scenami, presetem i pomysłem; zmieniasz długość (np. 15 s) albo format (9:16).
