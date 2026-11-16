# ASYSTENT EVENTIS — PATCH ZADANIOWY L1
## Import BRAKUJĄCYCH terminów SEMPER ze strony Pawła `eventis.local`

**Repozytorium:** `kapi1944/Asystent-Eventis`  
**Gałąź:** wyłącznie istniejąca `main`  
**Punkt odniesienia:** po commicie `74c3cd4` („Uporzadkuj karty kolejki Eventis i komunikaty statusow”). **Nie zakładaj**, że HEAD nadal jest identyczny: sprawdź bieżący HEAD, historię i lokalne modyfikacje.  
**Charakter pliku:** kompletna specyfikacja zmian do wykonania przez agenta na lokalnym repozytorium. **To nie jest gotowy diff do `git apply`**; nie wolno udawać, że kod już został wdrożony. Kluczowe selektory muszą być zweryfikowane w **żywym DOM** strony Pawła przed uruchomieniem funkcji na produkcyjnych danych.

---

## 0. Kontekst i zweryfikowane ustalenia

Użytkownik pracuje teraz na `eventis.local` (wewnętrzna strona Pawła „Szkolenia na Eventis”), zamiast używać arkusza Google „✅ Potwierdzone na eventis” jako bieżącej listy roboczej. Główny obszar to tabela „Do dodania”, z datą, szkoleniem i kolumnami `SEMPER` oraz `IIST`. U góry istnieje przycisk `#btn-kopiuj-semper` (na zrzucie: „Kopij SEMPER (9)”). W DevTools widoczny jest m.in. `button#btn-kopiuj-semper.btn.btn-primary` wewnątrz `span#kopiowanie`. To **jedyny zweryfikowany na zrzucie selektor**; nie zgaduj klas/atrybutów wierszy ani komórek.

Znaczenie stanu **komórki SEMPER** podane przez użytkownika:

| Stan komórki SEMPER | Znaczenie | Import do kolejki |
|---|---|---|
| **Rzeczywiście pusta**, bez oznaczenia znalezionego terminu i bez potwierdzenia | Termin SEMPER trzeba dopiero wprowadzić | **TAK**, jeśli dane są pełne i poprawne |
| **Niebieska kropka + niebieska ramka** | Strona Pawła wykryła istniejący termin w Eventis; operator ma go jedynie ręcznie zweryfikować | **NIE** — nigdy nie wprowadzać ponownie |
| **Potwierdzona / zweryfikowana**, np. z zaznaczeniem w komórce | Operator już zweryfikował termin | **NIE** |
| Nieznany/niejednoznaczny/ładowany stan | Nie można bezpiecznie rozstrzygnąć | **NIE**; pokaż powód |

**KRYTYCZNE:** „Do dodania: 9” / „Kopij SEMPER (9)” na zrzucie **NIE MUSI** oznaczać dziewięciu rzeczywiście brakujących terminów. Widać dziewięć niebieskich kropek w kolumnie SEMPER; zgodnie z objaśnieniem użytkownika takie rekordy mogą już istnieć w Eventis i wymagać tylko weryfikacji. Nowy licznik ma wynikać z **indywidualnego stanu każdej komórki**, NIE z licznika Pawła, koloru nagłówka ani liczby kopiowanych wierszy.

Nie zmieniaj ani nie klikaj automatycznie istniejących kontrolek oznaczania terminów na `eventis.local`. Użytkownik sam potwierdza znalezione rekordy.

**Ustalone ograniczenie audytu:** `eventis.local` jest lokalnym/wewnętrznym hostem; nie udostępniono pełnego źródła HTML ani aktywnej sesji. Zrzuty pokazują interfejs i fragment DevTools, **nie** pełną strukturę wierszy, ich atrybuty, źródło danych ani funkcję `Kopij SEMPER`. Najpierw audyt rzeczywistego DOM oraz implementacji Pawła (jeśli repo/kod jest dostępny lokalnie); opieranie klasyfikatora tylko na zrzucie jest niedozwolone. `view-source:https://eventis.local/` pokazuje statyczny HTML, natomiast wiersze i stany mogą być renderowane dynamicznie — badaj też żywy DOM, CSS/JS i zdarzenia.

## 1. Cel UX i zakres

