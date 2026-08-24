# Google Apps Script Bridge — odczyt arkusza

Ten katalog zawiera ograniczony most tylko do odczytu:

Asystent Eventis → background service worker → HTTPS JSON → Apps Script Web App → jeden Google Sheet

Bridge nie udostępnia zapisu, nie przyjmuje identyfikatora arkusza od klienta i nie korzysta z OAuth ani tokenów Google w rozszerzeniu.

## 1. Utworzenie projektu Apps Script

1. Utwórz samodzielny projekt Google Apps Script.
2. Skopiuj zawartość pliku Code.gs do projektu.
3. W ustawieniach projektu włącz środowisko V8, jeżeli nie jest już aktywne.
4. W Project Settings → Script Properties dodaj:

   - SPREADSHEET_ID — identyfikator jedynego dozwolonego arkusza;
   - BRIDGE_API_KEY — długi, losowy klucz wygenerowany przez użytkownika.

Przykładowy identyfikator docelowego arkusza:

    1m8jznhl3Zi1A5VILS7tqiZEchYYQZ6bX6MA6u25uG9M

Wartość produkcyjna nie znajduje się w kodzie. Zawsze jest odczytywana z Script Properties.

Nie zapisuj BRIDGE_API_KEY w repozytorium, kodzie Apps Script ani dokumentacji. Zalecany jest losowy klucz o co najmniej 32 bajtach entropii, przechowywany w menedżerze haseł.

## 2. Jednorazowa autoryzacja i wdrożenie

1. Podczas pierwszego wdrożenia zaakceptuj wymagane uprawnienia jako właściciel skryptu.
2. Wybierz Deploy → New deployment → Web app.
3. Ustaw Execute as: Me — właściciel skryptu.
4. Ustaw dostęp pozwalający rozszerzeniu wykonać żądanie bez logowania użytkownika do Google, zwykle Who has access: Anyone.
5. Wdróż i skopiuj adres kończący się na /exec.
6. W ustawieniach rozszerzenia włącz Bridge, podaj URL Web App i BRIDGE_API_KEY.

Po zmianie kodu utwórz nową wersję wdrożenia. Nie używaj adresu testowego /dev jako konfiguracji produkcyjnej.

## 3. Model bezpieczeństwa

Klucz zapisany w ustawieniach rozszerzenia nie jest kryptograficznie nieodczytywalnym sekretem. Osoba mająca dostęp do profilu Chrome lub plików rozszerzenia może go odzyskać. Klucz stanowi dodatkową barierę przed przypadkowymi i anonimowymi wywołaniami.

Głównym zabezpieczeniem jest ograniczony zakres API:

- tylko jeden SPREADSHEET_ID z Script Properties;
- tylko akcje health, listSheets i readRows;
- brak operacji zapisu;
- brak arbitralnych zakresów i identyfikatorów arkuszy w żądaniu;
- brak zwracania Script Properties i klucza;
- filtrowanie wyników do wierszy zawierających POTWIERDZONE SZKOLENIE lub ODPOTWIERDZONE;
- jednoznaczna detekcja nagłówków SEMPER i IIST w pierwszych 30 wierszach;
- rowFingerprint oparty na SHA-256 zawartości wiersza z pominięciem komórek SEMPER i IIST.

Jeśli klucz mógł zostać ujawniony, wygeneruj nowy, zmień BRIDGE_API_KEY w Script Properties i zaktualizuj ustawienia rozszerzenia.

## 4. Protokół

Bridge przyjmuje wyłącznie POST z ciałem JSON:

    {
      "action": "health",
      "apiKey": "KLUCZ_UZYTKOWNIKA",
      "requestId": "unikalny-identyfikator",
      "payload": {}
    }

Klucz nigdy nie jest przesyłany w query string.

Odpowiedź ma stały format:

    {
      "ok": true,
      "code": "HEALTH_OK",
      "requestId": "unikalny-identyfikator",
      "bridgeVersion": "1",
      "data": {}
    }

Najważniejsze stabilne kody błędów:

- AUTH_REQUIRED, AUTH_INVALID;
- CONFIG_MISSING;
- ACTION_NOT_ALLOWED, METHOD_NOT_ALLOWED;
- SPREADSHEET_UNAVAILABLE;
- SHEET_NAME_REQUIRED, SHEET_NAME_INVALID, SHEET_NOT_FOUND;
- HEADER_NOT_FOUND, HEADER_AMBIGUOUS;
- INVALID_JSON, INVALID_REQUEST, PAYLOAD_INVALID;
- INTERNAL_ERROR.

## 5. Kontrakt readRows

readRows przyjmuje wyłącznie:

    {
      "sheetName": "Nazwa karty"
    }

Zwracane są tylko pasujące wiersze:

    {
      "sheetName": "Nazwa karty",
      "rowNumber": 12,
      "rawValues": ["..."],
      "semperValue": "",
      "iistValue": "",
      "rowFingerprint": "64-znakowy-sha256-hex"
    }

rowNumber służy wyłącznie jako informacja o bieżącej pozycji. Nie jest częścią rowFingerprint. Fingerprint pomija również wartości komórek SEMPER i IIST, dlatego późniejsze oznaczenie tych komórek nie zmieni tożsamości merytorycznej wiersza.
