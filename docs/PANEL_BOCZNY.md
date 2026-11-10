# Panel boczny Eventis

## Diagnoza i model

Host zaczynał w trybie pływającym i nie odczytywał `eventisTrybPanelu`.
Zerwanie portu oraz zmiana jego karty oznaczały powrót do panelu pływającego.
Konfigurację panelu ustawiano ponownie przy każdym przełączeniu i zakończeniu ładowania.
Widoki nie miały identyfikatora dokumentu, więc sam numer wersji HTML nie chronił przed
akcją po nawigacji do innego ogłoszenia z podobnym widokiem.

Pozostaje model `open({tabId})`. Stała ścieżka `sidepanel.html?karta=ID` identyfikuje
instancję karty również po restarcie pracownika. Opcje zmieniają się tylko przy zmianie
dostępności. Domyślny panel globalny jest wyłączony. Model okna odrzucono: globalne
otwarcie nie daje wymaganej izolacji samo w sobie, a mieszanie go z opcjami kart tworzy
odrębne instancje i wymagałoby szerszej przebudowy. Nie wykonywano prototypu modelu okna.

Źródło: [dokumentacja Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel?hl=en),
sekcje „Enable a side panel on a specific site”, „Programmatically open the side panel
on user interaction” oraz `PanelOptions`.

## Stan i komunikacja

- Preferencja `boczny`/`plywajacy` jest trwała; brak ustawienia oznacza `boczny`.
- `OPEN`, `CLOSED`, `UNAVAILABLE` to stan sesji, odtwarzany z cyklu panelu i portu.
- `onOpened` (Chrome 141), `onClosed` (142) i `close` (141) są opcjonalne.
  Minimalna wersja pozostaje 120; port zapewnia obsługę wcześniejszych wersji.
- Rozłączenie portu nie zapisuje preferencji ani nie otwiera panelu pływającego.
- Jeden kontroler obsługuje karty, okna, dostępność, akcję rozszerzenia i powiadomienia.
  Zlecenia konfiguracji są wykonywane kolejno dla karty, a nieaktualne pomijane.
- Akcje wymagają zgodnej aktywnej karty, przypisania panelu, identyfikatora dokumentu
  i wersji widoku. Ukryty dokument odrzuca akcje; spóźniona odpowiedź nie zmienia
  kontekstu nowego widoku. Rozpoczęte operacje biznesowe pozostają przy swojej karcie.
- Zmiany DOM i kontekstu wywołują odświeżanie; odpytywanie awaryjne pozostaje co 2500 ms
  zamiast 800 ms. Skala i pozostałe dane magazynu są zachowane.
- Istniejący przycisk otwierania pozostaje w nagłówku panelu pływającego lub staje się
  przyciskiem „◧ Otwórz asystenta” na stronie przy zamkniętym panelu bocznym.
  Nieudane otwarcie udostępnia lokalny panel awaryjny bez zmiany trwałej preferencji.

## Zachowanie Chrome i ograniczenia

Panel wcześniej otwarty przez użytkownika może pozostać podczas nawigacji i odświeżenia
Eventis. Chrome ukrywa go na innej karcie i przywraca po powrocie do karty, dla której
zachował otwarcie. Zmiana domeny na obcą w tej samej karcie wyłącza i zamyka panel;
powrót może wymagać kliknięcia. Nowa karta oraz ręczne zamknięcie również mogą wymagać
kliknięcia przycisku strony lub ikony rozszerzenia. Kod nigdy nie wywołuje `open()`
ze zdarzeń nawigacji, przełączania kart ani restartu pracownika.

Testy MV3 używają tymczasowych profili i lokalnych odpowiedzi stron, bez zapisów
produkcyjnych. Obejmują gest content scriptu, nawigację, odświeżenie, dwie karty,
powrót z obcej strony, dwa okna, szybkie przełączanie, rzeczywisty restart pracownika
przez CDP i zamknięcie natywnym API. Pozostałe testy sprawdzają ochronę kontekstu,
wyścigi, brak nowych zdarzeń API, preferencje, skalę i regresję formularza/kolejki.

Ręczny przycisk X i przypięta ikona w interfejsie Chrome wymagają osobnego sprawdzenia
interakcyjnego. Test zamknięcia korzysta z `sidePanel.close`, a obsługę ikony sprawdza
test jednostkowy. Chrome 120 jest sprawdzany przez brak opcjonalnych API w atrapach;
nie uruchamiano historycznej przeglądarki. Integracje z produkcyjnym SEMPER/IIST
i Google Sheets nie są testowane sieciowo; ich istniejąca regresja pozostaje lokalna.

Walidacja: `npm run check`, `npm test`. Rzeczywisty Chrome można wybrać zmienną
`EVENTIS_KATEGORIE_PRZEGLADARKA=chrome` (domyślnie testy korzystają z Edge).

Wyniki z 10.11.2026: `npm run check` poprawny; pełne `npm test` w Edge 157.0.4341.46:
392/392; końcowe testy panelu, skalowania i przewijania w Chrome 156.0.8078.79:
18/18 (obejmują również ostatni dodany test spóźnionego widoku podczas edycji).
Wcześniejszy pełny przebieg w Chrome: 391/391. Żaden test nie został pominięty.

Zmodyfikowane pliki wykonawcze: `background.js`, `shared/host-panelu.js`, `sidepanel.js`,
`content/eventis.css`. Testy: `tests/panel-boczny.test.js`, `tests/panel-boczny-mv3.test.js`,
`tests/skala-panelu.test.js`, `tests/rozszerzenie-formularz.test.js`,
`tests/kolejka-formularz-dom.test.js`. Ten ostatni czeka na zakończenie istniejącej
animacji hover przed oceną koloru. Manifest, HTML i CSS panelu bocznego oraz skrypty
biznesowe listy i edycji Eventis nie wymagały zmian.