Dodać **jeden dodatkowy przycisk** obok `Kopij SEMPER (N)`:

> **Importuj brakujące SEMPER (N)**

- `N` to liczba rzeczywiście **pustych** komórek SEMPER z poprawnymi danymi wejściowymi, pomniejszona opcjonalnie o już istniejące pozycje w kolejce (gdy możliwe bezpieczne odczytanie); nie używać licznika ze strony Pawła.
- Kliknięcie uruchamia **podgląd przed zapisem**: pełny tytuł, daty, lokalizacja, stan źródła, liczba nowych i duplikatów, liczba wykrytych w Eventis i już zweryfikowanych, lista wyjątków.
- Użytkownik musi potwierdzić „Dodaj X do kolejki” przed zapisem do rozszerzenia. Bez automatycznego otwierania kart, wypełniania formularzy, wysyłania zgłoszeń czy zmiany statusów na stronie Pawła.
- Po zatwierdzeniu przeprowadzić import do istniejącego `chrome.storage.local` / `eventisImportQueue` przez **service worker rozszerzenia** (nie przez `localStorage` strony). Następnie krótki wynik: „Dodano: X · już w kolejce: Y · do weryfikacji na stronie Pawła: Z · pominięto: W”.
- Dotychczasowy przycisk `Kopij SEMPER` ma pozostać bez zmian.
- Funkcja dotyczy tylko **SEMPER**; kolumnę IIST zostaw nietkniętą.
- Pasek boczny rozszerzenia ma pozostać ograniczony do `eventis.pl`; na `eventis.local` ma być tylko mała, miejscowa integracja z przyciskiem.

### Ważne rozróżnienie

`BRAKUJE_W_EVENTIS` (można importować) ≠ `WYKRYTO_NA_EVENTIS_CZEKA_NA_WERYFIKACJE` (nie importować). Ten podział musi być utrzymany w modelu i testach, a nie tylko w kolorze CSS.

## 2. Audyt obowiązkowy — pierwsza czynność agenta

1. `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git log -5 --oneline`. Pracuj na `main`; **nie twórz gałęzi**, nie używaj `reset --hard`, `push --force`, nie czyść niewłasnych zmian. Jeśli repo jest dirty, zidentyfikuj i zachowaj istniejące zmiany.
2. Zweryfikuj aktualne: `manifest.json`, `background.js`, `shared/arkusz.js`, `shared/kolejka-eventis.js`, `content/lista-eventis.js`, istniejące testy i obsługę trwałej kolejki.
3. Otwórz **zalogowaną** `eventis.local` w przeglądarce użytkownika (o ile agent ma takie uprawnienia/dostęp), zbadaj:
   - rzeczywistą lokalizację przycisku `#btn-kopiuj-semper`, sposób aktualizacji licznika i widoczności;
   - strukturę **jednego wiersza** tabeli, układ `thead` i `tbody`, ewentualne `rowspan/colspan`, tabele sekcji „Do dodania”, „Już dodane”, „Historia”, wiersze ukryte/filtrowane;
   - **dokładne** atrybuty/klasy i DOM komórek SEMPER: pustej, kropki w niebieskiej ramce, ręcznie zweryfikowanej, w trakcie ładowania; sprawdź czy kropka to element DOM czy `::before`/`::after`;
   - skąd pochodzą daty, pełny tytuł, tryb (Online / miasto), daty końca, ew. liczba uczestników; czy istnieją `data-*` lub strukturalny model w JS;
   - czy skrypt Pawła kopiuje z danych źródłowych czy `innerText`; jak oznacza wyjątkowe warianty, wielodniowe zakresy, daty między miesiącami/latami i liczbę osób;
   - jak strona reaguje na zmianę sortowania, filtrów, skan, przepięcie sekcji i ponowny render.
4. Preferuj autorytatywny model danych / atrybuty DOM; **kolor obramowania jako jedyne źródło prawdy jest niedopuszczalny**. Jeśli status rozpoznawalny tylko wizualnie, udowodnij selektor regułą z żywego DOM i testami; przy braku pewności oznacz `UNKNOWN`, nie `MISSING`.
5. Jeśli agent **nie ma dostępu** do `eventis.local`, wykonaj niezależne, bezpieczne elementy integracji i testy na fixturach z jawnymi założeniami, ale **nie nazywaj klasyfikacji produkcyjnej zweryfikowaną**. Przygotuj tylko jedno, precyzyjne żądanie sanitizowanego DOM / przykładu trzech komórek — bez cookie, tokenów, danych osobowych ani całej sesji. Nie uruchamiaj importu na niezweryfikowanych klasach.

