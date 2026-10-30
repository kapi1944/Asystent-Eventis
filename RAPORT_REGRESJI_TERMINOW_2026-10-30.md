# Naprawa regresji terminów Eventis — 30.10.2026

## 1. Przyczyna awarii

`fillTerm()` przerywał pracę, gdy którakolwiek kontrolka daty zawierała wartość. Nie sprawdzał, czy był to zapisany rekord. Na rzeczywistym `/event/add` Eventis sam wstawiał daty `2026-10-30`, pustą cenę i VAT, status „Zbieranie grupy”, walutę zł oraz pierwszy pakiet cenowy. Tak samo inicjalizował wiersze utworzone przyciskiem „Dodaj termin”.

`addSelectedTerms()` tworzył lub wybierał wiersz, ustawiał ONLINE, a następnie wywoływał `fillTerm()` z poprawnymi danymi źródłowymi. Warunek obecności daty zatrzymywał import przed ustawieniem dat, ceny i VAT. Stąd częściowy wynik: ONLINE i domyślne daty, bez ceny. Następnie błąd trafiał do kolejki. Import opisów był uzależniony od niepustej listy dodanych terminów, więc ta sama blokada zatrzymywała również opisy.

Podczas inspekcji przeglądarki potwierdzono dwa dodatkowe problemy:

- Bootstrap Datepicker zachowywał wewnętrzną datę `2026-10-30`, mimo zmiany wartości inputa. Dopiero `keyup` aktualizuje jego model. Samo `input/change` nie wystarczało.
- Zapisany formularz zwraca cenę np. `1590,00`. Odczyt przez `Number()` dawał nieznaną cenę i fałszywe ostrzeżenie o duplikacie.

## 2. Historia regresji

Stan początkowy: czysta gałąź `main`, HEAD `6d71e97`, bez niezacommitowanych zmian użytkownika.

| Wersja | Ustalenie |
| --- | --- |
| `d6a7562` — 23.10.2026 | Wersja sprzed przebudowy: po natywnym dodaniu wiersza `fillTerm()` wpisywał dane również wtedy, gdy Eventis zainicjalizował daty. Nie miał późniejszej blokady dowolnej niepustej daty. |
| `b3c1e78` — 26.10.2026 | Dodano bezwarunkowe zabezpieczenie `if (dataPoczatkowa.value || dataKoncowa.value) throw ...`. Wprowadzono oczekiwanie na natywny formularz i pamięć pustych wierszy. Rozpoznanie bezpiecznego nowego wiersza nie było respektowane przez `fillTerm()`. |
| `cf910bf` — 29.10.2026 | Poprawnie usunięto obowiązkową obsługę materiałów. Dodano oczekiwanie na pola zależne od trybu po jego ustawieniu. Blokada dat pozostała. Ten commit nie wprowadził pierwotnego błędnego warunku. |
| `6d71e97` — 29.10.2026 | Dodano automatyczne wyszukiwanie przycisku w sekcji i sprawdzanie ceny potencjalnych duplikatów. Nadal pozostawiono blokadę dat. |

Git jednoznacznie wskazuje commit wprowadzający wadliwy warunek. Nie dowodzi, kiedy po raz pierwszy wystąpił błąd na produkcji ani czy historyczny DOM zawsze miał te same wartości domyślne. Testy wcześniejszej implementacji używały pustych dat i nie odtwarzały tego kontraktu Eventis. Nie cofano całego pliku ani commitów.

## 3. Wprowadzone poprawki

### `content/eventis.js`

