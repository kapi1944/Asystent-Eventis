(function (globalny) {
  "use strict";

  const NARZEDZIA_WYSZUKIWANIA = globalny.NarzedziaWyszukiwaniaEventis
    || (typeof require === "function" ? require("./wyszukiwanie") : null);
  if (!NARZEDZIA_WYSZUKIWANIA) throw new Error("Nie załadowano modułu wyszukiwania.");

  const MIASTA = ["Warszawa","Kraków","Poznań","Wrocław","Gdańsk","Katowice","Szczecin","Zakopane","Kołobrzeg"];

  function normalizuj(wartosc) {
    return NARZEDZIA_WYSZUKIWANIA.normalizujTytul(wartosc);
  }

  function normalizujDateRokMiesiacDzien(wartosc) {
    return String(wartosc || "").replace(/[.]/g,"-");
  }

  function dataZDniaMiesiacaRoku(dzien, miesiac, rok) {
    const dopelnij = wartosc => String(wartosc).padStart(2,"0");
    return String(rok) + "-" + dopelnij(miesiac) + "-" + dopelnij(dzien);
  }

  function zakresDatZTresci(tekst) {
    const tresc = String(tekst || "");
    let dopasowanie = tresc.match(/(?:od:\s*)?(\d{4}[.-]\d{2}[.-]\d{2})\s*(?:do:|do|[-–—])\s*(\d{4}[.-]\d{2}[.-]\d{2})/i);
    if (dopasowanie) {
      return {
        start: normalizujDateRokMiesiacDzien(dopasowanie[1]),
        end: normalizujDateRokMiesiacDzien(dopasowanie[2])
      };
    }

    dopasowanie = tresc.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})[.]([01]?\d)[.](\d{4})/);
    if (dopasowanie) {
      return {
        start: dataZDniaMiesiacaRoku(dopasowanie[1],dopasowanie[3],dopasowanie[4]),
        end: dataZDniaMiesiacaRoku(dopasowanie[2],dopasowanie[3],dopasowanie[4])
      };
    }

    dopasowanie = tresc.match(/(\d{1,2})[.]([01]?\d)[.](\d{4})\s*(?:do:|do|[-–—])\s*(\d{1,2})[.]([01]?\d)[.](\d{4})/i);
    if (dopasowanie) {
      return {
        start: dataZDniaMiesiacaRoku(dopasowanie[1],dopasowanie[2],dopasowanie[3]),
        end: dataZDniaMiesiacaRoku(dopasowanie[4],dopasowanie[5],dopasowanie[6])
      };
    }

    const daty = tresc.match(/\d{4}[.-]\d{2}[.-]\d{2}/g) || [];
    if (daty.length >= 2) {
      return {
        start: normalizujDateRokMiesiacDzien(daty[0]),
        end: normalizujDateRokMiesiacDzien(daty[1])
      };
    }
    if (daty.length === 1) {
      const data = normalizujDateRokMiesiacDzien(daty[0]);
      return { start:data, end:data };
    }

    dopasowanie = tresc.match(/(\d{1,2})[.]([01]?\d)[.](\d{4})/);
    if (dopasowanie) {
      const data = dataZDniaMiesiacaRoku(dopasowanie[1],dopasowanie[2],dopasowanie[3]);
      return { start:data, end:data };
    }
    return null;
  }

  function liczbaDni(dataPoczatkowa, dataKoncowa) {
    const poczatek = new Date(dataPoczatkowa + "T00:00:00Z");
    const koniec = new Date(dataKoncowa + "T00:00:00Z");
    return Math.max(1,Math.round((koniec-poczatek)/86400000)+1);
  }

  function zastosujReguleCzterodniowegoTerminu(dataPoczatkowa, dataKoncowa, miasto, cena) {
    const zrodlowyPoczatek = dataPoczatkowa;
    const zrodlowyKoniec = dataKoncowa;
    const surowaLiczbaDni = liczbaDni(dataPoczatkowa,dataKoncowa);
    if (surowaLiczbaDni !== 4) {
      return {
        sourceStart:zrodlowyPoczatek,
        sourceEnd:zrodlowyKoniec,
        start:dataPoczatkowa,
        end:dataKoncowa,
        city:miasto,
        price:cena,
        durationDays:surowaLiczbaDni
      };
    }
    const przesunietyPoczatek = new Date(dataPoczatkowa + "T00:00:00Z");
    przesunietyPoczatek.setUTCDate(przesunietyPoczatek.getUTCDate()+1);
    return {
      sourceStart:zrodlowyPoczatek,
      sourceEnd:zrodlowyKoniec,
      start:przesunietyPoczatek.toISOString().slice(0,10),
      end:dataKoncowa,
      city:miasto,
      price:miasto === "Online" ? cena : cena-300,
      durationDays:3
    };
  }

  function miastoZTresci(tekst) {
    const znormalizowany = normalizuj(tekst);
    if (/\bonline\b/.test(znormalizowany)) return "Online";
    for (const miasto of MIASTA) {
      if (znormalizowany.includes(normalizuj(miasto))) return miasto;
    }
    return "";
  }

  function cenaZTresci(tekst) {
    const dopasowanie = String(tekst || "").replace(/\s+/g," ").match(/(\d{3,5})(?:[.,]\d{2})?\s*zł/i);
    return dopasowanie ? parseInt(dopasowanie[1],10) : null;
  }

  function czyTekstPotwierdzony(tekst) {
    const znormalizowany = normalizuj(tekst).replace(/\s+/g,"");
    return znormalizowany.includes("ostatniewolnemiejsca")
      || znormalizowany.includes("ostatniewolne")
      || znormalizowany.includes("potwierdzony")
      || znormalizowany.includes("gwarantowany")
      || znormalizowany.includes("gwarancjaterminu");
  }

  function kluczTerminu(termin) {
    return [termin.start,termin.end,normalizuj(termin.city)].join("|");
  }

  function kluczIstniejacegoTerminu(termin) {
    return [termin.start,normalizuj(termin.city)].join("|");
  }

  function usunDuplikatyTerminow(terminy) {
    const mapa = new Map();
    for (const termin of terminy) {
      const klucz = kluczTerminu(termin);
      const poprzedni = mapa.get(klucz);
      if (!poprzedni || (termin.confirmed && !poprzedni.confirmed)) mapa.set(klucz,termin);
    }
    return Array.from(mapa.values()).sort((pierwszy,drugi)=>
      pierwszy.start.localeCompare(drugi.start) || String(pierwszy.city).localeCompare(String(drugi.city))
    );
  }

  const interfejs = {
    dateRangeFromText: zakresDatZTresci,
    durationDays: liczbaDni,
    cityFromText: miastoZTresci,
    priceFromText: cenaZTresci,
    isConfirmedText: czyTekstPotwierdzony,
    termKey: kluczTerminu,
    existingKey: kluczIstniejacegoTerminu,
    dedupeTerms: usunDuplikatyTerminow,
    zastosujReguleCzterodniowegoTerminu
  };

  globalny.NarzedziaTerminowEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