## 3. Architektura — bez drugiego systemu kolejki

### 3.1 Manifest V3

Zainstaluj dedykowany content script na **dokładnym hoście** Pawła, np. `http://eventis.local/*` i `https://eventis.local/*` — dopasuj realny protokół po audycie; nie używaj ogólnego `*://*.local/*` ani `http://*/*`.

Kolejność wstrzykiwania, jeżeli potrzebna: `shared/wyszukiwanie.js`, `shared/terminy.js`, `shared/arkusz.js`, `shared/kolejka-eventis.js`, dedykowany parser strony Pawła oraz `content/eventis-local.js`. Style w `content/eventis-local.css`, o **namespacowanych** selektorach, np. `#eventis-asystent-import` / `.ae-local-*`; nie modyfikuj globalnych `button`, `tr`, `td` ani theme Pawła.

Content script powinien działać w izolowanym świecie MV3, bez czytania cookies, tokenów i bez modyfikacji skryptów strony. Inicjalizacja idempotentna, obejmująca późny render. Obserwator DOM powinien być ograniczony, odłączany po nawigacji i odporny na samowywoływanie przez wstawiany przycisk.

### 3.2 Nowy, testowalny moduł klasyfikacji

Sugerowane pliki:
- `shared/eventis-local-import.js` — **czyste funkcje** klasyfikujące jawne dane DOM / model, odczyt rekordu, walidacja dat i statusów, budowa rekordów `NarzedziaArkuszaEventis`; eksport CommonJS + global tak jak inne moduły `shared/*`.
- `content/eventis-local.js` — odkrywanie tabeli, przycisk, podgląd, dostępność, MutationObserver i komunikacja z workerem.
- `content/eventis-local.css` — mała integracja, czytelne stany, focus i mobile.

Przykładowy jawny kontrakt wewnętrzny (nazwy mogą być dostosowane do istniejących konwencji):

```js
// Stan z komórki źródłowej (nie z licznika „Do dodania”).
// Unikaj zwrotu MISSING, jeśli jest wykryta kropka/niebieska ramka.
{ state: 'MISSING' | 'DETECTED' | 'VERIFIED' | 'UNKNOWN', reason: string }

// Dla MISSING i poprawnych danych:
{
  status: 'CONFIRMED', // oznacza potwierdzenie w źródle, NIE zapis w Eventis
  title: 'pełny niezmieniony tytuł',
  start: '2026-11-18',
  end: '2026-11-19',
  city: 'Online', // albo rzeczywista lokalizacja
  participants: null,
  normalizedTitle: '...'
}
```

**Nie traktuj jako MISSING:** `false`, `null`, pusty `textContent` przy istniejącej niebieskiej kropce, ukryty/nieaktywny wiersz, wiersz „Już dodane”, sekcja „Historia”, pusty placeholder w trakcie skanu, brak komórki lub wiersz z nieznanym stanem.

### 3.3 Pozyskiwanie pól z tabeli Pawła

