(function (globalny) {
  "use strict";

  const NARZEDZIA_WYSZUKIWANIA = globalny.NarzedziaWyszukiwaniaEventis
    || (typeof require === "function" ? require("./wyszukiwanie") : null);
  const NARZEDZIA_TERMINOW = globalny.NarzedziaTerminowEventis
    || (typeof require === "function" ? require("./terminy") : null);
  if (!NARZEDZIA_WYSZUKIWANIA || !NARZEDZIA_TERMINOW) {
    throw new Error("Nie załadowano modułów wymaganych przez obsługę arkusza.");
  }

  const STATUSY_REKORDU_ARKUSZA = Object.freeze({
    POTWIERDZONY: "CONFIRMED",
    ODPOTWIERDZONY: "DECONFIRMED"
  });

  function normalizuj(wartosc) {
    return NARZEDZIA_WYSZUKIWANIA.normalizujTytul(wartosc);
  }

  function oczyscLinie(wartosc) {
    return NARZEDZIA_WYSZUKIWANIA.oczyscLinie(wartosc);
  }

  function normalizujCzescDatyRecznej(wartosc) {
    return String(wartosc).replace(/[.]/g, "-");
  }

  function czyPoprawnaData(wartosc) {
    const dopasowanie = String(wartosc || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dopasowanie) return false;
    const [, rok, miesiac, dzien] = dopasowanie.map(Number);
    const data = new Date(Date.UTC(rok, miesiac - 1, dzien));
    return data.getUTCFullYear() === rok
      && data.getUTCMonth() === miesiac - 1
      && data.getUTCDate() === dzien;
  }

  function czyPoprawnyZakresDat(zakresDat) {
    return czyPoprawnaData(zakresDat?.start)
      && czyPoprawnaData(zakresDat?.end)
      && zakresDat.start <= zakresDat.end;
  }

  function utworzRekordArkusza(dane) {
    const rekord = {
      status: dane.status,
      title: dane.title,
      normalizedTitle: dane.normalizedTitle || normalizuj(dane.title),
      start: dane.start,
      end: dane.end,
      city: dane.city,
      participants: dane.participants
    };
    for (const pole of ["sheetName", "rowNumber", "rowFingerprint", "semperValue", "iistValue", "rawValues", "rawText", "error"]) {
      if (Object.prototype.hasOwnProperty.call(dane, pole)) rekord[pole] = dane[pole];
    }
    return rekord;
  }

  function czyPipeEscapowany(tekst, indeks) {
    let liczbaUcieczek = 0;
    for (let i = indeks - 1; i >= 0 && tekst[i] === "\\"; i--) liczbaUcieczek++;
    return liczbaUcieczek % 2 === 1;
  }

  function usunRamkeWierszaMarkdown(wartosc) {
    let tekst = String(wartosc || "").trim();
    if (tekst.startsWith("|") && !czyPipeEscapowany(tekst, 0)) tekst = tekst.slice(1).trim();
    const ostatni = tekst.length - 1;
    if (ostatni >= 0 && tekst[ostatni] === "|" && !czyPipeEscapowany(tekst, ostatni)) tekst = tekst.slice(0, ostatni).trim();
    return tekst;
  }

  function oczyscWierszRekordu(wartosc) {
    const bezHtml = String(wartosc || "").replace(/<br\s*\/?\s*>/gi, " ");
    const bezRamki = usunRamkeWierszaMarkdown(bezHtml);
    return bezRamki
      .replace(/^\\?\|\s*(ODPOTWIERDZONE|POTWIERDZONE\s+SZKOLENIE)\s*\\?\|\s*/i, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function znajdzStatus(tekst) {
    if (/ODPOTWIERDZONE/i.test(tekst)) return STATUSY_REKORDU_ARKUSZA.ODPOTWIERDZONY;
    if (/POTWIERDZONE\s+SZKOLENIE/i.test(tekst)) return STATUSY_REKORDU_ARKUSZA.POTWIERDZONY;
    return null;
  }

  function znajdzTytulWCudzyslowie(tekst) {
    const dopasowanie = tekst.match(/"((?:\\.|[^"\\])*)"/);
    if (!dopasowanie) return "";
    return dopasowanie[1].replace(/\\\|/g, "|").replace(/\\"/g, '"').trim();
  }

  function dopasowanieUczestnikow(tekst) {
    return tekst.match(/(\d+)\s*(?:osób|osoby|osoba|os)(?:\s*(?:\([^)]*BUR[^)]*\)|z\s+BUR))?/i);
  }

  function wytnijPoUczestnikach(tekst) {
    const dopasowanie = dopasowanieUczestnikow(tekst);
    if (!dopasowanie) return tekst;
    return tekst.slice(0, dopasowanie.index + dopasowanie[0].length).trim();
  }

  function wytnijFormatowanieStatusu(tekst) {
    return tekst
      .replace(/^ODPOTWIERDZONE\s*/i, "")
      .replace(/^POTWIERDZONE\s+SZKOLENIE\s*/i, "")
      .trim();
  }

  function odtworzTytulBezCudzyslowu(tekst, zakresDat, miasto, dopasowanieUczestnikow) {
    let tytul = wytnijFormatowanieStatusu(tekst);
    if (zakresDat) {
      tytul = tytul
        .replace(/(?:od:\s*)?\d{4}[.-]\d{2}[.-]\d{2}\s*(?:do:|do|[-–—])\s*\d{4}[.-]\d{2}[.-]\d{2}/i, "")
        .replace(/\d{1,2}\s*[-–—]\s*\d{1,2}[.]\d{1,2}[.]\d{4}/, "")
        .replace(/\d{1,2}[.]\d{1,2}[.]\d{4}\s*(?:do:|do|[-–—])\s*\d{1,2}[.]\d{1,2}[.]\d{4}/i, "")
        .replace(/\d{4}[.-]\d{2}[.-]\d{2}/g, "")
        .replace(/\d{1,2}[.]\d{1,2}[.]\d{4}/g, "");
    }
    if (dopasowanieUczestnikow) tytul = tytul.slice(0, dopasowanieUczestnikow.index);
    if (miasto) tytul = tytul.replace(new RegExp(miasto === "Online" ? "(?:SZKOLENIE\\s+)?ONLINE" : miasto, "ig"), "");
    return tytul
      .replace(/\bSZKOLENIE\b/ig, "")
      .replace(/^[,.;:\s]+|[,.;:\s]+$/g, "")
      .trim();
  }

  function parsujLinieRekorduRecznego(linia) {
    const surowy = String(linia || "").trim();
    const tekst = oczyscWierszRekordu(surowy);
    const status = znajdzStatus(tekst);
    if (!status) return null;

    const tekstDoAnalizy = wytnijPoUczestnikach(tekst);
    const zakresDat = NARZEDZIA_TERMINOW.dateRangeFromText(tekstDoAnalizy);
    const dopasowanieUczestnikow = tekstDoAnalizy.match(/(\d+)\s*(?:osób|osoby|osoba|os)(?:\s*(?:\([^)]*BUR[^)]*\)|z\s+BUR))?/i);
    const liczbaUczestnikow = dopasowanieUczestnikow ? Number(dopasowanieUczestnikow[1]) : null;
    const miasto = NARZEDZIA_TERMINOW.cityFromText(tekstDoAnalizy);
    const tytulWCudzyslowie = znajdzTytulWCudzyslowie(tekst);
    const tytul = tytulWCudzyslowie || odtworzTytulBezCudzyslowu(tekstDoAnalizy, zakresDat, miasto, dopasowanieUczestnikow);
    const dane = { status, title: tytul, normalizedTitle: normalizuj(tytul), start: zakresDat?.start || null, end: zakresDat?.end || null, city: miasto || null, participants: liczbaUczestnikow, rawText: surowy };
    if (!zakresDat) dane.error = "Nie rozpoznano daty";
    else if (!czyPoprawnyZakresDat(zakresDat)) dane.error = "Nieprawidłowy zakres dat";
    else if (!dane.normalizedTitle) dane.error = "Nie rozpoznano tytułu";
    else if (!miasto) dane.error = "Nie rozpoznano lokalizacji";
    return utworzRekordArkusza(dane);
  }

  function analizujReczneWklejenie(tekst) {
    const rekordy = String(tekst || "")
      .split(/\r?\n/)
      .map(linia => oczyscLinie(linia))
      .filter(linia => znajdzStatus(linia))
      .map(parsujLinieRekorduRecznego)
      .filter(Boolean);
    return { records: rekordy, errors: rekordy.filter(rekord => rekord.error) };
  }

  function parsujReczneWklejenie(tekst) {
    return analizujReczneWklejenie(tekst).records;
  }

  function dopasujRekordyReczneDoBiezacego(rekordy, biezacyTytul) {
    return (rekordy || [])
      .map(rekord => ({
        ...rekord,
        similarity: rekord.title
          ? NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(biezacyTytul, rekord.title)
          : 0
      }))
      .filter(rekord => rekord.error || rekord.similarity >= .58)
      .sort((pierwszy, drugi) => (drugi.similarity || 0) - (pierwszy.similarity || 0));
  }

  function kluczSemantycznyRekordu(rekord) {
    const znormalizowanyTytul = rekord.normalizedTitle || normalizuj(rekord.title);
    const znormalizowaneMiasto = normalizuj(rekord.normalizedCity || rekord.city);
    return [
      String(rekord.status || "").toUpperCase(),
      znormalizowanyTytul,
      rekord.start || "",
      rekord.end || rekord.start || "",
      znormalizowaneMiasto
    ].join("|");
  }

  const interfejs = {
    STATUSY_REKORDU_ARKUSZA,
    utworzRekordArkusza,
    normalizeManualDatePart: normalizujCzescDatyRecznej,
    parseManualRecordLine: parsujLinieRekorduRecznego,
    parseManualPaste: parsujReczneWklejenie,
    analizujReczneWklejenie,
    matchManualRecordsToCurrent: dopasujRekordyReczneDoBiezacego,
    recordKey: kluczSemantycznyRekordu
  };

  globalny.NarzedziaArkuszaEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
