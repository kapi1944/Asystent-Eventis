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
- [ ] Przy zgodności tytułów powyżej 95% panel automatycznie pokazuje zielone potwierdzenie, bez przycisku potwierdzania.
- [ ] Przy zgodności tytułów równej 95% lub niższej panel pokazuje ostrzeżenie, a `Uzupełnij brakujące` jest zablokowane do kliknięcia `Potwierdzam zgodność`.
- [ ] Po ręcznym potwierdzeniu przycisk może zostać odblokowany.
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
- [ ] Po zapisie panel czeka na komunikat Eventis; ręczne potwierdzenie pojawia się dopiero po braku automatycznego rozstrzygnięcia.

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

## Matcher i panel boczny Chrome
- [ ] Przeładuj rozszerzenie w chrome://extensions i odśwież otwarte karty Eventis.
- [ ] Na /company wklej rekord kierownika składowiska z 2-dniowym szkoleniem, próbnym egzaminem i dopiskiem online: analiza wybiera #89180.
- [ ] Wybierz ikonę „Panel boczny”: cała nakładka znika, a wyszukiwarka, tytuły, terminy i akcje Eventis pozostają dostępne.
- [ ] W panelu bocznym sprawdź import, otwieranie i uzupełnianie, ponowną weryfikację, zmianę przypisania, URL, nowe ogłoszenie i pomijanie.
- [ ] Odśwież /company: preferencja bocznego pozostaje zachowana; ikoną rozszerzenia możesz ponownie otworzyć zamknięty panel.
- [ ] Wybierz „Panel pływający”: nakładka wraca; jeśli Chrome nie zamknie bocznego automatycznie, zamknij go ręcznie.
- [ ] Sprawdź panel przy 280, 350, 450 i 700 px: brak poziomego przewijania.
- [ ] Zmień aktywną kartę Eventis: panel pokazuje jej stan; kliknięcie ze starego widoku nie wykonuje akcji na innej karcie.
- [ ] Z aktywnym rekordem kolejki otwórz /event/edit/89180: „Użyj bieżącego ogłoszenia #89180” zapisuje przypisanie; po ponownej analizie i zmianie dopisku nadal działa.
- [ ] Na stronie niezgodnego szkolenia brak propozycji użycia bieżącego ogłoszenia. Wariant 2-dniowy nie przypisuje się automatycznie do 3-dniowego.
- [ ] Sprawdź tryb na przeglądarce bez sidePanel.open: floating pozostaje dostępny.
