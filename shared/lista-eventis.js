(function (globalny) {
  "use strict";

  const NARZEDZIA_WYSZUKIWANIA = globalny.NarzedziaWyszukiwaniaEventis
    || (typeof require === "function" ? require("./wyszukiwanie") : null);
  if (!NARZEDZIA_WYSZUKIWANIA) throw new Error("Nie załadowano modułu wyszukiwania.");

  const PROG_DOPASOWANIA = 0.72;
  const MINIMALNA_PRZEWAGA = 0.08;
  const CZAS_WAZNOSCI_SERII_MS = 2 * 60 * 60 * 1000;

  function pobierzIdEventisZUrl(wartosc) {
    try {
      const url = new URL(String(wartosc || ""), "https://eventis.pl/");
      if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)eventis\.pl$/i.test(url.hostname)) return "";
      const zeSciezki = url.pathname.match(/^\/event\/edit\/(\d+)(?:\/|$)/i);
      if (zeSciezki) return zeSciezki[1];
      if (/^\/event\/edit(?:\/|$)/i.test(url.pathname)) return url.searchParams.get("id") || url.searchParams.get("event_id") || url.searchParams.get("eventId") || "";
      return "";
    } catch (_) {
      return "";
    }
  }

  function pogrupujElementyKolejki(elementy = [], organizacja) {
    const grupy = new Map();
    for (const element of elementy) {
      if (element.organization !== organizacja || !["PENDING", "ERROR"].includes(element.status)) continue;
      const klucz = element.normalizedTitle || NARZEDZIA_WYSZUKIWANIA.normalizujTytul(element.title);
      if (!klucz) continue;
      if (!grupy.has(klucz)) grupy.set(klucz, { klucz, tytul:element.title, elementy:[] });
      grupy.get(klucz).elementy.push(element);
    }
    return [...grupy.values()];
  }

  function najlepszyWynikDlaOgloszenia(tytul, ogloszenie) {
    const tytuly = Array.isArray(ogloszenie.tytuly) ? ogloszenie.tytuly : [ogloszenie.tytul];
    return tytuly.reduce((najlepszy, kandydat) => Math.max(
      najlepszy,
      NARZEDZIA_WYSZUKIWANIA.ocenWynikWyszukiwania(tytul,kandydat)
    ), 0);
  }

  function dopasujKolejkeDoOgloszen(elementy = [], ogloszenia = [], organizacja, opcje = {}) {
    const prog = Number(opcje.prog ?? PROG_DOPASOWANIA);
    const przewaga = Number(opcje.minimalnaPrzewaga ?? MINIMALNA_PRZEWAGA);
    const propozycje = pogrupujElementyKolejki(elementy,organizacja).map(grupa => {
      const wyniki = ogloszenia
        .filter(ogloszenie => ogloszenie.eventisId && ogloszenie.url)
        .map(ogloszenie => ({ ogloszenie, wynik:najlepszyWynikDlaOgloszenia(grupa.tytul,ogloszenie) }))
        .sort((a,b) => b.wynik - a.wynik);
      const najlepszy = wyniki[0];
      const drugi = wyniki[1];
      const jednoznaczne = !!najlepszy && najlepszy.wynik >= prog && (!drugi || najlepszy.wynik - drugi.wynik >= przewaga);
      return { grupa, wyniki, najlepszy, jednoznaczne };
    });

    const wedlugOgloszenia = new Map();
    for (const propozycja of propozycje.filter(pozycja => pozycja.jednoznaczne)) {
      const klucz = propozycja.najlepszy.ogloszenie.eventisId;
      if (!wedlugOgloszenia.has(klucz)) wedlugOgloszenia.set(klucz,[]);
      wedlugOgloszenia.get(klucz).push(propozycja);
    }

    const dopasowane = [];
    const nierozpoznane = [];
    for (const propozycja of propozycje) {
      const kolizja = propozycja.jednoznaczne
        ? (wedlugOgloszenia.get(propozycja.najlepszy.ogloszenie.eventisId) || []).length > 1
        : false;
      if (propozycja.jednoznaczne && !kolizja) {
        dopasowane.push({
          tytul:propozycja.grupa.tytul,
          elementy:propozycja.grupa.elementy,
          ogloszenie:propozycja.najlepszy.ogloszenie,
          wynik:propozycja.najlepszy.wynik
        });
      } else {
        nierozpoznane.push({
          tytul:propozycja.grupa.tytul,
          elementy:propozycja.grupa.elementy,
          powod:kolizja ? "COLLISION" : propozycja.najlepszy?.wynik >= prog ? "AMBIGUOUS" : "NO_MATCH",
          najlepszyWynik:propozycja.najlepszy?.wynik || 0
        });
      }
    }
    return { dopasowane, nierozpoznane };
  }

  function czyMapowanieGotoweDoAutomatyzacji(mapowanie, prog) {
    return !!mapowanie
      && mapowanie.status === "ACTIVE"
      && !!mapowanie.sourceUrl
      && !!mapowanie.lastVerifiedAt
      && Number(mapowanie.confidence || 0) >= Number(prog || 0);
  }

  function utworzSerieAutomatyczna(dopasowania, organizacja, opcje = {}) {
    const utworzono = opcje.utworzono || new Date().toISOString();
    const utworzonoMs = new Date(utworzono).getTime();
    const identyfikatorSerii = opcje.identyfikatorSerii
      || (globalny.crypto?.randomUUID ? globalny.crypto.randomUUID() : `seria-eventis-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    return {
      identyfikatorSerii,
      organizacja,
      utworzono,
      wygasa:new Date(utworzonoMs + CZAS_WAZNOSCI_SERII_MS).toISOString(),
      status:"ACTIVE",
      zadania:dopasowania.map(dopasowanie => ({
        eventisId:dopasowanie.ogloszenie.eventisId,
        eventisUrl:dopasowanie.ogloszenie.url,
        eventisTitle:dopasowanie.tytul,
        identyfikatoryKolejki:dopasowanie.elementy.map(element => element.id)
      }))
    };
  }

  function znajdzAktywneZadanie(serie = {}, organizacja, eventisId, teraz = Date.now()) {
    const kandydaci = Object.values(serie || {}).filter(seria =>
      seria?.status === "ACTIVE"
      && seria.organizacja === organizacja
      && Number.isFinite(new Date(seria.wygasa).getTime())
      && new Date(seria.wygasa).getTime() > teraz
    );
    for (const seria of kandydaci.sort((a,b) => String(b.utworzono).localeCompare(String(a.utworzono)))) {
      const zadanie = (seria.zadania || []).find(pozycja => String(pozycja.eventisId) === String(eventisId));
      if (zadanie) return { seria, zadanie };
    }
    return null;
  }

  const interfejs = {
    PROG_DOPASOWANIA,
    MINIMALNA_PRZEWAGA,
    CZAS_WAZNOSCI_SERII_MS,
    pobierzIdEventisZUrl,
    pogrupujElementyKolejki,
    dopasujKolejkeDoOgloszen,
    czyMapowanieGotoweDoAutomatyzacji,
    utworzSerieAutomatyczna,
    znajdzAktywneZadanie
  };

  globalny.NarzedziaListyEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
