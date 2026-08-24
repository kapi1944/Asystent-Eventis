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
    return String(wartosc).replace(/[.]/g,"-");
  }

  function utworzRekordArkusza(dane) {
    const rekord = {
      status:dane.status,
      title:dane.title,
      normalizedTitle:dane.normalizedTitle || normalizuj(dane.title),
      start:dane.start,
      end:dane.end,
      city:dane.city,
      participants:dane.participants
    };
    for (const pole of ["sheetName","rowNumber","rowFingerprint","semperValue","iistValue","rawValues","rawText"]) {
      if (Object.prototype.hasOwnProperty.call(dane,pole)) rekord[pole] = dane[pole];
    }
    return rekord;
  }

  function parsujLinieRekorduRecznego(linia) {
    const surowy = String(linia || "").replace(/<br\s*\/?\s*>/gi," ").replace(/\\\|/g,"|").replace(/\|/g," ").replace(/\s+/g," ").trim();
    const znormalizowany = normalizuj(surowy);
    let status = null;
    if (znormalizowany.includes("odpotwierdzone")) status=STATUSY_REKORDU_ARKUSZA.ODPOTWIERDZONY;
    else if (znormalizowany.includes("potwierdzone szkolenie")) status=STATUSY_REKORDU_ARKUSZA.POTWIERDZONY;
    if (!status) return null;

    let start=null;
    let end=null;
    let znacznikDaty="";
    let dopasowanie = surowy.match(/(\d{4}[.-]\d{2}[.-]\d{2})\s*(?:do|[-–—])\s*(\d{4}[.-]\d{2}[.-]\d{2})/i);
    if (dopasowanie) {
      start=normalizujCzescDatyRecznej(dopasowanie[1]);
      end=normalizujCzescDatyRecznej(dopasowanie[2]);
      znacznikDaty=dopasowanie[0];
    }
    if (!dopasowanie) {
      dopasowanie = surowy.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})[.]([01]?\d)[.](\d{4})/);
      if (dopasowanie) {
        const dopelnij = wartosc => String(wartosc).padStart(2,"0");
        start=dopasowanie[4]+"-"+dopelnij(dopasowanie[3])+"-"+dopelnij(dopasowanie[1]);
        end=dopasowanie[4]+"-"+dopelnij(dopasowanie[3])+"-"+dopelnij(dopasowanie[2]);
        znacznikDaty=dopasowanie[0];
      }
    }
    if (!dopasowanie) {
      dopasowanie = surowy.match(/(\d{4}[.-]\d{2}[.-]\d{2})/);
      if (dopasowanie) {
        start=end=normalizujCzescDatyRecznej(dopasowanie[1]);
        znacznikDaty=dopasowanie[0];
      }
    }
    if (!start) return {status,rawText:surowy,error:"Nie rozpoznano daty"};

    const miasto = NARZEDZIA_TERMINOW.cityFromText(surowy);
    if (!miasto) return {status,rawText:surowy,start,end,error:"Nie rozpoznano lokalizacji"};
    const dopasowanieUczestnikow = surowy.match(/(\d+)\s*(?:os(?:oby|ób|oba)?|osoby|osób)/i);
    const liczbaUczestnikow = dopasowanieUczestnikow ? Number(dopasowanieUczestnikow[1]) : null;
    const tytul = surowy
      .replace(/POTWIERDZONE\s+SZKOLENIE/ig,"")
      .replace(/ODPOTWIERDZONE/ig,"")
      .replace(znacznikDaty,"")
      .replace(new RegExp(miasto === "Online" ? "(?:SZKOLENIE\\s+)?ONLINE" : miasto,"ig"),"")
      .replace(/\d+\s*(?:os(?:oby|ób|oba)?|osoby|osób)/ig,"")
      .replace(/^\s*["']|["']\s*$/g,"")
      .replace(/^[,.;:\s]+|[,.;:\s]+$/g,"")
      .trim();

    return utworzRekordArkusza({
      status,
      title:tytul,
      normalizedTitle:normalizuj(tytul),
      start,
      end,
      city:miasto,
      participants:liczbaUczestnikow,
      rawText:surowy
    });
  }

  function parsujReczneWklejenie(tekst) {
    return String(tekst || "")
      .split(/\n+/)
      .map(oczyscLinie)
      .filter(linia=>/POTWIERDZONE\s+SZKOLENIE|ODPOTWIERDZONE/i.test(linia))
      .map(parsujLinieRekorduRecznego)
      .filter(Boolean);
  }

  function dopasujRekordyReczneDoBiezacego(rekordy, biezacyTytul) {
    return (rekordy || [])
      .map(rekord=>({
        ...rekord,
        similarity:rekord.title
          ? NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(biezacyTytul,rekord.title)
          : 0
      }))
      .filter(rekord=>rekord.error || rekord.similarity>=.58)
      .sort((pierwszy,drugi)=>(drugi.similarity || 0)-(pierwszy.similarity || 0));
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
    matchManualRecordsToCurrent: dopasujRekordyReczneDoBiezacego,
    recordKey: kluczSemantycznyRekordu
  };

  globalny.NarzedziaArkuszaEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
