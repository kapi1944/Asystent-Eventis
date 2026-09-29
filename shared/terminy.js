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
    return kluczZgodnegoTerminu(termin);
  }

  function kluczZgodnegoTerminu(termin) {
    return [termin.start,termin.end || termin.start,normalizuj(termin.city)].join("|");
  }

  function odczytajTerminyEventis(dokument) {
    const terminy = [];
    for (const wiersz of dokument.querySelectorAll('[id^="li_eventdate_"]')) {
      const identyfikator = wiersz.id.split("_").pop();
      const poczatek = wiersz.querySelector(`input[name="eventDate[${identyfikator}][date_start]"]`)?.value
        || wiersz.querySelector(`#eventdate_datestart_${identyfikator}`)?.value;
      const koniec = wiersz.querySelector(`input[name="eventDate[${identyfikator}][date_end]"]`)?.value
        || wiersz.querySelector(`#eventdate_dateend_${identyfikator}`)?.value || poczatek;
      const miasto = wiersz.querySelector(`input[name="eventDate[${identyfikator}][city]"]`)?.value || "";
      const informacja = wiersz.querySelector(`input[name="eventDate[${identyfikator}][info]"]`)?.value || "";
      const tryb = wiersz.querySelector(`select[name="eventDate[${identyfikator}][is_online]"]`)?.value
        || wiersz.querySelector(`#eventdate_is_online_${identyfikator}`)?.value;
      const opisTrybu = wiersz.querySelector(`select[name="eventDate[${identyfikator}][is_online]"]`)?.selectedOptions?.[0]?.textContent || "";
      const lokalizacja = tryb === "1" || /\bonline\b/.test(normalizuj(`${tryb || ""} ${opisTrybu}`)) ? "Online" : (miasto || informacja);
      const cena = Number(wiersz.querySelector('input[name*="[price]"]')?.value || 0) || null;
      const znormalizowanyPoczatek = zakresDatZTresci(poczatek)?.start || poczatek;
      const znormalizowanyKoniec = zakresDatZTresci(koniec)?.end || koniec;
      if (poczatek) terminy.push({start:znormalizowanyPoczatek,end:znormalizowanyKoniec,city:String(lokalizacja).replace(/\s+/g," ").trim(),price:cena,row:wiersz,id:identyfikator});
    }
    return terminy;
  }

  function odczytajTerminySemper(dokument) {
    const terminy = [];
    for (const wiersz of dokument.querySelectorAll("table tr")) {
      const tekst = String(wiersz.textContent || "").replace(/\s+/g," ").trim();
      const komorki = Array.from(wiersz.children).map(komorka => String(komorka.textContent || "").replace(/\s+/g," ").trim());
      const zakres = zakresDatZTresci(komorki[0] || tekst);
      const miasto = miastoZTresci(komorki[1] || tekst);
      const cena = cenaZTresci(komorki[3] || tekst);
      if (!zakres || !miasto || !cena) continue;
      terminy.push({...zastosujReguleCzterodniowegoTerminu(zakres.start,zakres.end,miasto,cena),
        confirmed:Boolean(wiersz.querySelector(".gw")) || czyTekstPotwierdzony(tekst),rawText:tekst});
    }
    return usunDuplikatyTerminow(terminy);
  }

  function porownajPotwierdzoneTerminy(terminyZrodlowe = [], terminyEventis = []) {
    const potwierdzone = usunDuplikatyTerminow(terminyZrodlowe.filter(termin => termin.confirmed));
    const kluczeEventis = new Set(terminyEventis.map(kluczZgodnegoTerminu));
    const kluczePotwierdzone = new Set(potwierdzone.map(kluczZgodnegoTerminu));
    const zgodne = potwierdzone.filter(termin => kluczeEventis.has(kluczZgodnegoTerminu(termin)));
    const brakujace = potwierdzone.filter(termin => !kluczeEventis.has(kluczZgodnegoTerminu(termin)));
    const dodatkowe = terminyEventis.filter(termin => !kluczePotwierdzone.has(kluczZgodnegoTerminu(termin)));
    const status = !potwierdzone.length ? "UNVERIFIED" : !brakujace.length ? "COMPLETE"
      : terminyEventis.length === potwierdzone.length ? "COUNT_MATCH_BUT_DIFFERENT" : "MISSING_TERMS";
    return {status,confirmedSemperTerms:potwierdzone,matchingEventisTerms:zgodne,missingConfirmedTerms:brakujace,extraEventisTerms:dodatkowe,eventisTerms:terminyEventis};
  }

  function ustalWynikPreflightu(terminyZrodlowe, terminyEventis, blad = "") {
    return blad || !Array.isArray(terminyEventis)
      ? {status:"UNVERIFIED",error:String(blad || "Nie udało się odczytać terminów Eventis.")}
      : porownajPotwierdzoneTerminy(terminyZrodlowe,terminyEventis);
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
    kluczZgodnegoTerminu,
    odczytajTerminyEventis,
    odczytajTerminySemper,
    porownajPotwierdzoneTerminy,
    ustalWynikPreflightu,
    dedupeTerms: usunDuplikatyTerminow,
    zastosujReguleCzterodniowegoTerminu
  };

  globalny.NarzedziaTerminowEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
