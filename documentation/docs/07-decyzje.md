# Decyzje właścicielki

**Zakres:** co postanowiła właścicielka i czego przez to nie robimy. Od najnowszych. **Stan na:** 2026-11-08.

## 2026-11-08 — moduł z Google AI Studio

- Właścicielka: przeanalizować moduł „YT Music Teaser”, dodać to, co najlepsze; **dane z modułu traktować jako placeholdery do wymiany**, dopóki nie będzie konfiguracji ze skryptu. Czego nie robimy: nie traktujemy profilu jako faktów (prompt to mówi), nie bierzemy z niego utworów ani dat.
- **⚠️ Do sprawdzenia** (sprzeczności modułu z zasadami muzaik.channel, czekają na decyzję): głos opisu (Twórczyni 1. os. ż. czy DJ w 3. os.), fiolet (marka muzaik ma fiolet w kolorach; moduł go ogranicza), sklep store.vizai.art w opisach, covery „is_cleared”.

## 2026-11-08 — start projektu

Przyjęte propozycje z planu:

- **Główne zadanie**: najpierw zwiastun kanału, potem materiały wideo marketingowe. Czego nie robimy: pinów, kampanii sklepu, Shopify.
- **Persona**: DJ MuzaIK jako reżyser. Czego nie robimy: nowej postaci; nie ujawniamy dostawcy modelu.
- **Gdzie działa**: serwer muzaik.channel, odczyt `muzaik.db` z dysku. Czego nie robimy: żadnego zapisu do muzaik.channel, żadnego czytania jego sekretów.
- **Portret Twórczyni (AI)**: dozwolony tylko na planszy końcowej z podpisem. Czego nie robimy: prawdziwych osób w promptach wideo. **⚠️ Do sprawdzenia:** plansza z portretem nie jest jeszcze zrobiona.
- **Wideo**: na razie prompty do wklejenia w Google Flow. Czego nie robimy: generowania wideo przez API (Veo) — ewentualnie później, z potwierdzeniem ceny.
- **Tylko utwory autorskie** w materiałach (Content ID), wysyłka na YouTube **tylko jako prywatna** i tylko po kliknięciu właścicielki.
