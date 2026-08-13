# Checklista testów v0.1.0

## A. Instalacja
- [ ] Rozszerzenie ładuje się w `chrome://extensions` bez błędów.
- [ ] Panel pojawia się na `/event/edit...`.
- [ ] Panel pojawia się na `/event/add...`.
- [ ] Panel nie pojawia się na innych stronach.

## B. Profil
- [ ] SEMPER jest wykrywany albo możliwy do ustawienia ręcznie.
- [ ] IIST jest wykrywany albo możliwy do ustawienia ręcznie.
- [ ] Przełączenie S/I zmienia domenę akceptowanych linków.
- [ ] Link IIST jest odrzucany w profilu SEMPER i odwrotnie.

## C. Pamięć linków — najważniejszy test
- [ ] Otwórz ogłoszenie, dla którego wyszukiwarka nie znajduje źródła.
- [ ] Wklej poprawny link SEMPER/IIST i kliknij `Użyj i zapamiętaj`.
- [ ] Zamknij kartę i otwórz ponownie to samo ogłoszenie.
- [ ] Link ładuje się automatycznie z pamięci.
- [ ] Panel pokazuje ŻÓŁTE ostrzeżenie, a nie zielone potwierdzenie.
- [ ] `Uzupełnij brakujące` jest zablokowane do kliknięcia `Potwierdzam zgodność`.
- [ ] Po potwierdzeniu przycisk może zostać odblokowany.
- [ ] `Zapomnij link` usuwa mapowanie.

## D. Ochrona przed złym linkiem
- [ ] Wklej link do zupełnie innego szkolenia tej samej organizacji.
- [ ] Panel pokazuje niski wynik podobieństwa.
- [ ] Przy wyniku poniżej progu blokady nie można potwierdzić powiązania ani dodać terminów.

## E. Terminy
- [ ] Źródło pokazuje terminy potwierdzone/gwarantowane jako `JEST` albo `BRAK`.
- [ ] Niepotwierdzone są informacyjne i nie trafiają do `missingTerms`.
- [ ] Termin już istniejący w Eventis nie jest duplikowany.
- [ ] Online ma właściwy typ, opis `-`, cenę i VAT.
- [ ] Termin stacjonarny ma miasto i region.
- [ ] Dla 4-dniowego wpisu SEMPER zachowana jest reguła starego skryptu: ostatnie 3 dni i -300 zł dla stacjonarnego.

## F. Ręczny zapis Eventis
- [ ] Po `Uzupełnij brakujące` rozszerzenie NIE klika przycisku zapisu.
- [ ] Panel wyraźnie każe sprawdzić formularz.
- [ ] Po ręcznym zapisie i przeładowaniu wykrywane są dodane terminy.
- [ ] Jeżeli brak jednoznacznego komunikatu sukcesu, wymagane jest ręczne `Potwierdzam: Eventis zapisał zmiany`.

## G. Awaryjny import arkusza
- [ ] Parser przyjmuje `YYYY-MM-DD do YYYY-MM-DD`.
- [ ] Parser przyjmuje `YYYY.MM.DD do YYYY.MM.DD`.
- [ ] Parser przyjmuje `28-29.09.2026`.
- [ ] Parser rozpoznaje pojedynczy dzień.
- [ ] Parser rozpoznaje ONLINE i miasta.
- [ ] `POTWIERDZONE SZKOLENIE` ma status `MA BYĆ`.
- [ ] `ODPOTWIERDZONE` ma status `USUŃ`.
- [ ] ODPOTWIERDZONE pasujące do istniejącego Eventis podświetla dokładny blok terminu.

## H. Outbox
- [ ] Potwierdzony zapis nowego terminu tworzy lokalny wpis `PENDING_SHEET_MAPPING`.
- [ ] `Zarejestruj potwierdzone, które już istnieją` również tworzy wpis.
- [ ] Idempotency key zapobiega wielokrotnemu dodaniu tego samego wpisu operatora.
