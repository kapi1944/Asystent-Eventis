var WERSJA_MOSTU = "1";
var MAKSYMALNA_LICZBA_WIERSZY_NAGLOWKA = 30;
var MAKSYMALNA_LICZBA_KOLUMN_NAGLOWKA = 200;

function doGet() {
  return odpowiedzJson(false,"METHOD_NOT_ALLOWED","",null);
}

function doPost(zdarzenie) {
  var identyfikatorZadania = "";
  try {
    var zadanie = parsujZadanie(zdarzenie);
    identyfikatorZadania = zadanie.identyfikatorZadania;
    var konfiguracja = pobierzKonfiguracje();
    sprawdzKlucz(zadanie.kluczApi,konfiguracja.klucz);

    if (zadanie.akcja === "health") {
      return obsluzHealth(konfiguracja,identyfikatorZadania);
    }
    if (zadanie.akcja === "listSheets") {
      return obsluzListeKart(konfiguracja,identyfikatorZadania);
    }
    if (zadanie.akcja === "readRows") {
      return obsluzOdczytWierszy(konfiguracja,zadanie.ladunek,identyfikatorZadania);
    }
    throw bladMostu("ACTION_NOT_ALLOWED");
  } catch (blad) {
    var kod = blad && blad.kodMostu ? blad.kodMostu : "INTERNAL_ERROR";
    return odpowiedzJson(false,kod,identyfikatorZadania,{
      message:komunikatPubliczny(kod)
    });
  }
}

function parsujZadanie(zdarzenie) {
  var tresc = zdarzenie && zdarzenie.postData && zdarzenie.postData.contents;
  if (!tresc) throw bladMostu("EMPTY_REQUEST");
  var zadanie;
  try {
    zadanie = JSON.parse(tresc);
  } catch (_) {
    throw bladMostu("INVALID_JSON");
  }
  if (!zadanie || typeof zadanie !== "object" || Array.isArray(zadanie)) {
    throw bladMostu("INVALID_REQUEST");
  }

  var identyfikatorZadania = String(zadanie.requestId || "").trim();
  var akcja = String(zadanie.action || "").trim();
  var kluczApi = String(zadanie.apiKey || "");
  var ladunek = zadanie.payload == null ? {} : zadanie.payload;
  if (!identyfikatorZadania || identyfikatorZadania.length > 200) throw bladMostu("REQUEST_ID_REQUIRED");
  if (!akcja || akcja.length > 50) throw bladMostu("ACTION_REQUIRED");
  if (!ladunek || typeof ladunek !== "object" || Array.isArray(ladunek)) {
    throw bladMostu("PAYLOAD_INVALID");
  }
  return {
    identyfikatorZadania:identyfikatorZadania,
    akcja:akcja,
    kluczApi:kluczApi,
    ladunek:ladunek
  };
}

function pobierzKonfiguracje() {
  var ustawienia = PropertiesService.getScriptProperties();
  var identyfikatorArkusza = String(ustawienia.getProperty("SPREADSHEET_ID") || "").trim();
  var klucz = String(ustawienia.getProperty("BRIDGE_API_KEY") || "");
  if (!identyfikatorArkusza || !klucz) throw bladMostu("CONFIG_MISSING");
  return {identyfikatorArkusza:identyfikatorArkusza,klucz:klucz};
}

function sprawdzKlucz(podanyKlucz, oczekiwanyKlucz) {
  if (!podanyKlucz) throw bladMostu("AUTH_REQUIRED");
  var dlugosc = Math.max(podanyKlucz.length,oczekiwanyKlucz.length);
  var roznica = podanyKlucz.length ^ oczekiwanyKlucz.length;
  for (var indeks=0;indeks<dlugosc;indeks++) {
    roznica |= (podanyKlucz.charCodeAt(indeks) || 0) ^ (oczekiwanyKlucz.charCodeAt(indeks) || 0);
  }
  if (roznica !== 0) throw bladMostu("AUTH_INVALID");
}

