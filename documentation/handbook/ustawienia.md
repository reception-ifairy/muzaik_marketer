# Ustawienia: AI, MuzaIK i YouTube

Ustawienia otwierasz ikoną zębatki w pasku po lewej. Klucze są szyfrowane i nigdy nie wracają do przeglądarki — widzisz tylko ich końcówkę.

**Gdzie:** pasek boczny → Ustawienia · **Potrzebne:** klucze, które chcesz dodać

## Silnik AI i klucze API

**Silnik AI** — kto projektuje plan ujęć i odpowiada w rozmowie: Claude, GPT albo Gemini, model i dokładność. **Klucze API** — wklej klucz, aplikacja od razu go sprawdzi (lista modeli, bez kosztu).

## MuzaIK

Montaż potrzebuje pliku utworu. Aplikacja szuka go po kolei:

1. we własnej kopii (gdy już go raz miała albo go wgrałaś),
2. w pamięci podcastów muzaik.channel na tym samym serwerze,
3. w AzuraCast — **własnym kluczem** z tej zakładki.

Klucz AzuraCast zrób osobny, tylko dla tej aplikacji (AzuraCast → Moje konto → Klucze API). Aplikacja nie bierze klucza z bazy muzaik.channel.

> **Wskazówka.** Bez klucza też się da: w Studiu przy utworze jest przycisk **Wgraj plik utworu**.

## YouTube

1. W Google Cloud zrób klienta OAuth typu „Web application” i dodaj adres powrotu pokazany w zakładce.
2. Wklej Client ID i Client secret → **Zapisz klienta**.
3. **Połącz z YouTube** i w oknie Google wybierz kanał MuzaIK.

Aplikacja przyjmuje **tylko kanał MuzaIK** — przy innym kanale cofnie dostęp i pokaże komunikat.
