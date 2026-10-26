# Raport naprawy natywnego dodawania terminów i panelu kolejki

Data: 26.10.2026. Walidacja lokalna zakończona; test produkcyjny Eventis **NIEWYKONANY**.

## 1. Audyt i przyczyna problemu

Przed zmianami katalog roboczy był czysty, gałąź: `main`, HEAD: `d6a7562`. Przeanalizowano `content/eventis.js`, `content/eventis.css`, `shared/terminy.js`, `shared/kolejka-eventis.js`, `shared/operacje-eventis.js`, testy DOM i potwierdzeń, poprzedni raport oraz transport panelu bocznego.

Potwierdzone przyczyny w kodzie:

- `findAddTermButton()` wybierał element według `nth-child`; przy braku wyniku przeszukiwał wszystkie odnośniki i przyciski ze słowem „termin”. Nie sprawdzał, czy element rzeczywiście dodaje formularz terminu. Mógł wskazać inną akcję.
- `addSelectedTerms()` wykonywał kliknięcia z przerwami 120 ms, następnie odczekiwał 850 ms. Nie obserwował utworzenia ani gotowości pól. Przy niewłaściwej akcji lub wolnym renderowaniu lista docelowych formularzy pozostawała pusta. Wówczas `wypelnijTerminyOsobno()` zwracał komunikat „Eventis nie utworzył formularza dla tego terminu”.
- `fillTerm()` miał globalne wyszukiwanie niektórych pól i zbyt szerokie wyszukiwanie ceny. Kontrola kompletności nie obejmowała całego pakietu i przyjęcia wartości przez kontrolki.
- Test DOM zastępował `findAddTermButton()` atrapą. Weryfikował wypełnianie własnego modelu, pomijając wadliwe wyszukiwanie.

Nie ustalono, który konkretnie element został kliknięty w zgłoszonej sesji produkcyjnej ani czy niebieski „+” dodaje termin. Repozytorium nie zawiera produkcyjnego fixture Eventis. Wskazanie konkretnego selektora lub zdarzenia produkcyjnego bez DOM byłoby zgadywaniem. Poprzednie 330/330 nie stanowi dowodu działania na produkcji.

## 2. Kopia rozszerzenia w Chrome

Odczytano wyłącznie informacje o rozszerzeniu z lokalnych ustawień Chrome. Profil `Default`, ID rozszerzenia `diifcgbmmakofgehiaffcidfpchmbnhc`, wskazuje katalog tego repozytorium. Nie stwierdzono innej kopii plików dla tego wpisu.

To potwierdza źródło plików na dysku. Nie potwierdza wersji skryptu już działającego w otwartej karcie. Rozszerzenia ani karty produkcyjnej nie przeładowywano automatycznie. Po ręcznym przeładowaniu nową implementację identyfikuje element `#esync-kolejka-ogloszenia` z `data-wersja-terminow="2026-10-26"`.

## 3. Naprawa natywnego dodawania

Wobec braku produkcyjnego DOM zastosowano bezpieczne rozpoznanie w bieżącym dokumencie:

1. W rozwiniętej kolejce użytkownik wybiera „Rozpoznaj natywne dodawanie”.
2. Następnie ręcznie klika właściwy przycisk dodania terminu na stronie Eventis.
3. Obserwator zakładany przed natywną obsługą kliknięcia sprawdza nowe ID formularzy i kompletność kontrolek.
4. Asystent zapamiętuje referencję do przycisku dopiero po utworzeniu jednego kompletnego formularza. Sam nie klika nieznanych elementów. Nie przechwytuje przycisków wysyłania formularza.
5. Rozpoznany pusty wiersz może zostać wykorzystany do pierwszego terminu, jeśli jego pola pozostały niezmienione. Kolejne wiersze tworzy wyłącznie natywna akcja Eventis.

Nie dodano produkcyjnego kodu tworzącego `li_eventdate_*`, alternatywnych formularzy Eventis ani selektorów odgadniętych z etykiet. Drobny wpis w konsoli po rozpoznaniu zawiera tag, ID i klasy przycisku oraz ID nowego wiersza, bez danych szkolenia; może posłużyć do późniejszego potwierdzenia stabilnego selektora.

Obie akcje importu korzystają ze wspólnego `addSelectedTerms()`. Dodawanie jest sekwencyjne. `MutationObserver` czeka do 6 sekund na wiersz, wymagane pola, aktywność kontrolek i odpowiednie opcje. Obserwacja kończy się po sukcesie, błędzie, anulowaniu, zmianie kontekstu albo opuszczeniu dokumentu; timer i nasłuchy są usuwane. Rozpoznanie ręczne ma osobny limit 30 sekund.