- `pobierzPolaTerminu()` odczytuje również identyfikator rekordu, akcję i walutę.
- `rozpoznajStanWiersza()` rozróżnia `PRISTINE_TEMPLATE`, `NEW_EMPTY_ROW`, `EXISTING_SAVED_TERM`, `USER_MODIFIED_DRAFT`, `EXTENSION_FILLED_DRAFT` i `UNKNOWN`.
- Potwierdzony kontrakt produkcyjny: nowy rekord ma `eventDate[n][action]=new` i `eventDate[n][id]=0`; zapisany rekord ma `action=update` i rzeczywisty identyfikator. Numer wiersza DOM nie jest identyfikatorem zapisanego rekordu.
- Przy klasyfikacji używane są znaczniki rekordu, wiele kontrolek, ich wartości domyślne, odcisk stanu i zaufane zdarzenia edycji użytkownika. Wyłączone kontrolki inicjalizacyjne nie udają ręcznej edycji. Po przejęciu wiersza odcisk obejmuje także te kontrolki.
- `getExistingTerms()` odróżnia gotowy termin od bezpiecznego szablonu i własnego nieukończonego szkicu. Początkowy wykaz zapisanych terminów obejmuje rzeczywiste rekordy serwera.
- `addSelectedTerms()` najpierw wybiera bezpieczny wiersz; w razie potrzeby używa natywnego dodawania. Różnicuje elementy DOM sprzed i po akcji, zamiast zakładać ostatni wiersz lub kolejny numer.
- `oczekujNaNatywnyFormularz()` czeka również na ustabilizowanie DOM i ponownie odnajduje zastąpiony wiersz po zmianie trybu. Niejednoznaczna przebudowa kończy się błędem.
- `fillTerm()` chroni rekordy i szkice przed rozpoczęciem zapisu pól; ponownie pobiera aktualne kontrolki. Przy niepowodzeniu nie cofa ręcznych zmian użytkownika. Własny szkic może zostać bezpiecznie ponowiony.
- `setValue()` wysyła do pól dat także zdarzenie `keyup`, wymagane przez działający na Eventis Bootstrap Datepicker.
- `zweryfikujWartosciTerminu()` sprawdza aktualne daty, rodzaj, lokalizację, cenę, VAT, walutę, pakiet i potwierdzenie. Ponowne sprawdzenie po aktualizacji DOM wykrywa opóźnioną utratę danych.
- Status „gwarantowany” wynika z potwierdzenia źródłowego, kolejki lub ręcznej akceptacji; sam fakt znalezienia terminu nie ustawia go na gwarantowany.
- Zachowano historyczne mapowanie netto/PLN/23% VAT, potwierdzone również na badanej stronie SEMPER. Jawna stawka źródłowa ma pierwszeństwo; cena oznaczona jako brutto wymaga jawnej stawki VAT do przeliczenia. Brak konfiguracji lub błędna stawka daje kontrolowany błąd.
- Import czterech opisów w nowym ogłoszeniu nie zależy już od sukcesu dodania przynajmniej jednego terminu. Zachowano kontrolę kontekstu ogłoszenia i źródła.
- Automatyczne opisy uzupełniają puste pola; nie zastępują niepustych opisów użytkownika. Import nie zastępuje już niepustego tytułu nowego ogłoszenia.
- Diagnostyka zawiera zadanie, ogłoszenie, wiersz, stan wiersza, etap, źródło, wybrane wartości formularza i przyczynę błędu. Nie zapisuje ciasteczek, uwierzytelnienia ani ukrytych pól sesji.

### `shared/terminy.js`

Odczyt ceny Eventis obsługuje przecinek dziesiętny, spacje, grosze i cenę zerową. Pusta lub nieprawidłowa cena pozostaje nieznana.

### `background.js`

Przy pomijaniu niepustego opisu pobierana jest zachowana treść modelu CKEditor i synchronizowana z polem formularza. Nie jest zastępowana treścią SEMPER. Zapobiega to wysłaniu starej wartości ukrytego pola po ręcznej edycji modelu.

### Testy

Rozszerzono `tests/kolejka-formularz-dom.test.js`, `tests/pola-rich-text.test.js` i `tests/terminy.test.js`. Dodano `tests/rozszerzenie-formularz.test.js` — test załadowanego rozszerzenia Manifest V3 w persistent context, z rzeczywistą komunikacją content script ↔ service worker ↔ MAIN world.

## 4. Ochrona istniejących danych

