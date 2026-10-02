(() => {
  "use strict";

  if (!/^\/company\/?$|^\/company\/listevents(?:\/|$)/i.test(location.pathname)) return;
  if (window.__EVENTIS_SYNC_LISTA__) return;
  window.__EVENTIS_SYNC_LISTA__ = true;

  const KONFIGURACJA = globalThis.EventisSyncConfig;
  const NARZEDZIA_WYSZUKIWANIA = globalThis.NarzedziaWyszukiwaniaEventis;
  const NARZEDZIA_ARKUSZA = globalThis.NarzedziaArkuszaEventis;
  const NARZEDZIA_TERMINOW = globalThis.NarzedziaTerminowEventis;
  const NARZEDZIA_KOLEJKI = globalThis.NarzedziaKolejkiEventis;
  const NARZEDZIA_LISTY = globalThis.NarzedziaListyEventis;
  const MAPOWANIA_WYDARZEN = globalThis.MapowaniaWydarzenEventis;
  if (!KONFIGURACJA || !NARZEDZIA_WYSZUKIWANIA || !NARZEDZIA_TERMINOW || !NARZEDZIA_ARKUSZA || !NARZEDZIA_KOLEJKI || !NARZEDZIA_LISTY || !MAPOWANIA_WYDARZEN) {
    throw new Error("Nie załadowano modułów kolejki listy Eventis.");
  }

  const stan = {
    ustawienia:{...KONFIGURACJA.DEFAULT_SETTINGS},
    organizacja:"SEMPER",
    rekordy:[],
    surowyTekst:"",
    kolejka:[],
    pokazKolejke:false,
    mapowania:{},
    ogloszenia:[],
    dopasowania:[],
    nierozpoznane:[],
    rozstrzygniecia:[],
    decyzje:{},
    magazynMapowan:null,
    planOtwarcia:null,
    liczbaBledow:0,
    liczbaDuplikatow:0,
    preflight:{trwa:false,sprawdzone:0,lacznie:0,wyniki:{},pokolenie:0},
    komunikat:"",
    bladAnalizy:false,
    skanowanie:{trwa:false,liczbaStron:1,liczbaZapytan:0,blad:""}
  };

  const MAKSYMALNA_LICZBA_STRON = 40;

  const $ = (selektor, korzen=document) => korzen.querySelector(selektor);
  const $$ = (selektor, korzen=document) => Array.from(korzen.querySelectorAll(selektor));
  const esc = wartosc => String(wartosc ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function pokazKomunikat(tekst) {
    $(".esync-toast")?.remove();
    const element = document.createElement("div");
    element.className = "esync-toast";
    element.textContent = tekst;
    document.body.appendChild(element);
    setTimeout(() => element.remove(),3500);
  }

  function obsluzAsynchronicznie(akcja) {
    return (...argumenty) => Promise.resolve()
      .then(() => akcja(...argumenty))
      .catch(blad => pokazKomunikat(blad?.message || String(blad)));
  }

  function wykryjOrganizacje() {
    const tekst = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(document.body.innerText || "");
    const znacznikSemper = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(stan.ustawienia.semperAccountMarker || "");
    const znacznikIist = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(stan.ustawienia.iistAccountMarker || "");
    if (znacznikIist && tekst.includes(znacznikIist)) return "IIST";
    if (znacznikSemper && tekst.includes(znacznikSemper)) return "SEMPER";
    if (/\biist\b/.test(tekst) && !/\bsemper\b/.test(tekst)) return "IIST";
    if (/\bsemper\b/.test(tekst) && !/\biist\b/.test(tekst)) return "SEMPER";
    return stan.ustawienia.defaultOrganization || "SEMPER";
  }

  function dodajKandydata(lista, wartosc) {
    const tekst = String(wartosc || "").replace(/\s+/g," ").trim();
    if (tekst.length >= 12 && !/^(edytuj|edycja|usun|usuń|podglad|podgląd)$/i.test(tekst) && !lista.includes(tekst)) lista.push(tekst);
  }

  function znajdzKontenerOgloszenia(link, identyfikatorEventis, adresStrony) {
    let element = link.parentElement;
    for (let poziom = 0; element && element !== link.ownerDocument.body && poziom < 9; poziom++, element = element.parentElement) {
      const identyfikatory = new Set($$('a[href*="/event/edit"]',element).map(kandydat => {
        try { return NARZEDZIA_LISTY.pobierzIdEventisZUrl(new URL(kandydat.getAttribute("href"),adresStrony).href); } catch (_) { return ""; }
      }).filter(Boolean));
      if (identyfikatory.size !== 1 || !identyfikatory.has(identyfikatorEventis)) continue;
      const tekstMerytoryczny = String(element.textContent || "")
        .replace(/\b(?:edytuj|edycja|usuń|usun|podgląd|podglad)\b/gi," ")
        .replace(/\s+/g," ")
        .trim();
      if (tekstMerytoryczny.length >= 12) return element;
    }
    return link.closest("tr, article, .event, .card, .panel, .row") || link.parentElement;
  }

  function pobierzOgloszeniaZDokumentu(dokument = document, adresStrony = location.href) {
    const wedlugId = new Map();
    for (const link of $$('a[href*="/event/edit"]',dokument)) {
      let url;
      try { url = new URL(link.getAttribute("href"),adresStrony); } catch (_) { continue; }
      const eventisId = NARZEDZIA_LISTY.pobierzIdEventisZUrl(url.href);
      if (!eventisId) continue;
      const kontener = znajdzKontenerOgloszenia(link,eventisId,adresStrony);
      const tytuly = wedlugId.get(eventisId)?.tytuly || [];
      dodajKandydata(tytuly,link.textContent);
      dodajKandydata(tytuly,link.getAttribute("title"));
      dodajKandydata(tytuly,link.getAttribute("aria-label"));
      for (const element of $$('[data-title], .event-title, .event-name, .title, .name, .media-heading, [class*="title"], [class*="nazwa"], h2, h3, h4, td, a',kontener || dokument)) {
        dodajKandydata(tytuly,element.getAttribute?.("data-title"));
        dodajKandydata(tytuly,element.textContent);
      }
      dodajKandydata(tytuly,kontener?.textContent);
      wedlugId.set(eventisId,{eventisId,url:url.href,tytuly});
    }
    return [...wedlugId.values()];
  }

  function pobierzAdresyPaginacji(dokument, adresStrony) {
    const adresy = new Set();
    for (const link of $$('a[href]',dokument)) {
      const adres = NARZEDZIA_LISTY.normalizujAdresStronyListyEventis(link.getAttribute("href"),adresStrony);
      if (!adres) continue;
      const url = new URL(adres);
      const tekst = String(link.textContent || "").replace(/\s+/g," ").trim();
      const jestWPaginacji = !!link.closest('.pagination,.pager,[class*="pagin"],[class*="pager"],nav[aria-label]');
      const maParametrStrony = [...url.searchParams.keys()].some(nazwa => /^(?:page|p|strona|start|offset|limitstart)$/i.test(nazwa));
      const wygladaJakNawigacja = /^(?:\d+|nast[eę]pna|nast[eę]pny|dalej|next|›|»|>)$/i.test(tekst);
      if (jestWPaginacji || maParametrStrony || wygladaJakNawigacja) adresy.add(adres);
    }
    return [...adresy];
  }

  async function pobierzDokumentListy(adres) {
    const odpowiedz = await fetch(adres,{credentials:"include",redirect:"follow",cache:"no-store"});
    if (!odpowiedz.ok) throw new Error(`Eventis zwrócił HTTP ${odpowiedz.status}.`);
    const adresKoncowy = NARZEDZIA_LISTY.normalizujAdresStronyListyEventis(odpowiedz.url,adres);
    if (!adresKoncowy) throw new Error("Eventis przekierował wyszukiwanie poza listę ogłoszeń.");
    return {dokument:new DOMParser().parseFromString(await odpowiedz.text(),"text/html"),adres:adresKoncowy};
  }

  function znajdzPoleWyszukiwaniaOgloszen() {
    return $$('input[type="search"],input[type="text"],input:not([type])')
      .filter(pole => !pole.closest("#esync-root") && !pole.disabled)
      .map(pole => {
        const opis = NARZEDZIA_WYSZUKIWANIA.normalizujTytul([
          pole.type,
          pole.name,
          pole.id,
          pole.placeholder,
          pole.getAttribute("aria-label")
        ].join(" "));
        const ocena = (pole.type === "search" ? 3 : 0)
          + (/szukaj|wyszukaj|search/.test(opis) ? 3 : 0)
          + (pole.offsetParent ? 1 : 0);
        return {pole,ocena};
      })
      .filter(pozycja => pozycja.ocena >= 3)
      .sort((pierwsza,druga) => druga.ocena - pierwsza.ocena)[0]?.pole || null;
  }

  function ustawWartoscPolaWyszukiwania(pole, wartosc) {
    const ustaw = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if (ustaw) ustaw.call(pole,wartosc); else pole.value = wartosc;
    pole.dispatchEvent(new Event("input",{bubbles:true}));
    pole.dispatchEvent(new Event("change",{bubbles:true}));
    pole.dispatchEvent(new KeyboardEvent("keyup",{bubbles:true,key:"Unidentified"}));
  }

  async function zastosujFiltrWyszukiwania(pole, wartosc) {
    const obserwowany = pole.closest('[class*="table"],[class*="list"],main,section') || document.body;
    await new Promise(rozwiaz => {
      let zakonczono = false;
      let czasUspokojenia = null;
      const zakoncz = () => {
        if (zakonczono) return;
        zakonczono = true;
        obserwator.disconnect();
        clearTimeout(czasUspokojenia);
        clearTimeout(czasMaksymalny);
        rozwiaz();
      };
      const obserwator = new MutationObserver(() => {
        clearTimeout(czasUspokojenia);
        czasUspokojenia = setTimeout(zakoncz,180);
      });
      obserwator.observe(obserwowany,{subtree:true,childList:true,characterData:true,attributes:true});
      const czasMaksymalny = setTimeout(zakoncz,1800);
      ustawWartoscPolaWyszukiwania(pole,wartosc);
      czasUspokojenia = setTimeout(zakoncz,700);
    });
  }

  async function pobierzOgloszeniaPrzezPoleWyszukiwania(tytuly) {
    const pole = znajdzPoleWyszukiwaniaOgloszen();
    if (!pole || !tytuly.length) return {ogloszenia:[],liczbaZapytan:0};
    const pierwotnaWartosc = pole.value;
    let ogloszenia = [];
    let liczbaZapytan = 0;
    try {
      for (const tytul of tytuly) {
        const warianty = NARZEDZIA_WYSZUKIWANIA.generujWariantyZapytania(tytul,5);
        for (const wariant of warianty) {
          await zastosujFiltrWyszukiwania(pole,wariant);
          liczbaZapytan++;
          ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(ogloszenia,pobierzOgloszeniaZDokumentu(document,location.href));
        }
      }
    } finally {
      await zastosujFiltrWyszukiwania(pole,pierwotnaWartosc);
    }
    return {ogloszenia,liczbaZapytan};
  }

  async function pobierzWszystkieOgloszeniaZListy(tytuly) {
    const adresPoczatkowy = NARZEDZIA_LISTY.normalizujAdresStronyListyEventis(location.href);
    const odwiedzone = new Set(adresPoczatkowy ? [adresPoczatkowy] : []);
    const oczekujace = pobierzAdresyPaginacji(document,location.href).filter(adres => !odwiedzone.has(adres));
    let ogloszenia = pobierzOgloszeniaZDokumentu(document,location.href);
    let ostatniBlad = "";

    while (oczekujace.length && odwiedzone.size < MAKSYMALNA_LICZBA_STRON) {
      const adres = oczekujace.shift();
      if (odwiedzone.has(adres)) continue;
      odwiedzone.add(adres);
      try {
        const wynik = await pobierzDokumentListy(adres);
        ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(ogloszenia,pobierzOgloszeniaZDokumentu(wynik.dokument,wynik.adres));
        for (const kolejnyAdres of pobierzAdresyPaginacji(wynik.dokument,wynik.adres)) {
          if (!odwiedzone.has(kolejnyAdres) && !oczekujace.includes(kolejnyAdres)) oczekujace.push(kolejnyAdres);
        }
      } catch (blad) {
        ostatniBlad = blad?.message || String(blad);
      }
    }
    if (oczekujace.length && odwiedzone.size >= MAKSYMALNA_LICZBA_STRON) {
      ostatniBlad = `Osiągnięto bezpieczny limit ${MAKSYMALNA_LICZBA_STRON} stron listy.`;
    }
    const wynikPola = await pobierzOgloszeniaPrzezPoleWyszukiwania(tytuly);
    ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(ogloszenia,wynikPola.ogloszenia);
    return {ogloszenia,liczbaStron:odwiedzone.size,liczbaZapytan:wynikPola.liczbaZapytan,blad:ostatniBlad};
  }

  function elementyDotyczaceRekordow(kolejka, rekordy) {
    const klucze = new Set(rekordy.filter(rekord => ["CONFIRMED","DECONFIRMED"].includes(rekord.status) && !rekord.error).map(NARZEDZIA_ARKUSZA.recordKey));
    return kolejka.filter(element => element.organization === stan.organizacja && klucze.has(element.recordKey)
      && ["PENDING","ERROR","NEEDS_ATTENTION","COMPLETED_EXISTING"].includes(element.status));
  }

  function odtworzAnalizeTrwalejKolejki() {
    const aktywneElementy = stan.kolejka.filter(element => element.organization === stan.organizacja
      && ["PENDING","ERROR","NEEDS_ATTENTION","COMPLETED_EXISTING"].includes(element.status));
    stan.rekordy = aktywneElementy.map(element => ({
      status:element.recordStatus,
      title:element.title,
      normalizedTitle:element.normalizedTitle,
      start:element.start,
      end:element.end,
      city:element.city,
      participants:element.participants,
      rawText:element.rawText,
      recordKey:element.recordKey
    }));
    const wynik = NARZEDZIA_LISTY.dopasujKolejkeDoOgloszen(aktywneElementy,stan.ogloszenia,stan.organizacja,{
      znajdzMapowanie:grupa => MAPOWANIA_WYDARZEN.resolverZMapowania(MAPOWANIA_WYDARZEN.pobierzBezpieczneMapowanie(stan.magazynMapowan,stan.organizacja,grupa.klucz,grupa.tytul))
    });
    stan.dopasowania = ocenGotowoscDopasowan(wynik.dopasowane);
    stan.nierozpoznane = wynik.nierozpoznane;
    stan.rozstrzygniecia = [
      ...wynik.dopasowane.map(dopasowanie => ({...dopasowanie.resolver,queueItemIds:dopasowanie.elementy.map(element => element.id)})),
      ...wynik.nierozpoznane.map(pozycja => pozycja.powod === "COLLISION"
        ? {...pozycja.resolver,status:"AMBIGUOUS",selectedCandidate:null,reason:"COLLISION",queueItemIds:pozycja.elementy.map(element => element.id)}
        : {...pozycja.resolver,queueItemIds:pozycja.elementy.map(element => element.id)})
    ];
  }

  function ocenGotowoscDopasowan(dopasowania) {
    const prog = stan.ustawienia.mappingWarningThreshold;
    return dopasowania.map(dopasowanie => {
      const mapowanie = stan.mapowania[`${stan.organizacja}|${dopasowanie.ogloszenie.eventisId}`];
      return { ...dopasowanie, gotowe:NARZEDZIA_LISTY.czyMapowanieGotoweDoAutomatyzacji(mapowanie,prog) };
    });
  }

  function kluczRozstrzygniecia(rozstrzygniecie) {
    return `${rozstrzygniecie.organization}|${rozstrzygniecie.normalizedSourceTitle}`;
  }

  function aktualneRozstrzygniecie(rozstrzygniecie) {
    return stan.decyzje[kluczRozstrzygniecia(rozstrzygniecie)] || rozstrzygniecie;
  }

  function liczbyTerminow(rozstrzygniecie) {
    const rekordy = stan.rekordy.filter(rekord => !rekord.error && rekord.normalizedTitle === rozstrzygniecie.normalizedSourceTitle);
    return {
      potwierdzone:rekordy.filter(rekord => rekord.status === "CONFIRMED").length,
      odpotwierdzone:rekordy.filter(rekord => rekord.status === "DECONFIRMED").length
    };
  }

  function potwierdzoneTerminyTytulu(rozstrzygniecie) {
    return stan.rekordy.filter(rekord => !rekord.error && rekord.status === "CONFIRMED"
      && rekord.normalizedTitle === rozstrzygniecie.normalizedSourceTitle)
      .map(rekord => ({...NARZEDZIA_TERMINOW.zastosujReguleCzterodniowegoTerminu(rekord.start,rekord.end,rekord.city,null),confirmed:true}));
  }

  async function sprawdzTerminyWydarzenia(rozstrzygniecie) {
    const kandydat = rozstrzygniecie.selectedCandidate;
    const identyfikator = NARZEDZIA_LISTY.pobierzIdEventisZUrl(kandydat?.url);
    if (identyfikator && String(identyfikator) !== String(kandydat?.eventId)) throw new Error("Brak bezpiecznego adresu edycji wydarzenia Eventis.");
    let terminyZrodlowe = potwierdzoneTerminyTytulu(rozstrzygniecie);
    let zrodlo = "wklejona lista";
    const mapowanie = stan.mapowania[`${stan.organizacja}|${identyfikator}`];
    let scalenie = null;
    let kontekst = null;
    if (stan.organizacja === "SEMPER") {
      const naglowkiWyszukiwania = {"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"};
      const stronyZrodla = new Map();
      async function zweryfikujStroneZrodla(adres) {
        const url = NARZEDZIA_WYSZUKIWANIA.absolutnyUrlSemper(adres);
        if (stronyZrodla.has(url)) return stronyZrodla.get(url);
        const odpowiedz = await chrome.runtime.sendMessage({type:"FETCH_TEXT",payload:{url}});
        if (!odpowiedz?.ok || !NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(odpowiedz.finalUrl)) throw new Error("Nie udało się potwierdzić aktualnej strony szkolenia SEMPER.");
        const dokument = new DOMParser().parseFromString(odpowiedz.text,"text/html");
        const tytul = (dokument.querySelector("h1") || dokument.querySelector("title"))?.textContent || "";
        const wariant = NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscWariantuLokalizacyjnego(rozstrzygniecie.sourceTitle,tytul);
        const wynik = NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(rozstrzygniecie.sourceTitle,tytul) >= stan.ustawienia.mappingWarningThreshold
          && (!wariant.wymagany || wariant.status === "ZGODNY") ? {odpowiedz,dokument} : null;
        stronyZrodla.set(url,wynik);
        return wynik;
      }
      let adresZrodla = mapowanie?.status === "ACTIVE" && mapowanie.lastVerifiedAt ? mapowanie.sourceUrl : "";
      if (!NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(adresZrodla)) {
        for (const wariant of NARZEDZIA_WYSZUKIWANIA.generujWariantyZapytania(rozstrzygniecie.sourceTitle)) {
          const wyszukanie = await chrome.runtime.sendMessage({type:"FETCH_TEXT",payload:{url:"https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj.php",method:"POST",headers:naglowkiWyszukiwania,body:new URLSearchParams({opc:"szukaj",co:wariant}).toString()}});
          if (wyszukanie?.ok) adresZrodla = NARZEDZIA_WYSZUKIWANIA.urlZJsonSemper(wyszukanie.text);
          if (adresZrodla && !await zweryfikujStroneZrodla(adresZrodla)) adresZrodla = "";
          if (!adresZrodla) {
            const podpowiedzi = await chrome.runtime.sendMessage({type:"FETCH_TEXT",payload:{url:"https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj_auto.php",method:"POST",headers:naglowkiWyszukiwania,body:new URLSearchParams({opc:"szukaj",co:wariant}).toString()}});
            const kandydaci = podpowiedzi?.ok ? NARZEDZIA_WYSZUKIWANIA.linkiZWyszukiwarkiSemper(podpowiedzi.text,wariant)
              .sort((pierwszy,drugi) => NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(rozstrzygniecie.sourceTitle,drugi.title)
                - NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(rozstrzygniecie.sourceTitle,pierwszy.title)).slice(0,5) : [];
            const zweryfikowani = new Map();
            for (const kandydat of kandydaci) {
              const strona = await zweryfikujStroneZrodla(kandydat.url);
              if (strona) zweryfikowani.set(strona.odpowiedz.finalUrl,kandydat.url);
            }
            if (zweryfikowani.size === 1) adresZrodla = [...zweryfikowani.values()][0];
          }
          if (NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(adresZrodla)) break;
        }
      }
      if (!NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(adresZrodla)) throw new Error("NEEDS_ATTENTION: nie znaleziono jednoznacznej strony szkolenia SEMPER.");
      const stronaZrodla = await zweryfikujStroneZrodla(adresZrodla);
      if (!stronaZrodla) throw new Error("NEEDS_ATTENTION: tytuł strony SEMPER wymaga weryfikacji.");
      const {odpowiedz:odpowiedzZrodla,dokument:dokumentZrodla} = stronaZrodla;
      const elementy = stan.kolejka.filter(element => element.organization === stan.organizacja && element.normalizedTitle === rozstrzygniecie.normalizedSourceTitle);
      scalenie = NARZEDZIA_TERMINOW.scalPotwierdzeniaKolejki(NARZEDZIA_TERMINOW.odczytajTerminySemper(dokumentZrodla),elementy);
      terminyZrodlowe = scalenie.terms;
      kontekst = {canonicalTitle:rozstrzygniecie.normalizedSourceTitle,queueTerms:elementy,sourceUrl:odpowiedzZrodla.finalUrl,targetEventisId:identyfikator || "",confirmationSource:"queue"};
      zrodlo = "bieżąca strona SEMPER";
    }
    const zakoncz = terminyEventis => {
      const porownanie = NARZEDZIA_TERMINOW.ustalWynikPreflightu(terminyZrodlowe,terminyEventis);
      const diagnostyka = {...scalenie?.diagnostics,eventisMatchingCount:porownanie.matchingEventisTerms.length,missingCount:porownanie.missingConfirmedTerms.length};
      if (stan.ustawienia.debug) console.debug("Eventis Sync terminy",{...diagnostyka,terms:terminyZrodlowe});
      return {...porownanie,zrodlo,queueContext:kontekst,reconciliation:scalenie,diagnostics:diagnostyka,
        status:scalenie?.status === "NEEDS_ATTENTION" ? "NEEDS_ATTENTION" : porownanie.status};
    };
    if (!identyfikator) return zakoncz([]);
    const adres = new URL(`/event/edit/${identyfikator}`,location.origin);
    const odpowiedz = await fetch(adres.href,{credentials:"include",redirect:"follow",cache:"no-store"});
    if (!odpowiedz.ok) throw new Error(`Eventis zwrócił HTTP ${odpowiedz.status}.`);
    if (NARZEDZIA_LISTY.pobierzIdEventisZUrl(odpowiedz.url) !== identyfikator) throw new Error("Eventis przekierował poza przypisane wydarzenie.");
    const dokument = new DOMParser().parseFromString(await odpowiedz.text(),"text/html");
    if (!dokument.querySelector("form#eventForm")) throw new Error("Nie odnaleziono formularza wydarzenia Eventis.");
    const terminyEventis = NARZEDZIA_TERMINOW.odczytajTerminyEventis(dokument)
      .map(({start,end,city}) => ({start,end,city}));
    return zakoncz(terminyEventis);
  }

  async function uruchomPreflight(wybraneKlucze = null) {
    const pokolenie = ++stan.preflight.pokolenie;
    const rozstrzygniecia = stan.rozstrzygniecia.map(aktualneRozstrzygniecie)
      .filter(rozstrzygniecie => rozstrzygniecie.manualStatus !== "SKIPPED"
        && (!wybraneKlucze || wybraneKlucze.has(kluczRozstrzygniecia(rozstrzygniecie))));
    for (const rozstrzygniecie of rozstrzygniecia) delete stan.preflight.wyniki[kluczRozstrzygniecia(rozstrzygniecie)];
    stan.preflight.trwa = true;
    stan.preflight.sprawdzone = 0;
    stan.preflight.lacznie = rozstrzygniecia.length;
    renderuj();
    let nastepny = 0;
    async function sprawdzKolejny() {
      while (nastepny < rozstrzygniecia.length && pokolenie === stan.preflight.pokolenie) {
        const rozstrzygniecie = rozstrzygniecia[nastepny++];
        const klucz = kluczRozstrzygniecia(rozstrzygniecie);
        try {
          const wynik = await sprawdzTerminyWydarzenia(rozstrzygniecie);
          if (pokolenie !== stan.preflight.pokolenie) return;
          stan.preflight.wyniki[klucz] = {...wynik,eventId:rozstrzygniecie.selectedCandidate?.eventId || "",checkedAt:new Date().toISOString()};
          if (["MISSING_TERMS","COUNT_MATCH_BUT_DIFFERENT"].includes(wynik.status)) {
            const {eventisImportQueue = []} = await chrome.storage.local.get(["eventisImportQueue"]);
            const klucze = new Set(stan.rekordy.filter(rekord => !rekord.error && rekord.status === "CONFIRMED"
              && rekord.normalizedTitle === rozstrzygniecie.normalizedSourceTitle).map(NARZEDZIA_ARKUSZA.recordKey));
            const zmiany = eventisImportQueue.filter(element => element.organization === stan.organizacja
              && klucze.has(element.recordKey) && element.status === "COMPLETED_EXISTING"
              && element.completion?.source === "preflight-existing")
              .map(element => ({...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,"PENDING"),completion:null,completionReason:null,completedAt:null}));
            if (zmiany.length) {
              const zapis = await chrome.runtime.sendMessage({type:"MERGE_QUEUE_ITEMS",items:zmiany});
              if (!zapis?.ok) throw new Error(zapis?.error || "Nie udało się odświeżyć statusu kolejki.");
              stan.kolejka = zapis.items;
            }
          }
        } catch (blad) {
          if (pokolenie !== stan.preflight.pokolenie) return;
          stan.preflight.wyniki[klucz] = {...NARZEDZIA_TERMINOW.ustalWynikPreflightu([],null,blad?.message || String(blad)),status:"NEEDS_ATTENTION",eventId:rozstrzygniecie.selectedCandidate?.eventId || ""};
        }
        stan.preflight.sprawdzone++;
        renderuj();
      }
    }
    await Promise.all(Array.from({length:Math.min(4,rozstrzygniecia.length)},sprawdzKolejny));
    if (pokolenie !== stan.preflight.pokolenie) return;
    stan.preflight.trwa = false;
    await odswiezPlanOtwarcia();
    renderuj();
  }

  async function ustawDecyzjeKompletnych(klucze, pomin) {
    const poprawne = new Set([...klucze].filter(klucz => {
      const rozstrzygniecie = stan.rozstrzygniecia.map(aktualneRozstrzygniecie)
        .find(pozycja => kluczRozstrzygniecia(pozycja) === klucz);
      const wynik = stan.preflight.wyniki[klucz];
      return rozstrzygniecie && wynik?.status === "COMPLETE"
        && String(wynik.eventId) === String(rozstrzygniecie.selectedCandidate?.eventId);
    }));
    if (!poprawne.size) return;
    const {eventisImportQueue = []} = await chrome.storage.local.get(["eventisImportQueue"]);
    const kolejka = NARZEDZIA_KOLEJKI.migrujKolejke(eventisImportQueue);
    const kluczeImportu = new Set(stan.rekordy.filter(rekord => !rekord.error && rekord.status === "CONFIRMED").map(NARZEDZIA_ARKUSZA.recordKey));
    const wyniki = Object.fromEntries([...poprawne].map(klucz => [klucz,stan.preflight.wyniki[klucz]]));
    const zaktualizowana = pomin ? NARZEDZIA_KOLEJKI.oznaczKompletnePoPreflighcie(kolejka,wyniki,stan.organizacja,kluczeImportu)
      : kolejka.map(element => element.organization === stan.organizacja && element.recordStatus === "CONFIRMED"
        && kluczeImportu.has(element.recordKey)
        && poprawne.has(`${element.organization}|${element.normalizedTitle}`)
        && element.status === "COMPLETED_EXISTING" && element.completion?.source === "preflight-existing"
        ? {...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,"PENDING"),completion:null,completionReason:null,completedAt:null} : element);
    const zmiany = zaktualizowana.filter((element,indeks) => element !== kolejka[indeks]);
    const zapis = await chrome.runtime.sendMessage({type:"MERGE_QUEUE_ITEMS",items:zmiany});
    if (!zapis?.ok) throw new Error(zapis?.error || "Nie udało się zapisać decyzji preflightu.");
    stan.kolejka = zapis.items;
    await odswiezPlanOtwarcia();
    renderuj();
  }

  async function zapiszMagazynMapowan() {
    await chrome.storage.local.set({[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]:stan.magazynMapowan});
  }

  async function zapiszRozstrzygniecie(rozstrzygniecie, resolutionSource) {
    const kandydat = rozstrzygniecie?.selectedCandidate;
    if (!kandydat) return;
    stan.magazynMapowan = MAPOWANIA_WYDARZEN.zapiszMapowanie(stan.magazynMapowan,{
      organization:rozstrzygniecie.organization,
      normalizedTitle:rozstrzygniecie.normalizedSourceTitle,
      sourceTitle:rozstrzygniecie.sourceTitle,
      eventId:kandydat.eventId,
      eventUrl:kandydat.url,
      eventTitle:kandydat.title,
      resolutionSource
    });
    await zapiszMagazynMapowan();
  }

  function finalnyPlanOtwarcia() {
    const aktywne = new Set(stan.kolejka.filter(element => element.recordStatus === "CONFIRMED"
      && ["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status)).map(element => element.id));
    const plan = NARZEDZIA_LISTY.utworzPlanOtwarcia(stan.rozstrzygniecia.map(aktualneRozstrzygniecie)
      .map(rozstrzygniecie => ({...rozstrzygniecie,queueItemIds:(rozstrzygniecie.queueItemIds || []).filter(id => aktywne.has(id))}))
      .filter(rozstrzygniecie => rozstrzygniecie.queueItemIds.length));
    const pozycje = plan.pozycje.filter(pozycja => {
      const wynik = stan.preflight.wyniki[kluczRozstrzygniecia(pozycja)];
      return stan.organizacja !== "SEMPER" || (wynik?.queueContext && wynik.status !== "NEEDS_ATTENTION" && !wynik.error);
    }).map(pozycja => ({...pozycja,queueContext:stan.preflight.wyniki[kluczRozstrzygniecia(pozycja)]?.queueContext}));
    return {...plan,pozycje,gotoweDoOtwarcia:pozycje.filter(pozycja => ["READY","CREATE_NEW"].includes(pozycja.status)).length,nierozstrzygniete:plan.nierozstrzygniete + plan.pozycje.length - pozycje.length};
  }

  async function odswiezPlanOtwarcia() {
    const odpowiedz = await chrome.runtime.sendMessage({type:"PREPARE_EVENTIS_OPENING",plan:finalnyPlanOtwarcia().pozycje});
    if (!odpowiedz?.ok) throw new Error(odpowiedz?.error || "Nie udało się przygotować planu otwarcia.");
    stan.planOtwarcia = odpowiedz;
  }

  async function otworzGotoweKarty() {
    const plan = finalnyPlanOtwarcia();
    const {eventisImportQueue = []} = await chrome.storage.local.get(["eventisImportQueue"]);
    const aktualnaKolejka = NARZEDZIA_KOLEJKI.migrujKolejke(eventisImportQueue);
    const nowe = stan.kolejka.filter(element => !aktualnaKolejka.some(istniejacy => istniejacy.signature === element.signature));
    stan.kolejka = [...aktualnaKolejka,...nowe];
    const zapis = await chrome.runtime.sendMessage({type:"MERGE_QUEUE_ITEMS",items:nowe});
    if (!zapis?.ok) throw new Error(zapis?.error || "Nie udało się zapisać kolejki Eventis.");
    stan.kolejka = zapis.items;
    const odpowiedz = await chrome.runtime.sendMessage({type:"OPEN_EVENTIS_PLAN",plan:plan.pozycje,organization:stan.organizacja});
    if (!odpowiedz?.ok) throw new Error(odpowiedz?.error || "Nie udało się otworzyć kart Eventis.");
    stan.komunikat = odpowiedz.opened
      ? `Otwarto ${odpowiedz.opened} kart w sesji ${odpowiedz.sessionId}.${odpowiedz.bledyOtwarcia?.length ? ` Nie udało się otworzyć: ${odpowiedz.bledyOtwarcia.length}.` : ""}`
      : odpowiedz.bledyOtwarcia?.length ? `Nie udało się otworzyć kart: ${odpowiedz.bledyOtwarcia.length}. Możesz ponowić próbę.` : "Nie otwarto nowych kart: wszystkie są już otwarte albo plan jest pusty.";
    await odswiezPlanOtwarcia();
    renderuj();
  }

  async function analizujWklejonyTekst() {
    if (stan.skanowanie.trwa) return;
    stan.preflight = {trwa:false,sprawdzone:0,lacznie:0,wyniki:{},pokolenie:stan.preflight.pokolenie+1};
    const pole = $("#esync-lista-paste");
    const surowyTekst = pole?.value.trim() || "";
    if (!surowyTekst) return pokazKomunikat("Wklej listę potwierdzonych szkoleń.");
    const rekordy = NARZEDZIA_ARKUSZA.parseManualPaste(surowyTekst);
    if (!rekordy.length) return pokazKomunikat("Nie znaleziono wierszy POTWIERDZONE SZKOLENIE ani ODPOTWIERDZONE.");
    stan.surowyTekst = surowyTekst;
    stan.bladAnalizy = false;
    stan.komunikat = "";
    stan.skanowanie = {trwa:true,liczbaStron:1,liczbaZapytan:0,blad:""};
    renderuj();
    try {
    const tytulyDoWyszukania = [...new Set(rekordy.filter(rekord => !rekord.error).map(rekord => rekord.title).filter(Boolean))];
    const [dane,wynikSkanowania] = await Promise.all([
      chrome.storage.local.get(["eventisImportQueue","mappings",MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]),
      pobierzWszystkieOgloszeniaZListy(tytulyDoWyszukania)
    ]);
    const kolejka = NARZEDZIA_KOLEJKI.migrujKolejke(Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : []);
    const przygotowane = NARZEDZIA_KOLEJKI.przygotujElementyKolejki(rekordy,kolejka,{organization:stan.organizacja});
    const kolejkaPodgladu = [...kolejka,...przygotowane.items];
    stan.rekordy = rekordy;
    stan.kolejka = kolejkaPodgladu;
    stan.mapowania = dane.mappings || {};
    stan.magazynMapowan = MAPOWANIA_WYDARZEN.normalizujMagazynMapowan(dane[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    stan.ogloszenia = wynikSkanowania.ogloszenia;
    stan.skanowanie = {trwa:false,liczbaStron:wynikSkanowania.liczbaStron,liczbaZapytan:wynikSkanowania.liczbaZapytan,blad:wynikSkanowania.blad};
    stan.liczbaBledow = rekordy.filter(rekord => rekord.error).length;
    stan.liczbaDuplikatow = przygotowane.duplicates;
    const wynik = NARZEDZIA_LISTY.dopasujKolejkeDoOgloszen(elementyDotyczaceRekordow(stan.kolejka,rekordy),stan.ogloszenia,stan.organizacja,{
      znajdzMapowanie:grupa => MAPOWANIA_WYDARZEN.resolverZMapowania(MAPOWANIA_WYDARZEN.pobierzBezpieczneMapowanie(stan.magazynMapowan,stan.organizacja,grupa.klucz,grupa.tytul))
    });
    stan.dopasowania = ocenGotowoscDopasowan(wynik.dopasowane);
    stan.nierozpoznane = wynik.nierozpoznane;
    stan.rozstrzygniecia = [
      ...wynik.dopasowane.map(dopasowanie => ({...dopasowanie.resolver,queueItemIds:dopasowanie.elementy.map(element => element.id)})),
      ...wynik.nierozpoznane.map(pozycja => pozycja.powod === "COLLISION"
        ? {...pozycja.resolver,status:"AMBIGUOUS",selectedCandidate:null,reason:"COLLISION",queueItemIds:pozycja.elementy.map(element => element.id)}
        : {...pozycja.resolver,queueItemIds:pozycja.elementy.map(element => element.id)})
    ];
    stan.decyzje = {};
    renderuj();
    const zapis = await chrome.runtime.sendMessage({type:"MERGE_QUEUE_ITEMS",items:przygotowane.items});
    if (!zapis?.ok) throw new Error(zapis?.error || "Nie udało się zapisać kolejki Eventis.");
    stan.kolejka = zapis.items;
    for (const rozstrzygniecie of stan.rozstrzygniecia) {
      if (rozstrzygniecie.status !== "AUTO_MATCH") continue;
      await zapiszRozstrzygniecie(rozstrzygniecie,rozstrzygniecie.reason === "EXACT_MATCH" ? "exact" : "fuzzy");
    }
    await odswiezPlanOtwarcia();
    stan.komunikat = "";
    renderuj();
    uruchomPreflight().catch(blad => pokazKomunikat(blad?.message || String(blad)));
    } catch (blad) {
      stan.skanowanie.trwa = false;
      stan.skanowanie.blad = blad?.message || String(blad);
      stan.bladAnalizy = true;
      stan.komunikat = `Nie udało się zakończyć analizy: ${stan.skanowanie.blad}`;
      renderuj();
      throw blad;
    }
  }

  function renderujPreflight(rozstrzygniecie) {
    if (rozstrzygniecie.manualStatus === "SKIPPED") return "";
    const klucz = kluczRozstrzygniecia(rozstrzygniecie);
    const wynik = stan.preflight.wyniki[klucz];
    const aktualny = wynik && String(wynik.eventId) === String(rozstrzygniecie.selectedCandidate?.eventId || "") ? wynik : null;
    const status = aktualny?.status || "UNVERIFIED";
    const potwierdzone = aktualny?.effectiveConfirmedTerms?.length ?? NARZEDZIA_TERMINOW.dedupeTerms(potwierdzoneTerminyTytulu(rozstrzygniecie)).length;
    const zgodne = aktualny?.matchingEventisTerms?.length;
    const brakujace = aktualny?.missingConfirmedTerms?.length;
    const opis = status === "NEEDS_ATTENTION" ? aktualny?.error || "⚠ Potwierdzony w kolejce, ale nie znaleziono odpowiadającego terminu SEMPER lub wystąpił konflikt odpotwierdzenia."
      : !rozstrzygniecie.selectedCandidate?.eventId && aktualny?.queueContext ? "Semper: termin znaleziony · Eventis: brak wydarzenia → zostanie utworzone nowe ogłoszenie po wyborze Utwórz nowe ogłoszenie."
      : status === "COMPLETE" ? "✓ Wszystkie potwierdzone terminy są już w Eventis"
      : status === "COUNT_MATCH_BUT_DIFFERENT" ? `⚠ Liczby są równe, ale brakuje ${brakujace} potwierdzonych terminów`
      : status === "MISSING_TERMS" ? `⚠ Brakuje ${brakujace} potwierdzonych terminów`
      : aktualny?.error ? `Nie udało się zweryfikować: ${aktualny.error}`
      : aktualny ? "Nie wykryto potwierdzonych terminów do porównania" : "Oczekuje na weryfikację terminów";
    const akcje = status === "COMPLETE"
      ? `<button class="esync-btn good" data-preflight-skip="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>Pomiń otwieranie</button><button class="esync-btn" data-preflight-open="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>Otwórz mimo to</button>`
      : `<button class="esync-btn good" data-preflight-open="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>${brakujace ? "Otwórz i uzupełnij" : "Otwórz ręcznie"}</button>`;
    return `<div class="esync-preflight"><div class="esync-akcje-glowne ${status === "COMPLETE" ? "esync-grid2" : ""}">${akcje}</div><details class="esync-szczegoly-kafelka"><summary>Szczegóły weryfikacji</summary><div class="esync-term-sub">${esc(stan.organizacja)}: ${potwierdzone} potwierdzone · EVENTIS: ${zgodne ?? "?"} zgodne · Brakuje: ${brakujace ?? "?"}</div><div class="esync-small esync-muted">Źródło terminów: ${esc(aktualny?.zrodlo || "wklejona lista")}</div><div class="esync-small esync-opis-weryfikacji">${esc(opis)}</div><button class="esync-btn" data-preflight-retry="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>Sprawdź ponownie</button></details></div>`;
  }

  function renderujTerminyPozycji(rozstrzygniecie) {
    const elementy = stan.kolejka.filter(element => element.organization === stan.organizacja
      && element.normalizedTitle === rozstrzygniecie.normalizedSourceTitle
      && element.status !== "DONE");
    const terminyZrodla = stan.preflight.wyniki[kluczRozstrzygniecia(rozstrzygniecie)]?.reconciliation?.terms || [];
    const widoczneKlucze = new Set();
    return elementy.map(element => {
      const termin = NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,terminyZrodla)[0];
      const kluczTerminu = termin?.canonicalTermKey || [element.start,element.end,String(element.city).toLowerCase()].join("|");
      if (widoczneKlucze.has(kluczTerminu)) return "";
      widoczneKlucze.add(kluczTerminu);
      const statusTerminu = termin?.existsOnEventis === true ? '<span class="esync-badge green">Dodany w Eventis</span>' : termin?.missingOnEventis === true ? '<span class="esync-badge yellow">Brakuje w Eventis</span>' : '<span class="esync-badge gray">Oczekuje na weryfikację</span>';
      const potwierdzonyKolejka = NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,terminyZrodla).some(termin => termin.confirmedByQueue && !termin.confirmedOnSemper);
      return `<div class="esync-termin-kolejki ${potwierdzonyKolejka ? "esync-termin-kolejki-niepotwierdzony" : ""}"><span>${esc(termin?.start || element.start)}${(termin?.end || element.end) !== (termin?.start || element.start) ? ` → ${esc(termin?.end || element.end)}` : ""} · ${esc(termin?.city || element.city)} ${potwierdzonyKolejka ? '<span class="esync-badge purple">Potwierdzony z kolejki</span>' : ''} ${statusTerminu}</span><span class="esync-akcje-terminu">${element.status === "SKIPPED" ? `<button class="esync-btn" data-queue-restore="${esc(element.id)}">Przywróć</button>` : ["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status) ? `<button class="esync-btn warn" data-queue-skip="${esc(element.id)}">Pomiń</button>` : ""}<button class="esync-queue-remove" data-queue-remove="${esc(element.id)}" title="Usuń ten termin z kolejki" aria-label="Usuń ten termin z kolejki">×</button></span></div>`;
    }).join("");
  }

  function wygladPozycji(rozstrzygniecie) {
    const klucz = kluczRozstrzygniecia(rozstrzygniecie);
    const wynik = stan.preflight.wyniki[klucz];
    const elementy = stan.kolejka.filter(element => element.organization === stan.organizacja && element.normalizedTitle === rozstrzygniecie.normalizedSourceTitle);
    if (elementy.some(element => element.status === "ERROR") || wynik?.status === "ERROR" || wynik?.error) return {klasa:"blad",etykieta:"Błąd krytyczny"};
    if (rozstrzygniecie.manualStatus === "CREATE_NEW" || (!rozstrzygniecie.selectedCandidate && rozstrzygniecie.manualStatus !== "SKIPPED")) return {klasa:"brak-dopasowania",etykieta:"Brak dopasowania — możliwe nowe ogłoszenie"};
    if (wynik?.status === "COMPLETE") return {klasa:"kompletne",etykieta:"Wszystkie potwierdzone terminy są w Eventis"};
    if (["MISSING_TERMS","COUNT_MATCH_BUT_DIFFERENT"].includes(wynik?.status)) return {klasa:"wymaga-uzupelnienia",etykieta:"Co najmniej jeden termin wymaga dodania"};
    if (rozstrzygniecie.selectedCandidate && elementy.some(element => ["PENDING","NEEDS_ATTENTION"].includes(element.status))) return {klasa:"wymaga-uzupelnienia",etykieta:"Wymaga uzupełnienia w Eventis"};
    return {klasa:"brak-dopasowania",etykieta:"Oczekuje na weryfikację"};
  }

  function renderujPozycjeSzkolenia(pozycja, indeks) {
    const aktualna = aktualneRozstrzygniecie(pozycja);
    const klucz = kluczRozstrzygniecia(pozycja);
    const wyglad = wygladPozycji(aktualna);
    const wynikTerminow = stan.preflight.wyniki[klucz];
    const oznaczenieKolejki = wynikTerminow?.status === "NEEDS_ATTENTION"
      ? `<div class="esync-warning">⚠ ${esc(wynikTerminow.error || (wynikTerminow.reconciliation?.unmatchedQueueTerms.length ? "Potwierdzony w kolejce, ale nie znaleziono odpowiadającego terminu SEMPER." : "Konflikt odpotwierdzenia — wymaga uwagi."))}</div>`
      : wynikTerminow?.reconciliation?.terms.some(termin => termin.confirmedByQueue && !termin.confirmedOnSemper)
      ? `<div class="esync-alarm-kolejki"><span class="esync-badge purple">Potwierdzony z kolejki</span> 🟣 Potwierdzony w kolejce · Semper: termin znaleziony${aktualna.selectedCandidate?.eventId ? '' : '<div>Eventis: brak wydarzenia</div>'}</div>` : '';
    const opisDopasowania = pozycja.status === "AUTO_MATCH" ? `Dopasowano automatycznie → Eventis #${esc(aktualna.selectedCandidate?.eventId || "?")}`
      : pozycja.status === "KNOWN_MAPPING" ? `Zapamiętane przypisanie → ${esc(aktualna.selectedCandidate?.url || "")}`
      : aktualna.manualStatus === "MANUAL_MATCH" ? `Wybrano Eventis #${esc(aktualna.selectedCandidate.eventId)}.` : "";
    const zmianaMapowania = pozycja.status === "KNOWN_MAPPING" ? `<button class="esync-btn" data-zmien-mapowanie="${esc(klucz)}">Zmień przypisane wydarzenie</button>` : "";
    const dopasowanie = opisDopasowania ? `<details class="esync-szczegoly-kafelka"><summary>Dopasowanie Eventis</summary><div class="esync-small esync-muted">${opisDopasowania}</div>${zmianaMapowania}</details>` : "";
    const tworzenie = aktualna.manualStatus === "CREATE_NEW" ? '<div class="esync-info esync-small">Zostanie utworzone nowe ogłoszenie.</div>' : "";
    const pominieto = aktualna.manualStatus === "SKIPPED" ? '<div class="esync-info esync-small">Tytuł pominięty.</div>' : "";
    const kandydaci = pozycja.status === "AMBIGUOUS" && aktualna.manualStatus !== "CREATE_NEW" ? (pozycja.candidates || []).slice(0,5).map(kandydat => `<label class="esync-choice"><input type="radio" name="esync-wybor-${indeks}" data-wybor-klucz="${esc(klucz)}" value="${esc(kandydat.eventId)}" ${aktualna.manualStatus === "MANUAL_MATCH" && aktualna.selectedCandidate.eventId === kandydat.eventId ? "checked" : ""}> <b>${esc(kandydat.title)}</b><small>Zgodność: ${Math.round(kandydat.score*100)}% · ${esc(kandydat.url)}</small></label>`).join("") : "";
    const recznyUrl = pozycja.status === "NOT_FOUND" && aktualna.manualStatus !== "CREATE_NEW" ? `<div class="esync-manual-preview"><input class="esync-input" data-reczny-url="${esc(klucz)}" placeholder="https://eventis.pl/event/edit/123"><button class="esync-btn" data-zatwierdz-url="${esc(klucz)}" style="width:100%;margin-top:5px">Wybierz ręcznie URL Eventis</button></div><button class="esync-btn" data-ponow-wyszukiwanie="1" style="width:100%;margin-top:5px">Wyszukaj ponownie</button>` : "";
    const wymagaDecyzji = !aktualna.selectedCandidate && aktualna.manualStatus !== "SKIPPED" && aktualna.manualStatus !== "CREATE_NEW";
    const decyzje = wymagaDecyzji ? `<div class="esync-info esync-small">${pozycja.status === "AMBIGUOUS" ? "Wybierz właściwe wydarzenie Eventis." : "Nie znaleziono dopasowania w Eventis."}</div>${kandydaci}${recznyUrl}<button class="esync-btn good" data-utworz-nowe="${esc(klucz)}" style="width:100%;margin-top:5px">Utwórz nowe ogłoszenie</button><button class="esync-btn warn" data-pomin-tytul="${esc(klucz)}" style="width:100%;margin-top:5px">Pomiń ten tytuł</button>` : "";
    return `<div class="esync-pozycja-szkolenia esync-kolejka-${wyglad.klasa}"><div class="esync-naglowek-szkolenia"><span class="esync-dioda" title="${esc(wyglad.etykieta)}"></span><div><div class="esync-term-main">${esc(pozycja.sourceTitle)}</div><div class="esync-term-sub">${esc(wyglad.etykieta)}</div></div></div>${renderujTerminyPozycji(pozycja)}${oznaczenieKolejki}${tworzenie}${pominieto}${decyzje}${renderujPreflight(aktualna)}${dopasowanie}</div>`;
  }

  function renderujWyniki() {
    if (!stan.rekordy.length) return "";
    const automatyczne = stan.rozstrzygniecia.filter(pozycja => pozycja.status === "AUTO_MATCH").length;
    const znaneMapowania = stan.rozstrzygniecia.filter(pozycja => pozycja.status === "KNOWN_MAPPING");
    const wymagajaWyboru = stan.rozstrzygniecia.filter(pozycja => pozycja.status === "AMBIGUOUS").length;
    const nieZnaleziono = stan.rozstrzygniecia.filter(pozycja => pozycja.status === "NOT_FOUND").length;
    const wierszeSzkolen = stan.rozstrzygniecia.map(renderujPozycjeSzkolenia).join("");
    const kompletne = stan.rozstrzygniecia.filter(pozycja => {
      const aktualna = aktualneRozstrzygniecie(pozycja);
      const wynik = stan.preflight.wyniki[kluczRozstrzygniecia(aktualna)];
      return wynik?.status === "COMPLETE" && String(wynik.eventId) === String(aktualna.selectedCandidate?.eventId);
    });
    const wymagajaUwagi = Object.values(stan.preflight.wyniki).filter(wynik => ["UNVERIFIED","ERROR","COUNT_MATCH_BUT_DIFFERENT"].includes(wynik.status)).length;
    const postep = stan.preflight.trwa ? `<div class="esync-info esync-small">Weryfikacja terminów ${stan.preflight.sprawdzone}/${stan.preflight.lacznie}</div>` : "";
    const plan = finalnyPlanOtwarcia();
    const planOtwarcia = stan.planOtwarcia;
    const podsumowanieOtwarcia = planOtwarcia ? `<div class="esync-import-summary"><span>Gotowe: <b>${planOtwarcia.gotowe}</b></span><span>Już otwarte: <b>${planOtwarcia.juzOtwarte.length}</b></span><span>Do otwarcia: <b>${planOtwarcia.doOtwarcia.length}</b></span><span>Kompletne: <b>${kompletne.length}</b></span><span>Wymagają uwagi: <b>${wymagajaUwagi}</b></span></div>${planOtwarcia.konflikty.length ? `<div class="esync-warning esync-small">Konflikty mapowań: ${planOtwarcia.konflikty.length}. Ten sam event nie zostanie otwarty drugi raz.</div>` : ""}<button id="esync-otworz-karty" class="esync-btn good" style="width:100%;margin-top:6px" ${planOtwarcia.doOtwarcia.length && !stan.preflight.trwa ? "" : "disabled"}>OTWÓRZ ${planOtwarcia.doOtwarcia.length} KART EVENTIS</button>` : '<div class="esync-small esync-muted">Sprawdzanie już otwartych kart…</div>';
    return `<div class="esync-card"><div class="esync-section-title"><span>Szkolenia do obsługi</span><span>${stan.rozstrzygniecia.length}</span></div><div class="esync-import-summary"><span>✓ automatycznie: <b>${automatyczne}</b></span><span>★ zapamiętane: <b>${znaneMapowania.length}</b></span><span>⚠ wybór: <b>${wymagajaWyboru}</b></span><span>✕ nie znaleziono: <b>${nieZnaleziono}</b></span></div>${stan.liczbaBledow?`<div class="esync-danger esync-small">Błędne rekordy: ${stan.liczbaBledow}. Nie trafią do kolejki.</div>`:""}${postep}${wierszeSzkolen || '<div class="esync-small esync-muted">Brak szkoleń do obsługi.</div>'}<button id="esync-pomin-kompletne" class="esync-btn" ${kompletne.length && !stan.preflight.trwa ? "" : "disabled"}>Pomiń wszystkie kompletne</button><div class="esync-divider"></div><div class="esync-import-summary"><span>Nierozstrzygnięte: <b>${plan.nierozstrzygniete}</b></span></div>${podsumowanieOtwarcia}</div>`;
  }

  function renderujSeryjnaKolejke() {
    const kolejka = NARZEDZIA_KOLEJKI.filtrujKolejkeOrganizacji(stan.kolejka,stan.organizacja);
    const kolejkaWidoczna = kolejka.filter(element => element.status !== "DONE");
    const podsumowanie = NARZEDZIA_KOLEJKI.podsumujKolejke(kolejka);
    const opisStatusu = element => {
      if (element.status === "ERROR") return {klasa:"blad",etykieta:"Błąd krytyczny"};
      if (element.status === "COMPLETED_EXISTING") return {klasa:"kompletne",etykieta:"Wszystkie terminy są w Eventis"};
      return {klasa:"wymaga-uzupelnienia",etykieta:"Wymaga uzupełnienia w Eventis"};
    };
    const wiersze = stan.rekordy.length ? "" : kolejkaWidoczna.map(element => {
      const status = opisStatusu(element);
      const przycisk = element.status === "SKIPPED"
        ? `<button class="esync-btn" data-queue-restore="${esc(element.id)}">Przywróć</button>`
        : ["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status)
          ? `<button class="esync-btn warn" data-queue-skip="${esc(element.id)}">Pomiń</button>` : "";
      return `<div class="esync-import-row esync-kolejka-${status.klasa}"><span class="esync-dioda" title="${esc(status.etykieta)}"></span><div><div class="esync-term-main">${esc(element.title)}</div><div class="esync-term-sub">${esc(element.start)} · ${esc(element.city)} · ${esc(status.etykieta)}</div></div>${przycisk}<button class="esync-queue-remove" data-queue-remove="${esc(element.id)}" title="Usuń ten termin z kolejki" aria-label="Usuń ten termin z kolejki">×</button></div>`;
    }).join("");
    const stanSkanowania = stan.skanowanie.trwa
      ? '<div class="esync-info esync-small">Wyszukiwanie ogłoszeń na wszystkich stronach listy Eventis…</div>'
      : `<div class="esync-small esync-muted" style="margin-top:6px">Przeszukane strony: ${stan.skanowanie.liczbaStron} · zapytania w polu wyszukiwania: ${stan.skanowanie.liczbaZapytan} · znalezione ogłoszenia: ${stan.ogloszenia.length}</div>${stan.skanowanie.blad?`<div class="esync-warning esync-small">Część stron nie została odczytana: ${esc(stan.skanowanie.blad)}</div>`:""}`;
    const zawartosc = wiersze || (stan.rekordy.length ? '<div class="esync-small esync-muted">Pozycje są pokazane niżej w jednej, scalonej liście.</div>' : '<div class="esync-small esync-muted">Brak aktywnych pozycji w kolejce.</div>');
    return `<div class="esync-card"><div class="esync-section-title"><span>Seryjna kolejka Eventis</span><span class="esync-small">trwała</span></div><div class="esync-import-summary"><span>Oczekujące: <b>${podsumowanie.pending}</b></span><span>Czekają na zapis: <b>${podsumowanie.waitingForSave}</b></span><span>Zakończone: <b>${podsumowanie.done}</b></span><span>Pominięte: <b>${podsumowanie.skipped}</b></span><span>Wymagają uwagi: <b>${podsumowanie.errors}</b></span></div>${stanSkanowania}${zawartosc}<button id="esync-clear-queue" class="esync-btn danger" style="width:100%;margin-top:7px" ${stan.kolejka.length ? "" : "disabled"}>Wyczyść całą kolejkę (${stan.kolejka.length})</button></div>`;
  }

  function renderuj() {
    let korzen = $("#esync-root");
    if (!korzen) {
      korzen = document.createElement("aside");
      korzen.id = "esync-root";
      document.body.appendChild(korzen);
    }
    const liczbaAktywnych = stan.kolejka.filter(element => element.status !== "DONE").length;
    korzen.innerHTML = `<div class="esync-head"><div class="esync-head-text"><div class="esync-head-title">Kolejka potwierdzonych terminów <span class="esync-badge ${stan.organizacja==='SEMPER'?'semper':'iist'}">${esc(stan.organizacja)}</span></div><div class="esync-head-sub">Lista wydarzeń Eventis · zapis ręczny</div></div><div class="esync-head-actions"><button class="esync-icon-btn esync-collapse" id="esync-lista-collapse" title="Zwiń">−</button></div></div><div class="esync-body"><details id="esync-lista-kolejka" ${stan.pokazKolejke?"open":""}><summary>Seryjna kolejka Eventis (${liczbaAktywnych})</summary>${renderujSeryjnaKolejke()}</details><div class="esync-card"><div class="esync-section-title"><span>Ręczny import do kolejki Eventis</span><span class="esync-small">format tabeli lub wierszy</span></div><textarea id="esync-lista-paste" class="esync-textarea" placeholder='| POTWIERDZONE SZKOLENIE | "Tytuł", 2026-09-21 do 2026-09-22, ONLINE, 2 osoby'>${esc(stan.surowyTekst)}</textarea><button id="esync-lista-analizuj" class="esync-btn primary" style="width:100%;margin-top:7px" ${stan.skanowanie.trwa?"disabled":""}>${stan.skanowanie.trwa?"Wyszukuję ogłoszenia…":"Analizuj kolejkę i dopasuj karty"}</button></div>${renderujWyniki()}${stan.komunikat?`<div class="esync-success">${esc(stan.komunikat)}</div>`:""}<div class="esync-footer">TYLKO POTWIERDZONE · BEZ AUTOMATYCZNEGO ZAPISU</div></div>`;
    const komunikat = $(".esync-body > .esync-success",korzen);
    if (komunikat) {
      if (stan.bladAnalizy) komunikat.classList.replace("esync-success","esync-danger");
      $(".esync-body > .esync-card",korzen).after(komunikat);
    }
    $("#esync-lista-kolejka")?.addEventListener("toggle",zdarzenie => { stan.pokazKolejke = zdarzenie.currentTarget.open; });
    const naglowek = $(".esync-head",korzen);
    naglowek.style.cursor = "move";
    naglowek.style.touchAction = "none";
    naglowek.addEventListener("pointerdown",zdarzenie => {
      if (zdarzenie.button !== 0 || zdarzenie.target.closest("button")) return;
      zdarzenie.preventDefault();
      const prostokat = korzen.getBoundingClientRect();
      const przesuniecieX = zdarzenie.clientX - prostokat.left;
      const przesuniecieY = zdarzenie.clientY - prostokat.top;
      const przesun = ruch => {
        korzen.style.right = "auto";
        korzen.style.left = `${Math.max(0,Math.min(window.innerWidth - prostokat.width,ruch.clientX - przesuniecieX))}px`;
        korzen.style.top = `${Math.max(0,Math.min(window.innerHeight - prostokat.height,ruch.clientY - przesuniecieY))}px`;
      };
      const zakoncz = () => {
        document.removeEventListener("pointermove",przesun);
        document.removeEventListener("pointerup",zakoncz);
        document.removeEventListener("pointercancel",zakoncz);
      };
      document.addEventListener("pointermove",przesun);
      document.addEventListener("pointerup",zakoncz);
      document.addEventListener("pointercancel",zakoncz);
    });
    $("#esync-lista-collapse")?.addEventListener("click",() => {
      korzen.classList.toggle("esync-collapsed");
      $("#esync-lista-collapse").textContent = korzen.classList.contains("esync-collapsed") ? "+" : "−";
    });
    $("#esync-lista-analizuj")?.addEventListener("click",obsluzAsynchronicznie(analizujWklejonyTekst));
    $("#esync-clear-queue")?.addEventListener("click",obsluzAsynchronicznie(async () => {
      const zapis = await chrome.runtime.sendMessage({type:"CLEAR_QUEUE"});
      if (!zapis?.ok) throw new Error(zapis?.error || "Nie udało się wyczyścić kolejki.");
      stan.kolejka = zapis.items;
      stan.rekordy = [];
      stan.dopasowania = [];
      stan.nierozpoznane = [];
      stan.rozstrzygniecia = [];
      stan.decyzje = {};
      stan.preflight = {trwa:false,sprawdzone:0,lacznie:0,wyniki:{},pokolenie:stan.preflight.pokolenie+1};
      stan.planOtwarcia = null;
      stan.komunikat = "Wyczyszczono całą kolejkę.";
      stan.bladAnalizy = false;
      renderuj();
    }));
    $$('[data-queue-remove]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const zapis = await chrome.runtime.sendMessage({type:"REMOVE_QUEUE_ITEMS",itemIds:[przycisk.dataset.queueRemove]});
      if (!zapis?.ok) throw new Error(zapis?.error || "Nie udało się usunąć terminu z kolejki.");
      stan.kolejka = zapis.items;
      await odswiezPlanOtwarcia();
      renderuj();
    })));
    for (const przycisk of $$('[data-queue-skip],[data-queue-restore]')) przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const id = przycisk.dataset.queueSkip || przycisk.dataset.queueRestore;
      const status = przycisk.dataset.queueSkip ? "SKIPPED" : "PENDING";
      const {eventisImportQueue = []} = await chrome.storage.local.get(["eventisImportQueue"]);
      const kolejka = NARZEDZIA_KOLEJKI.migrujKolejke(eventisImportQueue).map(element => element.id === id ? NARZEDZIA_KOLEJKI.zmienStatusElementu(element,status) : element);
      const zmieniony = kolejka.find(element => element.id === id);
      const zapis = await chrome.runtime.sendMessage({type:"MERGE_QUEUE_ITEMS",items:[zmieniony]});
      if (!zapis?.ok) {
        stan.bladAnalizy = true;
        stan.komunikat = zapis?.error || "Nie udało się zapisać statusu terminu.";
        renderuj();
        throw new Error(stan.komunikat);
      }
      stan.bladAnalizy = false;
      stan.komunikat = "";
      stan.kolejka = zapis.items;
      await odswiezPlanOtwarcia();
      renderuj();
    }));
    $("#esync-otworz-karty")?.addEventListener("click",obsluzAsynchronicznie(otworzGotoweKarty));
    $("#esync-pomin-kompletne")?.addEventListener("click",obsluzAsynchronicznie(async () => {
      await ustawDecyzjeKompletnych(new Set(Object.keys(stan.preflight.wyniki).filter(klucz => stan.preflight.wyniki[klucz].status === "COMPLETE")),true);
    }));
    $$('[data-preflight-skip]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      await ustawDecyzjeKompletnych(new Set([przycisk.dataset.preflightSkip]),true);
    })));
    $$('[data-preflight-retry]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      await uruchomPreflight(new Set([przycisk.dataset.preflightRetry]));
    })));
    $$('[data-preflight-open]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const klucz = przycisk.dataset.preflightOpen;
      if (stan.organizacja === "SEMPER" && (!stan.preflight.wyniki[klucz]?.queueContext || stan.preflight.wyniki[klucz]?.status === "NEEDS_ATTENTION")) return pokazKomunikat("Najpierw zweryfikuj terminy SEMPER.");
      if (stan.preflight.wyniki[klucz]?.status === "COMPLETE") await ustawDecyzjeKompletnych(new Set([klucz]),false);
      const pozycja = finalnyPlanOtwarcia().pozycje.find(wpis => `${wpis.organization}|${wpis.normalizedSourceTitle}` === klucz)
        || NARZEDZIA_LISTY.utworzPlanOtwarcia(stan.rozstrzygniecia.map(aktualneRozstrzygniecie)
          .filter(wpis => kluczRozstrzygniecia(wpis) === klucz)
          .map(wpis => ({...wpis,queueItemIds:[]}))).pozycje[0];
      if (!pozycja) return pokazKomunikat("To wydarzenie nie ma aktywnych potwierdzonych terminów do otwarcia.");
      const odpowiedz = await chrome.runtime.sendMessage({type:"OPEN_EVENTIS_PLAN",plan:[{...pozycja,queueContext:stan.preflight.wyniki[klucz]?.queueContext}],organization:stan.organizacja});
      if (!odpowiedz?.ok) throw new Error(odpowiedz?.error || "Nie udało się otworzyć karty Eventis.");
      await odswiezPlanOtwarcia();
      renderuj();
    })));
    $$('[data-wybor-klucz]').forEach(pole => pole.addEventListener("change",obsluzAsynchronicznie(async () => {
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === pole.dataset.wyborKlucz);
      const wybor = NARZEDZIA_LISTY.wybierzKandydataRozstrzygniecia(zrodlo,pole.value);
      if (wybor) {
        stan.decyzje[pole.dataset.wyborKlucz] = wybor;
        await zapiszRozstrzygniecie(wybor,"manual");
      }
      await odswiezPlanOtwarcia();
      renderuj();
      if (wybor) uruchomPreflight().catch(blad => pokazKomunikat(blad?.message || String(blad)));
    })));
    $$('[data-pomin-tytul]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === przycisk.dataset.pominTytul);
      if (zrodlo) stan.decyzje[przycisk.dataset.pominTytul] = NARZEDZIA_LISTY.pominRozstrzygniecie(zrodlo);
      await odswiezPlanOtwarcia();
      renderuj();
    })));
    $$('[data-utworz-nowe]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const klucz = przycisk.dataset.utworzNowe;
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === klucz);
      const wybor = NARZEDZIA_LISTY.utworzNoweOgloszenieRozstrzygniecia(zrodlo,location.origin);
      if (!wybor) return pokazKomunikat("Nie udało się przygotować bezpiecznego adresu nowego ogłoszenia Eventis.");
      stan.decyzje[klucz] = wybor;
      await odswiezPlanOtwarcia();
      renderuj();
    })));
    $$('[data-zatwierdz-url]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const klucz = przycisk.dataset.zatwierdzUrl;
      const pole = $$('[data-reczny-url]').find(element => element.dataset.recznyUrl === klucz);
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === klucz);
      const wybor = NARZEDZIA_LISTY.wybierzRecznyUrlEventis(zrodlo,pole?.value || "");
      if (!wybor) return pokazKomunikat("Wklej adres edycji Eventis, np. https://eventis.pl/event/edit/123. Link szkolenia SEMPER/IIST nie zawiera ID wydarzenia Eventis.");
      stan.decyzje[klucz] = wybor;
      renderuj();
      await zapiszRozstrzygniecie(wybor,"manual");
      await odswiezPlanOtwarcia();
      renderuj();
      uruchomPreflight().catch(blad => pokazKomunikat(blad?.message || String(blad)));
    })));
    $$('[data-zmien-mapowanie]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const klucz = przycisk.dataset.zmienMapowanie;
      const indeks = stan.rozstrzygniecia.findIndex(pozycja => kluczRozstrzygniecia(pozycja) === klucz);
      const zrodlo = stan.rozstrzygniecia[indeks];
      if (!zrodlo) return;
      stan.magazynMapowan = MAPOWANIA_WYDARZEN.usunMapowanie(stan.magazynMapowan,zrodlo.organization,zrodlo.normalizedSourceTitle);
      await zapiszMagazynMapowan();
      const ponownyResolver = NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul:zrodlo.sourceTitle,normalizedTitle:zrodlo.normalizedSourceTitle},stan.ogloszenia,zrodlo.organization);
      stan.rozstrzygniecia[indeks] = {...ponownyResolver,status:"AMBIGUOUS",selectedCandidate:null,reason:"CHANGE_MAPPING"};
      delete stan.decyzje[klucz];
      await odswiezPlanOtwarcia();
      renderuj();
    })));
    $$('[data-ponow-wyszukiwanie]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(analizujWklejonyTekst)));
  }

  async function inicjalizuj() {
    chrome.storage.onChanged.addListener((zmiany,obszar) => {
      if (obszar !== "local" || !zmiany.eventisImportQueue) return;
      stan.kolejka = Array.isArray(zmiany.eventisImportQueue.newValue) ? zmiany.eventisImportQueue.newValue : [];
      odtworzAnalizeTrwalejKolejki();
      odswiezPlanOtwarcia().then(renderuj).catch(blad => console.error("Odświeżenie kolejki Eventis",blad));
      renderuj();
    });
    await chrome.runtime.sendMessage({type:"RECONCILE_QUEUE"});
    const dane = await chrome.storage.local.get(["settings","eventisImportQueue","pendingOperations","eventisQueueSchemaVersion","mappings",MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    stan.ustawienia = {...KONFIGURACJA.DEFAULT_SETTINGS,...(dane.settings || {})};
    stan.organizacja = wykryjOrganizacje();
    stan.kolejka = NARZEDZIA_KOLEJKI.reconcileQueueState(NARZEDZIA_KOLEJKI.migrujKolejke(Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : []),dane.pendingOperations || {});
    if (dane.eventisQueueSchemaVersion !== 2) await chrome.storage.local.set({eventisImportQueue:stan.kolejka,eventisQueueSchemaVersion:2});
    stan.mapowania = dane.mappings || {};
    stan.magazynMapowan = MAPOWANIA_WYDARZEN.normalizujMagazynMapowan(dane[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    stan.ogloszenia = pobierzOgloszeniaZDokumentu();
    odtworzAnalizeTrwalejKolejki();
    await odswiezPlanOtwarcia();
    renderuj();
  }

  inicjalizuj().catch(blad => console.error("Kolejka listy Eventis",blad));
})();
