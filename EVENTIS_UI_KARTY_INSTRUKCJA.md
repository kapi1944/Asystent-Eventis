# Asystent Eventis — kompaktowe kafelki rekordów

**Data:** 2026-11-12  
**Zakres:** karty szkoleń na liście ogłoszeń Eventis, wyłącznie ich prezentacja.  
**Repozytorium:** `kapi1944/Asystent-Eventis`; pracujemy **tylko na `main`**, bez tworzenia gałęzi.

## 1. Cel wizualny

Kafelek rekordu ma mieć kolejność:

1. **Górny wiersz znaczników powiązań:** `SEMPER: znaleziono` oraz `EVENTIS: znaleziono` albo czerwony `EVENTIS: Nie znaleziono ogłoszenia`. Dla IIST zachowaj analogiczny znacznik źródła.
2. **Poniżej tytuł szkolenia**, pogrubiony, z dotychczasową kolorową diodą.
3. **Poniżej terminy**: data, miasto lub `Online`, znacznik statusu terminu `Oczekuje` (zamiast `Oczekuje na weryfikację`), przycisk `Pomiń` oraz krzyżyk usuwania. Na możliwie wąskim pasku bocznym nie zawijaj **przycisku akcji** `Pomiń` do osobnego wiersza; dopuszczalne jest zawinięcie tekstu daty / statusu, gdy brakuje miejsca.
4. Następnie istniejące przyciski, pola i rozwijane sekcje bez zmiany kolejności ich obsługi.

**Usuń zbędne powtórzenia:**

- szary opis pod tytułem (`esync-term-sub` w kafelku), np. `Co najmniej jeden termin wymaga dodania lub sprawdzenia` i podobne opisowe dopiski;
- czerwony akapit `Nie znaleziono odpowiedniego ogłoszenia Eventis. Wskaż ogłoszenie lub utwórz nowe.`, kiedy powyżej istnieje czerwony znacznik `EVENTIS: Nie znaleziono ogłoszenia`.

**Zachowaj:** zrozumiałe komunikaty innych stanów, np. wieloznaczne dopasowanie, błędy źródła, konflikt potwierdzenia, ostrzeżenia przed usunięciem; nie usuwaj danych, przycisków ani logiki.

> Uwaga: na **rzeczywistym** zrzucie interfejsu żółty przycisk to `Pomiń`. Wygenerowane makiety potrafiły błędnie przedstawiać go jako `Pilne`. Nazwa i funkcja `Pomiń` mają zostać bez zmian.

## 2. Lokalizacje implementacji

Ustalono na podstawie kodu `main` repozytorium:

- `content/lista-eventis.js`: `renderujPozycjeSzkolenia()` — kolejność znaczników, tytułu, usunięcie drugiego opisu, brak powtórzonego alertu; `renderujTerminyPozycji()` — krótki tekst `Oczekuje`;
- `shared/kolejka-eventis.js`: `opiszStatusPowiazania()` — `NOT_FOUND` Eventis ma brzmieć `Nie znaleziono ogłoszenia` (razem z istniejącym prefiksem daje `EVENTIS: Nie znaleziono ogłoszenia`);
- `content/eventis.css`: drobne poprawki odstępów i zachowanie przycisków akcji w wierszu.

Skrypt `apply-eventis-ui.sh` wprowadza te zmiany lokalnie i celowo nie wykonuje `git commit` ani `git push`.

## 3. Instrukcja dla Claude Code / Codex