Identyfikator zapisanego rekordu ma pierwszeństwo przed rozpoznaniem szablonu lub pamięcią wtyczki. Zapisanego terminu nie można przejąć nawet z pustą ceną. Ręczne `input/change` oznaczają szkic użytkownika; zmiany programowe wtyczki nie otrzymują takiego znacznika. Odcisk wykrywa również zmiany wartości bez zdarzeń.

Nieznany stan nie daje zgody na nadpisanie. Własny szkic może być wznowiony tylko dla przypisanego terminu i bez późniejszych zmian. Ręczna edycja podczas oczekiwania przerywa wypełnianie. Zmienione ogłoszenie, organizator, tytuł lub źródło przerywają operację. Materiały nie stanowią warunku gotowości i nie są automatycznie ustawiane.

Zachowano istniejące reprezentacje kolejki: `PENDING`, `WAITING_FOR_SAVE`, `DONE`, `COMPLETED_EXISTING`, `ERROR`, `NEEDS_ATTENTION`. Diagnostyka rozdziela `NOWY`, `WYPEŁNIANIE`, `WYPEŁNIONY`, `OCZEKUJE_NA_ZAPIS`, `BŁĄD_WYPEŁNIANIA`. `DONE` nadal wymaga potwierdzonego zapisu; obecność danych w DOM nie wystarcza.

## 5. Wyniki testów

Końcowy pełny zestaw: **381 testów zaliczonych, 0 niezaliczonych, 0 pominiętych** (`npm test`). Kontrola składni wszystkich plików ze skryptu `npm run check` zakończona kodem 0. `git diff --check` nie zgłasza błędów. Osobny zestaw formularza i MV3: 59/59; testy pól rich-text po zmianie synchronizacji: 27/27. Pełny zestaw obejmuje te testy — liczby nie są dodatkowymi niezależnymi sumami.

Pokrycie obejmuje scenariusze A–P z zadania: domyślne i zapisane wiersze, nowe wiersze, ręczne edycje, ONLINE i stacjonarne, warianty tych samych dat, przebudowę kontrolek i całego wiersza, pakiet i walutę, cztery opisy, nieobowiązkowe materiały, ponowienia bez duplikatów, kolejkę seryjną, przerwanie i wznowienie, precyzyjny błąd wartości oraz dokładne daty i cenę z regresji 30.10.2026. Dodatkowo sprawdzono odczyt `1590,00`, aktualizację modelu datepickera oraz ręczną edycję podczas oczekiwania.

## 6. Przeglądarka: co rzeczywiście sprawdzono

### Rzeczywisty Eventis

W dostępnej, uwierzytelnionej sesji Chrome otwarto osobne karty diagnostyczne. Nie kopiowano profilu ani plików sesji. Sprawdzono:

- czysty `/event/add`, domyślny wiersz i natywne dodawanie kolejnego;
- regresję `2026-11-16 → 2026-11-17`, ONLINE, 1590 netto, 23% VAT, PLN;
- zgodność obu dat z wewnętrznymi modelami Bootstrap Datepicker;
- parsowanie bieżącej strony SEMPER, porównanie i seryjne uzupełnienie ONLINE oraz Wrocławia dla `23–24.11.2026`;
- powtórzenie bez duplikatów;
- rzeczywisty zapisany rekord na `/event/edit/101008`, `action=update`, niezerowy identyfikator;
- pozostawienie zapisanych kontrolek bez zmian przy dodaniu osobnego wiersza;
- prawidłowe pominięcie zapisanego duplikatu z ceną `1590,00` po naprawie odczytu;
- cztery rzeczywiste modele CKEditor oraz właściwe pola `event[information]`, `event[reason]`, `event[forWho]`, `event[plan]`;
- zachowanie ręcznej ceny oraz ręcznego programu; po ponownym imporcie model programu pozostał bez zmian, a pole formularza było z nim zgodne.

Kod formularza i istniejąca funkcja MAIN world z repozytorium były uruchamiane przez DevTools w diagnostycznej otoczce, bez inicjalizacji produkcyjnej kolejki i bez zapisu jej pamięci. To test rzeczywistego DOM i mechanizmów Eventis, a nie pełnego produkcyjnego procesu instalacji rozszerzenia.