- Wyznacz **kolumnę SEMPER** po nagłówku `SEMPER` / stabilnym `data-*`, nie po sztywnym indeksie 3 (kolumny i wiersze mogą się zmienić).
- Skup się na **aktywnych wierszach „Do dodania”**; jawnie wyłącz „Już dodane” i „Historia” oraz wiersze agregujące/nagłówkowe.
- Pobieraj **pełny tytuł szkolenia**, bez etykiety SEMPER i drugiej linii typu `Online 2 dni (12 h) · 1590 zł/netto`.
- Daty na zrzucie mają postać `16.11.26 → 17.11.26`; obsłuż `dd.mm.yy`, `dd.mm.yyyy`, warianty w pełnym ISO, `→`, `–`, `-`, granice miesięcy i lat. Waliduj daty kalendarzowo i chronologicznie. Nie domyślaj się roku, jeżeli jest niejednoznaczny.
- Lokalizacja: online = `Online`; dla stacjonarnych najpierw strukturalne dane / jawna lokalizacja w metadanych. Jeżeli nie da się wiarygodnie ustalić miasta, oznacz rekord jako problem zamiast importować z pustą lub zgadywaną lokalizacją.
- Dla wielodniowych wariantów i szkoleń różniących się lokalizacją zachowaj dokładną tożsamość terminu. Nie skracaj tytułu na potrzeby identyfikatora.
- Jeżeli istnieją wpisy z `POTWIERDZONE SZKOLENIE`, preferuj istniejący `NarzedziaArkuszaEventis.parseManualPaste` / `utworzRekordArkusza` / `recordKey` bez dublowania parsera. **Nie wywołuj** istniejącego `Kopij SEMPER` i nie czytaj w ciemno całego schowka (zawiera także wykryte wpisy i może mieć ograniczenia uprawnień).

### 3.4 Bezpieczna obsługa w service workerze

Dedykowany komunikat, np. `IMPORT_EVENTIS_LOCAL_SEMPER`, nieoparty na ogólnym `MERGE_QUEUE_ITEMS` wywołanym bezpośrednio przez stronę. Worker MUSI sprawdzić `sender.tab.url` i `sender.url`/origin: protokół `http:` lub `https:` i hostname **dokładnie `eventis.local`**. Odrzuć wiadomości z innych domen i z nieuprawnionych nadawców; nie ufaj polu `origin` w payloadzie.

- Maks. rozsądna liczba rekordów na wywołanie (np. 300), wymagane pola i typy, status wyłącznie `CONFIRMED`, organizacja wyłącznie `SEMPER` ustalana po stronie workera.
- W workerze ponownie waliduj daty, lokalizację, pełny tytuł i `recordKey`, nie ufaj JSON przesłanemu przez stronę.
- Reużyj `NarzedziaKolejkiEventis.przygotujElementyKolejki(rekordy,kolejka,{organization:'SEMPER'})` i `scalElementyKolejki(...)`; pracuj pod istniejącą serializacją `wykonajClaimSeryjnie('eventisImportQueue',...)` w `background.js`.
- Nowym elementom dodaj `source: 'EVENTIS_LOCAL'` oraz minimalną informację diagnostyczną, jeśli w architekturze jest na to miejsce, np. identyfikator wiersza **bez** danych wrażliwych. **Nie** nadpisuj `source` ani `status` istniejących pozycji, w szczególności `DONE`, `COMPLETED_EXISTING`, `WAITING_FOR_SAVE` lub `SKIPPED`.
- Zwróć policzone na podstawie rzeczywistej kolejki `{ ok, added, duplicates, skipped, errors }`. Powtórny import jest idempotentny; kolejne kliknięcia nie tworzą duplikatów. Nie zmieniaj pamięci przypisań Eventis ani ręcznych decyzji użytkownika.
- Żadnego Google Sheets, Apps Script, web-scrapingu po zewnętrznych hostach ani nowych, szerokich uprawnień.

### 3.5 Integracja z istniejącym widokiem Eventis

Istniejąca `content/lista-eventis.js` już czyta trwałe `eventisImportQueue`, korzysta z `RECONCILE_QUEUE`, nasłuchuje `chrome.storage.onChanged` i wywołuje `odtworzAnalizeTrwalejKolejki()`. **Nie buduj osobnej kolejki** i nie kopiuj logiki dopasowania.

Nowe rekordy powinny po otwarciu / przeładowaniu `https://eventis.pl/company` pojawić się w obecnej kolejce SEMPER, przejść aktualne dopasowanie, weryfikację (preflight) i standardowe, ręcznie zatwierdzane akcje. Jeśli lista Eventis jest już otwarta, sprawdź odświeżenie bez utraty scrolla i ręcznych wyborów. Nie zmieniaj istniejącego `status=CONFIRMED` w rozumieniu źródłowej listy szkoleń.

## 4. Dokładne zachowanie UX

