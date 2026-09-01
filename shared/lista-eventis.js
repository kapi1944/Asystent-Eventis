(function (globalny) {
  "use strict";

  const NARZEDZIA_WYSZUKIWANIA = globalny.NarzedziaWyszukiwaniaEventis
    || (typeof require === "function" ? require("./wyszukiwanie") : null);
  if (!NARZEDZIA_WYSZUKIWANIA) throw new Error("Nie załadowano modułu wyszukiwania.");

  const PROG_DOPASOWANIA = 0.72;
  const MINIMALNA_PRZEWAGA = 0.08;
  const CZAS_WAZNOSCI_SERII_MS = 2 * 60 * 60 * 1000;
  const STATUSY_RESOLVERA = Object.freeze({
    AUTO_MATCH:"AUTO_MATCH",
    AMBIGUOUS:"AMBIGUOUS",
    NOT_FOUND:"NOT_FOUND"
  });

  function porownajKandydatow(pierwszy, drugi) {
    return drugi.score - pierwszy.score
      || pierwszy.normalizedTitle.localeCompare(drugi.normalizedTitle,"pl")
      || String(pierwszy.eventId).localeCompare(String(drugi.eventId),"pl",{numeric:true})
      || pierwszy.url.localeCompare(drugi.url);
  }

  function kandydaciEventis(ogloszenia = [], organizacja, normalizedSourceTitle) {
    const wedlugId = new Map();
    for (const ogloszenie of ogloszenia) {
      if (!ogloszenie?.eventisId || !ogloszenie.url) continue;
      if (ogloszenie.organization && ogloszenie.organization !== organizacja) continue;
      const tytuly = Array.isArray(ogloszenie.tytuly) ? ogloszenie.tytuly : [ogloszenie.tytul];
      for (const tytul of tytuly) {
        const normalizedTitle = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(tytul);
        if (!normalizedTitle) continue;
        const score = NARZEDZIA_WYSZUKIWANIA.ocenWynikWyszukiwania(normalizedSourceTitle,normalizedTitle);
        const kandydat = {
          eventId:String(ogloszenie.eventisId),
          url:ogloszenie.url,
          title:tytul,
          normalizedTitle,
          score,
          matchType:normalizedTitle === normalizedSourceTitle ? "EXACT" : "FUZZY"
        };
        const poprzedni = wedlugId.get(kandydat.eventId);
        if (!poprzedni || porownajKandydatow(kandydat,poprzedni) < 0) wedlugId.set(kandydat.eventId,kandydat);
      }
    }
    return [...wedlugId.values()].sort(porownajKandydatow);
  }

  function rozwiazGrupeTytulu(grupa, ogloszenia = [], organizacja, opcje = {}) {
    const sourceTitle = grupa?.tytul || grupa?.title || "";
    const normalizedSourceTitle = grupa?.normalizedTitle || NARZEDZIA_WYSZUKIWANIA.normalizujTytul(sourceTitle);
    const prog = Number(opcje.prog ?? PROG_DOPASOWANIA);
    const przewaga = Number(opcje.minimalnaPrzewaga ?? MINIMALNA_PRZEWAGA);
    const candidates = kandydaciEventis(ogloszenia,organizacja,normalizedSourceTitle);
    const exactMatches = candidates.filter(kandydat => kandydat.matchType === "EXACT");

    if (exactMatches.length === 1) {
      return {status:STATUSY_RESOLVERA.AUTO_MATCH,sourceTitle,normalizedSourceTitle,organization:organizacja,selectedCandidate:exactMatches[0],candidates,reason:"EXACT_MATCH",confidence:1};
    }
    if (exactMatches.length > 1) {
      return {status:STATUSY_RESOLVERA.AMBIGUOUS,sourceTitle,normalizedSourceTitle,organization:organizacja,selectedCandidate:null,candidates,reason:"MULTIPLE_EXACT_MATCHES",confidence:1};
    }

    const najlepszy = candidates[0];
    const drugi = candidates[1];
    if (!najlepszy || najlepszy.score < prog) {
      return {status:STATUSY_RESOLVERA.NOT_FOUND,sourceTitle,normalizedSourceTitle,organization:organizacja,selectedCandidate:null,candidates,reason:"NO_SUFFICIENT_FUZZY_MATCH",confidence:najlepszy?.score || 0};
    }
    if (drugi && najlepszy.score - drugi.score < przewaga) {
      return {status:STATUSY_RESOLVERA.AMBIGUOUS,sourceTitle,normalizedSourceTitle,organization:organizacja,selectedCandidate:null,candidates,reason:"FUZZY_MATCHES_TOO_CLOSE",confidence:najlepszy.score};
    }
    return {status:STATUSY_RESOLVERA.AUTO_MATCH,sourceTitle,normalizedSourceTitle,organization:organizacja,selectedCandidate:najlepszy,candidates,reason:"STRONG_FUZZY_MATCH",confidence:najlepszy.score};
  }

  function wybierzKandydataRozstrzygniecia(rozstrzygniecie, eventId) {
    const kandydat = (rozstrzygniecie?.candidates || []).find(pozycja => String(pozycja.eventId) === String(eventId));
    if (!kandydat) return null;
    return {...rozstrzygniecie,selectedCandidate:kandydat,manualStatus:"MANUAL_MATCH"};
  }

  function pominRozstrzygniecie(rozstrzygniecie) {
    return {...rozstrzygniecie,selectedCandidate:null,manualStatus:"SKIPPED"};
  }

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

  function utworzKandydataZUrlEventis(wartosc, sourceTitle) {
    const eventId = pobierzIdEventisZUrl(wartosc);
    if (!eventId) return null;
    const url = new URL(String(wartosc),"https://eventis.pl/").href;
    return {
      eventId,
      url,
      title:String(sourceTitle || ""),
      normalizedTitle:NARZEDZIA_WYSZUKIWANIA.normalizujTytul(sourceTitle),
      score:0,
      matchType:"MANUAL_URL"
    };
  }

  function wybierzRecznyUrlEventis(rozstrzygniecie, wartosc) {
    const kandydat = utworzKandydataZUrlEventis(wartosc,rozstrzygniecie?.sourceTitle);
    return kandydat ? {...rozstrzygniecie,selectedCandidate:kandydat,manualStatus:"MANUAL_MATCH"} : null;
  }

  function utworzPlanOtwarcia(rozstrzygniecia = []) {
    const pozycje = [];
    let nierozstrzygniete = 0;
    for (const rozstrzygniecie of rozstrzygniecia) {
      const wybrany = rozstrzygniecie.manualStatus === "MANUAL_MATCH"
        ? rozstrzygniecie.selectedCandidate
        : rozstrzygniecie.status === STATUSY_RESOLVERA.AUTO_MATCH ? rozstrzygniecie.selectedCandidate : null;
      if (wybrany) {
        pozycje.push({sourceTitle:rozstrzygniecie.sourceTitle,status:"READY",selectedCandidate:wybrany});
      } else if (rozstrzygniecie.manualStatus === "SKIPPED") {
        pozycje.push({sourceTitle:rozstrzygniecie.sourceTitle,status:"SKIPPED",selectedCandidate:null});
      } else {
        nierozstrzygniete++;
      }
    }
    return {pozycje,gotoweDoOtwarcia:pozycje.filter(pozycja => pozycja.status === "READY").length,nierozstrzygniete};
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
    const propozycje = pogrupujElementyKolejki(elementy,organizacja).map(grupa => {
      const resolver = rozwiazGrupeTytulu(grupa,ogloszenia,organizacja,opcje);
      const wyniki = resolver.candidates.map(kandydat => ({
        ogloszenie:{eventisId:kandydat.eventId,url:kandydat.url,tytul:kandydat.title},
        wynik:kandydat.score
      }));
      return {grupa,resolver,wyniki,najlepszy:wyniki[0],jednoznaczne:resolver.status === STATUSY_RESOLVERA.AUTO_MATCH};
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
          wynik:propozycja.najlepszy.wynik,
          resolver:propozycja.resolver
        });
      } else {
        nierozpoznane.push({
          tytul:propozycja.grupa.tytul,
          elementy:propozycja.grupa.elementy,
          powod:kolizja ? "COLLISION" : propozycja.resolver.status === STATUSY_RESOLVERA.AMBIGUOUS ? "AMBIGUOUS" : "NO_MATCH",
          najlepszyWynik:propozycja.resolver.confidence,
          resolver:propozycja.resolver
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
    STATUSY_RESOLVERA,
    pobierzIdEventisZUrl,
    utworzKandydataZUrlEventis,
    pogrupujElementyKolejki,
    rozwiazGrupeTytulu,
    wybierzKandydataRozstrzygniecia,
    wybierzRecznyUrlEventis,
    pominRozstrzygniecie,
    utworzPlanOtwarcia,
    dopasujKolejkeDoOgloszen,
    czyMapowanieGotoweDoAutomatyzacji,
    utworzSerieAutomatyczna,
    znajdzAktywneZadanie
  };

  globalny.NarzedziaListyEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