Nie kliknięto produkcyjnego „Zapisz”. Nie potwierdzano zapisania testowych danych na serwerze. Utworzone karty testowe są zamykane z odrzuceniem niezapisanych danych. Istniejące karty użytkownika pozostają poza tym sprzątaniem.

Badane źródło: [SEMPER, szkolenie 658](https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,658.html). W trakcie badania aktualne daty wynosiły `23–24.11`, dlatego przypadek `16–17.11` sprawdzono osobno jako dokładne dane regresji przekazane w zadaniu. Źródło określa cenę jako netto +23% VAT; zwolnienie dotyczy określonych odbiorców, nie domyślnej stawki oferty.

### Lokalny test załadowanego rozszerzenia Manifest V3

Użyto `launchPersistentContext()` z nowym profilem Edge, `--load-extension` i `--disable-extensions-except`. Potwierdzono rzeczywisty service worker rozszerzenia oraz `manifest_version=3`. Nie opierano tego wyniku na zwykłym uruchomieniu karty Chrome bez rozszerzenia.

Test obsługuje natywne dodawanie, niestandardowy numer nowego wiersza, wstawienie przed innymi wierszami, wartości domyślne, asynchroniczną przebudowę dat i ceny po zmianie rodzaju, import opisów przez MAIN world, rzeczywistą pamięć rozszerzenia i statusy kolejki. Dwa warianty trafiają do `WAITING_FOR_SAVE`, a zapisany wiersz jest porównywany według wartości kontrolek. Pobrania źródła są odpowiedziami lokalnymi; pozostałe żądania są blokowane. Test sprawdza brak prób zapisu.

### Testy DOM

Playwright uruchamia funkcje repozytorium na lokalnym modelu formularza, z zablokowaną siecią. Model uwzględnia ustalone w produkcji znaczniki rekordów i wartości domyślne. Dodatkowe warianty przebudowy DOM są scenariuszami regresyjnymi, nie deklaracją, że Eventis wykonuje każdą taką przebudowę.

Pozostaje do ręcznego potwierdzenia pierwszy autoryzowany zapis na produkcji po przeładowaniu rozszerzenia oraz ewentualne odmienne formularze i konfiguracje IIST. Nie wykonano rzeczywistego produkcyjnego importu IIST; integrację i warianty IIST sprawdzają testy lokalne. Samych wyników DOM nie przedstawiono jako dowodu zapisu serwerowego.

## 7. Rezultat według funkcji

| Funkcja | Potwierdzenie |
| --- | --- |
| Nowe terminy | Rzeczywisty `/event/add`, osobny wiersz na `/event/edit`, lokalny przepływ MV3. |
| Daty | Kontrolki oraz modele obu kalendarzy zgodne ze źródłem. |
| Ceny | Wprowadzenie netto/PLN/VAT oraz odczyt zapisanego `1590,00`. |
| Lokalizacja | Wrocław na rzeczywistym formularzu; dodatkowe miasta i warianty w testach. |
| Cztery opisy | Rzeczywisty CKEditor i pola formularza; ochrona ręcznej treści i jej synchronizacja. |
| Kolejka | Lokalny pełny MV3, wprowadzanie seryjne i `WAITING_FOR_SAVE`; serwerowy zapis testowy nie był wykonywany. |
| Duplikaty i ochrona danych | Powtórzenie na rzeczywistym formularzu, zapisany rekord, ręczne szkice oraz testy wznowienia. |
| Materiały | Nie blokują operacji; wartości i ręczne wybory pozostają zachowane. |

## 8. Git

Bazą był `6d71e97` na `main`. Zmiany zadania są wydzielone w commit zawierający ten raport. Jego pełny identyfikator można odczytać przez `git log -1 --format=%H -- RAPORT_REGRESJI_TERMINOW_2026-10-30.md`; identyfikator oraz potwierdzony wynik synchronizacji z `origin/main` są podane w odpowiedzi końcowej. Push jest wykonywany zwyczajnie, bez `--force`, po weryfikacji relacji do zdalnej gałęzi. Pliki robocze diagnostyki nie należą do commita.