1. Gdy `#btn-kopiuj-semper` jest dostępny, wstrzyknij obok niego `Importuj brakujące SEMPER (N)` bez zmiany działania istniejącego przycisku. Zachowaj estetykę strony Pawła, kompaktową szerokość i zgodność z ciemnym motywem.
2. `N=0` — przycisk nieaktywny, z komunikatem „Brak terminów do wprowadzenia” (wykryte niebieskie kropki **nie** są „brakującymi”). Przy nierozpoznanych stanach pokaż liczbę `Niepewne: M`.
3. Kliknięcie aktywnego przycisku otwiera dialog/panel z tabelą **tylko** kwalifikujących się rekordów. Na osobnej linijce zwięzłe podsumowanie `Do importu`, `Wykryte w Eventis — weryfikuj na stronie Pawła`, `Już zweryfikowane`, `Błędne / niejasne`.
4. Jeśli lista/DOM zmieniła się między podglądem a potwierdzeniem, przelicz klasyfikację i pokaż nowy stan; **nie importuj starego snapshotu** bez rewalidacji.
5. Po imporcie: komunikat sukcesu z liczbami, nieprzerywający działania strony Pawła. Link/przycisk `Przejdź do Eventis` może otwierać `https://eventis.pl/company` **po decyzji użytkownika**; nie uruchamiaj automatycznie formularzy.
6. Zawsze pokazuj dostępne działania i komunikaty błędów bez wymuszania poziomego przewijania (wąski viewport / przeglądarka zoom).
7. Obsłuż klawiaturę (Tab/Enter/Escape), focus po zamknięciu dialogu, `aria-live`, brak focus trap, jeśli użyto natywnego `dialog`, i brak duplikowania elementów przy renderach.

## 5. Minimalny zakres plików (dostosować po audycie)

| Plik | Działanie |
|---|---|
| `manifest.json` | Dokładny host + content script oraz CSS dla `eventis.local` |
| `shared/eventis-local-import.js` **nowy** | Czyste funkcje: klasyfikacja, wyciąganie danych, walidacja, kształt rekordu |
| `content/eventis-local.js` **nowy** | Przycisk przy `#btn-kopiuj-semper`, podgląd, odświeżanie, wysyłka do workera |
| `content/eventis-local.css` **nowy** | Namespacowany wygląd, responsywność, dostępność |
| `background.js` | Jeden autoryzowany nowy handler, serializacja i deduplikacja kolejki |
| `package.json` | Dopisanie `node --check` dla nowych skryptów (bez zbędnych zależności) |
| `tests/eventis-local-import.test.js` **nowy** | Jednostkowe reguły statusów, dat, ID, walidacji, duplikatów |
| `tests/eventis-local-dom.test.js` **nowy** | Playwright DOM: UI, podgląd, brak importu niebieskich kropek, rerender |
| `tests/fixtures/eventis-local-*.html` **nowe** | Sanitizowane odwzorowanie prawdziwego DOM; nie fikcyjna kopia na podstawie samego zrzutu |

Możesz zredukować liczbę nowych plików, jeśli istniejące podejście testowe tego wymaga. Nie refaktoryzuj innych funkcji.

## 6. Scenariusze testowe — obowiązkowe

### Klasyfikacja statusów

- A: Pusta komórka SEMPER + poprawny tytuł/datę/lokalizacja → `MISSING`, **jedyny** rodzaj importowany.
- B: Niebieska kropka w ramce, brak tekstu w komórce → `DETECTED`, **nie importuj**.
- C: Ręcznie potwierdzony/zaznaczony termin → `VERIFIED`, **nie importuj**.
- D: SEMPER puste, ale wiersz jest w „Już dodane” lub „Historia” → **nie importuj**.
- E: Nieznana struktura wiersza, załadowywanie, brak danych → `UNKNOWN`, **nie importuj**.
- F: Tabela: 9 niebieskich kropek i **0 pustych** → **N=0**, mimo „Kopij SEMPER (9)”.
- G: Tabela: 3 puste + 5 niebieskich + 1 potwierdzony → przycisk `Importuj brakujące SEMPER (3)`.
- H: Przetasowanie/sortowanie/ponowny skan/lazy render → brak dwukrotnego przycisku i brak błędnych importów.
- I: IIST bez zmian — zerowy zapis do `IIST`.

### Dane i kolejka

