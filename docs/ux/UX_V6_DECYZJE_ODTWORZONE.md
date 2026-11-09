# UX V6 — odtworzone decyzje i stan wdrożenia

## Zakres źródeł

Ten dokument odtwarza decyzje przekazane w etapie UX-V6.2. Nie jest oryginalną specyfikacją ani makietą V6. Szczegółowe wymagania wizualne dla wielu pozycji nie są dostępne. Status ocenia wyłącznie znane ustalenia i kod.

Repozytorium rozpoczęto na `main`, HEAD `ce40692d53c73c7fcbf26c8ab9f6610677c27264`, bez lokalnych zmian. Punkt 05 wdrożono jako wariant B, z istniejącym mechanizmem przypisania.

## Decyzje 01–13

| Nr | Obszar i odtworzone ustalenie | Status | Implementacja | Test potwierdzający |
|---|---|---|---|---|
| 01 | Nagłówek V3, monogram E, SEMPER/IIST, akcent `#dd8046` | WYKONANE w znanym zakresie | Nagłówek i przełącznik źródła | `tests/rozszerzenie-formularz.test.js`; `tests/skala-panelu.test.js` |
| 02 | Cztery kroki procesu, pomarańczowy aktywny, zielony ukończony | BRAK DOKUMENTACJI | Nie potwierdzono kompletnego widoku czterech kroków | Brak testu pełnego procesu |
| 03 | Rozwijana lista terminów, nieruchoma oś strzałki SVG | CZĘŚCIOWO WYKONANE | Strzałka 20×20 px wokół środka i natywne `details` | `tests/rozszerzenie-formularz.test.js`; `tests/przewijanie-panelu.test.js` |
| 04 | Kompaktowe filtry, pastelowe aktywne tła i krótkie etykiety | BRAK DOKUMENTACJI | Filtrów i liczników nie potwierdzono | Brak testu filtrów |
| 05 | Karta szkolenia, wariant B z osobnym „Zmień przypisanie” | WYKONANE | Oddzielny pełnoszeroki wiersz. Zachowano `data-zmien-mapowanie` | `tests/panel-kolejki.test.js`; `tests/kolejka-formularz-dom.test.js` |
| 06 | Osobne statusy źródła, terminu i Eventis, fiolet dla stanu z kolejki | CZĘŚCIOWO WYKONANE | Statusy mają osobne etykiety. Brak terminu źródłowego opisano przy terminie i karcie | `tests/kolejka-formularz-dom.test.js`; `tests/potwierdzenia-kolejki.test.js` |
| 07 | Kompaktowy alert, komunikat z lewej, działanie z prawej | BRAK DOKUMENTACJI | Nie potwierdzono wspólnego układu alertu z akcją | Brak testu układu |
| 08 | Otwieranie zielone, pomijanie czerwone, weryfikacja pomarańczowa | WYKONANE w znanym zakresie | Kolory akcji preflight. Pominięcie korzysta z istniejącego działania | `tests/kolejka-formularz-dom.test.js` |
| 09 | Porównanie niejednoznacznych kandydatów, ręczna akceptacja | CZĘŚCIOWO WYKONANE | Kandydaci, wybór ręczny i zapamiętanie mapowania istnieją. Szczegółowy wygląd wymaga makiety | `tests/wyszukiwanie-listy-eventis.test.js`; `tests/reczny-link-semper.test.js` |
| 10 | Osobne akcje seryjne dla gotowych i wymagających weryfikacji | BRAK DOKUMENTACJI | Nie potwierdzono dwóch odrębnych akcji | Brak testu takiego podziału |
| 11 | Pamięć przypisań, historia sprawdzeń i otwierania | CZĘŚCIOWO WYKONANE | Mapowania i plan otwarć istnieją. Pełny widok historii niepotwierdzony | `tests/panel-kolejki.test.js`; `tests/wyszukiwanie-listy-eventis.test.js` |
| 12 | Porównanie parsera i zabezpieczenia dopasowania | CZĘŚCIOWO WYKONANE | Parser, podgląd i walidacja istnieją. Zgodność widoku z makietą nieznana | `tests/kolejka-formularz-dom.test.js`; `tests/wyszukiwanie.test.js` |
| 13 | Pomarańczowy fokus, hover, klawiatura, reduced motion | WYKONANE w znanym zakresie | Fokus `#dd8046`, subtelne powiększenie, natywne rozwijanie i ograniczenie ruchu | `tests/rozszerzenie-formularz.test.js`; `tests/przewijanie-panelu.test.js` |

## Brakujące materiały

Oryginalna makieta V6 i numerowana specyfikacja nie są dostępne. Nie można potwierdzić wymiarów, kolejności ani wszystkich stanów wizualnych. Punkty 02, 04, 07 i 10 nie mają dowodu wdrożenia. Dla punktów częściowo wykonanych potrzebne są makiety oraz przypadki brzegowe.

## Ochrona działania

Przycisk zmiany przypisania uruchamia dotychczasowy handler `data-zmien-mapowanie` w `content/lista-eventis.js`. Nie zmieniono logiki kolejki ani synchronizacji. Formularz nadal wymaga ręcznego zapisu w Eventis.