function otworzSkonfigurowanyArkusz(identyfikatorArkusza) {
  try {
    return SpreadsheetApp.openById(identyfikatorArkusza);
  } catch (_) {
    throw bladMostu("SPREADSHEET_UNAVAILABLE");
  }
}

function obsluzHealth(konfiguracja, identyfikatorZadania) {
  var arkusz = otworzSkonfigurowanyArkusz(konfiguracja.identyfikatorArkusza);
  return odpowiedzJson(true,"HEALTH_OK",identyfikatorZadania,{
    spreadsheetAccessible:true,
    sheetCount:arkusz.getSheets().length
  });
}

function obsluzListeKart(konfiguracja, identyfikatorZadania) {
  var arkusz = otworzSkonfigurowanyArkusz(konfiguracja.identyfikatorArkusza);
  var nazwyKart = arkusz.getSheets().map(function (karta) {
    return karta.getName();
  });
  return odpowiedzJson(true,"SHEETS_LISTED",identyfikatorZadania,{sheets:nazwyKart});
}

function obsluzOdczytWierszy(konfiguracja, ladunek, identyfikatorZadania) {
  var nazwaKarty = String(ladunek.sheetName || "").trim();
  if (!nazwaKarty) throw bladMostu("SHEET_NAME_REQUIRED");
  if (nazwaKarty.length > 200) throw bladMostu("SHEET_NAME_INVALID");

  var arkusz = otworzSkonfigurowanyArkusz(konfiguracja.identyfikatorArkusza);
  var karta = arkusz.getSheetByName(nazwaKarty);
  if (!karta) throw bladMostu("SHEET_NOT_FOUND");
  var naglowki = wykryjNaglowki(karta);
  var ostatniWiersz = karta.getLastRow();
  var ostatniaKolumna = karta.getLastColumn();
  var wynikoweWiersze = [];

  if (ostatniWiersz > naglowki.numerWiersza && ostatniaKolumna > 0) {
    var liczbaWierszy = ostatniWiersz-naglowki.numerWiersza;
    var wartosci = karta.getRange(
      naglowki.numerWiersza+1,
      1,
      liczbaWierszy,
      ostatniaKolumna
    ).getDisplayValues();

    wartosci.forEach(function (wiersz, indeks) {
      var polaczonyTekst = normalizujBialeZnaki(wiersz.join(" ")).toUpperCase();
      if (polaczonyTekst.indexOf("POTWIERDZONE SZKOLENIE") < 0
        && polaczonyTekst.indexOf("ODPOTWIERDZONE") < 0) {
        return;
      }
      wynikoweWiersze.push({
        sheetName:nazwaKarty,
        rowNumber:naglowki.numerWiersza+1+indeks,
        rawValues:wiersz,
        semperValue:wiersz[naglowki.indeksSemper] || "",
        iistValue:wiersz[naglowki.indeksIist] || "",
        rowFingerprint:obliczFingerprintWiersza(
          wiersz,
          naglowki.indeksSemper,
          naglowki.indeksIist
        )
      });
    });
  }

  return odpowiedzJson(true,"ROWS_READ",identyfikatorZadania,{
    sheetName:nazwaKarty,
    headerRowNumber:naglowki.numerWiersza,
    rows:wynikoweWiersze
  });
}

