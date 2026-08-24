(function (globalny) {
  "use strict";

  const WERSJA_MOSTU = "1";
  const DOZWOLONE_AKCJE = new Set(["health","listSheets","readRows"]);
  const DOZWOLONE_HOSTY = new Set(["script.google.com","script.googleusercontent.com"]);

  function utworzBladMostu(kod, komunikat, dane) {
    const blad = new Error(komunikat);
    blad.kodMostu = kod;
    blad.daneMostu = dane;
    return blad;
  }

  function komunikatBledu(kod) {
    const komunikaty = {
      CONFIG_DISABLED:"Bridge arkusza jest wyłączony.",
      CONFIG_URL_MISSING:"Brak URL Web App.",
      CONFIG_KEY_MISSING:"Brak klucza Bridge.",
      CONFIG_URL_INVALID:"URL Web App jest nieprawidłowy.",
      CONFIG_URL_NOT_ALLOWED:"URL musi wskazywać dozwolony host Google Apps Script.",
      SHEET_NAME_MISSING:"Nie wybrano karty arkusza.",
      ACTION_NOT_ALLOWED:"Niedozwolona akcja Bridge.",
      FETCH_UNAVAILABLE:"Brak obsługi żądań sieciowych.",
      TIMEOUT:"Przekroczono limit czasu odpowiedzi Bridge.",
      NETWORK_ERROR:"Nie udało się połączyć z Bridge.",
      HTTP_ERROR:"Bridge zwrócił błąd HTTP.",
      INVALID_JSON:"Bridge zwrócił nieprawidłowy JSON.",
      INVALID_RESPONSE:"Bridge zwrócił nieprawidłową odpowiedź.",
      REQUEST_ID_MISMATCH:"Odpowiedź Bridge ma inny requestId.",
      BRIDGE_VERSION_UNSUPPORTED:"Wersja protokołu Bridge nie jest obsługiwana.",
      INVALID_SHEETS_LIST:"Lista kart ma nieprawidłowy format.",
      INVALID_READ_ROWS:"Dane readRows mają nieprawidłowy format.",
      INTERNAL_ERROR:"Wystąpił wewnętrzny błąd klienta Bridge."
    };
    return komunikaty[kod] || "Bridge zwrócił błąd.";
  }

  function wynikBledu(kod, identyfikatorZadania, dane) {
    return {
      ok:false,
      code:kod,
      requestId:identyfikatorZadania || "",
      bridgeVersion:WERSJA_MOSTU,
      data:{
        message:komunikatBledu(kod),
        ...(dane || {})
      }
    };
  }

  function utworzRequestId() {
    if (globalny.crypto && typeof globalny.crypto.randomUUID === "function") {
      return globalny.crypto.randomUUID();
    }
    return "bridge-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function walidujAdres(adres) {
    if (!String(adres || "").trim()) {
      throw utworzBladMostu("CONFIG_URL_MISSING",komunikatBledu("CONFIG_URL_MISSING"));
    }
    let adresUrl;
    try {
      adresUrl = new URL(String(adres).trim());
    } catch {
      throw utworzBladMostu("CONFIG_URL_INVALID",komunikatBledu("CONFIG_URL_INVALID"));
    }
    if (adresUrl.protocol !== "https:" || adresUrl.username || adresUrl.password) {
      throw utworzBladMostu("CONFIG_URL_INVALID",komunikatBledu("CONFIG_URL_INVALID"));
    }
    if (!DOZWOLONE_HOSTY.has(adresUrl.hostname.toLowerCase())) {
      throw utworzBladMostu("CONFIG_URL_NOT_ALLOWED",komunikatBledu("CONFIG_URL_NOT_ALLOWED"));
    }
    if (adresUrl.hostname.toLowerCase() === "script.google.com"
      && !/^\/macros\/s\/[^/]+\/(?:exec|dev)\/?$/.test(adresUrl.pathname)) {
      throw utworzBladMostu("CONFIG_URL_INVALID",komunikatBledu("CONFIG_URL_INVALID"));
    }
    return adresUrl.href;
  }

  function walidujKonfiguracje(parametry) {
    if (!parametry.sheetBridgeEnabled) {
      throw utworzBladMostu("CONFIG_DISABLED",komunikatBledu("CONFIG_DISABLED"));
    }
    if (!DOZWOLONE_AKCJE.has(parametry.action)) {
      throw utworzBladMostu("ACTION_NOT_ALLOWED",komunikatBledu("ACTION_NOT_ALLOWED"));
    }
    const adres = walidujAdres(parametry.sheetBridgeUrl);
    const klucz = String(parametry.sheetBridgeKey || "").trim();
    if (!klucz) {
      throw utworzBladMostu("CONFIG_KEY_MISSING",komunikatBledu("CONFIG_KEY_MISSING"));
    }
    const nazwaKarty = String(parametry.sheetName || "").trim();
    if (parametry.action === "readRows" && !nazwaKarty) {
      throw utworzBladMostu("SHEET_NAME_MISSING",komunikatBledu("SHEET_NAME_MISSING"));
    }
    return {adres,klucz,nazwaKarty};
  }

  function walidujOdpowiedzMostu(odpowiedz, oczekiwanyIdZadania) {
    if (!odpowiedz || typeof odpowiedz !== "object" || Array.isArray(odpowiedz)) {
      throw utworzBladMostu("INVALID_RESPONSE",komunikatBledu("INVALID_RESPONSE"));
    }
    if (typeof odpowiedz.ok !== "boolean"
      || typeof odpowiedz.code !== "string"
      || !odpowiedz.code
      || typeof odpowiedz.requestId !== "string"
      || typeof odpowiedz.bridgeVersion !== "string"
      || !Object.prototype.hasOwnProperty.call(odpowiedz,"data")) {
      throw utworzBladMostu("INVALID_RESPONSE",komunikatBledu("INVALID_RESPONSE"));
    }
    if (odpowiedz.requestId !== oczekiwanyIdZadania) {
      throw utworzBladMostu("REQUEST_ID_MISMATCH",komunikatBledu("REQUEST_ID_MISMATCH"));
    }
    if (odpowiedz.bridgeVersion !== WERSJA_MOSTU) {
      throw utworzBladMostu("BRIDGE_VERSION_UNSUPPORTED",komunikatBledu("BRIDGE_VERSION_UNSUPPORTED"));
    }
    return odpowiedz;
  }

  function parsujListeKart(dane) {
    if (!dane || typeof dane !== "object" || !Array.isArray(dane.sheets)) {
      throw utworzBladMostu("INVALID_SHEETS_LIST",komunikatBledu("INVALID_SHEETS_LIST"));
    }
    const karty = dane.sheets.map(nazwa=>String(nazwa || "").trim());
    if (karty.some(nazwa=>!nazwa)) {
      throw utworzBladMostu("INVALID_SHEETS_LIST",komunikatBledu("INVALID_SHEETS_LIST"));
    }
    return {sheets:Array.from(new Set(karty))};
  }

  function parsujWierszeOdczytu(dane) {
    if (!dane || typeof dane !== "object" || !Array.isArray(dane.rows)) {
      throw utworzBladMostu("INVALID_READ_ROWS",komunikatBledu("INVALID_READ_ROWS"));
    }
    const domyslnaNazwaKarty = String(dane.sheetName || "").trim();
    const wiersze = dane.rows.map(wiersz=>{
      if (!wiersz || typeof wiersz !== "object" || Array.isArray(wiersz)) {
        throw utworzBladMostu("INVALID_READ_ROWS",komunikatBledu("INVALID_READ_ROWS"));
      }
      const nazwaKarty = String(wiersz.sheetName || domyslnaNazwaKarty).trim();
      const numerWiersza = Number(wiersz.rowNumber);
      const odciskWiersza = String(wiersz.rowFingerprint || "").toLowerCase();
      if (!nazwaKarty
        || !Number.isInteger(numerWiersza)
        || numerWiersza < 1
        || !Array.isArray(wiersz.rawValues)
        || !/^[a-f0-9]{64}$/.test(odciskWiersza)) {
        throw utworzBladMostu("INVALID_READ_ROWS",komunikatBledu("INVALID_READ_ROWS"));
      }
      return {
        sheetName:nazwaKarty,
        rowNumber:numerWiersza,
        rawValues:wiersz.rawValues.map(wartosc=>wartosc == null ? "" : String(wartosc)),
        semperValue:wiersz.semperValue == null ? "" : String(wiersz.semperValue),
        iistValue:wiersz.iistValue == null ? "" : String(wiersz.iistValue),
        rowFingerprint:odciskWiersza
      };
    });
    return {
      sheetName:domyslnaNazwaKarty || wiersze[0]?.sheetName || "",
      headerRowNumber:Number.isInteger(Number(dane.headerRowNumber)) && Number(dane.headerRowNumber) >= 1
        ? Number(dane.headerRowNumber)
        : null,
      rows:wiersze
    };
  }

  async function wykonajZadanieMostu(parametry, zaleznosci) {
    const identyfikatorZadania = String(parametry?.requestId || utworzRequestId());
    let czasomierz = null;
    try {
      const konfiguracja = walidujKonfiguracje(parametry || {});
      const pobierz = zaleznosci?.pobierz || (typeof globalny.fetch === "function" ? globalny.fetch.bind(globalny) : null);
      if (!pobierz) throw utworzBladMostu("FETCH_UNAVAILABLE",komunikatBledu("FETCH_UNAVAILABLE"));

      const kontroler = new AbortController();
      const limitCzasu = Math.max(1,Math.min(60000,Number(parametry.timeoutMs) || 15000));
      czasomierz = setTimeout(()=>kontroler.abort(),limitCzasu);
      const ladunek = parametry.action === "readRows" ? {sheetName:konfiguracja.nazwaKarty} : {};
      let odpowiedzHttp;
      try {
        odpowiedzHttp = await pobierz(konfiguracja.adres,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            action:parametry.action,
            apiKey:konfiguracja.klucz,
            requestId:identyfikatorZadania,
            payload:ladunek
          }),
          credentials:"omit",
          redirect:"follow",
          cache:"no-store",
          referrerPolicy:"no-referrer",
          signal:kontroler.signal
        });
      } catch (blad) {
        if (blad?.name === "AbortError" || kontroler.signal.aborted) {
          throw utworzBladMostu("TIMEOUT",komunikatBledu("TIMEOUT"));
        }
        throw utworzBladMostu("NETWORK_ERROR",komunikatBledu("NETWORK_ERROR"));
      }

      if (!odpowiedzHttp?.ok) {
        throw utworzBladMostu("HTTP_ERROR",komunikatBledu("HTTP_ERROR"),{
          httpStatus:Number(odpowiedzHttp?.status) || 0
        });
      }

      let odpowiedz;
      try {
        odpowiedz = JSON.parse(await odpowiedzHttp.text());
      } catch {
        throw utworzBladMostu("INVALID_JSON",komunikatBledu("INVALID_JSON"));
      }
      walidujOdpowiedzMostu(odpowiedz,identyfikatorZadania);
      if (!odpowiedz.ok) return odpowiedz;
      if (parametry.action === "listSheets") odpowiedz.data = parsujListeKart(odpowiedz.data);
      if (parametry.action === "readRows") odpowiedz.data = parsujWierszeOdczytu(odpowiedz.data);
      return odpowiedz;
    } catch (blad) {
      return wynikBledu(
        blad?.kodMostu || "INTERNAL_ERROR",
        identyfikatorZadania,
        blad?.daneMostu
      );
    } finally {
      if (czasomierz !== null) clearTimeout(czasomierz);
    }
  }

  const interfejs = {
    WERSJA_MOSTU,
    utworzWynikBledu:wynikBledu,
    walidujOdpowiedzMostu,
    parsujListeKart,
    parsujWierszeOdczytu,
    wykonajZadanieMostu
  };

  globalny.KlientMostuArkuszaEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