Daty, lokalizacja i cena są sprawdzane przed akcją dodania. Pola są wyszukiwane wyłącznie w konkretnym natywnym wierszu. Zachowano mapowania ONLINE, miast i województw, potwierdzenia, VAT 23% oraz elementów pakietu. Nie są nadpisywane wiersze zawierające już daty. Po wpisaniu sprawdzane są przyjęte wartości; błąd przywraca poprzednie wartości kontrolek tego wiersza.

## 4. Niezależność potwierdzeń i statusy

- Potwierdzenie kolejki nie ustawia potwierdzenia SEMPER/IIST. Potwierdzony rekord kolejki bez potwierdzenia źródła może zostać wprowadzony po poprawnym przypisaniu i uzyskaniu kompletnych danych. Przy brakach pozostaje jawne uzupełnienie ceny i akceptacja danych w panelu. Akceptacja działa także przy nieprawidłowej cenie źródłowej lub niezweryfikowanym źródle.
- Akcja uzupełniania potwierdzonych korzysta z potwierdzenia źródłowego lub dotychczasowej świadomej deklaracji ręcznej. Samo potwierdzenie kolejką nie uruchamia tej ścieżki.
- Zachowano blokadę konfliktu `DECONFIRMED`, ścisłe przypisania tytułów, organizatorów, wariantów lokalizacji i normalizację zakresów dat.
- Metadane operacji przechowują `pochodzenie` (`queue`/`source`) oraz osobne potwierdzenia terminu. Lokalne blokady ustawiane przed pierwszym `await` uzupełniają istniejące claimy ogłoszenia i zabezpieczają obie akcje przed równoległym importem.
- Wypełniony formularz otrzymuje `WAITING_FOR_SAVE`. Błąd tworzenia lub wypełniania nie oznacza sukcesu. Niekompletny termin znaleziony tylko w niezapisanym formularzu otrzymuje `NEEDS_ATTENTION`.
- Przycisk kolejki umożliwia także rozliczenie jedynego już istniejącego terminu albo powiązanie kompletnego niezapisanego wiersza. Te przypadki nie wymagają ponownego tworzenia formularza ani rozpoznania przycisku dodawania.
- Termin z zapisanej migawki Eventis może otrzymać `COMPLETED_EXISTING`. `DONE` wymaga istniejącego mechanizmu potwierdzenia zapisu i obecności właściwego terminu; świadome potwierdzenie ręczne pozostało dostępne. Rozliczane są tylko konkretne rekordy operacji. Przy błędzie importu opisów zachowywana jest informacja o faktycznie wypełnionych terminach.

## 5. Interfejs

Jedno kompaktowe zestawienie „📥 Kolejka dla tego ogłoszenia (N)” jest pierwszą kartą w `.esync-body`, pod nagłówkiem i przełącznikiem organizatora, przed źródłem. Zawiera liczniki oczekujących, czekających na zapis, zapisanych i wymagających uwagi.

Po rozwinięciu dostępne są daty, lokalizacja, uczestnicy, niezależne statusy kolejki/źródła/Eventis, historia zakończonych pozycji, ponawianie oraz uzupełnianie danych. Zachowywane są rozwinięcie, szkice pól, zgoda użytkownika i przewinięcie podczas odświeżenia panelu.

Usunięto wstrzykiwanie sekcji do `#eventForm`. Sprzątanie usuwa tylko dawny `#esync-terminy-formularza.esync-card`. Nie usuwa natywnych wierszy ani nagłówka Eventis. Ten sam DOM i istniejący transport obsługują panel pływający i boczny.

## 6. Zmienione pliki

| Plik | Zakres |
| --- | --- |
| `content/eventis.js` | Rozpoznawanie natywnej akcji, oczekiwanie, walidacja i wypełnianie, blokady, metadane, niezależność potwierdzeń oraz przeniesienie kolejki. |
| `content/eventis.css` | Kompaktowe style kolejki w panelu; usunięte style dawnej sekcji w formularzu. |
| `tests/kolejka-formularz-dom.test.js` | Produkcyjne rozpoznawanie i renderowanie zamiast atrapy wyszukiwania; nowe scenariusze DOM i obu paneli. |
| `tests/fixtures/eventis-natywne-dodawanie.html` | Jawnie oznaczony syntetyczny model formularza z niezależnymi, mylącymi kontrolkami. Nie jest kopią produkcji. |
| `tests/pola-rich-text.test.js` | Regresja importu opisów i zachowania operacji po błędzie edytora w obu ścieżkach. |
| `RAPORT_NAPRAWY_KOLEJKI.md` | Bieżący raport zastępujący poprzednią ocenę. |

