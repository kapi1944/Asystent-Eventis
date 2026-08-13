# SEMPER / IIST Eventis Sync — v0.1.0

Pierwszy działający prototyp rozszerzenia Chrome Manifest V3 zastępującego podstawowy workflow Tampermonkey na stronach `/event/add` i `/event/edit` w Eventis.

## Co działa w v0.1.0

- uruchamianie bez Tampermonkey jako rozszerzenie Manifest V3;
- panel na stronach dodawania/edycji Eventis;
- profile SEMPER i IIST oraz ręczne przełączanie profilu;
- próba automatycznej identyfikacji profilu na podstawie konfigurowalnego tekstu widocznego na stronie;
- pobieranie stron źródłowych przez service worker rozszerzenia (cross-origin);
- parser SEMPER oparty na logice istniejącego userscriptu;
- parser IIST dla stron szczegółów szkolenia i znacznika `termin gwarantowany`;
- automatyczne wyszukiwanie SEMPER przez istniejące endpointy wyszukiwarki;
- pomocnicze wyszukiwanie IIST w aktualnym kalendarzu; jeżeli nie znajdzie szkolenia, można podać URL ręcznie;
- trwałe zapamiętywanie `organizacja + Eventis ID -> URL szkolenia` w `chrome.storage.local`;
- sugestie z wcześniej poznanych tytułów dla nowych identyfikatorów Eventis;
- zapamiętane mapowanie jest zawsze wyróżnione graficznie i nie odblokowuje zmian, dopóki użytkownik nie potwierdzi zgodności w bieżącej sesji;
- czerwona blokada przy bardzo niskiej zgodności tytułów;
- odczyt terminów już istniejących w formularzu Eventis;
- do automatycznego uzupełnienia trafiają WYŁĄCZNIE terminy rozpoznane na stronie źródłowej jako potwierdzone/gwarantowane;
- wypełnianie brakujących terminów Eventis: data, miasto/online, region, gwarancja, cena, VAT i elementy pakietu;
- brak automatycznego kliknięcia zapisu Eventis — po wypełnieniu użytkownik musi zweryfikować formularz i zapisać go ręcznie;
- lokalna `pending operation` pozwalająca po przeładowaniu strony sprawdzić, czy dodawane terminy pojawiły się w Eventis;
- lokalny `sheetOutbox` dla wpisów, które w kolejnej wersji zostaną zapisane do właściwych komórek Google Sheets;
- rejestrowanie sytuacji, w której potwierdzony termin już wcześniej istniał w Eventis;
- awaryjny import tekstu `POTWIERDZONE SZKOLENIE` / `ODPOTWIERDZONE`;
- parser kilku formatów dat (`YYYY-MM-DD`, `YYYY.MM.DD`, `28-29.09.2026`), lokalizacji i liczby osób;
- ODPOTWIERDZONE obecne w Eventis jest w v0.1 podświetlane na czerwono, ale rozszerzenie NIE klika jeszcze automatycznie usunięcia;
- lokalny audit log;
- strona ustawień i eksport całej pamięci rozszerzenia do JSON.

## Najważniejsza zasada bezpieczeństwa

Zapamiętany link oznacza tylko: **„wiemy, gdzie szukać”**. Nie oznacza: **„powiązanie jest na pewno poprawne”**.

Każde zapamiętane powiązanie jest pokazywane w stanie ostrzegawczym. Użytkownik widzi tytuł Eventis i tytuł SEMPER/IIST oraz wynik podobieństwa. Dopiero kliknięcie `Potwierdzam zgodność tytułu i linku` w bieżącej sesji odblokowuje przycisk uzupełniania terminów.

## Instalacja testowa

1. Rozpakuj katalog rozszerzenia.
2. Otwórz `chrome://extensions`.
3. Włącz **Tryb dewelopera**.
4. Kliknij **Załaduj rozpakowane**.
5. Wskaż katalog `eventis-sync-mv3-v0.1.0`.
6. Otwórz stronę edycji lub dodawania szkolenia w Eventis.
7. W ustawieniach rozszerzenia ustaw inicjał operatora i — jeżeli to możliwe — charakterystyczne fragmenty tekstu kont SEMPER i IIST.

## Scenariusz pierwszego testu