1. Zweryfikuj `git status`, `git branch --show-current`, `git log -1 --oneline`, następnie obejrzyj diff powyższych trzech plików.
2. Oceń zmianę pod kątem dostępności, kompatybilności ze skalowaniem panelu i ekstremalnie długich tytułów. Zachowaj dynamiczne dane, istniejące identyfikatory oraz delegację zdarzeń.
3. Dodaj lub popraw testy regresyjne zgodnie z mechanizmem testowania istniejącym w repo (nie twórz nowego frameworka). Sprawdź szczególnie: `NOT_FOUND`, `AMBIGUOUS`, `FOUND`, `CREATE_NEW`, status terminu `Oczekuje`, zachowanie `Pomiń`, ponowne renderowanie, profile SEMPER/IIST.
4. Wykonaj `npm run check`, `npm test`, `git diff --check`. Jeżeli możliwe, przeprowadź wizualny test w Playwright na 320, 360, 390 i 768 px (w tym skalowanie panelu i długi tytuł). Nie twierdź, że testy wizualne wykonano, jeśli nie były uruchamiane.
5. Nie zmieniaj algorytmów wyszukiwania, mapowań, kolejki, stanu zapisu, logiki potwierdzeń i komunikacji z Eventis/SEMPER. Nie przeprowadzaj refaktoru poza zadaniem.
6. Nie twórz nowych gałęzi. Pracuj na `main`. **Nie stosuj `git reset --hard`, `git push --force` ani nadpisywania cudzych zmian.** Jeśli kod lokalny różni się od wersji, pod którą przygotowano patch, zachowaj te zmiany i wykonaj adaptację ręcznie.
7. Przygotuj zwięzły raport: zmienione pliki, testy PASS/FAIL, ewentualne ryzyka, stan `git status`. Gdy poprawki i testy są zatwierdzone przez użytkownika, można wykonać zwykły `git commit` i `git push origin main` (bez `force`).

## 4. Kryteria akceptacji

- Statusy źródła/Eventis **nad tytułem** w każdym kafelku.
- Szary opis pod tytułem nie występuje.
- Dla braku ogłoszenia wyświetla się tylko jeden opis tego faktu: czerwony badge. Nadal są dostępne wszystkie opcje wskazania / tworzenia / pominięcia.
- Skrócony badge terminu: `Oczekuje`.
- Przycisk `Pomiń` w tym samym wierszu akcji, bez niepotrzebnego zawijania; można zawijać datę/tekst terminu przy wąskim panelu.
- Długi tytuł mieści się bez poziomego scrolla.
- Stany sukcesu, błędu, konfliktu i wyszukiwania pozostają rozróżnialne.
- Brak regresji w dodawaniu terminów, zapamiętanych mapowaniach, obsłudze przycisków i widoku panelu bocznego.
- `npm run check`, `npm test` i `git diff --check` kończą się pomyślnie.

## 5. Procedura użytkownika

1. Otwórz **Git Bash** w lokalnym katalogu repozytorium `Asystent-Eventis`.
2. Zabezpiecz dotychczasowe zmiany (`git status` i, jeśli trzeba, commit/stash). Przejdź na aktualną lokalną `main`, bez wymuszania zmian zdalnych.
3. Pobierz plik `apply-eventis-ui.sh` i `EVENTIS_UI_KARTY_INSTRUKCJA.md` do wygodnego miejsca (np. folder Pobrane). **Uruchom skrypt z katalogu repo,** podając ścieżkę do pobranego pliku. Przykład Git Bash:

   ```bash
   cp ~/Downloads/EVENTIS_UI_KARTY_INSTRUKCJA.md ./EVENTIS_UI_KARTY_INSTRUKCJA.md
   bash ~/Downloads/apply-eventis-ui.sh
   ```

4. Skrypt sam sprawdzi stan repo, przeprowadzi zamiany i uruchomi testy. Przejrzyj `git diff`.
5. Otwórz Claude Code lub Codex w katalogu repo i wklej prompt startowy podany w rozmowie; agent ma odczytać `./EVENTIS_UI_KARTY_INSTRUKCJA.md`.
6. Po końcowej weryfikacji: zatwierdź commit i wypchnij `main`. Przeładuj rozszerzenie w `chrome://extensions` i sprawdź stronę Eventis.

**Gdy skrypt przerwie pracę** przed zmianami: to zwykle oznacza lokalne różnice w kodzie, inne niż sprawdzona wersja `main`. Nie wymuszaj nadpisania: zleć agentowi adaptację według niniejszego dokumentu.