- Daty: `16.11.26 → 17.11.26`, `30.11.26 → 01.12.26`, `31.12.26 → 02.01.27`, ISO, jeden dzień, błędna data, odwrócona data.
- Zachowanie pełnego tytułu (długie nazwy), Online, miasto, różne warianty jednego tematu, brak lokalizacji/uczestników.
- Pierwszy import dodaje tylko kwalifikujące się pozycje; drugi identyczny daje `added:0`; rekordy ukończone nie cofają się do `PENDING`.
- Brak równoległego zapisu psującego inne karty `eventis.pl`; jednoczesny import i preflight pozostają bezpieczne.
- Komunikat wysłany z innej domeny jest odrzucany nawet przy poprawnym payloadzie; niedozwolona organizacja / brak dat / ogromny payload zostają odrzucone.
- Zmiana DOM podczas otwartego podglądu nie importuje już nieaktualnego wiersza.
- UI testy szerokości **320, 360, 390, 768 px** oraz desktop 1366 px; brak nakładek na oryginalny `Kopij SEMPER`, brak poziomego scrolla.
- Żadna ścieżka nie klika kontrolek potwierdzenia na stronie Pawła i nie zapisuje automatycznie Eventis.

### Polecenia walidacji

```bash
npm run check
npm test
git diff --check
git status --short
```

W razie braku dostępnej strony Pawła uczciwie odróżnij testy na fixturze od sprawdzenia na żywym DOM i nie deklaruj pełnego sukcesu wdrożenia.

## 7. Warunki akceptacji — wszystkie muszą być spełnione

- [ ] Rozpoznano realne trzy stany komórki SEMPER na żywym DOM / kodzie Pawła; źródło decyzji zostało udokumentowane.
- [ ] Nowy licznik nie jest kopią `Kopij SEMPER (N)` i wyklucza niebieskie kropki.
- [ ] Do kolejki wchodzą wyłącznie poprawne rekordy `MISSING`; niepewne są pominięte z wyjaśnieniem.
- [ ] Podgląd wymaga świadomego potwierdzenia; brak autonomicznego tworzenia/weryfikowania terminu w Eventis.
- [ ] `eventisImportQueue` jest jedyną kolejką; reimport jest idempotentny, istniejące statusy i mapowania są zachowane.
- [ ] Dotychczasowe `Kopij SEMPER` i tryb boczny wyłącznie na `eventis.pl` pozostają bez zmian.
- [ ] `npm run check`, `npm test`, testy przy 320/360/390/768/1366 px przeszły; wyniki i ograniczenia są pokazane w raporcie.
- [ ] Repo pozostaje na `main`; brak nowej gałęzi, brak force/reset; **bez commita i push bez jednoznacznej zgody użytkownika**.

## 8. Format końcowego raportu od agenta — krótko i konkretnie

1. **DOM Pawła:** co rzeczywiście oznaczają pusta komórka, niebieska kropka i potwierdzenie; na jakich znacznikach oparto reguły (lub „niezweryfikowane: brak dostępu”).
2. **Zmiany:** konkretne pliki i efekt.
3. **Przykład licznika:** liczba ze strony Pawła vs liczba do importu; wyraźnie rozdziel `DETECTED` od `MISSING`.
4. **Testy:** ile PASS/FAIL i co sprawdzono na prawdziwej stronie.
5. **Git:** aktualna gałąź, HEAD, staged/unstaged; czekaj na zgodę na commit/push.
6. **Ograniczenia:** co dokładnie nie zostało zweryfikowane, jeśli nie było dostępu do `eventis.local`.

## 9. Instrukcja startowa dla OpenCode

> Przeczytaj cały `EVENTIS_LOCAL_IMPORT_PATCH.md` jako specyfikację. Następnie przeprowadź audyt lokalnego repozytorium i **żywego DOM** `eventis.local`. Wdróż wyłącznie bezpieczny import pustych komórek SEMPER przez istniejącą kolejkę Eventis, z podglądem, deduplikacją, pełnymi testami i raportem. Nie twórz gałęzi. Nie wykonuj commita ani pusha bez mojej wyraźnej zgody. Nie uznawaj niebieskich kropek za brakujące terminy. Gdy nie możesz zbadać DOM Pawła, nie zgaduj selektorów i wyraźnie wyodrębnij niezweryfikowany etap.
