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
    reczneAdresySemper:{},
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
    const wiersz = link.closest("tr");
    if (wiersz) {
      const identyfikatory = new Set($$('a[href*="/event/edit"]',wiersz).map(kandydat => {
        try { return NARZEDZIA_LISTY.pobierzIdEventisZUrl(new URL(kandydat.getAttribute("href"),adresStrony).href); } catch (_) { return ""; }
      }).filter(Boolean));
      if (identyfikatory.size === 1 && identyfikatory.has(identyfikatorEventis)) return wiersz;
    }
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
      const kontenerTerminow = kontener?.closest("tr") || kontener;
      const terminy = kontenerTerminow ? NARZEDZIA_TERMINOW.odczytajTerminyListyEventis(kontenerTerminow) : [];
      wedlugId.set(eventisId,{eventisId,url:url.href,tytuly,terminy});
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

  function odswiezDopasowaniaZListy() {
    const widoczne = pobierzOgloszeniaZDokumentu();
    const poprzednie = stan.ogloszenia;
    stan.ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(poprzednie,widoczne);
    const zmienioneKlucze = new Set();
    stan.rozstrzygniecia = stan.rozstrzygniecia.map(pozycja => {
      const klucz = kluczRozstrzygniecia(pozycja);
      const aktualna = aktualneRozstrzygniecie(pozycja);
      const rozwiazana = aktualna.manualStatus || pozycja.status === "KNOWN_MAPPING" ? pozycja
        : {...pozycja,...NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul:pozycja.sourceTitle},stan.ogloszenia,pozycja.organization)};
      const identyfikator = aktualna.manualStatus ? aktualna.selectedCandidate?.eventId : rozwiazana.selectedCandidate?.eventId;
      const noweOgloszenie = widoczne.find(ogloszenie => String(ogloszenie.eventisId) === String(identyfikator));
      const stareOgloszenie = poprzednie.find(ogloszenie => String(ogloszenie.eventisId) === String(identyfikator));
      if (identyfikator !== aktualna.selectedCandidate?.eventId || (noweOgloszenie
        && JSON.stringify(noweOgloszenie.terminy) !== JSON.stringify(stareOgloszenie?.terminy))) zmienioneKlucze.add(klucz);
      return rozwiazana;
    });
    return zmienioneKlucze;
  }

  function obserwujListeOgloszen() {
    let licznik = null;
    const odswiez = async () => {
      if (stan.skanowanie.trwa || stan.preflight.trwa) {
        licznik = setTimeout(() => odswiez().catch(blad => console.error("Odświeżenie terminów Eventis",blad)),300);
        return;
      }
      const zmienioneKlucze = odswiezDopasowaniaZListy();
      if (zmienioneKlucze.size) await uruchomPreflight(zmienioneKlucze);
    };
    new MutationObserver(zmiany => {
      if (!zmiany.some(zmiana => !zmiana.target.closest?.("#esync-root")
        && [...zmiana.addedNodes,...zmiana.removedNodes].some(wezel => wezel.nodeType === 1))) return;
      clearTimeout(licznik);
      licznik = setTimeout(() => odswiez().catch(blad => console.error("Odświeżenie terminów Eventis",blad)),300);
    }).observe(document.body,{childList:true,subtree:true});
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
    const obserwowany = document.body;
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
      const obserwator = new MutationObserver(zmiany => {
        const zmienionoWyniki = zmiany.some(zmiana => {
          const element = zmiana.target.nodeType === 1 ? zmiana.target : zmiana.target.parentElement;
          if (element?.closest("#esync-root")) return false;
          return element?.closest("table") || [...zmiana.addedNodes,...zmiana.removedNodes].some(wezel =>
            wezel.nodeType === 1 && (wezel.matches("table,tbody,tr") || wezel.querySelector("table,tbody,tr")));
        });
        if (!zmienionoWyniki) return;
        clearTimeout(czasUspokojenia);
        czasUspokojenia = setTimeout(zakoncz,80);
      });
      obserwator.observe(obserwowany,{subtree:true,childList:true,characterData:true,attributes:true});
      const czasMaksymalny = setTimeout(zakoncz,5000);
      czasUspokojenia = setTimeout(zakoncz,1400);
      ustawWartoscPolaWyszukiwania(pole,wartosc);
    });
  }

  async function pobierzOgloszeniaPrzezPoleWyszukiwania(tytuly, znaneOgloszenia = [], wymusOdswiezenie = false) {
    const maTerminyTytulu = (tytul, ogloszenia) => {
      const wynik = NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul},ogloszenia,stan.organizacja);
      return wynik.status === "AUTO_MATCH" && ogloszenia.some(ogloszenie =>
        String(ogloszenie.eventisId) === wynik.selectedCandidate.eventId && ogloszenie.terminy?.length);
    };
    tytuly = tytuly.filter(tytul => wymusOdswiezenie || !maTerminyTytulu(tytul,znaneOgloszenia));
    if (!tytuly.length) return {ogloszenia:znaneOgloszenia,liczbaZapytan:0};
    const pole = znajdzPoleWyszukiwaniaOgloszen();
    if (!pole || !tytuly.length) return {ogloszenia:[],liczbaZapytan:0};
    const pierwotnaWartosc = pole.value;
    let ogloszenia = znaneOgloszenia;
    let liczbaZapytan = 0;
    const wykonaneZapytania = new Set();
    try {
      for (const tytul of tytuly) {
        if (!wymusOdswiezenie && maTerminyTytulu(tytul,ogloszenia)) continue;
        const warianty = NARZEDZIA_WYSZUKIWANIA.generujZapytaniaEventis(tytul);
        for (const wariant of warianty) {
          if (wykonaneZapytania.has(wariant)) continue;
          await zastosujFiltrWyszukiwania(pole,wariant);
          wykonaneZapytania.add(wariant);
          liczbaZapytan++;
          const widoczne = pobierzOgloszeniaZDokumentu(document,location.href);
          ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(ogloszenia,widoczne);
          const rozstrzygniecie = NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul},ogloszenia,stan.organizacja);
          console.debug("[Eventis][dopasowanie]",{
            ...NARZEDZIA_WYSZUKIWANIA.rozlozTytul(tytul),wariantZapytania:wariant,powod:rozstrzygniecie.reason,
            kandydaci:rozstrzygniecie.candidates.map(kandydat => ({...kandydat,powod:
              kandydat.eventId === rozstrzygniecie.selectedCandidate?.eventId ? rozstrzygniecie.reason
              : ogloszenia.find(ogloszenie => String(ogloszenie.eventisId) === kandydat.eventId)?.tytuly.some(tytulKandydata => NARZEDZIA_WYSZUKIWANIA.czyKonfliktStruktury(tytul,tytulKandydata)) ? "KONFLIKT_DLUGOSCI_LUB_FORMULY"
              : kandydat.zgodnoscWariantu?.wymagany && kandydat.zgodnoscWariantu.status !== "ZGODNY" ? "NIEZGODNY_WARIANT_LOKALIZACJI"
              : kandydat.score < NARZEDZIA_LISTY.PROG_DOPASOWANIA ? "ZA_NISKA_ZGODNOSC_TYTULU" : "NIEJEDNOZNACZNE_DOPASOWANIE"}))
          });
          if (NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul},widoczne,stan.organizacja).status === "AUTO_MATCH") break;
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
      const partia = [];
      while (oczekujace.length && partia.length < 3 && odwiedzone.size < MAKSYMALNA_LICZBA_STRON) {
        const adres = oczekujace.shift();
        if (odwiedzone.has(adres)) continue;
        odwiedzone.add(adres);
        partia.push(adres);
      }
      const wyniki = await Promise.allSettled(partia.map(pobierzDokumentListy));
      for (const rezultat of wyniki) {
        if (rezultat.status === "rejected") {
          ostatniBlad = rezultat.reason?.message || String(rezultat.reason);
          continue;
        }
        const wynik = rezultat.value;
        ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(ogloszenia,pobierzOgloszeniaZDokumentu(wynik.dokument,wynik.adres));
        for (const kolejnyAdres of pobierzAdresyPaginacji(wynik.dokument,wynik.adres)) {
          if (!odwiedzone.has(kolejnyAdres) && !oczekujace.includes(kolejnyAdres)) oczekujace.push(kolejnyAdres);
        }
      }
    }
    if (oczekujace.length && odwiedzone.size >= MAKSYMALNA_LICZBA_STRON) {
      ostatniBlad = `Osiągnięto bezpieczny limit ${MAKSYMALNA_LICZBA_STRON} stron listy.`;
    }
    const wynikPola = await pobierzOgloszeniaPrzezPoleWyszukiwania(tytuly,ogloszenia);
    ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(ogloszenia,wynikPola.ogloszenia);
    return {ogloszenia,liczbaStron:odwiedzone.size,liczbaZapytan:wynikPola.liczbaZapytan,blad:ostatniBlad};
  }

  function elementyDotyczaceRekordow(kolejka, rekordy) {
    const wedlugRekordu = new Map(kolejka.filter(element => element.organization === stan.organizacja
      && ["PENDING","ERROR","NEEDS_ATTENTION","COMPLETED_EXISTING"].includes(element.status))
      .map(element => [element.recordKey,element]));
    const wykorzystane = new Set();
    return rekordy.filter(rekord => ["CONFIRMED","DECONFIRMED"].includes(rekord.status) && !rekord.error)
      .flatMap(rekord => {
        const klucz = NARZEDZIA_ARKUSZA.recordKey(rekord);
        const element = wedlugRekordu.get(klucz);
        if (!element || wykorzystane.has(klucz)) return [];
        wykorzystane.add(klucz);
        return [{...element,indeksWejsciowy:rekord.indeksWejsciowy}];
      });
  }

  function odtworzAnalizeTrwalejKolejki() {
    const aktywneElementy = stan.kolejka.filter(element => element.organization === stan.organizacja
      && ["PENDING","ERROR","NEEDS_ATTENTION","COMPLETED_EXISTING"].includes(element.status));
    stan.rekordy = aktywneElementy.map(element => ({
      status:element.recordStatus,
      title:element.title,
      indeksWejsciowy:element.indeksWejsciowy,
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
    stan.rozstrzygniecia = wynik.rozstrzygniecia;
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
    const elementyKolejki = (stan.kolejka || []).filter(element => element.organization === stan.organizacja && element.normalizedTitle === rozstrzygniecie.normalizedSourceTitle);
    let kontekst = {canonicalTitle:rozstrzygniecie.normalizedSourceTitle,queueTerms:elementyKolejki,sourceUrl:"",targetEventisId:identyfikator || "",confirmationSource:"queue"};
    let statusZrodla = "UNKNOWN";
    let bladZrodla = "";
    try {
    if (stan.organizacja === "SEMPER") {
      let bladSieciZrodla = false;
      let wieleZrodel = false;
      const naglowkiWyszukiwania = {"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"};
      const stronyZrodla = new Map();
      async function zweryfikujStroneZrodla(adres) {
        const url = NARZEDZIA_WYSZUKIWANIA.absolutnyUrlSemper(adres);
        if (stronyZrodla.has(url)) return stronyZrodla.get(url);
        const odpowiedz = await chrome.runtime.sendMessage({type:"FETCH_TEXT",payload:{url}});
        if (!odpowiedz?.ok || !NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(odpowiedz.finalUrl)) throw Object.assign(new Error("Nie udało się zakończyć wyszukiwania SEMPER. Spróbuj ponownie."),{statusZrodla:"ERROR"});
        const dokument = new DOMParser().parseFromString(odpowiedz.text,"text/html");
        const tytul = (dokument.querySelector("h1") || dokument.querySelector("title"))?.textContent || "";
        const wariant = NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscWariantuLokalizacyjnego(rozstrzygniecie.sourceTitle,tytul);
        const tytulOnline = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(rozstrzygniecie.sourceTitle).replace(/ online$/, "");
        const tytulBezMiejsca = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(tytul.replace(/\s+(?:w|we)\s+[\p{L}-]+\s*(?:\([^)]*\))?[.]?\s*$/iu,""));
        const terminyListy = potwierdzoneTerminyTytulu(rozstrzygniecie);
        const terminyStrony = NARZEDZIA_TERMINOW.odczytajTerminySemper(dokument);
        const zgodnyTerminOnline = /\bonline\b/i.test(rozstrzygniecie.sourceTitle)
          && tytulOnline === tytulBezMiejsca && terminyListy.length > 0
          && terminyListy.every(termin => NARZEDZIA_TERMINOW.kluczZgodnegoTerminu(termin).endsWith("|online")
            && terminyStrony.some(terminStrony => NARZEDZIA_TERMINOW.kluczZgodnegoTerminu(terminStrony) === NARZEDZIA_TERMINOW.kluczZgodnegoTerminu(termin)));
        const stronaInnejLokalizacji = /\bonline\b/i.test(rozstrzygniecie.sourceTitle)
          && tytulOnline !== NARZEDZIA_WYSZUKIWANIA.normalizujTytul(tytul)
          && tytulBezMiejsca !== NARZEDZIA_WYSZUKIWANIA.normalizujTytul(tytul);
        const wynik = (!stronaInnejLokalizacji
          && NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(rozstrzygniecie.sourceTitle,tytul) >= stan.ustawienia.mappingWarningThreshold
          && (!wariant.wymagany || wariant.status === "ZGODNY")) || zgodnyTerminOnline ? {odpowiedz,dokument} : null;
        stronyZrodla.set(url,wynik);
        return wynik;
      }
      let adresZrodla = stan.reczneAdresySemper?.[`${stan.organizacja}|${rozstrzygniecie.normalizedSourceTitle}`]
        || (mapowanie?.status === "ACTIVE" && mapowanie.lastVerifiedAt ? mapowanie.sourceUrl : "");
      if (!NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(adresZrodla)) {
        for (const wariant of NARZEDZIA_WYSZUKIWANIA.generujWariantyZapytania(rozstrzygniecie.sourceTitle)) {
          const wyszukanie = await chrome.runtime.sendMessage({type:"FETCH_TEXT",payload:{url:"https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj.php",method:"POST",headers:naglowkiWyszukiwania,body:new URLSearchParams({opc:"szukaj",co:wariant}).toString()}});
          if (!wyszukanie?.ok) bladSieciZrodla = true;
          if (wyszukanie?.ok) adresZrodla = NARZEDZIA_WYSZUKIWANIA.urlZJsonSemper(wyszukanie.text);
          if (adresZrodla && !await zweryfikujStroneZrodla(adresZrodla)) adresZrodla = "";
          if (!adresZrodla) {
            const podpowiedzi = await chrome.runtime.sendMessage({type:"FETCH_TEXT",payload:{url:"https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj_auto.php",method:"POST",headers:naglowkiWyszukiwania,body:new URLSearchParams({opc:"szukaj",co:wariant}).toString()}});
            if (!podpowiedzi?.ok) bladSieciZrodla = true;
            const kandydaci = podpowiedzi?.ok ? NARZEDZIA_WYSZUKIWANIA.linkiZWyszukiwarkiSemper(podpowiedzi.text,wariant)
              .sort((pierwszy,drugi) => NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(rozstrzygniecie.sourceTitle,drugi.title)
                - NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(rozstrzygniecie.sourceTitle,pierwszy.title)).slice(0,5) : [];
            const zweryfikowani = new Map();
            for (const kandydat of kandydaci) {
              const strona = await zweryfikujStroneZrodla(kandydat.url);
              if (strona) zweryfikowani.set(strona.odpowiedz.finalUrl,kandydat.url);
            }
            if (zweryfikowani.size > 1) wieleZrodel = true;
            if (zweryfikowani.size === 1) adresZrodla = [...zweryfikowani.values()][0];
          }
          if (NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(adresZrodla)) break;
        }
      }
      if (!NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(adresZrodla)) throw Object.assign(
        new Error(bladSieciZrodla ? "Nie udało się zakończyć wyszukiwania. Spróbuj ponownie." : wieleZrodel ? "Znaleziono kilka podobnych szkoleń SEMPER. Wybierz właściwe." : "Nie znaleziono szkolenia na SEMPER."),
        {statusZrodla:bladSieciZrodla ? "ERROR" : wieleZrodel ? "AMBIGUOUS" : "NOT_FOUND"});
      const stronaZrodla = await zweryfikujStroneZrodla(adresZrodla);
      if (!stronaZrodla) throw Object.assign(new Error("Tytuł strony SEMPER wymaga weryfikacji."),{statusZrodla:"AMBIGUOUS"});
      const {odpowiedz:odpowiedzZrodla,dokument:dokumentZrodla} = stronaZrodla;
      const elementy = stan.kolejka.filter(element => element.organization === stan.organizacja && element.normalizedTitle === rozstrzygniecie.normalizedSourceTitle);
      scalenie = NARZEDZIA_TERMINOW.scalPotwierdzeniaKolejki(NARZEDZIA_TERMINOW.odczytajTerminySemper(dokumentZrodla),elementy);
      terminyZrodlowe = scalenie.terms;
      kontekst = {canonicalTitle:rozstrzygniecie.normalizedSourceTitle,queueTerms:elementy,sourceUrl:odpowiedzZrodla.finalUrl,targetEventisId:identyfikator || "",confirmationSource:"queue"};
      zrodlo = "bieżąca strona SEMPER";
      statusZrodla = "FOUND";
    }
    } catch (blad) {
      statusZrodla = blad.statusZrodla || "ERROR";
      bladZrodla = blad.message;
      terminyZrodlowe = [];
      scalenie = NARZEDZIA_TERMINOW.scalPotwierdzeniaKolejki([],elementyKolejki);
    }
    const zakoncz = terminyEventis => {
      const porownanie = NARZEDZIA_TERMINOW.ustalWynikPreflightu(terminyZrodlowe,terminyEventis);
      const diagnostyka = {...scalenie?.diagnostics,eventisMatchingCount:porownanie.matchingEventisTerms.length,missingCount:porownanie.missingConfirmedTerms.length};
      if (stan.ustawienia.debug) console.debug("Eventis Sync terminy",{...diagnostyka,terms:terminyZrodlowe});
      return {...porownanie,zrodlo,statusZrodla,bladZrodla,queueContext:kontekst,reconciliation:scalenie,diagnostics:diagnostyka,
        status:scalenie?.status === "NEEDS_ATTENTION" ? "NEEDS_ATTENTION" : porownanie.status};
    };
    if (!identyfikator) {
      const wynik = zakoncz([]);
      if (kandydat?.matchType === "CREATE_NEW") return wynik;
      for (const termin of scalenie?.terms || []) {
        delete termin.existsOnEventis;
        delete termin.missingOnEventis;
      }
      return {...wynik,status:"UNVERIFIED",missingConfirmedTerms:[]};
    }
    try {
    const adres = new URL(`/event/edit/${identyfikator}`,location.origin);
    const odpowiedz = await fetch(adres.href,{credentials:"include",redirect:"follow",cache:"no-store"});
    if (!odpowiedz.ok) throw new Error(`Eventis zwrócił HTTP ${odpowiedz.status}.`);
    if (NARZEDZIA_LISTY.pobierzIdEventisZUrl(odpowiedz.url) !== identyfikator) throw new Error("Eventis przekierował poza przypisane wydarzenie.");
    const dokument = new DOMParser().parseFromString(await odpowiedz.text(),"text/html");
    if (!dokument.querySelector("form#eventForm")) throw new Error("Nie odnaleziono formularza wydarzenia Eventis.");
    const terminyEventis = NARZEDZIA_TERMINOW.odczytajTerminyEventis(dokument)
      .map(({start,end,city}) => ({start,end,city}));
    const terminyListy = stan.ogloszenia?.find(ogloszenie => String(ogloszenie.eventisId) === identyfikator)?.terminy || [];
    return zakoncz(terminyEventis.length ? terminyEventis : terminyListy);
    } catch (blad) {
      return {...zakoncz([]),status:"ERROR",statusWeryfikacjiEventis:"ERROR",error:blad.message};
    }
  }

  async function uruchomPreflight(wybraneKlucze = null) {
    if (stan.preflight.trwa || stan.skanowanie.trwa) return;
    odswiezDopasowaniaZListy();
    const pokolenie = ++stan.preflight.pokolenie;
    let rozstrzygniecia = stan.rozstrzygniecia.map(aktualneRozstrzygniecie)
      .filter(rozstrzygniecie => rozstrzygniecie.manualStatus !== "SKIPPED"
        && (!wybraneKlucze || wybraneKlucze.has(kluczRozstrzygniecia(rozstrzygniecie))));
    for (const rozstrzygniecie of rozstrzygniecia) delete stan.preflight.wyniki[kluczRozstrzygniecia(rozstrzygniecie)];
    stan.preflight.trwa = true;
    stan.preflight.sprawdzone = 0;
    stan.preflight.lacznie = rozstrzygniecia.length;
    renderuj();
    try {
      const tytuly = [...new Set(rozstrzygniecia.filter(pozycja => pozycja.manualStatus !== "CREATE_NEW")
        .map(pozycja => pozycja.selectedCandidate?.title || pozycja.sourceTitle))];
      const wynik = await pobierzOgloszeniaPrzezPoleWyszukiwania(tytuly,stan.ogloszenia,!!wybraneKlucze);
      if (pokolenie !== stan.preflight.pokolenie) return;
      stan.ogloszenia = NARZEDZIA_LISTY.scalOgloszeniaEventis(stan.ogloszenia,wynik.ogloszenia);
      stan.skanowanie.liczbaZapytan += wynik.liczbaZapytan;
      odswiezDopasowaniaZListy();
      rozstrzygniecia = rozstrzygniecia.map(pozycja => aktualneRozstrzygniecie(stan.rozstrzygniecia
        .find(aktualna => kluczRozstrzygniecia(aktualna) === kluczRozstrzygniecia(pozycja)) || pozycja));
    } catch (blad) {
      stan.preflight.trwa = false;
      renderuj();
      throw blad;
    }
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

  async function zweryfikujReczneOgloszenie(wybor) {
    const odpowiedz = await fetch(wybor.selectedCandidate.url,{credentials:"include",redirect:"follow",cache:"no-store"});
    if (!odpowiedz.ok || NARZEDZIA_LISTY.pobierzIdEventisZUrl(odpowiedz.url) !== String(wybor.selectedCandidate.eventId)) throw new Error("Nie udało się zweryfikować adresu ogłoszenia Eventis.");
    const dokument = new DOMParser().parseFromString(await odpowiedz.text(),"text/html");
    const formularz = dokument.querySelector("#eventForm");
    const ogloszenie = NARZEDZIA_LISTY.pobierzBiezaceOgloszenie(dokument,odpowiedz.url);
    if (!formularz || !ogloszenie) throw new Error("Nie znaleziono formularza i tytułu wskazanego ogłoszenia.");
    const etykieta = Array.from(formularz.querySelectorAll("label")).find(element => /^firma\s*[:*]?$/i.test(element.textContent.trim()));
    const pole = etykieta?.control || (etykieta?.htmlFor ? dokument.getElementById(etykieta.htmlFor) : null)
      || etykieta?.parentElement?.querySelector("input,select")
      || Array.from(formularz.querySelectorAll("input,select")).find(element => /(?:^|[\[_.-])(?:company|firm|firma)(?:$|[\]_.-])/i.test(`${element.name} ${element.id}`));
    const nazwaFirmy = pole?.tagName === "SELECT" ? pole.selectedOptions[0]?.textContent : pole?.value;
    const slowa = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(nazwaFirmy).split(" ");
    if (slowa.includes("semper") === slowa.includes("iist") || !slowa.includes(wybor.organization.toLowerCase())) throw new Error("Organizator wskazanego ogłoszenia nie odpowiada organizatorowi kolejki.");
    const tytul = ogloszenie.tytuly[0];
    const wariant = NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscWariantuLokalizacyjnego(wybor.sourceTitle,tytul);
    if (NARZEDZIA_WYSZUKIWANIA.ocenTytulEventis(wybor.sourceTitle,tytul) < NARZEDZIA_LISTY.PROG_DOPASOWANIA
      || (wariant.wymagany && wariant.status !== "ZGODNY")) throw new Error("Tytuł lub wariant wskazanego ogłoszenia nie odpowiada szkoleniu kolejki.");
    return {...wybor,selectedCandidate:{...wybor.selectedCandidate,title:tytul,url:odpowiedz.url}};
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
    const pozycje = plan.pozycje.map(pozycja => ({...pozycja,queueContext:stan.preflight.wyniki[kluczRozstrzygniecia(pozycja)]?.queueContext}));
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
    if (stan.skanowanie.trwa || stan.preflight.trwa) return;
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
    stan.rozstrzygniecia = wynik.rozstrzygniecia;
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
    await uruchomPreflight();
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
    const brakujace = aktualny?.missingConfirmedTerms?.length;
    const akcje = status === "COMPLETE"
      ? `<button class="esync-btn good" data-preflight-skip="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>Pomiń otwieranie</button><button class="esync-btn" data-preflight-open="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>Otwórz mimo to</button>`
      : `<button class="esync-btn good" data-preflight-open="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>${brakujace ? "Otwórz i uzupełnij" : "Otwórz ręcznie"}</button>`;
    return `<div class="esync-preflight"><div class="esync-akcje-glowne ${status === "COMPLETE" ? "esync-grid2" : ""}">${akcje}</div></div>`;
  }

  function renderujTerminyPozycji(rozstrzygniecie) {
    const elementy = stan.kolejka.filter(element => element.organization === stan.organizacja
      && element.normalizedTitle === rozstrzygniecie.normalizedSourceTitle
);
    const terminyZrodla = stan.preflight.wyniki[kluczRozstrzygniecia(rozstrzygniecie)]?.reconciliation?.terms || [];
    const widoczneKlucze = new Set();
    return elementy.map(element => {
      const termin = NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,terminyZrodla)[0];
      const kluczTerminu = termin?.canonicalTermKey || [element.start,element.end,String(element.city).toLowerCase()].join("|");
      if (widoczneKlucze.has(kluczTerminu)) return "";
      widoczneKlucze.add(kluczTerminu);
      const statusTerminu = termin?.existsOnEventis === true ? '<span class="esync-badge green">Dodany w Eventis</span>' : termin?.missingOnEventis === true ? '<span class="esync-badge yellow">Brakuje w Eventis</span>' : '<span class="esync-badge gray">Oczekuje na weryfikację</span>';
      const potwierdzonyKolejka = element.recordStatus === "CONFIRMED" && !(termin?.confirmedOnSemper ?? termin?.confirmed);
      return `<div class="esync-termin-kolejki ${potwierdzonyKolejka ? "esync-termin-kolejki-niepotwierdzony" : ""}"><span>${esc(termin?.start || element.start)}${(termin?.end || element.end) !== (termin?.start || element.start) ? ` → ${esc(termin?.end || element.end)}` : ""} · ${esc(termin?.city || element.city)} ${potwierdzonyKolejka ? '<span class="esync-badge purple">POTW. Z KOLEJKI</span>' : ''} ${statusTerminu}</span><span class="esync-akcje-terminu">${element.status === "SKIPPED" ? `<button class="esync-btn" data-queue-restore="${esc(element.id)}">Przywróć</button>` : ["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status) ? `<button class="esync-btn warn" data-queue-skip="${esc(element.id)}">Pomiń</button>` : ""}<button class="esync-queue-remove" data-queue-remove="${esc(element.id)}" title="Usuń ten termin z kolejki" aria-label="Usuń ten termin z kolejki">×</button></span></div>`;
    }).join("");
  }

  function wygladPozycji(rozstrzygniecie) {
    const wynik = stan.preflight.wyniki[kluczRozstrzygniecia(rozstrzygniecie)];
    const statusy = NARZEDZIA_KOLEJKI.ustalStatusyPowiazania(rozstrzygniecie,wynik,stan.organizacja,stan.skanowanie);
    if (["NOT_FOUND","CREATE_NEW"].includes(statusy.ogloszenie.status)) return {klasa:"brak-dopasowania",etykieta:statusy.ogloszenie.etykieta};
    if (statusy.ogloszenie.status === "AMBIGUOUS" || statusy.zrodlo.status === "AMBIGUOUS") return {klasa:"wymaga-uzupelnienia",etykieta:"Niejednoznaczne dopasowanie — wybierz właściwe"};
    if (statusy.zrodlo.status === "NOT_FOUND") return {klasa:"brak-zrodla",etykieta:statusy.zrodlo.etykieta};
    if (wynik?.status === "COMPLETE") return {klasa:"kompletne",etykieta:"Wszystkie potwierdzone terminy są w Eventis"};
    if (wynik?.error || ["ERROR","UNKNOWN","SEARCHING"].includes(statusy.ogloszenie.status)) return {klasa:"nierozstrzygniete",etykieta:wynik?.error ? "Nie udało się zakończyć weryfikacji. Spróbuj ponownie." : statusy.ogloszenie.etykieta};
    if (["MISSING_TERMS","COUNT_MATCH_BUT_DIFFERENT","NEEDS_ATTENTION"].includes(wynik?.status)) return {klasa:"wymaga-uzupelnienia",etykieta:"Co najmniej jeden termin wymaga dodania lub sprawdzenia"};
    return {klasa:statusy.zrodlo.status === "FOUND" ? "kompletne" : "nierozstrzygniete",etykieta:"Ogłoszenie Eventis znaleziono; sprawdź terminy"};
  }

  function renderujPozycjeSzkolenia(pozycja, indeks) {
    const aktualna = aktualneRozstrzygniecie(pozycja);
    const klucz = kluczRozstrzygniecia(pozycja);
    const wyglad = wygladPozycji(aktualna);
    const wynikTerminow = stan.preflight.wyniki[klucz];
    const statusy = NARZEDZIA_KOLEJKI.ustalStatusyPowiazania(aktualna,wynikTerminow,stan.organizacja,stan.skanowanie);
    const znaczniki = Object.values(statusy).map(status => `<span class="esync-badge ${status.klasa}">${esc(status.etykieta)}</span>`).join(" ");
    const adresSemper = stan.reczneAdresySemper[klucz] || wynikTerminow?.queueContext?.sourceUrl || "";
    const problemPrzypisaniaSemper = Boolean(wynikTerminow && !wynikTerminow.queueContext?.sourceUrl);
    const recznySemper = stan.organizacja === "SEMPER" && aktualna.manualStatus !== "SKIPPED"
      ? `<div class="esync-manual-preview"><label class="esync-small">Strona szkolenia SEMPER<input class="esync-input" data-reczny-semper="${esc(klucz)}" value="${esc(adresSemper)}" placeholder="https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,325.html"></label><button class="esync-btn" data-zatwierdz-semper="${esc(klucz)}" style="width:100%;margin-top:5px" ${stan.preflight.trwa ? "disabled" : ""}>Użyj linku SEMPER i sprawdź</button></div>` : "";
    const oznaczenieKolejki = wynikTerminow?.reconciliation?.terms.some(termin => termin.confirmationConflict)
      ? '<div class="esync-warning">Konflikt odpotwierdzenia — wymaga uwagi. Terminy Eventis nie są usuwane.</div>'
      : wynikTerminow?.statusZrodla === "FOUND" && wynikTerminow.reconciliation?.unmatchedQueueTerms.length
        ? `<div class="esync-problem-zrodla">${esc(stan.organizacja)}: nie znaleziono konkretnego terminu ze znalezionej strony szkolenia. Sprawdź dane kolejki w formularzu.</div>`
        : wynikTerminow?.reconciliation?.terms.some(termin => termin.confirmedByQueue && !termin.confirmedOnSemper)
          ? `<div class="esync-alarm-kolejki"><span class="esync-badge purple">POTW. Z KOLEJKI</span> ${esc(stan.organizacja)} nie oznacza jeszcze potwierdzenia tego terminu.</div>` : '';
    const tworzenie = aktualna.manualStatus === "CREATE_NEW" ? '<div class="esync-danger esync-small">Wybrano utworzenie nowego ogłoszenia.</div>' : "";
    const pominieto = aktualna.manualStatus === "SKIPPED" ? '<div class="esync-info esync-small">Tytuł pominięty.</div>' : "";
    const kandydaci = pozycja.status === "AMBIGUOUS" && aktualna.manualStatus !== "CREATE_NEW" ? (pozycja.candidates || []).slice(0,5).map(kandydat => `<label class="esync-choice"><input type="radio" name="esync-wybor-${indeks}" data-wybor-klucz="${esc(klucz)}" value="${esc(kandydat.eventId)}" ${aktualna.manualStatus === "MANUAL_MATCH" && aktualna.selectedCandidate.eventId === kandydat.eventId ? "checked" : ""}> <b>${esc(kandydat.title)}</b><small>Zgodność: ${Math.round(kandydat.score*100)}% · ${esc(kandydat.url)}</small></label>`).join("") : "";
    const recznyUrl = ["NOT_FOUND","AMBIGUOUS"].includes(pozycja.status) && aktualna.manualStatus !== "CREATE_NEW" ? `<div class="esync-manual-preview"><input class="esync-input" data-reczny-url="${esc(klucz)}" placeholder="https://eventis.pl/event/edit/123"><button class="esync-btn" data-zatwierdz-url="${esc(klucz)}" style="width:100%;margin-top:5px">Wskaż istniejące ogłoszenie</button></div><button class="esync-btn" data-ponow-wyszukiwanie="1" style="width:100%;margin-top:5px">Wyszukaj ponownie</button>` : "";
    const wymagaDecyzji = !aktualna.selectedCandidate && aktualna.manualStatus !== "SKIPPED" && aktualna.manualStatus !== "CREATE_NEW";
    const decyzje = wymagaDecyzji ? `<div class="${statusy.ogloszenie.klasa === "red" ? "esync-danger" : statusy.ogloszenie.klasa === "yellow" ? "esync-warning" : "esync-neutralny"} esync-small">${statusy.ogloszenie.status === "AMBIGUOUS" ? "Wybierz właściwe wydarzenie Eventis." : statusy.ogloszenie.status === "NOT_FOUND" ? "Nie znaleziono odpowiedniego ogłoszenia Eventis. Wskaż ogłoszenie lub utwórz nowe." : statusy.ogloszenie.etykieta}</div>${kandydaci}${recznyUrl}<button class="esync-btn danger" data-utworz-nowe="${esc(klucz)}" style="width:100%;margin-top:5px">Utwórz nowe ogłoszenie</button><button class="esync-btn warn" data-pomin-tytul="${esc(klucz)}" style="width:100%;margin-top:5px">Pomiń ten tytuł</button>` : "";
    return `<div data-klucz-karty="${esc(klucz)}" class="esync-pozycja-szkolenia esync-kolejka-${wyglad.klasa}"><div class="esync-naglowek-szkolenia"><span class="esync-dioda" title="${esc(wyglad.etykieta)}"></span><div><div class="esync-term-main">${esc(pozycja.sourceTitle)}</div><div class="esync-term-sub">${esc(wyglad.etykieta)}</div></div></div><div class="esync-row esync-wrap">${znaczniki}</div>${wynikTerminow?.bladZrodla ? `<div class="${statusy.zrodlo.klasa === "blue" ? "esync-problem-zrodla" : statusy.zrodlo.klasa === "yellow" ? "esync-warning" : "esync-neutralny"}">${esc(wynikTerminow.bladZrodla)}</div>` : ""}${renderujTerminyPozycji(pozycja)}${oznaczenieKolejki}${problemPrzypisaniaSemper ? recznySemper : ""}${tworzenie}${pominieto}${decyzje}${renderujPreflight(aktualna)}<div class="esync-grid2" style="margin-top:9px"><button class="esync-btn" data-preflight-retry="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>Sprawdź ponownie</button><button class="esync-btn" data-zmien-mapowanie="${esc(klucz)}" ${stan.preflight.trwa ? "disabled" : ""}>Zmień przypisane</button></div>${recznySemper && !problemPrzypisaniaSemper ? `<details class="esync-manual-preview"><summary>Zmień link SEMPER</summary>${recznySemper}</details>` : ""}</div>`;
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
    const kolejkaWidoczna = kolejka;
    const podsumowanie = NARZEDZIA_KOLEJKI.podsumujKolejke(kolejka);
    const opisStatusu = element => {
      const opis = NARZEDZIA_KOLEJKI.opiszStatusElementu(element);
      return {...opis,klasa:opis.klasa === "green" ? "kompletne" : opis.klasa === "yellow" ? "wymaga-uzupelnienia" : "nierozstrzygniete"};
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
    return `<div class="esync-card"><div class="esync-section-title"><span>Seryjna kolejka Eventis</span><span class="esync-small">trwała</span></div><div class="esync-import-summary"><span>Oczekujące: <b>${podsumowanie.pending}</b></span><span>Czekają na zapis: <b>${podsumowanie.waitingForSave}</b></span><span>Zakończone: <b>${podsumowanie.done}</b></span><span>Pominięte: <b>${podsumowanie.skipped}</b></span><span>Wymagają uwagi: <b>${podsumowanie.errors}</b></span></div>${stanSkanowania}${zawartosc}</div>`;
  }

  function zapamietajWidok(korzen) {
    const kontener = $(".esync-body",korzen);
    if (!kontener) return null;
    const gora = kontener.getBoundingClientRect().top;
    const karty = $$("[data-klucz-karty]",kontener);
    const karta = karty.find(element => element.getBoundingClientRect().bottom > gora);
    return {scroll:kontener.scrollTop,klucz:karta?.dataset.kluczKarty,
      przesuniecie:karta ? karta.getBoundingClientRect().top - gora : 0,
      szczegoly:karty.map(element => ({klucz:element.dataset.kluczKarty,otwarte:$$("details",element).map(szczegoly => szczegoly.open)}))};
  }

  function przywrocWidok(korzen, widok) {
    if (!widok) return;
    const kontener = $(".esync-body",korzen);
    const karty = $$("[data-klucz-karty]",kontener);
    for (const karta of karty) {
      const zapis = widok.szczegoly.find(element => element.klucz === karta.dataset.kluczKarty);
      if (zapis) $$("details",karta).forEach((szczegoly,indeks) => { szczegoly.open = zapis.otwarte[indeks]; });
    }
    kontener.scrollTop = widok.scroll;
    const karta = karty.find(element => element.dataset.kluczKarty === widok.klucz);
    if (karta) kontener.scrollTop += karta.getBoundingClientRect().top - kontener.getBoundingClientRect().top - widok.przesuniecie;
  }

  function renderuj() {
    let korzen = $("#esync-root");
    if (!korzen) {
      korzen = document.createElement("aside");
      korzen.id = "esync-root";
      document.body.appendChild(korzen);
    }
    const widok = zapamietajWidok(korzen);
    const liczbaAktywnych = stan.kolejka.filter(element => element.status !== "DONE").length;
    korzen.innerHTML = `<div class="esync-head"><div class="esync-head-text"><div class="esync-head-title">Kolejka potwierdzonych terminów <span class="esync-badge ${stan.organizacja==='SEMPER'?'semper':'iist'}">${esc(stan.organizacja)}</span></div><div class="esync-head-sub">Lista wydarzeń Eventis · zapis ręczny</div></div><div class="esync-head-actions"><button class="esync-icon-btn esync-collapse" id="esync-lista-collapse" title="Zwiń">−</button></div></div><div class="esync-body"><details id="esync-lista-kolejka" ${stan.pokazKolejke?"open":""}><summary>Seryjna kolejka Eventis (${liczbaAktywnych})</summary>${renderujSeryjnaKolejke()}</details><button id="esync-clear-queue" class="esync-btn danger" style="width:100%;margin-top:7px" ${stan.kolejka.length ? "" : "disabled"}>Wyczyść całą kolejkę (${stan.kolejka.length})</button><div class="esync-card"><div class="esync-section-title"><span>Ręczny import do kolejki Eventis</span><span class="esync-small">format tabeli lub wierszy</span></div><textarea id="esync-lista-paste" class="esync-textarea" placeholder='| POTWIERDZONE SZKOLENIE | "Tytuł", 2026-09-21 do 2026-09-22, ONLINE, 2 osoby'>${esc(stan.surowyTekst)}</textarea><button id="esync-lista-analizuj" class="esync-btn primary" style="width:100%;margin-top:7px" ${stan.skanowanie.trwa?"disabled":""}>${stan.skanowanie.trwa?"Wyszukuję ogłoszenia…":"Analizuj kolejkę i dopasuj karty"}</button></div>${renderujWyniki()}${stan.komunikat?`<div class="esync-success">${esc(stan.komunikat)}</div>`:""}<div class="esync-footer">TYLKO POTWIERDZONE · BEZ AUTOMATYCZNEGO ZAPISU</div></div>`;
    const komunikat = $(".esync-body > .esync-success",korzen);
    if (komunikat) {
      if (stan.bladAnalizy) komunikat.classList.replace("esync-success","esync-danger");
      $(".esync-body > .esync-card",korzen).after(komunikat);
    }
    przywrocWidok(korzen,widok);
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
        korzen.style.left = `${Math.max(0,Math.min(window.innerWidth - prostokat.width,ruch.clientX - przesuniecieX)) / (Number(getComputedStyle(korzen).zoom) || 1)}px`;
        korzen.style.top = `${Math.max(0,Math.min(window.innerHeight - prostokat.height,ruch.clientY - przesuniecieY)) / (Number(getComputedStyle(korzen).zoom) || 1)}px`;
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
      const rozstrzygniecie = stan.rozstrzygniecia.map(aktualneRozstrzygniecie).find(wpis => kluczRozstrzygniecia(wpis) === klucz);
      const wynik = stan.preflight.wyniki[klucz];
      const aktualnyWynik = wynik && String(wynik.eventId) === String(rozstrzygniecie?.selectedCandidate?.eventId || "") ? wynik : null;
      if (stan.organizacja === "SEMPER" && !aktualnyWynik?.queueContext) {
        const pozycja = stan.rozstrzygniecia.map(aktualneRozstrzygniecie).find(wpis => kluczRozstrzygniecia(wpis) === klucz);
        const kandydat = pozycja?.selectedCandidate;
        if (!kandydat?.eventId || pozycja.manualStatus === "SKIPPED") return pokazKomunikat("Najpierw wybierz wydarzenie Eventis.");
        const odpowiedz = await chrome.runtime.sendMessage({type:"OTWORZ_EVENTIS_RECZNIE",url:kandydat.url,eventId:kandydat.eventId});
        if (!odpowiedz?.ok) throw new Error(odpowiedz?.error || "Nie udało się otworzyć karty Eventis.");
        return;
      }
      if (aktualnyWynik?.status === "COMPLETE") await ustawDecyzjeKompletnych(new Set([klucz]),false);
      const pozycja = finalnyPlanOtwarcia().pozycje.find(wpis => `${wpis.organization}|${wpis.normalizedSourceTitle}` === klucz)
        || NARZEDZIA_LISTY.utworzPlanOtwarcia(stan.rozstrzygniecia.map(aktualneRozstrzygniecie)
          .filter(wpis => kluczRozstrzygniecia(wpis) === klucz)
          .map(wpis => ({...wpis,queueItemIds:[]}))).pozycje[0];
      if (!pozycja) return pokazKomunikat("To wydarzenie nie ma aktywnych potwierdzonych terminów do otwarcia.");
      const odpowiedz = await chrome.runtime.sendMessage({type:"OPEN_EVENTIS_PLAN",plan:[{...pozycja,queueContext:aktualnyWynik?.queueContext}],organization:stan.organizacja});
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
      if (wybor) await uruchomPreflight(new Set([pole.dataset.wyborKlucz]));
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
    $$('[data-zatwierdz-semper]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const klucz = przycisk.dataset.zatwierdzSemper;
      const pole = $$('[data-reczny-semper]').find(element => element.dataset.recznySemper === klucz);
      const adres = NARZEDZIA_WYSZUKIWANIA.absolutnyUrlSemper(pole?.value || "");
      if (!NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(adres)) return pokazKomunikat("Wklej pełny link do strony szkolenia SEMPER.");
      const dane = await chrome.storage.local.get(["reczneAdresySemper"]);
      const adresy = {...dane.reczneAdresySemper,[klucz]:adres};
      await chrome.storage.local.set({reczneAdresySemper:adresy});
      stan.reczneAdresySemper = adresy;
      await uruchomPreflight(new Set([klucz]));
    })));
    $$('[data-zatwierdz-url]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const klucz = przycisk.dataset.zatwierdzUrl;
      const pole = $$('[data-reczny-url]').find(element => element.dataset.recznyUrl === klucz);
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === klucz);
      const propozycja = NARZEDZIA_LISTY.wybierzRecznyUrlEventis(zrodlo,pole?.value || "");
      if (!propozycja) return pokazKomunikat("Wklej adres edycji Eventis, np. https://eventis.pl/event/edit/123. Link szkolenia SEMPER/IIST nie zawiera ID wydarzenia Eventis.");
      const wybor = await zweryfikujReczneOgloszenie(propozycja);
      stan.decyzje[klucz] = wybor;
      renderuj();
      await zapiszRozstrzygniecie(wybor,"manual");
      await odswiezPlanOtwarcia();
      renderuj();
      await uruchomPreflight(new Set([klucz]));
    })));
    $$('[data-zmien-mapowanie]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(async () => {
      const klucz = przycisk.dataset.zmienMapowanie;
      const indeks = stan.rozstrzygniecia.findIndex(pozycja => kluczRozstrzygniecia(pozycja) === klucz);
      const zrodlo = stan.rozstrzygniecia[indeks];
      if (!zrodlo) return;
      stan.magazynMapowan = MAPOWANIA_WYDARZEN.usunMapowanie(stan.magazynMapowan,zrodlo.organization,zrodlo.normalizedSourceTitle);
      await zapiszMagazynMapowan();
      const ponownyResolver = NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul:zrodlo.sourceTitle,normalizedTitle:zrodlo.normalizedSourceTitle},stan.ogloszenia,zrodlo.organization);
      stan.rozstrzygniecia[indeks] = {...zrodlo,...ponownyResolver,status:"AMBIGUOUS",selectedCandidate:null,reason:"CHANGE_MAPPING"};
      delete stan.decyzje[klucz];
      await odswiezPlanOtwarcia();
      renderuj();
    })));
    $$('[data-ponow-wyszukiwanie]').forEach(przycisk => przycisk.addEventListener("click",obsluzAsynchronicznie(analizujWklejonyTekst)));
  }

  async function inicjalizuj() {
    chrome.storage.onChanged.addListener((zmiany,obszar) => {
      if (obszar !== "local" || (!zmiany.eventisImportQueue && !zmiany[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN])) return;
      if (zmiany[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]) stan.magazynMapowan = MAPOWANIA_WYDARZEN.normalizujMagazynMapowan(zmiany[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN].newValue);
      if (zmiany.eventisImportQueue) stan.kolejka = Array.isArray(zmiany.eventisImportQueue.newValue) ? zmiany.eventisImportQueue.newValue : [];
      odtworzAnalizeTrwalejKolejki();
      odswiezPlanOtwarcia().then(renderuj).catch(blad => console.error("Odświeżenie kolejki Eventis",blad));
      renderuj();
    });
    await chrome.runtime.sendMessage({type:"RECONCILE_QUEUE"});
    const dane = await chrome.storage.local.get(["settings","eventisImportQueue","pendingOperations","eventisQueueSchemaVersion","reczneAdresySemper","mappings",MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    stan.ustawienia = {...KONFIGURACJA.DEFAULT_SETTINGS,...(dane.settings || {})};
    stan.organizacja = wykryjOrganizacje();
    stan.kolejka = NARZEDZIA_KOLEJKI.reconcileQueueState(NARZEDZIA_KOLEJKI.migrujKolejke(Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : []),dane.pendingOperations || {});
    if (dane.eventisQueueSchemaVersion !== 2) await chrome.storage.local.set({eventisImportQueue:stan.kolejka,eventisQueueSchemaVersion:2});
    stan.mapowania = dane.mappings || {};
    stan.magazynMapowan = MAPOWANIA_WYDARZEN.normalizujMagazynMapowan(dane[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    stan.reczneAdresySemper = dane.reczneAdresySemper || {};
    stan.ogloszenia = pobierzOgloszeniaZDokumentu();
    odtworzAnalizeTrwalejKolejki();
    await odswiezPlanOtwarcia();
    renderuj();
    if (stan.rozstrzygniecia.length) await uruchomPreflight();
  }

  inicjalizuj().then(obserwujListeOgloszen).catch(blad => console.error("Kolejka listy Eventis",blad));
})();