1. Otwórz istniejące ogłoszenie SEMPER na Eventis.
2. Jeżeli rozszerzenie nie zna szkolenia, kliknij `Szukaj automatycznie` lub wklej prawidłowy link SEMPER.
3. Po prawidłowym pobraniu link zostanie zapamiętany.
4. Porównaj graficznie tytuł Eventis i tytuł źródłowy.
5. Kliknij `Potwierdzam zgodność tytułu i linku`.
6. Sprawdź listę potwierdzonych terminów i stan `JEST / BRAK`.
7. Kliknij `Uzupełnij brakujące potwierdzone`.
8. Zweryfikuj pola formularza Eventis.
9. Zapisz Eventis ręcznie.
10. Po powrocie na stronę rozszerzenie spróbuje potwierdzić zapis. Gdy Eventis nie pokaże jednoznacznego komunikatu sukcesu, pojawi się dodatkowy przycisk ręcznego potwierdzenia zapisu.

Przy kolejnym wejściu do tego samego ogłoszenia URL powinien załadować się z pamięci bez ponownego ręcznego szukania, ale nadal będzie wymagał wizualnej kontroli.

## Świadome ograniczenia v0.1.0

### Google Sheets

Bezpośredni zapis do arkusza nie jest jeszcze wykonywany. Po potwierdzonym zapisie Eventis powstaje wpis w lokalnej kolejce `sheetOutbox` ze statusem `PENDING_SHEET_MAPPING`. Jest to celowe: przed włączeniem zapisu potrzebujemy dokładnego modelu, jak dla danego szkolenia/terminu wyznaczyć właściwą komórkę w arkuszu. Nie chcemy zgadywać komórki i ryzykować wpisania `K` w złe miejsce.

### IIST — wyszukiwanie

Parser bezpośredniego linku IIST oraz rozpoznawanie `termin gwarantowany` są zaimplementowane. Automatyczne wyszukiwanie IIST w v0.1 jest pomocnicze i przegląda linki widoczne w kalendarzu. Nie zostały jeszcze rozpoznane stabilne parametry wewnętrznej wyszukiwarki IIST. Ręcznie wskazany link jest zapamiętywany, więc problem występuje tylko przy pierwszym kontakcie z danym ogłoszeniem.

### ODPOTWIERDZONE

Rozszerzenie potrafi odnaleźć dokładny termin `data + lokalizacja` z wpisu ODPOTWIERDZONE i podświetlić odpowiedni blok Eventis. W v0.1 nie usuwa go jeszcze automatycznie. Przed włączeniem tej funkcji należy potwierdzić stabilny selektor przycisku usuwania i zachowanie Eventis przy regule „musi pozostać co najmniej jeden aktywny termin”.

### Detekcja konta Eventis

Nie mamy jeszcze udokumentowanego stabilnego identyfikatora konta SEMPER/IIST z DOM Eventis. v0.1 pozwala w ustawieniach podać tekst charakterystyczny dla konta (np. nazwę lub e-mail widoczny w interfejsie); zawsze można też przełączyć profil przyciskiem `S/I` w panelu.

## Następny krok v0.2

1. zebrać DOM/HTML kont SEMPER i IIST w Eventis i zrobić twardą detekcję profilu;
2. przetestować parsery SEMPER/IIST na kilkunastu realnych szkoleniach;
3. ustalić strukturę arkusza Google i algorytm `training + term -> cell`;
4. podłączyć Google Sheets API lub Apps Script bridge oraz obsłużyć retry lokalnego outboxu;
5. dodać bezpieczne usuwanie ODPOTWIERDZONE z kontrolą minimum jednego terminu;
6. dopiero potem przejść do kolejki wielu ogłoszeń.

## Architektura

- `manifest.json` — Manifest V3, permissions i host permissions;
- `background.js` — service worker, cross-origin fetch oraz most do kontekstu MAIN dla edytorów rich-text;
- `content/eventis.js` — logika biznesowa, provider SEMPER/IIST, diff, UI, mapowania, outbox i audit;
- `content/eventis.css` — panel i stany bezpieczeństwa;
- `options/*` — ustawienia i pamięć rozszerzenia.

## Źródła techniczne wykorzystane przy szkielecie MV3

- Chrome Extensions Manifest: https://developer.chrome.com/docs/extensions/reference/manifest
- Chrome permissions / host_permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome MV3: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- Chrome Identity (do kolejnego etapu Google Sheets): https://developer.chrome.com/docs/extensions/reference/api/identity
- Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2
- Google Sheets API values.update: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update
