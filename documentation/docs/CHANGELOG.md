# Historia zmian

**Zakres:** wszystkie zmiany w aplikacji, od najnowszych. **Stan na:** 2026-11-08.

## 2026-11-08 — silnik z Parallax Studio

- Krzywa basu, analiza tempa i dropów, renderer klatek Parallax przeniesione z `parallax-studio` ([silnik](#docs/silnik-parallax)).
- Ujęcia Parallax reagują na prawdziwą stopę fragmentu utworu (jak na antenie).
- Karta bez BPM albo refrenu: tempo i drop z analizy pliku (cache, pewność ≥ 0,2).

## 2026-11-08 — elementy z modułu Google AI Studio

- Profil kanału z danymi wstępnymi (placeholdery), import/eksport JSON, lista sprzeczności ([moduł](#docs/modul-ai-studio)).
- 10 presetów estetycznych, reguła fioletu w promptach, akty w prompcie reżysera.
- Ujęcia: kamera, światło, przejście, napis na obrazie (render), lektor DJ MuzaIK (Gemini TTS, przyciszanie muzyki).
- Miniatura 1280×720 z napisem i wysyłka miniatury; przypięty komentarz; przycisk „Wariant”.
- Kontrola zasad kanału (10 punktów) w projekcie i w eksporcie .md.

## 2026-11-08 — pierwsza wersja

- Projekt z szablonu `reception-ifairy/template`; z `vizai_marketer`: katalog Flow, Handbook, wzór YouTube.
- Most do `muzaik.db` tylko do odczytu ([dane](#docs/dane-muzaik)), pliki utworów i obrazy.
- Studio: siedem rodzajów materiałów, cięcie muzyki do taktów, plan ujęć DJ-a z poprawkami kodu ([studio](#docs/studio-i-plan)).
- Montaż ffmpeg 16:9 + 9:16 z animowaną sceną Parallax i planszami ([montaż](#docs/montaz)).
- Wysyłka prywatna na YouTube i zwiastun kanału ([YouTube](#docs/youtube)).
- Testy jednostkowe, atrapy muzaik i Claude, przejście Playwright ([testy](#docs/testy)).