function wykryjNaglowki(karta) {
  var liczbaWierszy = Math.min(MAKSYMALNA_LICZBA_WIERSZY_NAGLOWKA,karta.getLastRow());
  var liczbaKolumn = Math.min(MAKSYMALNA_LICZBA_KOLUMN_NAGLOWKA,karta.getLastColumn());
  if (liczbaWierszy < 1 || liczbaKolumn < 1) throw bladMostu("HEADER_NOT_FOUND");

  var wartosci = karta.getRange(1,1,liczbaWierszy,liczbaKolumn).getDisplayValues();
  var kandydaci = [];
  var niejednoznacznyWiersz = false;
  wartosci.forEach(function (wiersz, indeksWiersza) {
    var indeksySemper = [];
    var indeksyIist = [];
    wiersz.forEach(function (wartosc, indeksKolumny) {
      var naglowek = normalizujNaglowek(wartosc);
      if (naglowek === "semper") indeksySemper.push(indeksKolumny);
      if (naglowek === "iist") indeksyIist.push(indeksKolumny);
    });
    if (indeksySemper.length && indeksyIist.length) {
      if (indeksySemper.length !== 1 || indeksyIist.length !== 1) {
        niejednoznacznyWiersz = true;
        return;
      }
      kandydaci.push({
        numerWiersza:indeksWiersza+1,
        indeksSemper:indeksySemper[0],
        indeksIist:indeksyIist[0]
      });
    }
  });

  if (niejednoznacznyWiersz || kandydaci.length > 1) {
    throw bladMostu("HEADER_AMBIGUOUS");
  }
  if (kandydaci.length !== 1) throw bladMostu("HEADER_NOT_FOUND");
  return kandydaci[0];
}

function normalizujNaglowek(wartosc) {
  return normalizujBialeZnaki(wartosc).toLowerCase();
}

function normalizujBialeZnaki(wartosc) {
  return String(wartosc == null ? "" : wartosc).replace(/\s+/g," ").trim();
}

function obliczFingerprintWiersza(wiersz, indeksSemper, indeksIist) {
  var wartosciDoFingerprintu = wiersz.filter(function (_, indeks) {
    return indeks !== indeksSemper && indeks !== indeksIist;
  });
  while (wartosciDoFingerprintu.length
    && wartosciDoFingerprintu[wartosciDoFingerprintu.length-1] === "") {
    wartosciDoFingerprintu.pop();
  }
  var tresc = JSON.stringify(wartosciDoFingerprintu);
  var bajty = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    tresc,
    Utilities.Charset.UTF_8
  );
  return bajty.map(function (bajt) {
    var wartosc = (bajt+256)%256;
    return ("0"+wartosc.toString(16)).slice(-2);
  }).join("");
}

function bladMostu(kod) {
  var blad = new Error(kod);
  blad.kodMostu = kod;
  return blad;
}

function odpowiedzJson(czySukces, kod, identyfikatorZadania, dane) {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok:czySukces,
      code:kod,
      requestId:identyfikatorZadania || "",
      bridgeVersion:WERSJA_MOSTU,
      data:dane
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function komunikatPubliczny(kod) {
  var komunikaty = {
    METHOD_NOT_ALLOWED:"Użyj żądania POST.",
    EMPTY_REQUEST:"Brak treści żądania.",
    INVALID_JSON:"Nieprawidłowy JSON.",
    INVALID_REQUEST:"Nieprawidłowe żądanie.",
    REQUEST_ID_REQUIRED:"Brak prawidłowego requestId.",
    ACTION_REQUIRED:"Brak prawidłowej akcji.",
    PAYLOAD_INVALID:"Nieprawidłowy payload.",
    CONFIG_MISSING:"Bridge nie został skonfigurowany.",
    AUTH_REQUIRED:"Brak klucza Bridge.",
    AUTH_INVALID:"Nieprawidłowy klucz Bridge.",
    ACTION_NOT_ALLOWED:"Niedozwolona akcja.",
    SPREADSHEET_UNAVAILABLE:"Nie można otworzyć skonfigurowanego arkusza.",
    SHEET_NAME_REQUIRED:"Brak nazwy karty.",
    SHEET_NAME_INVALID:"Nieprawidłowa nazwa karty.",
    SHEET_NOT_FOUND:"Nie znaleziono karty.",
    HEADER_NOT_FOUND:"Nie znaleziono jednoznacznych nagłówków SEMPER i IIST.",
    HEADER_AMBIGUOUS:"Znaleziono kilka możliwych układów nagłówków.",
    INTERNAL_ERROR:"Wewnętrzny błąd Bridge."
  };
  return komunikaty[kod] || "Błąd Bridge.";
}