Pozostałe moduły, Manifest V3, mapowania i transport zapisu nie zostały przebudowane. Nie dodano zależności, integracji ani automatyzacji. Nie wykonano commita ani push.

## 7. Walidacja automatyczna

- `npm run check`: **PASS**, kod wyjścia 0.
- `npm test`: **PASS, 349/349**, błędy 0, pominięte 0, anulowane 0; lokalny Edge, około 42 sekund.
- `git diff --check`: **PASS**, kod wyjścia 0.

Edge nie uruchamiał się w piaskownicy, dlatego testy przeglądarkowe uruchomiono poza nią. Testy DOM korzystają z lokalnych fixture i blokują żądania stron. Nie łączono się z produkcyjnym Eventis.

Pokrycie obejmuje wszystkie 20 wymaganych scenariuszy: jeden i kilka terminów; niezależne potwierdzenie kolejki i źródła; zapisane i niezapisane terminy; brak przycisku; brak utworzonego formularza; opóźnione wiersze, pola i opcje; podwójne importy; ponawianie; błędne ceny; zachowanie wcześniejszych pól; ogłoszenia z istniejącymi terminami; SEMPER/IIST; zakresy wielodniowe i ONLINE; zapis tylko jednego terminu operacji; usunięcie dawnej sekcji; DOM obu paneli; brak fałszywego DONE.

Dotychczasowa regresja obejmuje również opisy SEMPER, mapowania i pamięć ogłoszeń, odtwarzanie sesji po odświeżeniu, przejście add → edit, claimy różnych kart oraz potwierdzanie zapisu.

## 8. Checklista produkcyjna — niewykonana

- [ ] W `chrome://extensions` sprawdź ID i katalog rozszerzenia. Przeładuj je, a potem stronę Eventis. Sprawdź `data-wersja-terminow="2026-10-26"` nowej sekcji w DOM.
- [ ] Na zalogowanym `event/edit` oraz `event/add` rozwiń kolejkę i wybierz „Rozpoznaj natywne dodawanie”. Ręcznie użyj rzeczywistego przycisku nowego terminu; sprawdź wpis diagnostyczny i nowe pola. Ustal, co faktycznie robi niebieski „+”.
- [ ] Dla rekordu potwierdzonego wyłącznie kolejką uzupełnij i zaakceptuj brakujące dane. Wprowadź termin; sprawdź wszystkie natywne wartości oraz `WAITING_FOR_SAVE`, bez `DONE`.
- [ ] Wprowadź kilka terminów, również do ogłoszenia już zawierającego inne daty. Sprawdź brak zmian wcześniejszych pól oraz brak duplikatów po ponowieniu i odświeżeniu.
- [ ] Sprawdź oba panele, historię, uzupełnianie ceny i ponawianie błędów. Kolejka ma być przed źródłem; dawna sekcja w formularzu ma nie istnieć.
- [ ] Sprawdź osobno SEMPER, IIST, konflikt ODPOTWIERDZONE, ONLINE, lokalizację stacjonarną i zakres wielodniowy.
- [ ] Jeżeli użytkownik zdecyduje się wykonać rzeczywisty zapis, niech zrobi to ręcznie po kontroli pól. Sprawdź DONE tylko dla zapisanych rekordów, reakcję na błąd walidacji, odtworzenie sesji oraz brak ponownego dodania po przeładowaniu. Samo lokalne testowanie nie jest zgodą na produkcyjny zapis.

## 9. Pozostałe ograniczenia i ryzyka

Rozpoznawanie przycisku wymaga ręcznej czynności w każdym nowym dokumencie. Nie utrwala odgadniętego selektora; wymiana przycisku lub całego formularza przez Eventis może wymagać ponownego rozpoznania. Syntetyczny DOM nie dowodzi obsługi zdarzeń, opcji i widgetów rzeczywistego Eventis. Zachowany kontrakt nazw pól, mapowania i limit 6 sekund wymagają sprawdzenia na produkcji.

Kontrola przyjęcia wartości jest lokalna i synchroniczna. Nie potwierdza walidacji serwera ani późniejszych zmian dokonywanych przez widgety Eventis. Przywrócenie kontrolek po błędzie nie jest gwarancją odtworzenia wewnętrznego stanu zewnętrznych widgetów — należy sprawdzić natywny wiersz przed ponowieniem. Ręczne potwierdzenie zapisu pozostaje deklaracją użytkownika.

Nie potwierdzono aktualnie działającej wersji content scriptu ani rzeczywistej funkcji kontrolki produkcyjnej. Pełny PASS dla produkcji wymaga wykonania powyższej checklisty.
