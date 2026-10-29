(() => {
  "use strict";

  if (!/\/event\/(?:add|edit)(?:\/|$|\?)/.test(location.pathname + location.search)) return;
  if (window.__EVENTIS_SYNC_V010__) return;
  window.__EVENTIS_SYNC_V010__ = true;

  const VERSION = "0.1.0";
  const PAGE_LOAD_ID = crypto.randomUUID();
  const MODE = location.pathname.startsWith("/event/edit") ? "edit" : "add";
  const KLUCZ_ZAMKNIECIA_PO_ZAPISIE = "eventisSyncZamknijPoZapisie";
  const KLUCZ_OCZEKUJACEGO_ZAPISU = "eventisSyncPendingSave";
  const REGIONS = { Warszawa:7, Kraków:6, Poznań:15, Wrocław:1, Gdańsk:11, Katowice:12, Szczecin:16, Zakopane:6, Kołobrzeg:16 };
  const KONFIGURACJA = globalThis.EventisSyncConfig;
  const NARZEDZIA_WYSZUKIWANIA = globalThis.NarzedziaWyszukiwaniaEventis;
  const NARZEDZIA_TERMINOW = globalThis.NarzedziaTerminowEventis;
  const NARZEDZIA_ARKUSZA = globalThis.NarzedziaArkuszaEventis;
  const NARZEDZIA_KOLEJKI = globalThis.NarzedziaKolejkiEventis;
  const NARZEDZIA_OPISOW_SEMPER = globalThis.NarzedziaOpisowSemper;
  const NARZEDZIA_OPERACJI = globalThis.NarzedziaOperacjiEventis;
  const NARZEDZIA_LISTY = globalThis.NarzedziaListyEventis;
  const NARZEDZIA_POL_RICH_TEXT = globalThis.NarzedziaPolRichTextEventis;
  const NARZEDZIA_OTWIERANIA = globalThis.OtwieranieWydarzenEventis;
  const MAPOWANIA_WYDARZEN = globalThis.MapowaniaWydarzenEventis;
  const NARZEDZIA_ORGANIZATORA = globalThis.NarzedziaOrganizatoraEventis;
  if (!KONFIGURACJA) throw new Error("Nie załadowano wspólnej konfiguracji.");
  if (!NARZEDZIA_WYSZUKIWANIA) throw new Error("Nie załadowano modułu wyszukiwania.");
  if (!NARZEDZIA_TERMINOW) throw new Error("Nie załadowano modułu terminów.");
  if (!NARZEDZIA_ARKUSZA) throw new Error("Nie załadowano modułu arkusza.");
  if (!NARZEDZIA_KOLEJKI) throw new Error("Nie załadowano modułu kolejki Eventis.");
  if (!NARZEDZIA_OPISOW_SEMPER) throw new Error("Nie załadowano parsera opisów SEMPER.");
  if (!NARZEDZIA_OPERACJI) throw new Error("Nie załadowano obsługi operacji Eventis.");
  if (!NARZEDZIA_LISTY) throw new Error("Nie załadowano obsługi listy Eventis.");
  if (!NARZEDZIA_POL_RICH_TEXT) throw new Error("Nie załadowano obsługi pól rich-text.");
  if (!NARZEDZIA_OTWIERANIA || !MAPOWANIA_WYDARZEN) throw new Error("Nie załadowano obsługi sesji otwierania Eventis.");
  if (!NARZEDZIA_ORGANIZATORA) throw new Error("Nie załadowano rozpoznawania organizatora Eventis.");
  const DEFAULT_SETTINGS = KONFIGURACJA.DEFAULT_SETTINGS;
  const PROGI_WYSZUKIWANIA = Object.freeze({
    AUTO_AKCEPTACJA: 0.84,
    AUTOMATYCZNE_POTWIERDZENIE_MAPOWANIA: 0.95,
    MOCNY_KANDYDAT: 0.72,
    POKAZ_KANDYDATA: 0.42,
    MINIMALNA_PRZEWAGA: 0.08,
    MAKS_KANDYDATOW_DO_WERYFIKACJI: 5,
    MAKS_WYNIKOW_W_UI: 5
  });
  const NAZWY_POL_OPISOWYCH = Object.freeze({
    "event[forWho]":"Grupa docelowa",
    "event[information]":"Cel szkolenia",
    "event[reason]":"Korzyści ze szkolenia",
    "event[plan]":"Program szkolenia"
  });

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    organization: null,
    organizatorWydarzenia: null,
    sposobWyboruZrodla: "AUTO",
    statusOrganizatora: "LOADING",
    wartoscFirmy: "",
    kontekstWydarzenia: "",
    terminUstaleniaKontekstu: 0,
    eventisId: "",
    eventisTitle: "",
    mapping: null,
    source: null,
    statusZrodla: "UNKNOWN",
    tytulSemperNowegoOgloszenia: "",
    sourceLoadedFromMapping: false,
    mappingVerifiedThisSession: false,
    sourceTerms: [],
    reczniePotwierdzoneTerminy: new Set(),
    existingTerms: [],
    missingTerms: [],
    searchChoices: [],
    searchRequestId: 0,
    searchAttempted: false,
    searchMessage: "",
    searchFinalReason: "",
    titleAtSearch: "",
    manualRecords: [],
    manualMatches: [],
    manualPreview: null,
    eventisImportQueue: [],
    przypisaneRecznieBiezacejKarty: [],
    tabId: null,
    pendingOperation: null,
    pendingLooksSaved: false,
    zapis: {saveState:"IDLE"},
    trwaRozpoczynanieZapisu: false,
    trwaWypelnianieOperacji: false,
    trwaWprowadzanieKolejki: false,
    trwaDodawanieZrodla: false,
    trwaRozpoznawanieNatywne: false,
    zapisaneTerminyEventis: [],
    weryfikacjaOtwartejKarty: null,
    przypisaneElementyKolejki: [],
    formularzZmieniony: false,
    poczatkowyOdciskFormularza: "",
    analizaTerminowWykonana: false,
    analizaWykazalaBraki: false,
    status: "INIT"
  };

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  let kontrolerKategorii = null;

  function pobierzTekstDlaKategorii() {
    return {
      tytul: state.tytulSemperNowegoOgloszenia || state.weryfikacjaOtwartejKarty?.task?.sourceTitle
        || state.source?.title || state.mapping?.sourceTitle || getEventisTitle(),
      opis: Object.values(state.source?.opisy || {}).filter(tekst => typeof tekst === "string").join(" ")
    };
  }

  function toast(text) {
    const old = $(".esync-toast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.className = "esync-toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function normalize(value) { return NARZEDZIA_WYSZUKIWANIA.normalizujTytul(value); }

  function cleanLine(value) { return NARZEDZIA_WYSZUKIWANIA.oczyscLinie(value); }

  function titleBeforeFirstPunctuation(title) { return NARZEDZIA_WYSZUKIWANIA.tytulPrzedPierwszymSeparatorem(title); }

  function tokenSet(value) { return NARZEDZIA_WYSZUKIWANIA.zbiorTokenow(value); }

  function titleSimilarity(a, b) { return NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow(a, b); }

  function wyroznijRozniceTytulow(pierwszyTytul, drugiTytul) {
    const podzielNaSlowa = tytul => String(tytul || "").match(/\S+\s*/g) || [];
    const kluczSlowa = slowo => normalize(slowo).replace(/\s+/g, "");
    const pierwszeSlowa = podzielNaSlowa(pierwszyTytul);
    const drugieSlowa = podzielNaSlowa(drugiTytul);
    const tabela = Array.from({ length: pierwszeSlowa.length + 1 }, () => Array(drugieSlowa.length + 1).fill(0));

    for (let i = pierwszeSlowa.length - 1; i >= 0; i--) {
      for (let j = drugieSlowa.length - 1; j >= 0; j--) {
        tabela[i][j] = kluczSlowa(pierwszeSlowa[i]) === kluczSlowa(drugieSlowa[j])
          ? tabela[i + 1][j + 1] + 1
          : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
      }
    }

    const zgodnePierwsze = new Set();
    const zgodneDrugie = new Set();
    let i = 0;
    let j = 0;
    while (i < pierwszeSlowa.length && j < drugieSlowa.length) {
      if (kluczSlowa(pierwszeSlowa[i]) === kluczSlowa(drugieSlowa[j])) {
        zgodnePierwsze.add(i++);
        zgodneDrugie.add(j++);
      } else if (tabela[i + 1][j] >= tabela[i][j + 1]) i++;
      else j++;
    }

    const renderuj = (slowa, zgodne) => slowa.map((slowo, indeks) =>
      `<span class="${zgodne.has(indeks) ? "esync-tytul-zgodny" : "esync-tytul-rozny"}">${esc(slowo)}</span>`
    ).join("");

    return {
      pierwszy: renderuj(pierwszeSlowa, zgodnePierwsze),
      drugi: renderuj(drugieSlowa, zgodneDrugie)
    };
  }

  function dateRangeFromText(text) {
    return NARZEDZIA_TERMINOW.dateRangeFromText(text);
  }

  function durationDays(start,end) {
    return NARZEDZIA_TERMINOW.durationDays(start,end);
  }

  function zastosujReguleCzterodniowegoTerminu(start, end, city, price) {
    return NARZEDZIA_TERMINOW.zastosujReguleCzterodniowegoTerminu(start,end,city,price);
  }

  function cityFromText(text) {
    return NARZEDZIA_TERMINOW.cityFromText(text);
  }

  function priceFromText(text) {
    return NARZEDZIA_TERMINOW.priceFromText(text);
  }

  function isConfirmedText(text) {
    return NARZEDZIA_TERMINOW.isConfirmedText(text);
  }

  function termKey(t) { return NARZEDZIA_TERMINOW.termKey(t); }
  function existingKey(t) { return NARZEDZIA_TERMINOW.existingKey(t); }
  function czyTerminPotwierdzony(termin) {
    return termin.effectiveConfirmed || termin.confirmed || state.reczniePotwierdzoneTerminy.has(termKey(termin));
  }
  function dedupeTerms(terms) {
    return NARZEDZIA_TERMINOW.dedupeTerms(terms);
  }

  async function storageGet(keys) { return chrome.storage.local.get(keys); }
  async function storageSet(obj) { return chrome.storage.local.set(obj); }

  async function zapiszElementyKolejki(elementy) {
    const wynik = await chrome.runtime.sendMessage({type:"MERGE_QUEUE_ITEMS",items:elementy});
    if (!wynik?.ok) throw new Error(wynik?.error || "Nie udało się zapisać kolejki Eventis.");
    state.eventisImportQueue = wynik.items;
    return wynik.items;
  }

  async function fetchText(url, opts={}) {
    const payload = { url, method: opts.method || "GET", body: opts.body || null, headers: opts.headers || {}, timeoutMs: opts.timeoutMs || 15000 };
    const res = await chrome.runtime.sendMessage({ type:"FETCH_TEXT", payload });
    if (!res?.ok) throw new Error(res?.error || "Nie udało się pobrać strony.");
    return res;
  }

  function formUrlEncoded(data) {
    return new URLSearchParams(data).toString();
  }

  function detectEventisId() {
    const parts = [location.pathname, location.search, $("form#eventForm")?.action || ""].join(" ");
    const patterns = [
      /\/event\/edit\/(\d+)/i,
      /\/event\/edit[^\d]+(\d+)/i,
      /[?&](?:id|event_id|eventId)=(\d+)/i,
      /event\/(\d+)/i
    ];
    for (const re of patterns) {
      const m = parts.match(re);
      if (m) return m[1];
    }
    const hidden = $('input[name="event[id]"], input[name="id"]');
    return hidden?.value || (MODE === "add" ? `new:${normalize(getEventisTitle()).slice(0,60)}` : `unknown:${location.pathname}`);
  }

  function getEventisTitle() {
    const field = $('textarea[name="event[title]"], input[name="event[title]"], #title');
    return cleanLine(field ? (field.value || field.textContent || "") : ($('h1')?.textContent || ""));
  }

  function kluczKontekstuWydarzenia() {
    const identyfikator = MODE === "edit"
      ? detectEventisId()
      : $('input[name="event[id]"], input[name="id"]')?.value || "nowe";
    return `${location.pathname}${location.search}|${identyfikator}`;
  }

  async function loadSettingsAndState() {
    state.tabId = (await chrome.runtime.sendMessage({type:"GET_TAB_CONTEXT"}))?.tabId || null;
    const data = await storageGet(["settings","mappings","pendingOperations","manualSheetSnapshot","eventisImportQueue","eventisQueueSchemaVersion",MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    state.eventisTitle = getEventisTitle();
    state.eventisId = detectEventisId();
    state.zapisaneTerminyEventis = getExistingTerms();
    const wykrytyOrganizator = wykryjOrganizatora();
    state.organization = wykrytyOrganizator.organizator;
    state.organizatorWydarzenia = wykrytyOrganizator.organizator;
    state.statusOrganizatora = wykrytyOrganizator.stan;
    state.wartoscFirmy = wykrytyOrganizator.wartosc;
    state.sposobWyboruZrodla = "AUTO";
    state.kontekstWydarzenia = kluczKontekstuWydarzenia();
    const key = state.organization ? mappingKey(state.organization,state.eventisId) : "";
    state.mapping = key ? (data.mappings || {})[key] || null : null;
    const pendingOperations = data.pendingOperations || {};
    state.pendingOperation = state.organization ? NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,state.organization,state.eventisId,state.eventisTitle,state.tabId) : null;
    state.eventisImportQueue = NARZEDZIA_KOLEJKI.migrujKolejke(Array.isArray(data.eventisImportQueue) ? data.eventisImportQueue : []);
    state.przypisaneRecznieBiezacejKarty = state.organization ? state.eventisImportQueue.filter(element => {
      if (element.organization !== state.organization) return false;
      const mapowanie = MAPOWANIA_WYDARZEN.pobierzBezpieczneMapowanie(data[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN],state.organization,element.normalizedTitle,element.title);
      return String(mapowanie?.eventId || "") === String(state.eventisId);
    }).map(element => element.id) : [];
    if (data.eventisQueueSchemaVersion !== 2) await storageSet({eventisImportQueue:state.eventisImportQueue,eventisQueueSchemaVersion:2});
    if (data.manualSheetSnapshot?.records) {
      state.manualRecords = data.manualSheetSnapshot.records;
      state.manualMatches = matchManualRecordsToCurrent(state.manualRecords);
      state.manualPreview = utworzPodgladImportu(state.manualRecords, data.manualSheetSnapshot.rawText || "");
    }
  }

  function odczytajWartoscPola(pole) {
    if (!pole) return "";
    if (pole.tagName === "SELECT") {
      const opcja = pole.selectedOptions?.[0];
      return cleanLine([opcja?.label,opcja?.textContent,opcja?.value].filter(Boolean).join(" "));
    }
    if ("value" in pole) return cleanLine([pole.value,pole.getAttribute("aria-label"),pole.dataset?.companyName,pole.dataset?.firma].filter(Boolean).join(" "));
    return cleanLine(pole.getAttribute("aria-label") || pole.textContent || "");
  }

  function znajdzPoleFirmy() {
    const formularz = $("form#eventForm") || $("form");
    if (!formularz) return null;
    for (const etykieta of $$('label',formularz)) {
      if (!/^firma\s*[:*]?$/i.test(cleanLine(etykieta.textContent))) continue;
      const powiazane = etykieta.control || (etykieta.htmlFor ? document.getElementById(etykieta.htmlFor) : null);
      const pole = powiazane || etykieta.querySelector("input,select,[contenteditable='true'],[role='combobox']")
        || etykieta.nextElementSibling?.matches?.("input,select,[contenteditable='true'],[role='combobox']") && etykieta.nextElementSibling
        || etykieta.parentElement?.querySelector("input,select,[contenteditable='true'],[role='combobox']");
      if (pole && formularz.contains(pole)) return pole;
    }
    const kandydaci = $$('input,select,textarea,[contenteditable="true"],[role="combobox"]',formularz);
    return kandydaci.find(pole => /(?:^|[\[_.-])(?:company|firm|firma)(?:$|[\]_.-])/i.test(`${pole.name || ""} ${pole.id || ""}`)) || null;
  }

  function wykryjOrganizatora() {
    const identyfikatorUrl = `${location.pathname} ${location.search}`.match(/\/event\/edit\/(\d+)|[?&](?:id|event_id|eventId)=(\d+)/i);
    const identyfikatorFormularza = $('input[name="event[id]"], input[name="id"]')?.value;
    if (identyfikatorUrl && identyfikatorFormularza && String(identyfikatorFormularza) !== (identyfikatorUrl[1] || identyfikatorUrl[2])) {
      return {organizator:null,stan:"LOADING",wartosc:""};
    }
    const pole = znajdzPoleFirmy();
    if (!pole) {
      return {organizator:null,stan:"LOADING",wartosc:""};
    }
    const wartosc = odczytajWartoscPola(pole);
    const rozpoznany = NARZEDZIA_ORGANIZATORA.rozpoznajOrganizatora(wartosc);
    const organizator = rozpoznany === "UNKNOWN" ? null : rozpoznany;
    return {organizator,stan:organizator || "UNKNOWN",wartosc};
  }

  async function zastosujOrganizatora(org, wartosc, {automatycznieSzukaj=true,wymusReset=false}={}) {
    if (!org || !["SEMPER","IIST"].includes(org)) return;
    const zmienilSieZrodlo = org !== state.organization || state.sposobWyboruZrodla !== "AUTO" || wymusReset;
    state.organizatorWydarzenia = org;
    state.statusOrganizatora = org;
    state.wartoscFirmy = wartosc;
    state.sposobWyboruZrodla = "AUTO";
    if (!zmienilSieZrodlo) { render(); return; }
    state.searchRequestId++;
    state.organization = org;
    state.source = null; state.statusZrodla = "UNKNOWN"; state.sourceLoadedFromMapping = false; state.sourceTerms = [];
    state.mappingVerifiedThisSession = false; state.searchChoices = []; state.searchAttempted = false;
    state.searchMessage = ""; state.searchFinalReason = "";
    state.analizaTerminowWykonana = false; state.analizaWykazalaBraki = false;
    state.mapping = null; state.pendingOperation = null; state.pendingLooksSaved = false;
    state.weryfikacjaOtwartejKarty = null; state.przypisaneElementyKolejki = [];
    state.status = "INIT";
    const identyfikatorKontekstu = state.searchRequestId;
    const {mappings={},pendingOperations={}} = await storageGet(["mappings","pendingOperations"]);
    if (identyfikatorKontekstu !== state.searchRequestId || state.organization !== org) return;
    await zweryfikujKarteSesjiOtwarcia();
    if (identyfikatorKontekstu !== state.searchRequestId || state.organization !== org) return;
    state.mapping = mappings[mappingKey(org,state.eventisId)] || null;
    state.pendingOperation = NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,org,state.eventisId,state.eventisTitle,state.tabId);
    state.pendingLooksSaved = false;
    render();
    await inspectPendingAfterReload();
    przywrocOczekujacyZapis();
    if (state.pendingLooksSaved) render();
    if (state.mapping) await loadRememberedMapping();
    else if (automatycznieSzukaj && MODE === "edit" && state.eventisTitle) setTimeout(() => {
      if (state.organization === org && state.wartoscFirmy === wartosc && state.sposobWyboruZrodla === "AUTO") onSearch();
    },350);
    await uruchomAutomatycznaKolejkeJesliGotowa();
  }

  function obserwujOrganizatora() {
    let czasomierz = null;
    const odczytajPonownie = () => {
      clearTimeout(czasomierz);
      czasomierz = setTimeout(() => {
        const kontekst = kluczKontekstuWydarzenia();
        if (kontekst !== state.kontekstWydarzenia) {
          state.kontekstWydarzenia = kontekst;
          state.terminUstaleniaKontekstu = Date.now() + 300;
          state.searchRequestId++;
          state.eventisId = detectEventisId();
          state.eventisTitle = getEventisTitle();
          state.sposobWyboruZrodla = "AUTO";
          state.organization = null;
          state.organizatorWydarzenia = null;
          state.statusOrganizatora = "LOADING";
          state.wartoscFirmy = "";
          state.source = null; state.statusZrodla = "UNKNOWN"; state.sourceLoadedFromMapping = false; state.sourceTerms = [];
          state.mapping = null; state.pendingOperation = null; state.pendingLooksSaved = false;
          state.searchChoices = []; state.searchAttempted = false; state.mappingVerifiedThisSession = false;
          state.weryfikacjaOtwartejKarty = null; state.przypisaneElementyKolejki = [];
          state.analizaTerminowWykonana = false; state.analizaWykazalaBraki = false;
          state.searchMessage = ""; state.searchFinalReason = ""; state.status = "INIT";
          state.reczniePotwierdzoneTerminy.clear();
          render();
          setTimeout(odczytajPonownie,300);
          return;
        }
        if (Date.now() < state.terminUstaleniaKontekstu) {
          setTimeout(odczytajPonownie,state.terminUstaleniaKontekstu-Date.now());
          return;
        }
        const aktualnyTytul = getEventisTitle();
        if (normalize(aktualnyTytul) !== normalize(state.eventisTitle)) {
          state.eventisTitle = aktualnyTytul;
          state.searchRequestId++;
          state.mappingVerifiedThisSession = false;
          state.searchChoices = [];
          state.manualMatches = matchManualRecordsToCurrent(state.manualRecords);
          if (state.source || state.searchAttempted) {
            state.status = "TITLE_CHANGED";
            state.searchMessage = "Tytuł Eventis zmienił się. Dotychczasowy wynik może być nieaktualny — uruchom wyszukiwanie ponownie.";
          }
          render();
        }
        const wykryty = wykryjOrganizatora();
        if (wykryty.stan === "LOADING") {
          const wymagaResetu = state.organization || state.source || state.searchAttempted
            || state.sposobWyboruZrodla !== "AUTO" || state.statusOrganizatora !== "LOADING" || state.wartoscFirmy;
          if (!wymagaResetu) return;
          state.searchRequestId++;
          state.sposobWyboruZrodla = "AUTO";
          state.statusOrganizatora = "LOADING";
          state.organization = null;
          state.organizatorWydarzenia = null;
          state.wartoscFirmy = "";
          state.source = null; state.statusZrodla = "UNKNOWN"; state.sourceTerms = []; state.mapping = null; state.pendingOperation = null;
          state.searchChoices = []; state.searchAttempted = false; state.mappingVerifiedThisSession = false;
          state.searchMessage = ""; state.searchFinalReason = ""; state.status = "INIT";
          render();
          return;
        }
        if (wykryty.wartosc === state.wartoscFirmy) return;
        if (wykryty.stan === "UNKNOWN") {
          if (state.wartoscFirmy !== wykryty.wartosc || state.organization) {
            state.searchRequestId++;
            state.sposobWyboruZrodla = "AUTO";
            state.organization = null;
            state.organizatorWydarzenia = null;
            state.statusOrganizatora = "UNKNOWN";
            state.wartoscFirmy = wykryty.wartosc;
            state.source = null; state.statusZrodla = "UNKNOWN"; state.sourceLoadedFromMapping = false; state.sourceTerms = []; state.mapping = null; state.pendingOperation = null;
            state.searchChoices = []; state.searchAttempted = false; state.mappingVerifiedThisSession = false;
            state.status = "INIT";
          }
          render();
          return;
        }
        zastosujOrganizatora(wykryty.organizator,wykryty.wartosc);
      },150);
    };
    const czyZdarzeniePolaFirmy = zdarzenie => {
      const pole = znajdzPoleFirmy();
      return zdarzenie.target === pole || Boolean(pole?.contains?.(zdarzenie.target));
    };
    document.addEventListener("input",zdarzenie => { if (czyZdarzeniePolaFirmy(zdarzenie)) odczytajPonownie(); },true);
    document.addEventListener("change",zdarzenie => { if (czyZdarzeniePolaFirmy(zdarzenie)) odczytajPonownie(); },true);
    const obserwator = new MutationObserver(odczytajPonownie);
    obserwator.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["value","selected"]});
    window.addEventListener("popstate",odczytajPonownie);
    window.addEventListener("hashchange",odczytajPonownie);
    window.navigation?.addEventListener("navigatesuccess",odczytajPonownie);
    odczytajPonownie();
  }

  function mappingKey(org,id) { return `${org}|${id}`; }

  function czyMapowanieDotyczyZrodla(mapowanie, zrodlo) {
    if (!mapowanie || !zrodlo) return false;
    if (zrodlo.id && mapowanie.sourceTrainingId === zrodlo.id) return true;
    return mapowanie.sourceUrl === zrodlo.url;
  }

  async function saveMapping(source, origin="MANUAL_URL") {
    const identyfikatorWyszukiwania = state.searchRequestId;
    const kontekst = state.kontekstWydarzenia;
    const organizacja = state.organization;
    const identyfikatorWydarzenia = state.eventisId;
    const tytulWydarzenia = state.eventisTitle;
    const { mappings = {} } = await storageGet(["mappings"]);
    if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia
      || organizacja !== state.organization || identyfikatorWydarzenia !== state.eventisId) return false;
    const key = mappingKey(organizacja,identyfikatorWydarzenia);
    const mapping = {
      mappingId: crypto.randomUUID(),
      organization: organizacja,
      eventisEventId: identyfikatorWydarzenia,
      eventisTitle: tytulWydarzenia,
      normalizedEventisTitle: normalize(tytulWydarzenia),
      sourceTrainingId: source.id || source.url,
      sourceTitle: source.title,
      sourceUrl: source.url,
      mappingOrigin: origin,
      confidence: titleSimilarity(tytulWydarzenia, source.title),
      learnedBy: state.settings.operatorInitial || "K",
      learnedAt: new Date().toISOString(),
      lastVerifiedAt: null,
      status: "ACTIVE"
    };
    mappings[key] = mapping;
    if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia) return false;
    await storageSet({ mappings });
    if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia) return false;
    state.mapping = mapping;
    state.mappingVerifiedThisSession = false;
    await audit("MAPPING_LEARNED", { sourceUrl:source.url, sourceTitle:source.title, origin });
    return true;
  }

  async function forgetMapping() {
    if (!await zwolnijOczekujacaOperacje()) return;
    const { mappings = {} } = await storageGet(["mappings"]);
    const key = mappingKey(state.organization,state.eventisId);
    delete mappings[key];
    await storageSet({ mappings });
    await audit("MAPPING_FORGOTTEN", {});
    state.mapping = null;
    state.source = null; state.statusZrodla = "UNKNOWN";
    state.sourceLoadedFromMapping = false;
    state.sourceTerms = [];
    state.missingTerms = [];
    state.analizaTerminowWykonana = false;
    state.analizaWykazalaBraki = false;
    state.mappingVerifiedThisSession = false;
  }

  async function audit(type, details={}) {
    const { auditLog = [] } = await storageGet(["auditLog"]);
    auditLog.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      type,
      operator: state.settings.operatorInitial || "K",
      organization: state.organization,
      eventisId: state.eventisId,
      eventisTitle: state.eventisTitle,
      details
    });
    if (auditLog.length > 1000) auditLog.splice(0,auditLog.length-1000);
    await storageSet({ auditLog });
  }

  function normalizeSemperUrl(value) {
    return NARZEDZIA_WYSZUKIWANIA.absolutnyUrlSemper(value);
  }

  function normalizeIistUrl(value) {
    return NARZEDZIA_WYSZUKIWANIA.absolutnyUrlIist(value);
  }

  function parseSemperTerms(doc) {
    return NARZEDZIA_TERMINOW.odczytajTerminySemper(doc);
  }

  function odczytajLiczbeDni(doc) {
    const wzorzec = /(?:czas trwania|liczba dni|czas szkolenia)[^0-9]{0,50}(\d{1,2})\s*(?:dni|dzien)\b/i;
    const elementy = $$('li,p,div,span,td,th,strong,b',doc)
      .map(el=>cleanLine(el.textContent || ""))
      .filter(tekst=>tekst.length <= 250 && /czas trwania|liczba dni|czas szkolenia/i.test(normalize(tekst)))
      .sort((a,b)=>a.length-b.length);
    for (const tekst of elementy) {
      const dopasowanie = normalize(tekst).match(wzorzec);
      if (dopasowanie) return Number(dopasowanie[1]);
    }
    const dopasowanie = normalize(doc.body?.innerText || doc.body?.textContent || "").match(wzorzec);
    return dopasowanie ? Number(dopasowanie[1]) : null;
  }

  function collectSectionByMarker(doc, markerText) {
    const headings = $$('h1,h2,h3,h4,h5,strong,b,.text_over',doc);
    const marker = headings.find(el => normalize(el.textContent).includes(normalize(markerText)));
    if (!marker) return "";
    const parent = marker.parentElement;
    if (!parent) return "";
    let html = "";
    let node = marker.nextElementSibling;
    let licznikBezpieczenstwa = 0;
    while (node && licznikBezpieczenstwa++ < 500) {
      if (czyPoczatekSekcji(node)) break;
      const txt = normalize(node.textContent);
      if (txt.includes("informacje organizacyjne") || txt.includes("inwestycja")) break;
      html += node.outerHTML || "";
      node = node.nextElementSibling;
    }
    return sanitizeHtml(html);
  }

  function czyPoczatekSekcji(element) {
    const selektor = "h1,h2,h3,h4,h5,strong,b,.text_over";
    const kandydaci = [element];
    if (element.firstElementChild) kandydaci.push(element.firstElementChild);
    if (element.firstElementChild?.firstElementChild) kandydaci.push(element.firstElementChild.firstElementChild);
    const naglowek = kandydaci.find(kandydat=>kandydat.matches?.(selektor));
    if (!naglowek) return false;
    const tekst = normalize(naglowek.textContent || "");
    return /^(?:grupa docelowa|adresaci|cel szkolenia|korzysci|program szkolenia|metodologia|szkolenie stacjonarne|szkolenie on-line|szkolenie online|trenerzy|informacje organizacyjne|inwestycja)(?:\s|:|$)/.test(tekst);
  }

  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`,"text/html");
    const root = doc.body.firstElementChild;
    root.querySelectorAll("script,style,img,svg,iframe,object,form,input,button").forEach(x=>x.remove());
    root.querySelectorAll("a").forEach(a=>a.replaceWith(doc.createTextNode(a.textContent||"")));
    root.querySelectorAll("*").forEach(el=>Array.from(el.attributes).forEach(a=>{ if (/^on/i.test(a.name)||["style","class","id"].includes(a.name)) el.removeAttribute(a.name); }));
    while (root.firstChild && /^[\s|]*$/.test(root.firstChild.textContent || "")) root.firstChild.remove();
    return root.innerHTML.trim();
  }

  function parseSemperPage(html,url) {
    const doc = new DOMParser().parseFromString(html,"text/html");
    const title = cleanLine((doc.querySelector("h1") || doc.querySelector("title"))?.textContent || "");
    const idMatch = url.match(/(?:szkolenie,|,)(\d+)(?:\.html|,html)/i);
    return {
      provider:"SEMPER", id:idMatch?.[1] || url, url, title,
      terms: parseSemperTerms(doc),
      liczbaDni: odczytajLiczbeDni(doc),
      opisy: NARZEDZIA_OPISOW_SEMPER.parsujOpisySemper(html)
    };
  }

  function minimalTermBlocks(doc) {
    const matches = $$('div,li,tr,p,section,article',doc).filter(el => {
      const text = cleanLine(el.textContent || "");
      return text.length >= 20 && text.length <= 700 && /od:\s*\d{4}-\d{2}-\d{2}/i.test(text) && /do:\s*\d{4}-\d{2}-\d{2}/i.test(text) && /zł/i.test(text);
    });
    return matches.filter(el => !Array.from(el.children).some(ch => {
      const t = cleanLine(ch.textContent||"");
      return t.length >= 20 && t.length < cleanLine(el.textContent||"").length && /od:\s*\d{4}-\d{2}-\d{2}/i.test(t) && /do:\s*\d{4}-\d{2}-\d{2}/i.test(t) && /zł/i.test(t);
    }));
  }

  function parseIistTerms(doc) {
    const terms = [];
    for (const el of minimalTermBlocks(doc)) {
      const text = cleanLine(el.textContent || "");
      const range = dateRangeFromText(text);
      const city = cityFromText(text.replace(/szkolenie online/gi,"Online"));
      const price = priceFromText(text);
      if (!range || !city || !price) continue;
      const confirmed = isConfirmedText(text);
      terms.push({...zastosujReguleCzterodniowegoTerminu(range.start,range.end,city,price),confirmed,rawText:text});
    }
    // Awaryjny parser tekstowy, gdy layout strony nie da minimalnych bloków.
    if (!terms.length) {
      const lines = (doc.body?.innerText || doc.body?.textContent || "").split(/\n+/).map(cleanLine).filter(Boolean);
      for (const line of lines) {
        if (!/od:\s*\d{4}-\d{2}-\d{2}/i.test(line) || !/do:\s*\d{4}-\d{2}-\d{2}/i.test(line)) continue;
        const range = dateRangeFromText(line), city = cityFromText(line), price = priceFromText(line);
        if (range && city && price) terms.push({...zastosujReguleCzterodniowegoTerminu(range.start,range.end,city,price),confirmed:isConfirmedText(line),rawText:line});
      }
    }
    return dedupeTerms(terms);
  }

  function parseIistPage(html,url) {
    const doc = new DOMParser().parseFromString(html,"text/html");
    const title = cleanLine((doc.querySelector("h1") || doc.querySelector("title"))?.textContent || "").replace(/\|\s*Szkolenia IIST.*$/i,"").trim();
    const idMatch = decodeURIComponent(url).match(/,(\d+)\.html/i);
    return {
      provider:"IIST", id:idMatch?.[1] || url, url, title,
      terms: parseIistTerms(doc),
      liczbaDni: odczytajLiczbeDni(doc),
      opisy: {
        grupaHtml: collectSectionByMarker(doc,"grupa docelowa"),
        celHtml: collectSectionByMarker(doc,"cel szkolenia"),
        korzysciHtml: collectSectionByMarker(doc,"korzyści dla uczestników"),
        programHtml: collectSectionByMarker(doc,"program szkolenia")
      }
    };
  }

  async function fetchTraining(url, organizacja=state.organization) {
    const normalizedUrl = organizacja === "SEMPER" ? normalizeSemperUrl(url) : normalizeIistUrl(url);
    const czySzczegoly = organizacja === "SEMPER"
      ? NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(normalizedUrl)
      : NARZEDZIA_WYSZUKIWANIA.czySzczegolyIist(normalizedUrl);
    if (!normalizedUrl || !czySzczegoly) throw new Error(`Link nie jest stroną szczegółową szkolenia ${organizacja}.`);
    const { text, finalUrl } = await fetchText(normalizedUrl);
    const source = organizacja === "SEMPER" ? parseSemperPage(text,finalUrl || normalizedUrl) : parseIistPage(text,finalUrl || normalizedUrl);
    if (!source.title) throw new Error("Nie udało się odczytać tytułu szkolenia ze strony źródłowej.");
    return source;
  }

  function importantSearchWords(value) {
    return NARZEDZIA_WYSZUKIWANIA.istotneSlowa(value);
  }

  function absoluteSemperUrl(value) {
    return NARZEDZIA_WYSZUKIWANIA.absolutnyUrlSemper(value);
  }

  function isSemperDetailsUrl(url) {
    return NARZEDZIA_WYSZUKIWANIA.czySzczegolySemper(url);
  }

  function linksFromSemperSearch(html, phrase) {
    return NARZEDZIA_WYSZUKIWANIA.linkiZWyszukiwarkiSemper(html, phrase);
  }

  function sprawdzAktualnoscWyszukiwania(identyfikator) {
    if (identyfikator !== state.searchRequestId) throw new Error("Wyszukiwanie zostało zastąpione nowszym.");
  }

  function zapiszDiagnostykeWyszukiwania(szczegoly) {
    console.debug("[Eventis Sync][wyszukiwanie]", szczegoly);
  }

  function dodajKandydata(mapa, kandydat, wariant) {
    if (!kandydat?.url) return;
    const poprzedni = mapa.get(kandydat.url);
    const searchScore = Math.max(kandydat.searchScore || 0, poprzedni?.searchScore || 0);
    mapa.set(kandydat.url, {
      ...poprzedni,
      ...kandydat,
      searchScore,
      warianty: [...new Set([...(poprzedni?.warianty || []), wariant])]
    });
  }

  async function zweryfikujKandydatow(kandydaci, organizacja, identyfikator) {
    const posortowani = [...kandydaci]
      .sort((a,b)=>b.searchScore-a.searchScore)
      .slice(0,PROGI_WYSZUKIWANIA.MAKS_KANDYDATOW_DO_WERYFIKACJI);
    const wyniki = [];
    let bledySieci = 0;
    let bledyWeryfikacji = 0;
    for (const kandydat of posortowani) {
      sprawdzAktualnoscWyszukiwania(identyfikator);
      try {
        const source = kandydat.source || await fetchTraining(kandydat.url, organizacja);
        const verificationScore = titleSimilarity(state.eventisTitle, source.title);
        wyniki.push({
          url: source.url,
          title: source.title,
          provider: organizacja,
          searchScore: kandydat.searchScore || 0,
          verificationScore,
          similarity: verificationScore,
          finalScore: 0.82 * verificationScore + 0.18 * (kandydat.searchScore || 0),
          source
        });
      } catch (blad) {
        bledyWeryfikacji++;
        if(/HTTP|połą|pobr|czasu|fetch|network/i.test(blad.message||""))bledySieci++;
        zapiszDiagnostykeWyszukiwania({provider:organizacja,url:kandydat.url,finalReason:"candidate-fetch-error",error:blad.message});
      }
    }
    return {
      results:wyniki.sort((a,b)=>b.finalScore-a.finalScore||b.verificationScore-a.verificationScore),
      verificationErrors:bledyWeryfikacji,
      networkVerificationErrors:bledySieci
    };
  }

  async function searchSemper(warianty, identyfikator) {
    const headers = {"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"};
    const kandydaci = new Map();
    let udaneZapytania = 0;
    let ostatniBlad = null;
    for (const wariant of warianty) {
      sprawdzAktualnoscWyszukiwania(identyfikator);
      try {
        const direct = await fetchText("https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj.php", {method:"POST",headers,body:formUrlEncoded({opc:"szukaj",co:wariant})});
        udaneZapytania++;
        const url = NARZEDZIA_WYSZUKIWANIA.urlZJsonSemper(direct.text);
        if (url) {
          dodajKandydata(kandydaci,{
            url,
            title:url,
            searchScore:Math.max(0.7,NARZEDZIA_WYSZUKIWANIA.ocenWynikWyszukiwania(wariant,url))
          },wariant);
          try {
            const source = await fetchTraining(url,"SEMPER");
            const verificationScore = titleSimilarity(state.eventisTitle,source.title);
            const searchScore = NARZEDZIA_WYSZUKIWANIA.ocenWynikWyszukiwania(wariant,source.title);
            dodajKandydata(kandydaci,{url:source.url,title:source.title,searchScore,source},wariant);
            if (verificationScore >= PROGI_WYSZUKIWANIA.AUTO_AKCEPTACJA) {
              const weryfikacja = await zweryfikujKandydatow(kandydaci.values(),"SEMPER",identyfikator);
              return {...weryfikacja,rawCount:kandydaci.size,networkVerificationErrors:weryfikacja.networkVerificationErrors + (!weryfikacja.results.length && ostatniBlad ? 1 : 0)};
            }
          } catch (blad) {
            ostatniBlad = blad;
          }
        }
      } catch (blad) {
        ostatniBlad = blad;
      }
      try {
        const auto = await fetchText("https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj_auto.php", {method:"POST",headers,body:formUrlEncoded({opc:"szukaj",co:wariant})});
        udaneZapytania++;
        for (const kandydat of linksFromSemperSearch(auto.text,wariant)) dodajKandydata(kandydaci,kandydat,wariant);
      } catch (blad) {
        ostatniBlad = blad;
      }
    }
    if (!udaneZapytania && ostatniBlad) throw ostatniBlad;
    const weryfikacja = await zweryfikujKandydatow(kandydaci.values(),"SEMPER",identyfikator);
    return {...weryfikacja,rawCount:kandydaci.size,networkVerificationErrors:weryfikacja.networkVerificationErrors + (!weryfikacja.results.length && ostatniBlad ? 1 : 0)};
  }

  function odczytajFormularzIist(html, urlStrony) {
    const doc = new DOMParser().parseFromString(html,"text/html");
    const polaTekstowe = $$('input:not([type]),input[type="text"],input[type="search"]',doc);
    const poleTytulu = polaTekstowe.find(pole => {
      const opis = normalize(`${pole.getAttribute("placeholder") || ""} ${pole.getAttribute("aria-label") || ""}`);
      return opis.includes("wpisz nazwe szkolenia");
    });
    const formularz = poleTytulu?.closest("form");
    if (!formularz || !poleTytulu.name) {
      const blad = new Error("Nie rozpoznano natywnego formularza „Znajdź szkolenie” IIST. Potrzebny jest aktualny HTML/request strony.");
      blad.code = "IIST_FORM_NOT_RECOGNIZED";
      throw blad;
    }
    const metoda = String(formularz.getAttribute("method") || "GET").toUpperCase();
    if (!['GET','POST'].includes(metoda)) throw new Error(`Nieobsługiwana metoda formularza IIST: ${metoda}.`);
    const surowaAkcja = formularz.getAttribute("action") || urlStrony;
    if (/^javascript:/i.test(surowaAkcja)) throw new Error("Formularz IIST używa JavaScript/AJAX — potrzebny jest rzeczywisty request z DevTools.");
    const endpoint = normalizeIistUrl(new URL(surowaAkcja,urlStrony).href);
    if (!endpoint) throw new Error("Formularz IIST wskazuje endpoint poza dozwoloną domeną.");
    const pola = [];
    for (const pole of $$('input[name],select[name],textarea[name]',formularz)) {
      if (pole === poleTytulu) continue;
      const typ = String(pole.getAttribute("type") || "").toLowerCase();
      if (["submit","button","reset","file","image"].includes(typ)) continue;
      if (["checkbox","radio"].includes(typ) && !pole.checked) continue;
      if (pole.tagName === "SELECT") {
        for (const opcja of Array.from(pole.options).filter(opcja => opcja.selected)) pola.push([pole.name,opcja.value]);
      } else {
        pola.push([pole.name,pole.value || ""]);
      }
    }
    const przycisk = $('button[type="submit"][name],input[type="submit"][name]',formularz);
    if (przycisk?.name) pola.push([przycisk.name,przycisk.value || ""]);
    return {endpoint,method:metoda,titleParameter:poleTytulu.name,fields:pola};
  }

  async function wykonajWyszukiwanieIist(opisFormularza, wariant) {
    const dane = new URLSearchParams(opisFormularza.fields);
    dane.set(opisFormularza.titleParameter,wariant);
    if (opisFormularza.method === "GET") {
      const url = new URL(opisFormularza.endpoint);
      for (const [nazwa,wartosc] of dane) url.searchParams.append(nazwa,wartosc);
      return fetchText(url.href);
    }
    return fetchText(opisFormularza.endpoint,{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
      body:dane.toString()
    });
  }

  async function searchIist(warianty, identyfikator) {
    const strona = await fetchText("https://szkoleniaiist.com.pl/szkolenia.php");
    sprawdzAktualnoscWyszukiwania(identyfikator);
    const formularz = odczytajFormularzIist(strona.text,strona.finalUrl || "https://szkoleniaiist.com.pl/szkolenia.php");
    const kandydaci = new Map();
    let udaneZapytania = 0;
    let ostatniBlad = null;
    zapiszDiagnostykeWyszukiwania({provider:"IIST",endpoint:formularz.endpoint,method:formularz.method,titleParameter:formularz.titleParameter});
    for (const wariant of warianty) {
      sprawdzAktualnoscWyszukiwania(identyfikator);
      try {
        const odpowiedz = await wykonajWyszukiwanieIist(formularz,wariant);
        udaneZapytania++;
        const baza = odpowiedz.finalUrl || formularz.endpoint;
        for (const kandydat of NARZEDZIA_WYSZUKIWANIA.linkiZWyszukiwarkiIist(odpowiedz.text,wariant,baza)) {
          dodajKandydata(kandydaci,kandydat,wariant);
        }
      } catch (blad) {
        ostatniBlad = blad;
      }
    }
    if (!udaneZapytania && ostatniBlad) throw ostatniBlad;
    const weryfikacja = await zweryfikujKandydatow(kandydaci.values(),"IIST",identyfikator);
    return {...weryfikacja,rawCount:kandydaci.size,form:formularz,networkVerificationErrors:weryfikacja.networkVerificationErrors + (!weryfikacja.results.length && ostatniBlad ? 1 : 0)};
  }

  async function searchTraining(identyfikator=state.searchRequestId) {
    const warianty = NARZEDZIA_WYSZUKIWANIA.generujWariantyZapytania(state.eventisTitle);
    if (!warianty.length) throw new Error("Nie odczytano wystarczająco charakterystycznego tytułu ogłoszenia Eventis.");
    zapiszDiagnostykeWyszukiwania({provider:state.organization,eventisTitle:state.eventisTitle,variants:warianty});
    const wynik = state.organization === "SEMPER"
      ? await searchSemper(warianty,identyfikator)
      : await searchIist(warianty,identyfikator);
    zapiszDiagnostykeWyszukiwania({
      provider:state.organization,
      eventisTitle:state.eventisTitle,
      variants:warianty,
      candidateCount:wynik.rawCount,
      topCandidate:wynik.results[0]?.title || null,
      searchScore:wynik.results[0]?.searchScore || 0,
      verificationScore:wynik.results[0]?.verificationScore || 0
    });
    return {...wynik,variants:warianty};
  }

  function getExistingTerms() {
    return NARZEDZIA_TERMINOW.odczytajTerminyEventis($("#eventForm") || document);
  }

  function potwierdzoneZapisaneTerminy() {
    const klucze = new Set((state.zapisaneTerminyEventis || []).map(existingKey));
    return state.sourceTerms.filter(termin => czyTerminPotwierdzony(termin) && !termin.confirmationConflict && klucze.has(existingKey(termin)));
  }

  function compareTerms() {
    state.existingTerms = getExistingTerms();
    const kolejka = dopasowaniaKolejkiDoBiezacegoTytulu().map(dopasowanie => dopasowanie.element);
    const tytulGrupy = state.weryfikacjaOtwartejKarty?.task?.normalizedSourceTitle || normalize(state.eventisTitle);
    kolejka.push(...state.eventisImportQueue.filter(element => element.recordStatus === "DECONFIRMED" && element.organization === state.organization && element.normalizedTitle === tytulGrupy && !kolejka.some(przypisany => przypisany.id === element.id)));
    const scalenie = NARZEDZIA_TERMINOW.scalPotwierdzeniaKolejki(state.sourceTerms,kolejka,state.reczniePotwierdzoneTerminy);
    state.sourceTerms = scalenie.terms;
    const porownanie = NARZEDZIA_TERMINOW.porownajPotwierdzoneTerminy(state.sourceTerms,state.existingTerms);
    state.missingTerms = porownanie.missingConfirmedTerms;
    state.diagnostykaTerminow = {...scalenie.diagnostics,eventisMatchingCount:porownanie.matchingEventisTerms.length,missingCount:state.missingTerms.length};
    state.scalenieKolejki = scalenie;
    if (state.settings.debug || sessionStorage.getItem("eventisSyncDebug") === "1") console.debug("Eventis Sync terminy",{...state.diagnostykaTerminow,terms:state.sourceTerms});
    if (state.analizaTerminowWykonana && state.missingTerms.length) state.analizaWykazalaBraki = true;
  }

  function odciskFormularza() {
    const formularz = $("#eventForm");
    if (!formularz) return "";
    return Array.from(formularz.elements).filter(pole=>!pole.closest("#esync-root,#esync-terminy-formularza")).map((pole, indeks) => {
      const typ = String(pole.type || pole.tagName).toLowerCase();
      if (["button","submit","reset","image"].includes(typ)) return "";
      const wartosc = ["checkbox","radio"].includes(typ)
        ? `${pole.checked}:${pole.value}`
        : pole instanceof HTMLSelectElement && pole.multiple
          ? Array.from(pole.selectedOptions).map(opcja=>opcja.value).join("\u001d")
          : pole.value;
      return `${indeks}\u001f${pole.name}\u001f${typ}\u001f${pole.disabled}\u001f${wartosc}`;
    }).join("\u001e");
  }

  function aktualizujStanPrzyciskuPanelu() {
    state.formularzZmieniony = odciskFormularza() !== state.poczatkowyOdciskFormularza;
    const przycisk = $("#esync-panel-action");
    if (!przycisk) return;
    const zamknijKarte = state.analizaTerminowWykonana && !state.analizaWykazalaBraki && !state.formularzZmieniony;
    przycisk.dataset.action = zamknijKarte ? "save-close" : "save";
    przycisk.textContent = zamknijKarte ? "Zapisz i wróć do listy" : "Zapisz kartę";
    przycisk.classList.toggle("good",!zamknijKarte);
    przycisk.classList.toggle("primary",zamknijKarte);
    przycisk.disabled = !NARZEDZIA_OPERACJI.czyMoznaRozpoczacZapis(state.zapis,state.trwaRozpoczynanieZapisu) || (!zamknijKarte && !state.formularzZmieniony);
  }

  function obserwujZmianyFormularza() {
    const formularz = $("#eventForm");
    if (!formularz) return;
    state.poczatkowyOdciskFormularza = odciskFormularza();
    const aktualizujZPoznieniem = zdarzenie => {
      if (!zdarzenie.isTrusted || zdarzenie.target.closest("#esync-root,#esync-terminy-formularza")) return;
      setTimeout(aktualizujStanPrzyciskuPanelu, 0);
    };
    formularz.addEventListener("input",aktualizujZPoznieniem);
    formularz.addEventListener("change",aktualizujZPoznieniem);
  }

  function znajdzPrzyciskZapisu() {
    const formularz = $("#eventForm");
    if (!formularz) return null;
    const kandydaci = $$('button[type="submit"],input[type="submit"],button:not([type])',formularz).filter(przycisk=>!przycisk.disabled);
    const tekst = przycisk => normalize(przycisk.textContent || przycisk.value || "");
    return kandydaci.find(przycisk=>/zapisz|aktualizuj/.test(tekst(przycisk)))
      || kandydaci.find(przycisk=>/dodaj/.test(tekst(przycisk))&&!/termin/.test(tekst(przycisk)))
      || kandydaci.find(przycisk=>przycisk.type==="submit")
      || null;
  }

  function rozpocznijOczekiwanieNaZapis() {
    if (state.zapis?.saveState === "WAITING_FOR_EVENTIS") return;
    const tytulZadania = state.weryfikacjaOtwartejKarty?.status === "VERIFIED" ? state.weryfikacjaOtwartejKarty.task?.normalizedSourceTitle : "";
    const oczekujacyZapis = {eventId:state.eventisId,timestamp:Date.now(),expectedOperation:state.pendingOperation?.operationId || "FORM_SAVE",
      normalizedSourceTitle:tytulZadania || normalize(state.source?.title || state.mapping?.sourceTitle || state.eventisTitle),
      pageLoadId:PAGE_LOAD_ID,url:location.pathname + location.search};
    sessionStorage.setItem(KLUCZ_OCZEKUJACEGO_ZAPISU,JSON.stringify(oczekujacyZapis));
    state.zapis = NARZEDZIA_OPERACJI.utworzStanZapisu(oczekujacyZapis);
    diagnostykaZapisu({pageReloadDetected:false,pendingSaveRestored:false});
    rozpocznijObserwacjeZapisu();
  }

  function obserwujRecznyZapisFormularza() {
    $("#eventForm")?.addEventListener("submit",() => {
      rozpocznijOczekiwanieNaZapis();
    },true);
  }

  async function zapiszFormularzZPanelu(wymusZapis = false) {
    if (state.trwaWypelnianieOperacji) return toast("Trwa wypełnianie formularza. Poczekaj na zakończenie.");
    if (!NARZEDZIA_OPERACJI.czyMoznaRozpoczacZapis(state.zapis,state.trwaRozpoczynanieZapisu)) return;
    if (!state.formularzZmieniony && !wymusZapis) return;
    const formularz = $("#eventForm");
    if (!formularz) return toast("Nie znaleziono formularza Eventis.");
    if (state.pendingOperation?.status === "SAVE_SUBMITTED") return toast("Żądanie zapisu zostało już wysłane. Oczekuję na wynik Eventis.");
    state.trwaRozpoczynanieZapisu = true;
    state.zapis = {saveState:"PREPARING_SAVE"};
    render();
    try {
    if (state.pendingOperation?.status === "WAITING_FOR_SAVE") {
      const { pendingOperations = {} } = await storageGet(["pendingOperations"]);
      const klucz = kluczStorageOperacji(state.pendingOperation);
      const aktualnaOperacja = pendingOperations[klucz];
      if (identyfikatorOperacji(aktualnaOperacja) !== identyfikatorOperacji(state.pendingOperation)) {
        throw new Error("Operacja oczekująca zmieniła się w innej karcie. Odśwież stronę.");
      }
      const wyslanaOperacja = NARZEDZIA_OPERACJI.oznaczWyslanieZapisu(aktualnaOperacja);
      if (!wyslanaOperacja) throw new Error("Operacja nie jest gotowa do zapisu.");
      pendingOperations[klucz]=wyslanaOperacja;
      await storageSet({pendingOperations});
      state.pendingOperation=wyslanaOperacja;
    }
    state.zapis = {saveState:"SUBMITTING"};
    render();
    rozpocznijOczekiwanieNaZapis();
    render();
    const przyciskZapisu = znajdzPrzyciskZapisu();
    if (przyciskZapisu) przyciskZapisu.click();
    else formularz.requestSubmit();
    } catch (blad) {
      zakonczObserwacjeZapisu();
      sessionStorage.removeItem(KLUCZ_OCZEKUJACEGO_ZAPISU);
      state.zapis = {saveState:"IDLE"};
      render();
      throw blad;
    } finally { state.trwaRozpoczynanieZapisu = false; }
  }

  async function zapiszIZamknijKarte() {
    sessionStorage.setItem(KLUCZ_ZAMKNIECIA_PO_ZAPISIE,JSON.stringify({pageLoadId:PAGE_LOAD_ID,startedAt:Date.now()}));
    try { await zapiszFormularzZPanelu(true); }
    catch (blad) { sessionStorage.removeItem(KLUCZ_ZAMKNIECIA_PO_ZAPISIE); throw blad; }
  }

  function wykonajAkcjePanelu() {
    const przycisk = $("#esync-panel-action");
    if (przycisk?.dataset.action === "save-close") zapiszIZamknijKarte().catch(blad=>toast(`Nie udało się zapisać formularza: ${blad.message}`));
    else {
      sessionStorage.removeItem(KLUCZ_ZAMKNIECIA_PO_ZAPISIE);
      zapiszFormularzZPanelu().catch(blad=>toast(`Nie udało się rozpocząć zapisu: ${blad.message}`));
    }
  }

  function setValue(el,val) {
    if (!el) return;
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto,"value")?.set;
    if (setter) setter.call(el,String(val ?? "")); else el.value = String(val ?? "");
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }

  async function zweryfikujKarteSesjiOtwarcia() {
    const parametry = new URLSearchParams(location.search);
    let zapamietanaSesja = null;
    let oczekujacyZapis = null;
    if (typeof sessionStorage !== "undefined") {
      try {
        zapamietanaSesja = JSON.parse(sessionStorage.getItem("eventisSyncSesjaOtwarcia") || "null");
        oczekujacyZapis = JSON.parse(sessionStorage.getItem(KLUCZ_OCZEKUJACEGO_ZAPISU) || "null");
      } catch (_) { zapamietanaSesja = null; }
    }
    const przejsciePoZapisie = zapamietanaSesja?.tryb === "add" && state.tabId === zapamietanaSesja.tabId
      && oczekujacyZapis?.url?.startsWith("/event/add") && Date.now() >= oczekujacyZapis.timestamp && Date.now() - oczekujacyZapis.timestamp < 120000
      && oczekujacyZapis.expectedOperation === (state.pendingOperation?.operationId || "FORM_SAVE")
      && /^\/event\/edit\/\d+/.test(location.pathname || "");
    const moznaOdtworzyc = zapamietanaSesja?.organization === state.organization && state.tabId === zapamietanaSesja.tabId
      && ((zapamietanaSesja.tryb === "edit" && String(zapamietanaSesja.eventisId) === String(state.eventisId)) || przejsciePoZapisie);
    const sessionId = parametry.get("esyncSession") || (moznaOdtworzyc ? zapamietanaSesja.sessionId : "");
    const taskId = parametry.get("esyncTask") || (moznaOdtworzyc ? zapamietanaSesja.taskId : "");
    if (!sessionId && !taskId) return null;
    const dane = await storageGet(["eventisOpeningSessions",MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    const sesje = dane.eventisOpeningSessions || {};
    const sesja = sesje[sessionId] || null;
    const zadanie = sesja?.tasks?.find(element => String(element.taskId || element.eventId) === String(taskId));
    let magazynMapowan = MAPOWANIA_WYDARZEN.normalizujMagazynMapowan(dane[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
    if (przejsciePoZapisie && sessionId === zapamietanaSesja.sessionId && taskId === zapamietanaSesja.taskId
      && zadanie?.typ === "CREATE_NEW" && zadanie.organization === state.organization && normalize(getEventisTitle()) === normalize(zadanie.sourceTitle)) {
      Object.assign(zadanie,{typ:"EDIT",eventId:state.eventisId,eventUrl:location.href});
      magazynMapowan = MAPOWANIA_WYDARZEN.zapiszMapowanie(magazynMapowan,{
        organization:state.organization,sourceTitle:zadanie.sourceTitle,normalizedTitle:zadanie.normalizedSourceTitle,
        eventId:state.eventisId,eventUrl:location.href,eventTitle:getEventisTitle(),resolutionSource:"manual"
      });
      await storageSet({[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]:magazynMapowan});
    }
    const mapowanie = zadanie ? MAPOWANIA_WYDARZEN.pobierzMapowanie(magazynMapowan,zadanie.organization || sesja.organization,zadanie.normalizedSourceTitle) : null;
    for (let proba=0;proba<10 && !getEventisTitle();proba++) await sleep(100);
    const wynik = NARZEDZIA_OTWIERANIA.zweryfikujOtwartaKarte(sesja,{
      sessionId,
      taskId,
      organization:state.organization,
      eventUrl:location.href,
      eventTitle:getEventisTitle()
    },mapowanie);
    state.weryfikacjaOtwartejKarty=wynik;
    if (wynik.status === "VERIFIED" && typeof sessionStorage !== "undefined") sessionStorage.setItem("eventisSyncSesjaOtwarcia",JSON.stringify({
      sessionId,taskId,organization:state.organization,tabId:state.tabId,eventisId:state.eventisId,tryb:location.pathname?.startsWith("/event/add") ? "add" : "edit"
    }));
    state.przypisaneElementyKolejki = wynik.status === "VERIFIED"
      ? NARZEDZIA_KOLEJKI.przypiszElementyDoZadania(state.eventisImportQueue,{...zadanie,status:wynik.status},state.organization)
      : [];
    if (sesja) {
      sesje[sessionId]=NARZEDZIA_OTWIERANIA.zapiszWynikWeryfikacjiSesji(sesja,wynik);
      await storageSet({eventisOpeningSessions:sesje});
    }
    if (wynik.invalidMapping && zadanie) {
      const zaktualizowanyMagazyn = MAPOWANIA_WYDARZEN.oznaczMapowanieNieprawidlowe(magazynMapowan,zadanie.organization || sesja.organization,zadanie.normalizedSourceTitle);
      await storageSet({[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]:zaktualizowanyMagazyn});
    }
    await audit("OPENING_SESSION_PAGE_VERIFIED",{sessionId,taskId,status:wynik.status,reason:wynik.reason});
    return wynik;
  }

  function renderujWeryfikacjeOtwartejKarty() {
    return "";
  }

  async function ustawPoleRichText(pole, html, dodatkoweDane = {}) {
    const wynik = await chrome.runtime.sendMessage({type:"SET_RICH_FIELD",name:pole,html,...dodatkoweDane});
    if (wynik?.ok) return wynik;
    const nazwaPola = NAZWY_POL_OPISOWYCH[pole] || pole || dodatkoweDane.elementId || "pole rich-text";
    const szczegoly = wynik?.message || "Edytor Eventis nie potwierdził aktualizacji danych.";
    throw new Error(`Nie udało się poprawnie ustawić pola „${nazwaPola}”. ${szczegoly}`);
  }

  function znajdzPolePoEtykiecie(tekstEtykiety) {
    const szukanyTekst = normalize(tekstEtykiety);
    const etykieta = $$('label').find(el=>normalize(el.textContent).includes(szukanyTekst));
    if (!etykieta) return null;
    const identyfikator = etykieta.getAttribute("for");
    if (identyfikator) {
      const pole = document.getElementById(identyfikator);
      if (pole) return pole;
    }
    return etykieta.querySelector('input,textarea,select') || etykieta.parentElement?.querySelector('input,textarea,select') || null;
  }

  async function wybierzWygladPodstawowy() {
    let pole = znajdzPolePoEtykiecie("Podstawowy");
    if (!(pole instanceof HTMLInputElement)) throw new Error("Nie znaleziono opcji wyglądu prelegentów „Podstawowy”.");
    if (!pole.checked) pole.click();
    for (let proba=0;proba<10;proba++) {
      await sleep(100);
      pole = znajdzPolePoEtykiecie("Podstawowy");
      if (pole instanceof HTMLInputElement && pole.checked) return;
    }
    throw new Error("Nie udało się wybrać wyglądu prelegentów „Podstawowy”.");
  }

  function odczytajTrescEdytoraPola(pole) {
    let kontener = pole?.parentElement;
    while (kontener && kontener !== document.body) {
      const edytory = kontener.querySelectorAll('.ck-editor__editable[contenteditable="true"]');
      if (edytory.length === 1) return cleanLine(edytory[0].textContent || "");
      if (edytory.length > 1) return "";
      kontener = kontener.parentElement;
    }
    return "";
  }

  async function uzupelnijIZweryfikujZyciorys() {
    const zyciorys = state.organization === "SEMPER" ? "Ekspert SEMPER" : "Trener IIST";
    for (let proba=0;proba<3;proba++) {
      const pole = znajdzPolePoEtykiecie("Życiorys");
      const edytor = document.getElementById("participants");
      if (!pole && !edytor) throw new Error("Nie znaleziono pola „Życiorys” w sekcji prelegentów.");
      if (pole?.name || edytor) await chrome.runtime.sendMessage({type:"SET_RICH_FIELD",name:pole?.name,elementId:"participants",html:`<p>${zyciorys}</p>`});
      else setValue(pole,zyciorys);
      await sleep(150);
      const wpisanaTresc = cleanLine(document.getElementById("participants")?.textContent || odczytajTrescEdytoraPola(pole));
      if (normalize(wpisanaTresc) === normalize(zyciorys)) return;
    }
    throw new Error(`Nie udało się uzupełnić pola „Życiorys” wartością „${zyciorys}”.`);
  }

  function zaznaczOpcjePolaWielokrotnegoWyboru(tekstEtykiety, nazwyOpcji) {
    const szukanyTekst = normalize(tekstEtykiety);
    const etykieta = $$('label,div').filter(element=>normalize(element.textContent).includes(szukanyTekst))
      .sort((pierwszy,drugi)=>(pierwszy.textContent || "").length-(drugi.textContent || "").length)[0];
    if (!etykieta) return false;
    let pole = etykieta.htmlFor ? document.getElementById(etykieta.htmlFor) : null;
    let kontener = etykieta.parentElement;
    while (!(pole instanceof HTMLSelectElement) && kontener && kontener !== document.body) {
      const pola = Array.from(kontener.querySelectorAll('select[multiple],select'));
      if (pola.length === 1) pole = pola[0];
      if (pola.length > 1) break;
      kontener = kontener.parentElement;
    }
    if (!(pole instanceof HTMLSelectElement)) return false;
    const szukaneOpcje = new Set(nazwyOpcji.map(nazwa=>normalize(nazwa)));
    let znalezionoWszystkie = true;
    for (const nazwa of szukaneOpcje) {
      const opcja = Array.from(pole.options).find(element=>normalize(element.textContent) === nazwa);
      if (opcja) opcja.selected = true;
      else znalezionoWszystkie = false;
    }
    pole.dispatchEvent(new Event("input",{bubbles:true}));
    pole.dispatchEvent(new Event("change",{bubbles:true}));
    return znalezionoWszystkie;
  }

  function wymaganeFormyZajec() {
    const formy = ["Case study","Wykłady"];
    if (normalize(getEventisTitle() || state.eventisTitle).includes("warsztaty praktyczne")) formy.push("Warsztaty");
    return formy;
  }

  async function uzupelnijWymaganeFormyZajec() {
    for (let proba=0;proba<10;proba++) {
      if (zaznaczOpcjePolaWielokrotnegoWyboru("Jakie formy zajęć stosowane są w trakcie wydarzenia?",wymaganeFormyZajec())) return true;
      await sleep(100);
    }
    return false;
  }

  function pobierzPolaTerminu(formularz) {
    const identyfikator = formularz.id.slice("li_eventdate_".length);
    const pole = (nazwa, znacznik = "input") => formularz.querySelector(`${znacznik}[name="eventDate[${identyfikator}][${nazwa}]"]`);
    return {
      tryb:pole("is_online","select") || formularz.querySelector(`[id="eventdate_is_online_${identyfikator}"]`),
      poczatek:pole("date_start") || formularz.querySelector(`[id="eventdate_datestart_${identyfikator}"]`),
      koniec:pole("date_end") || formularz.querySelector(`[id="eventdate_dateend_${identyfikator}"]`),
      potwierdzenie:pole("is_guaranteed","select"), vat:pole("prices][0][taxRate"), cena:pole("prices][0][price"),
      pakiet:pole("prices][0][price_name"), opisOnline:pole("online_description","textarea"),
      informacja:pole("info"), region:pole("region_id","select"), miasto:pole("city")
    };
  }

  const natywneDodawanie = {przycisk:null,formularz:null,anuluj:null,komunikat:"",puste:new WeakMap()};

  function odciskPolTerminu(formularz) {
    return JSON.stringify($$('input,select,textarea',formularz).map(pole => [pole.name,pole.value,pole.checked]));
  }

  function brakujacePolaTerminu(formularz, termin, tylkoPodstawowe = false) {
    const pola = pobierzPolaTerminu(formularz);
    const wymagane = ["tryb","poczatek","koniec","potwierdzenie","vat","cena","pakiet"];
    if (!tylkoPodstawowe) wymagane.push(...(termin?.city === "Online" ? ["opisOnline"] : termin ? ["informacja","region","miasto"]
      : pola.opisOnline ? ["opisOnline"] : ["informacja","region","miasto"]));
    const brakujace = wymagane.filter(nazwa => !pola[nazwa] || pola[nazwa].disabled);
    const wymaganeOpcje = [["tryb",termin?.city === "Online" || !termin ? "1" : ""],["potwierdzenie","1"]];
    if (!tylkoPodstawowe && termin && termin.city !== "Online") wymaganeOpcje.push(["region",String(REGIONS[termin.city])]);
    for (const [nazwa,wartosc] of wymaganeOpcje) {
      if (pola[nazwa] && !Array.from(pola[nazwa].options || []).some(opcja => opcja.value === wartosc)) brakujace.push(`opcja ${nazwa}`);
    }

    return brakujace;
  }

  function findAddTermButton() {
    const przycisk = natywneDodawanie.przycisk;
    const formularz = $("#eventForm");
    if (przycisk?.isConnected && natywneDodawanie.formularz === formularz
      && formularz.contains(przycisk) && !przycisk.disabled) return przycisk;
    if (!formularz) return null;
    const naglowki = $$('h1,h2,h3,h4,h5,h6,legend',formularz)
      .filter(element => normalize(element.textContent) === normalize("Termin i miejsce wydarzenia"));
    if (naglowki.length > 1) throw new Error("Niejednoznaczna sekcja terminów Eventis. Sprawdź formularz przed dodaniem.");
    if (!naglowki.length) return null;
    let sekcja = naglowki[0].parentElement;
    while (sekcja && sekcja !== formularz) {
      const kandydaci = $$('button,a,input[type="button"]',sekcja).filter(element =>
        !element.closest('[id^="li_eventdate_"],#esync-root') && !element.disabled
        && element.getAttribute("aria-disabled") !== "true" && element.type !== "submit"
        && /^\+?\s*dodaj termin\s*$/i.test((element.textContent || element.value || element.getAttribute("aria-label") || "").trim()));
      if (kandydaci.length > 1) throw new Error("Znaleziono kilka przycisków „Dodaj termin” w sekcji terminów. Sprawdź formularz przed dodaniem.");
      if (kandydaci.length === 1) return kandydaci[0];
      sekcja = sekcja.parentElement;
    }
    return null;
  }

  function oczekujNaPrzyciskTerminu(czyAktualny, czas = 6000) {
    return new Promise((rozwiaz, odrzuc) => {
      let licznik;
      const zakoncz = (blad, przycisk) => { obserwator.disconnect(); clearTimeout(licznik); window.removeEventListener("pagehide",anuluj); blad ? odrzuc(blad) : rozwiaz(przycisk); };
      const anuluj = () => zakoncz(new Error("Anulowano oczekiwanie na przycisk dodawania terminu."));
      const sprawdz = () => {
        try {
          if (!czyAktualny()) return zakoncz(new Error("Kontekst ogłoszenia zmienił się podczas dodawania terminu."));
          const przycisk = findAddTermButton();
          if (przycisk) zakoncz(null,przycisk);
        } catch (blad) { zakoncz(blad); }
      };
      const obserwator = new MutationObserver(sprawdz);
      obserwator.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
      window.addEventListener("pagehide",anuluj,{once:true});
      licznik = setTimeout(() => zakoncz(new Error("Nie znaleziono przycisku „Dodaj termin” w sekcji terminów Eventis.")),czas);
      sprawdz();
    });
  }

  function oczekujNaNatywnyFormularz(poczatkoweId, termin, akcja, {sygnal,czas = 6000,czyAktualny = () => true,wierszDocelowy = null,tylkoPodstawowe = false} = {}) {
    return new Promise((rozwiaz, odrzuc) => {
      const formularz = $("#eventForm");
      if (!formularz || sygnal?.aborted) return odrzuc(new Error("Anulowano oczekiwanie na formularz Eventis."));
      let zakonczone = false;
      let licznik;
      const zakoncz = (blad, wiersz) => {
        if (zakonczone) return;
        zakonczone = true;
        obserwator.disconnect();
        clearTimeout(licznik);
        sygnal?.removeEventListener("abort",anuluj);
        window.removeEventListener("pagehide",anuluj);
        formularz.removeEventListener("input",sprawdz);
        formularz.removeEventListener("change",sprawdz);
        if (blad) odrzuc(blad); else rozwiaz(wiersz);
      };
      const anuluj = () => zakoncz(new Error("Anulowano oczekiwanie na formularz Eventis."));
      const noweWiersze = () => wierszDocelowy ? (formularz.contains(wierszDocelowy) ? [wierszDocelowy] : [])
        : $$('[id^="li_eventdate_"]',formularz).filter(wiersz => !poczatkoweId.has(wiersz.id));
      const sprawdz = () => {
        if (!formularz.isConnected || !czyAktualny()) return zakoncz(new Error("Kontekst ogłoszenia zmienił się podczas dodawania terminu."));
        const nowe = noweWiersze();
        if (nowe.length > 1) return zakoncz(new Error("Jedna akcja utworzyła kilka formularzy. Sprawdź natywny przycisk Eventis."));
        if (nowe.length === 1 && !brakujacePolaTerminu(nowe[0],termin,tylkoPodstawowe).length) zakoncz(null,nowe[0]);
      };
      const obserwator = new MutationObserver(sprawdz);
      obserwator.observe(document.body,{childList:true,subtree:true,attributes:true});
      sygnal?.addEventListener("abort",anuluj,{once:true});
      window.addEventListener("pagehide",anuluj,{once:true});
      formularz.addEventListener("input",sprawdz);
      formularz.addEventListener("change",sprawdz);
      licznik = setTimeout(() => {
        const nowe = noweWiersze();
        zakoncz(new Error(nowe.length === 1
          ? `Formularz Eventis nie jest gotowy. Brak pól: ${brakujacePolaTerminu(nowe[0],termin,tylkoPodstawowe).join(", ")}.`
          : "Eventis nie utworzył nowego formularza terminu. Rozpoznaj ponownie natywne dodawanie w panelu."));
      },czas);
      try { akcja(); sprawdz(); } catch (blad) { zakoncz(blad); }
    });
  }

  function rozpoznajNatywneDodawanie() {
    if (natywneDodawanie.anuluj) return;
    if (state.trwaWypelnianieOperacji || state.trwaWprowadzanieKolejki || czyTrwaZapis()) return;
    const formularz = $("#eventForm");
    if (!formularz) return toast("Nie znaleziono formularza Eventis.");
    natywneDodawanie.przycisk = null;
    natywneDodawanie.formularz = null;
    const kontroler = new AbortController();
    const zakoncz = () => { clearTimeout(licznik); formularz.removeEventListener("click",obsluz,true); kontroler.abort(); natywneDodawanie.anuluj = null; state.trwaRozpoznawanieNatywne = false; };
    const obsluz = async zdarzenie => {
      const przycisk = zdarzenie.target.closest('button,a,input[type="button"]');
      if (!zdarzenie.isTrusted || !przycisk || przycisk.closest('[id^="li_eventdate_"],#esync-root') || przycisk.type === "submit" || przycisk.disabled) return;
      formularz.removeEventListener("click",obsluz,true);
      const poczatkoweId = new Set($$('[id^="li_eventdate_"]',formularz).map(wiersz => wiersz.id));
      try {
        const wiersz = await oczekujNaNatywnyFormularz(poczatkoweId,null,() => {},{sygnal:kontroler.signal});
        natywneDodawanie.przycisk = przycisk;
        natywneDodawanie.formularz = formularz;
        natywneDodawanie.puste.set(wiersz,odciskPolTerminu(wiersz));
        natywneDodawanie.komunikat = "Rozpoznano natywny przycisk. Sprawdź dane i wprowadź terminy.";
        console.info("Asystent Eventis: rozpoznano natywne dodawanie",{znacznik:przycisk.tagName,id:przycisk.id,klasy:przycisk.className,formularz:wiersz.id});
      } catch (blad) {
        natywneDodawanie.przycisk = null;
        natywneDodawanie.komunikat = blad.message;
      } finally { zakoncz(); render(); }
    };
    const licznik = setTimeout(() => { zakoncz(); natywneDodawanie.komunikat = "Rozpoznanie anulowane: nie wskazano natywnego dodawania."; render(); },30000);
    natywneDodawanie.anuluj = zakoncz;
    state.trwaRozpoznawanieNatywne = true;
    natywneDodawanie.komunikat = "Teraz ręcznie kliknij właściwy przycisk dodania terminu w Eventis. Asystent sprawdzi, czy powstał kompletny formularz. Niczego nie zapisuj.";
    formularz.addEventListener("click",obsluz,true);
    render();
    toast(natywneDodawanie.komunikat);
  }

  function sprawdzDaneTerminu(termin) {
    const poprawnaData = data => /^\d{4}-\d{2}-\d{2}$/.test(data || "") && Number.isFinite(Date.parse(data)) && new Date(data).toISOString().slice(0,10) === data;
    if (!poprawnaData(termin.start) || !poprawnaData(termin.end) || termin.end < termin.start || !termin.city
      || termin.price == null || String(termin.price).trim() === "" || !Number.isFinite(Number(termin.price)) || Number(termin.price) < 0
      || termin.confirmationConflict || termin.effectiveConfirmed === false) throw new Error("Termin ma nieprawidłowe dane daty, lokalizacji, potwierdzenia lub ceny.");
    if (termin.city !== "Online" && REGIONS[termin.city] == null) throw new Error(`Brak mapowania regionu Eventis dla miasta „${termin.city}”.`);
  }

  function fillTerm(formularz,termin) {
    sprawdzDaneTerminu(termin);
    const {tryb,poczatek:dataPoczatkowa,koniec:dataKoncowa,potwierdzenie,vat:stawkaVat,cena,opisOnline,informacja,region,miasto,pakiet} = pobierzPolaTerminu(formularz);
    if (brakujacePolaTerminu(formularz,termin).length) throw new Error("Formularz terminu Eventis nie zawiera wszystkich wymaganych pól.");
    if (dataPoczatkowa.value || dataKoncowa.value) throw new Error("Formularz zawiera już termin. Nie został nadpisany.");
    const poprzednieWartosci = $$('input,select,textarea',formularz).map(pole => ({pole,wartosc:pole.value,zaznaczony:pole.checked}));
    try {
      if (termin.city === "Online") {
        if (tryb.value !== "1") setValue(tryb,"1");
        setValue(opisOnline,"-");
      } else {
        if (tryb.value !== "") setValue(tryb,"");
        setValue(informacja,termin.city);
        setValue(region,REGIONS[termin.city]);
        setValue(miasto,termin.city);
      }
      setValue(dataPoczatkowa,termin.start);
      setValue(dataKoncowa,termin.end);
      setValue(potwierdzenie,"1");
      setValue(pakiet,termin.city === "Online" ? "szkolenie online" : "szkolenie stacjonarne");
      setValue(stawkaVat,"23");
      setValue(cena,termin.price);
      if (dataPoczatkowa.value !== termin.start || dataKoncowa.value !== termin.end || String(cena.value).trim() === "" || Number(cena.value) !== Number(termin.price)
        || potwierdzenie.value !== "1" || Number(stawkaVat.value) !== 23
        || tryb.value !== (termin.city === "Online" ? "1" : "")
        || pakiet.value !== (termin.city === "Online" ? "szkolenie online" : "szkolenie stacjonarne")
        || (termin.city === "Online" ? opisOnline.value !== "-" : miasto.value !== termin.city || informacja.value !== termin.city || region.value !== String(REGIONS[termin.city]))) {
        const oczekiwane = [["data rozpoczęcia",dataPoczatkowa,termin.start],["data zakończenia",dataKoncowa,termin.end],["cena",cena,termin.price],["tryb",tryb,termin.city === "Online" ? "1" : ""],["pakiet",pakiet,termin.city === "Online" ? "szkolenie online" : "szkolenie stacjonarne"],["VAT",stawkaVat,"23"],["potwierdzenie",potwierdzenie,"1"]];
        throw new Error(`Eventis nie przyjął wartości terminu: ${oczekiwane.filter(([,pole,wartosc]) => String(pole.value) !== String(wartosc)).map(([nazwa]) => nazwa).join(", ") || "lokalizacja"}. Sprawdź formularz przed ponowieniem.`);
      }
    } catch (blad) {
      for (const zapis of poprzednieWartosci) { zapis.pole.value = zapis.wartosc; zapis.pole.checked = zapis.zaznaczony; }
      throw blad;
    }
  }

  async function addSelectedTerms(terminy) {
    if (state.weryfikacjaOtwartejKarty && state.weryfikacjaOtwartejKarty.status !== "VERIFIED") {
      throw new Error("Karta sesji nie przeszła weryfikacji. Formularz nie został zmieniony.");
    }
    const rozdzielenie = NARZEDZIA_KOLEJKI.rozdzielTerminyDoWprowadzenia(terminy,getExistingTerms());
    const doDodania = rozdzielenie.doWprowadzenia;
    const wynik = {dodane:[],pominiete:rozdzielenie.pominiete,bledy:[]};
    for (const termin of rozdzielenie.pominiete) {
      const istniejacy = getExistingTerms().find(wpis => existingKey(wpis) === existingKey(termin));
      if (istniejacy && (istniejacy.price == null || Number(istniejacy.price) !== Number(termin.price))) {
        wynik.bledy.push({termin,komunikat:"Potencjalny duplikat: istniejący termin ma inną lub nieznaną cenę. Sprawdź go ręcznie."});
      }
    }
    const organizacja = state.organization;
    const tytul = getEventisTitle();
    const czyAktualny = () => state.organization === organizacja && wykryjOrganizatora().organizator === organizacja && getEventisTitle() === tytul && !czyTrwaZapis();
    for (const [indeks,termin] of doDodania.entries()) {
      try {
        sprawdzDaneTerminu(termin);
        if (!czyAktualny()) throw new Error("Kontekst ogłoszenia zmienił się podczas dodawania terminu.");
        const istniejacy = getExistingTerms().find(wpis => existingKey(wpis) === existingKey(termin));
        if (istniejacy) {
          if (istniejacy.price == null || Number(istniejacy.price) !== Number(termin.price)) throw new Error("Potencjalny duplikat: istniejący termin ma inną lub nieznaną cenę. Sprawdź go ręcznie.");
          wynik.pominiete.push(termin);
          continue;
        }
        let formularz = $$('[id^="li_eventdate_"]',$("#eventForm")).find(wiersz => natywneDodawanie.puste.has(wiersz)
          && natywneDodawanie.puste.get(wiersz) === odciskPolTerminu(wiersz));
        if (!formularz) {
          const przycisk = await oczekujNaPrzyciskTerminu(czyAktualny);
          if (getExistingTerms().some(wpis => existingKey(wpis) === existingKey(termin))) throw new Error("Potencjalny duplikat: termin pojawił się podczas oczekiwania. Sprawdź formularz.");
          const poczatkoweId = new Set($$('[id^="li_eventdate_"]',$("#eventForm")).map(wiersz => wiersz.id));
          formularz = await oczekujNaNatywnyFormularz(poczatkoweId,termin,() => przycisk.click(),{czyAktualny,tylkoPodstawowe:true});
          natywneDodawanie.puste.set(formularz,odciskPolTerminu(formularz));
        } else if (brakujacePolaTerminu(formularz,termin,true).length) {
          await oczekujNaNatywnyFormularz(new Set(),termin,() => {},{czyAktualny,wierszDocelowy:formularz,tylkoPodstawowe:true});
        }
        await oczekujNaNatywnyFormularz(new Set(),termin,() => {
          const poleTrybu = pobierzPolaTerminu(formularz).tryb;
          const wartosc = termin.city === "Online" ? "1" : "";
          if (poleTrybu.value !== wartosc) setValue(poleTrybu,wartosc);
        },{czyAktualny,wierszDocelowy:formularz});
        fillTerm(formularz,termin);
        natywneDodawanie.puste.delete(formularz);
        wynik.dodane.push(termin);
      } catch (blad) {
        wynik.bledy.push(...doDodania.slice(indeks).map(pozostaly => ({termin:pozostaly,komunikat:blad.message})));
        break;
      }
    }
    return wynik;
  }

  async function uzupelnijDaneWydarzenia(zrodlo, terminy) {
    const liczbaDni = Math.max(1,...terminy.map(termin=>durationDays(termin.start,termin.end)));
    const poleCzasuTrwania = $('[name="event[hours]"]') || znajdzPolePoEtykiecie("Godziny zajęć (czas trwania)");
    const czasTrwania = liczbaDni === 1 ? "1 dzień" : `${liczbaDni} dni`;
    if (MODE === "add") setValue($('input[name="event[title]"],textarea[name="event[title]"],#title'),zrodlo.title);
    if (poleCzasuTrwania?.name || document.getElementById("eventHours")) await ustawPoleRichText(poleCzasuTrwania?.name,`<p>${czasTrwania}</p>`,{elementId:"eventHours",tylkoPuste:MODE === "edit"});
    else if (MODE === "add" || !poleCzasuTrwania?.value?.trim()) setValue(poleCzasuTrwania,czasTrwania);
    if (MODE === "add") {
      await wybierzWygladPodstawowy();
      await uzupelnijWymaganeFormyZajec();
      await uzupelnijIZweryfikujZyciorys();
    }
    await NARZEDZIA_POL_RICH_TEXT.uzupelnijPolaOpisowe(
      zrodlo.opisy,
      NARZEDZIA_OPISOW_SEMPER.MAPOWANIE_POL_OPISOWYCH,
      ustawPoleRichText
    );
    if (MODE !== "add") return;
    const participantType=$('input[name="event[participantsType]"][value="1"]'); if(participantType){participantType.checked=true;participantType.dispatchEvent(new Event("change",{bubbles:true}));}
    const adult=$('input[name="ageGroup[]"][value="4"]'); if(adult&&!adult.checked){adult.checked=true;adult.dispatchEvent(new Event("change",{bubbles:true}));}
    const category=$("#tematSelect") || $('select[name="event[category_id]"]');
    if(category) category.classList.add("esync-manual-highlight");
  }

  function przygotujTerminDoKolejki(termin) {
    return {
      sourceStart:termin.sourceStart || termin.start,
      sourceEnd:termin.sourceEnd || termin.end,
      start:termin.start,
      end:termin.end,
      city:termin.city,
      price:termin.price,
      confirmationSource:termin.confirmationSource || (termin.confirmedOnSemper ? "source" : termin.confirmedByQueue ? "queue" : termin.confirmedManually ? "manual" : null),
      confirmedOnSemper:!!termin.confirmedOnSemper,
      confirmedByQueue:!!termin.confirmedByQueue,
      confirmedManually:!!termin.confirmedManually
    };
  }

  function kluczClaimuBiezacegoFormularza() {
    return NARZEDZIA_OPERACJI.kluczClaimuOperacji(state.organization,MODE,state.eventisId,PAGE_LOAD_ID);
  }

  function kluczStorageOperacji(operacja) {
    return operacja?.operationScopeKey || mappingKey(operacja?.organization,operacja?.eventisId);
  }

  function identyfikatorOperacji(operacja) { return operacja?.operationId || operacja?.id || ""; }

  function terminyOperacji(operacja) { return operacja?.expectedTerms || operacja?.terms || []; }

  function eventisIdPoczatkowyOperacji(operacja) {
    return operacja?.eventisIdAtStart ?? operacja?.eventisId ?? null;
  }

  function utworzPlanOperacji(terms, queueItemIds = []) {
    const eventisIdAtStart = MODE === "add" ? null : state.eventisId;
    return {
      operationId:NARZEDZIA_OPERACJI.utworzOperationId(),
      operationScopeKey:kluczClaimuBiezacegoFormularza(),
      organization:state.organization,
      eventisIdAtStart,
      eventisIdResolved:MODE === "edit" ? state.eventisId : null,
      eventisTitleAtStart:getEventisTitle() || state.eventisTitle,
      sourceId:state.source?.id || state.mapping?.sourceTrainingId || null,
      sourceUrl:state.source?.url || state.mapping?.sourceUrl || "",
      pochodzenie:queueItemIds.length ? "queue" : "source",
      expectedTerms:terms.map(przygotujTerminDoKolejki),
      queueItemIds:[...queueItemIds],
      tabId:state.tabId,
      skipSheetOutbox:queueItemIds.length>0,
      operator:state.settings.operatorInitial || "K",
      createdAt:new Date().toISOString(),
      createdPageLoadId:PAGE_LOAD_ID,
      status:"CLAIMED"
    };
  }

  async function uzyskajClaimOperacji(operacja) {
    if (czyMoznaKontynuowacOperacje(state.pendingOperation,operacja.queueItemIds.length > 0)) {
      const { pendingOperations = {} } = await storageGet(["pendingOperations"]);
      const aktualna = pendingOperations[kluczStorageOperacji(state.pendingOperation)];
      if (identyfikatorOperacji(aktualna) === identyfikatorOperacji(state.pendingOperation)
        && czyMoznaKontynuowacOperacje(aktualna,operacja.queueItemIds.length > 0)) {
        state.pendingOperation=aktualna;
        return {ok:true,operacja:aktualna};
      }
    }
    const wynik = await chrome.runtime.sendMessage({type:"CLAIM_PENDING_OPERATION",operation:operacja});
    if (!wynik.ok) {
      state.pendingOperation=wynik.operacja?.tabId === state.tabId ? wynik.operacja : null;
      return wynik;
    }
    state.pendingOperation=wynik.operacja;
    return wynik;
  }

  async function zwolnijNiepotwierdzonyClaim(operacja) {
    const { pendingOperations = {} } = await storageGet(["pendingOperations"]);
    const key = kluczStorageOperacji(operacja);
    if (pendingOperations[key]?.operationId !== operacja.operationId || pendingOperations[key]?.status !== "CLAIMED") return;
    delete pendingOperations[key];
    await storageSet({pendingOperations});
    state.pendingOperation=null;
  }

  async function potwierdzOperacjeOczekujaca(operacja, terms, queueItemIds = []) {
    const { pendingOperations = {}, eventisImportQueue = [] } = await storageGet(["pendingOperations","eventisImportQueue"]);
    const key = kluczStorageOperacji(operacja);
    if (pendingOperations[key]?.operationId !== operacja.operationId) {
      throw new Error("Operacja importu utraciła ownership przed potwierdzeniem formularza.");
    }
    const potwierdzona = {
      ...pendingOperations[key],
      expectedTerms:unikalneTerminy([...(operacja.status === "WAITING_FOR_SAVE" ? terminyOperacji(operacja) : []),...terms]).map(przygotujTerminDoKolejki),
      queueItemIds:[...new Set([...(operacja.status === "WAITING_FOR_SAVE" ? operacja.queueItemIds || [] : []),...queueItemIds])],
      skipSheetOutbox:queueItemIds.length>0,
      status:"WAITING_FOR_SAVE",
      filledAt:new Date().toISOString()
    };
    pendingOperations[key]=potwierdzona;
    const aktualnaKolejka = Array.isArray(eventisImportQueue) ? eventisImportQueue : [];
    const zaktualizowanaKolejka = NARZEDZIA_KOLEJKI.oznaczElementyOczekujaceOperacji(aktualnaKolejka,potwierdzona);
    await storageSet({pendingOperations});
    await zapiszElementyKolejki(zaktualizowanaKolejka.filter((element,indeks) => element !== aktualnaKolejka[indeks]));
    state.pendingOperation=potwierdzona;
    state.zapis={saveState:"IDLE"};
    return potwierdzona;
  }

  function czyTrwaZapis() {
    return state.trwaRozpoczynanieZapisu || trwaRozstrzyganieZapisu
      || ["PREPARING_SAVE","SUBMITTING","WAITING_FOR_EVENTIS"].includes(state.zapis?.saveState);
  }

  function czyMoznaKontynuowacOperacje(operacja,zKolejki) {
    return !!operacja && !czyTrwaZapis() && operacja.status === "WAITING_FOR_SAVE"
      && operacja.createdPageLoadId === PAGE_LOAD_ID && operacja.organization === state.organization
      && operacja.sourceUrl === (state.source?.url || state.mapping?.sourceUrl || "") && !!operacja.skipSheetOutbox === zKolejki;
  }

  async function zwolnijOczekujacaOperacje() {
    if (state.trwaWypelnianieOperacji) {
      toast("Trwa wypełnianie formularza. Poczekaj na zakończenie.");
      return false;
    }
    if (czyTrwaZapis()) {
      toast("Trwa zapis Eventis. Poczekaj na jego wynik.");
      return false;
    }
    const { pendingOperations = {}, eventisImportQueue = [] } = await storageGet(["pendingOperations","eventisImportQueue"]);
    const operacja = NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,state.organization,state.eventisId,state.eventisTitle,state.tabId);
    if (operacja?.status === "CLAIMED") {
      toast("Trwa wypełnianie formularza. Poczekaj na zakończenie.");
      return false;
    }
    if (operacja) {
      const kolejka = NARZEDZIA_KOLEJKI.rozliczElementyOperacji(eventisImportQueue,operacja,
        NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.WYMAGA_UWAGI,"Przerwano oczekiwanie na zapis. Sprawdź terminy w Eventis przed ponowieniem.");
      delete pendingOperations[kluczStorageOperacji(operacja)];
      await storageSet({pendingOperations});
      await zapiszElementyKolejki(kolejka.filter((element,indeks) => element !== eventisImportQueue[indeks]));
    }
    zakonczObserwacjeZapisu();
    sessionStorage.removeItem(KLUCZ_OCZEKUJACEGO_ZAPISU);
    sessionStorage.removeItem(KLUCZ_ZAMKNIECIA_PO_ZAPISIE);
    state.pendingOperation=null;
    state.pendingLooksSaved=false;
    state.zapis={saveState:"IDLE"};
    return true;
  }

  async function sprawdzBrakOczekujacejOperacji(zKolejki = false) {
    if (state.trwaWypelnianieOperacji) return false;
    if (czyTrwaZapis()) {
      toast("Trwa zapis Eventis. Poczekaj na jego wynik.");
      return false;
    }
    const { pendingOperations = {} } = await storageGet(["pendingOperations"]);
    const operacja = NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,state.organization,state.eventisId,state.eventisTitle,state.tabId);
    state.pendingOperation=operacja;
    if (!operacja || czyMoznaKontynuowacOperacje(operacja,zKolejki)) return true;
    render();
    toast(czyTrwaZapis() ? "Trwa zapis Eventis. Poczekaj na jego wynik." : "Poprzednia operacja wymaga sprawdzenia. Użyj „Zwolnij blokadę” przy ogłoszeniu lub w Ustawienia → Pamięć rozszerzenia.");
    return false;
  }

  let obserwatorZapisu = null;
  let licznikZapisu = null;
  let komunikatPrzedZapisem = null;
  let tekstPrzedZapisem = null;
  let trwaRozstrzyganieZapisu = false;

  function znajdzKomunikatZapisu() {
    const komunikaty = $$('div, p, li, span, strong, [role="alert"]')
      .filter(element=>!element.closest("#esync-root") && element.getClientRects().length);
    const sukces = komunikaty.find(element=>/^dane wydarzenia zaktualizowane\.?$/i.test((element.textContent || "").trim())
      && !Array.from(element.children).some(dziecko=>/^dane wydarzenia zaktualizowane\.?$/i.test((dziecko.textContent || "").trim())));
    if (sukces) return {rodzaj:"SUCCESS",tekst:sukces.textContent.trim(),element:sukces,selektor:sukces.id ? `#${sukces.id}` : sukces.className || sukces.tagName};
    const bledy = $$('.alert-danger,.alert-error,[role="alert"],.invalid-feedback,.validation-error,.error-message')
      .filter(element=>!element.closest("#esync-root") && element.getClientRects().length);
    const blad = bledy.find(element=>/błąd|blad|wymagane|wymagany|nie udało się|nie mozna|nie można|nieprawidłow|uzupełnij|uzupelnij/i.test(element.textContent || ""));
    return blad ? {rodzaj:"EXPLICIT_ERROR",tekst:blad.textContent.trim().slice(0,400),element:blad,
      selektor:blad.id ? `#${blad.id}` : blad.className || blad.tagName} : null;
  }

  function zakonczObserwacjeZapisu() {
    obserwatorZapisu?.disconnect();
    obserwatorZapisu = null;
    clearTimeout(licznikZapisu);
    licznikZapisu = null;
  }

  function diagnostykaZapisu(dodatkowe = {}) {
    if (!state.settings.debug && sessionStorage.getItem("eventisSyncDebug") !== "1") return;
    const {saveState,submitStartedAt,successDetectedAt,errorDetectedAt,timeoutAt} = state.zapis || {};
    console.debug("Eventis Sync zapis",{saveState,submitStartedAt,successDetectedAt,errorDetectedAt,timeoutAt,...dodatkowe});
  }

  async function sprawdzWynikZapisu() {
    if (state.zapis?.saveState !== "WAITING_FOR_EVENTIS" || trwaRozstrzyganieZapisu) return;
    const komunikat = znajdzKomunikatZapisu();
    const aktualnyKomunikat = komunikat?.element === komunikatPrzedZapisem && komunikat.tekst === tekstPrzedZapisem ? null : komunikat;
    const nowyStan = NARZEDZIA_OPERACJI.rozstrzygnijStanZapisu(state.zapis,aktualnyKomunikat);
    if (nowyStan === state.zapis) return;
    trwaRozstrzyganieZapisu = true;
    state.zapis = nowyStan;
    zakonczObserwacjeZapisu();
    try {
      diagnostykaZapisu({successSelectorMatched:aktualnyKomunikat?.rodzaj === "SUCCESS" ? aktualnyKomunikat.selektor : null,
        errorSelectorMatched:aktualnyKomunikat?.rodzaj === "EXPLICIT_ERROR" ? aktualnyKomunikat.selektor : null});
      if (nowyStan.saveState === "SUCCESS") {
        await confirmPendingSaved("AUTO_SUCCESS_MARKER");
        sessionStorage.removeItem(KLUCZ_OCZEKUJACEGO_ZAPISU);
        compareTerms();
        render();
        const zamiarZamkniecia = sessionStorage.getItem(KLUCZ_ZAMKNIECIA_PO_ZAPISIE);
        if (zamiarZamkniecia) {
          sessionStorage.removeItem(KLUCZ_ZAMKNIECIA_PO_ZAPISIE);
          await chrome.runtime.sendMessage({type:"CLOSE_TAB"});
        }
      } else render();
    } finally { trwaRozstrzyganieZapisu = false; }
  }

  function rozpocznijObserwacjeZapisu(pominIstniejacy = true) {
    zakonczObserwacjeZapisu();
    const poprzedniKomunikat = pominIstniejacy && state.zapis.pendingSave.pageLoadId === PAGE_LOAD_ID ? znajdzKomunikatZapisu() : null;
    komunikatPrzedZapisem = poprzedniKomunikat?.element || null;
    tekstPrzedZapisem = poprzedniKomunikat?.tekst || null;
    obserwatorZapisu = new MutationObserver(()=>{sprawdzWynikZapisu().catch(console.error);});
    obserwatorZapisu.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["class","style","hidden"]});
    const pozostalo = Math.max(0,NARZEDZIA_OPERACJI.CZAS_OCZEKIWANIA_ZAPISU - (Date.now() - state.zapis.submitStartedAt));
    licznikZapisu = setTimeout(()=>{sprawdzWynikZapisu().catch(console.error);},pozostalo);
    sprawdzWynikZapisu().catch(console.error);
  }

  function przywrocOczekujacyZapis() {
    let oczekujacyZapis;
    try { oczekujacyZapis = JSON.parse(sessionStorage.getItem(KLUCZ_OCZEKUJACEGO_ZAPISU) || "null"); } catch (_) { oczekujacyZapis = null; }
    if (!oczekujacyZapis) return;
    if (!NARZEDZIA_OPERACJI.czyPrzywrocicZapis(oczekujacyZapis,state.eventisId,location.pathname + location.search,state.pendingOperation)) {
      sessionStorage.removeItem(KLUCZ_OCZEKUJACEGO_ZAPISU);
      return;
    }
    state.zapis = NARZEDZIA_OPERACJI.utworzStanZapisu(oczekujacyZapis);
    diagnostykaZapisu({pageReloadDetected:oczekujacyZapis.pageLoadId !== PAGE_LOAD_ID,pendingSaveRestored:true});
    rozpocznijObserwacjeZapisu();
  }

  function sprawdzPonownieZapis() {
    const oczekujacyZapis = state.zapis?.pendingSave || {eventId:state.eventisId,expectedOperation:state.pendingOperation?.operationId || "FORM_SAVE",
      pageLoadId:PAGE_LOAD_ID,url:location.pathname + location.search};
    oczekujacyZapis.timestamp = Date.now();
    sessionStorage.setItem(KLUCZ_OCZEKUJACEGO_ZAPISU,JSON.stringify(oczekujacyZapis));
    state.zapis = NARZEDZIA_OPERACJI.utworzStanZapisu(oczekujacyZapis);
    render();
    rozpocznijObserwacjeZapisu(false);
  }

  async function inspectPendingAfterReload() {
    if (!state.pendingOperation || state.pendingOperation.createdPageLoadId === PAGE_LOAD_ID) return;
    if (state.zapis?.saveState === "WAITING_FOR_EVENTIS") return;
    const existingKeys = new Set(getExistingTerms().map(existingKey));
    const allExist = terminyOperacji(state.pendingOperation).every(t=>existingKeys.has(existingKey(t)));
    if (!allExist) return;
    state.pendingLooksSaved = true;
  }

  async function confirmPendingSaved(method="USER_CONFIRM") {
    if (method === "AUTO_SUCCESS_MARKER" && state.zapis?.saveState !== "SUCCESS") return;
    if (!state.pendingOperation) {
      state.zapisaneTerminyEventis = getExistingTerms();
      state.status="SAVED";
      render();
      return;
    }
    const op = state.pendingOperation;
    const { pendingOperations = {}, sheetOutbox = [], eventisImportQueue = [] } = await storageGet(["pendingOperations","sheetOutbox","eventisImportQueue"]);
    const key = kluczStorageOperacji(op);
    if (identyfikatorOperacji(pendingOperations[key]) !== identyfikatorOperacji(op)) {
      state.pendingOperation=NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,state.organization,state.eventisId,state.eventisTitle,state.tabId);
      state.pendingLooksSaved=false;
      render();
      return toast("Operacja oczekująca zmieniła się w innej karcie. Odświeżono stan panelu.");
    }
    const eventisIdPoczatkowy = eventisIdPoczatkowyOperacji(op);
    const docelowyEventisId = (!eventisIdPoczatkowy || String(eventisIdPoczatkowy).startsWith("new:")) && !String(state.eventisId || "").startsWith("new:")
      ? state.eventisId
      : op.eventisIdResolved || eventisIdPoczatkowy || state.eventisId;
    op.eventisIdResolved = docelowyEventisId;
    const docelowyTytulEventis = getEventisTitle() || op.eventisTitleAtStart || op.eventisTitle;
    if (!op.skipSheetOutbox) {
      for (const term of terminyOperacji(op)) {
        const idem = `${op.organization}|${docelowyEventisId}|${term.start}|${normalize(term.city)}|${op.operator}`;
        if (!sheetOutbox.some(x=>x.idempotencyKey===idem && x.status!=="CANCELLED")) {
          sheetOutbox.push({id:crypto.randomUUID(),idempotencyKey:idem,status:"PENDING_SHEET_MAPPING",createdAt:new Date().toISOString(),operator:op.operator,organization:op.organization,eventisId:docelowyEventisId,eventisTitle:docelowyTytulEventis,term:przygotujTerminDoKolejki(term),sourceUrl:op.sourceUrl});
        }
      }
    }
    const widoczneTerminy = getExistingTerms();
    const oczekiwaneTerminy = terminyOperacji(op);
    const potwierdzoneId = (op.queueItemIds || []).filter(id => {
      const element = eventisImportQueue.find(wpis => wpis.id === id && wpis.organization === op.organization);
      return element && oczekiwaneTerminy.some(termin => NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,[termin]).length
        && widoczneTerminy.some(widoczny => existingKey(widoczny) === existingKey(termin)));
    });
    const zaktualizowanaKolejka = NARZEDZIA_KOLEJKI.rozliczElementyOperacji(
      NARZEDZIA_KOLEJKI.rozliczElementyOperacji(eventisImportQueue,{...op,queueItemIds:potwierdzoneId},NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE),
      {...op,queueItemIds:(op.queueItemIds || []).filter(id => !potwierdzoneId.includes(id))},
      NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.WYMAGA_UWAGI,"Po zapisie nie potwierdzono obecności tego terminu.");
    state.zapisaneTerminyEventis = widoczneTerminy;
    delete pendingOperations[key];
    await storageSet({pendingOperations,sheetOutbox});
    await zapiszElementyKolejki(zaktualizowanaKolejka.filter((element,indeks) => element !== eventisImportQueue[indeks]));
    await audit("EVENTIS_SAVE_CONFIRMED",{method,terms:terminyOperacji(op)});
    await odswiezKolejke();
    state.pendingOperation=null; state.pendingLooksSaved=false; state.status="SAVED";
    toast(op.queueItemIds?.length ? `Zapis Eventis potwierdzony. Zakończone: ${potwierdzoneId.length}; wymagają uwagi: ${op.queueItemIds.length - potwierdzoneId.length}.` : "Zapis Eventis potwierdzony. Oznaczenia dodano do lokalnej kolejki arkusza.");
    render();
  }

  async function oznaczNieudanyZapis() {
    if (!state.pendingOperation) return;
    const op = state.pendingOperation;
    const { pendingOperations = {}, eventisImportQueue = [] } = await storageGet(["pendingOperations","eventisImportQueue"]);
    const key = kluczStorageOperacji(op);
    if (identyfikatorOperacji(pendingOperations[key]) !== identyfikatorOperacji(op)) return toast("Operacja oczekująca zmieniła się w innej karcie. Odśwież stronę.");
    const komunikat = "Zapis formularza Eventis nie został potwierdzony. Sprawdź dane i ponów operację.";
    const zaktualizowanaKolejka = NARZEDZIA_KOLEJKI.rozliczElementyOperacji(eventisImportQueue,op,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.BLAD,komunikat);
    delete pendingOperations[key];
    await storageSet({pendingOperations});
    await zapiszElementyKolejki(zaktualizowanaKolejka.filter((element,indeks) => element !== eventisImportQueue[indeks]));
    state.pendingOperation=null;
    state.pendingLooksSaved=false;
    state.status="SAVE_ERROR";
    state.zapis = {saveState:"EXPLICIT_ERROR",przyczyna:komunikat};
    state.lastError=komunikat;
    await audit("EVENTIS_SAVE_FAILED",{terms:terminyOperacji(op),queueItemIds:op.queueItemIds || []});
    render();
    toast("Nieudany zapis rozliczono. Powiązane pozycje kolejki można ponowić.");
  }

  async function queueExistingTerms() {
    if (!state.mappingVerifiedThisSession || czyTrwaZapis() || state.trwaWypelnianieOperacji) return toast("Najpierw zweryfikuj powiązanie i zakończ bieżącą operację.");
    const matched = potwierdzoneZapisaneTerminy();
    if (!matched.length) return toast("Brak potwierdzonych terminów, które już istnieją w Eventis.");
    const { sheetOutbox = [] } = await storageGet(["sheetOutbox"]);
    let added=0;
    for (const term of matched) {
      const idem=`${state.organization}|${state.eventisId}|${term.start}|${normalize(term.city)}|${state.settings.operatorInitial}`;
      if (!sheetOutbox.some(x=>x.idempotencyKey===idem&&x.status!=="CANCELLED")) {
        sheetOutbox.push({id:crypto.randomUUID(),idempotencyKey:idem,status:"PENDING_SHEET_MAPPING",createdAt:new Date().toISOString(),operator:state.settings.operatorInitial,organization:state.organization,eventisId:state.eventisId,eventisTitle:state.eventisTitle,term:przygotujTerminDoKolejki(term),sourceUrl:state.source?.url||state.mapping?.sourceUrl||"",reason:"ALREADY_EXISTS"});
        added++;
      }
    }
    await storageSet({sheetOutbox});
    await audit("EXISTING_TERMS_CONFIRMED",{count:added});
    toast(`Dodano do kolejki arkusza: ${added}.`);
  }

  function parseManualPaste(text) {
    return NARZEDZIA_ARKUSZA.parseManualPaste(text);
  }

  function matchManualRecordsToCurrent(records) {
    return NARZEDZIA_ARKUSZA.matchManualRecordsToCurrent(records,state.eventisTitle);
  }

  function utworzPodgladImportu(rekordy, rawText = "", bledyWalidacji = []) {
    const przygotowane = NARZEDZIA_KOLEJKI.przygotujElementyKolejki(rekordy,state.eventisImportQueue,{organization:state.organization});
    const kluczeDoDodania = new Set(przygotowane.items.map(element => element.recordKey));
    const potwierdzone = rekordy.filter(rekord => rekord.status === "CONFIRMED" && !rekord.error);
    return {
      rawText,
      records: rekordy,
      confirmed: potwierdzone.length,
      deconfirmed: rekordy.filter(rekord => rekord.status === "DECONFIRMED").length,
      errors: rekordy.filter(rekord => rekord.error).length + bledyWalidacji.length,
      bledyWalidacji,
      duplicates: przygotowane.duplicates,
      candidateRecords: potwierdzone.filter(rekord => kluczeDoDodania.has(NARZEDZIA_ARKUSZA.recordKey(rekord))),
      queueItems: przygotowane.items
    };
  }

  async function dodajPodgladDoKolejki() {
    if (!state.manualPreview) return;
    const dane = await storageGet(["eventisImportQueue"]);
    const obecnaKolejka = Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : state.eventisImportQueue;
    const przygotowane = NARZEDZIA_KOLEJKI.przygotujElementyKolejki(state.manualPreview.records,obecnaKolejka,{organization:state.organization});
    if (!przygotowane.items.length) return toast("Brak nowych potwierdzonych pozycji do dodania do kolejki.");
    state.eventisImportQueue = [...obecnaKolejka,...przygotowane.items];
    await zapiszElementyKolejki(przygotowane.items);
    state.manualPreview = utworzPodgladImportu(state.manualPreview.records,state.manualPreview.rawText,state.manualPreview.bledyWalidacji);
    await audit("MANUAL_EVENTIS_QUEUE_ADDED",{records:przygotowane.items.length,duplicates:przygotowane.duplicates});
    render();
    toast(`Dodano do kolejki Eventis: ${przygotowane.items.length}.`);
  }

  async function saveManualSnapshot(records, rawText, bledyWalidacji = []) {
    const snapshot = { importedAt:new Date().toISOString(),hash:String(rawText.length)+":"+normalize(rawText).slice(0,64),records,rawText };
    await storageSet({manualSheetSnapshot:snapshot});
    state.manualRecords=records;
    state.manualMatches=matchManualRecordsToCurrent(records);
    state.manualPreview=utworzPodgladImportu(records,rawText,bledyWalidacji);
    await audit("MANUAL_SHEET_SNAPSHOT_IMPORTED",{records:records.length});
  }

  async function zaktualizujBiezacaKolejke(modyfikator) {
    const { eventisImportQueue = [] } = await storageGet(["eventisImportQueue"]);
    const aktualnaKolejka = Array.isArray(eventisImportQueue) ? eventisImportQueue : [];
    const zaktualizowanaKolejka=modyfikator(aktualnaKolejka);
    state.eventisImportQueue=zaktualizowanaKolejka;
    if (state.weryfikacjaOtwartejKarty?.status === "VERIFIED") {
      state.przypisaneElementyKolejki=NARZEDZIA_KOLEJKI.przypiszElementyDoZadania(state.eventisImportQueue,{...state.weryfikacjaOtwartejKarty.task,status:"VERIFIED"},state.organization);
    }
    await zapiszElementyKolejki(zaktualizowanaKolejka.filter((element,indeks) => element !== aktualnaKolejka[indeks]));
    return state.eventisImportQueue;
  }

  async function odswiezKolejke() {
    const { eventisImportQueue = [] } = await storageGet(["eventisImportQueue"]);
    state.eventisImportQueue=Array.isArray(eventisImportQueue) ? eventisImportQueue : [];
    if (state.weryfikacjaOtwartejKarty?.status === "VERIFIED") {
      state.przypisaneElementyKolejki=NARZEDZIA_KOLEJKI.przypiszElementyDoZadania(state.eventisImportQueue,{...state.weryfikacjaOtwartejKarty.task,status:"VERIFIED"},state.organization);
    }
  }

  async function reconcileBiezacejKolejki() {
    if (MODE !== "edit" || !state.sourceTerms.length || state.formularzZmieniony || state.pendingOperation || state.trwaWprowadzanieKolejki) return;
    const istniejące = new Set((state.zapisaneTerminyEventis || []).map(existingKey));
    const potwierdzoneId = new Set(state.eventisImportQueue.filter(element =>
      element.organization === state.organization
      && element.normalizedTitle === normalize(state.eventisTitle)
      && element.recordStatus === "CONFIRMED"
      && !state.pendingOperation?.queueItemIds?.includes(element.id)
      && NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,state.sourceTerms.filter(czyTerminPotwierdzony))
        .some(termin => istniejące.has(existingKey(termin)))
    ).map(element => element.id));
    if (!potwierdzoneId.size) return;
    await zaktualizujBiezacaKolejke(kolejka => NARZEDZIA_KOLEJKI.reconcileQueueState(kolejka,{},potwierdzoneId));
    render();
  }

  function dopasowaniaKolejkiDoBiezacegoTytulu(wszystkieStatusy = false) {
    if (state.weryfikacjaOtwartejKarty && normalize(state.weryfikacjaOtwartejKarty.eventTitle || state.weryfikacjaOtwartejKarty.task?.sourceTitle) !== normalize(state.eventisTitle)) return [];
    const elementy = state.weryfikacjaOtwartejKarty
      ? NARZEDZIA_KOLEJKI.przypiszElementyDoZadania(state.eventisImportQueue,
        {...state.weryfikacjaOtwartejKarty.task,status:state.weryfikacjaOtwartejKarty.status},state.organization,true)
      : NARZEDZIA_KOLEJKI.filtrujKolejkeOrganizacji(state.eventisImportQueue,state.organization)
        .filter(element => String(element.normalizedTitle || "") === normalize(state.eventisTitle)
          || ((state.przypisaneRecznieBiezacejKarty || []).includes(element.id)
            && NARZEDZIA_WYSZUKIWANIA.ocenTytulEventis(element.title,state.eventisTitle) >= NARZEDZIA_LISTY.PROG_DOPASOWANIA));
    return elementy
      .filter(element => wszystkieStatusy || ["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status))
      .map(element => {
        let terminy = NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,state.sourceTerms);
        const zweryfikowany = NARZEDZIA_KOLEJKI.przygotujZweryfikowanyTermin(element);
        if (zweryfikowany && (!terminy.length || !state.mappingVerifiedThisSession)) terminy = [zweryfikowany];
        else if (zweryfikowany && terminy.length === 1 && (terminy[0].price == null || String(terminy[0].price).trim() === ""
          || !Number.isFinite(Number(terminy[0].price)) || Number(terminy[0].price) < 0)) {
          terminy = [state.mappingVerifiedThisSession ? {...terminy[0],price:zweryfikowany.price} : zweryfikowany];
        }
        const konflikt = elementy.some(inny => inny.recordStatus === "DECONFIRMED"
          && NARZEDZIA_TERMINOW.kluczZgodnegoTerminu(inny) === NARZEDZIA_TERMINOW.kluczZgodnegoTerminu(element));
        return {element,similarity:titleSimilarity(state.eventisTitle,element.title),terminy:konflikt ? [] : terminy};
      });
  }

  function gotoweDopasowaniaKolejki() {
    return NARZEDZIA_KOLEJKI.rozdzielDopasowaniaKolejki(dopasowaniaKolejkiDoBiezacegoTytulu()
      .filter(dopasowanie => dopasowanie.element.status === "PENDING" && !powodBlokadyKolejki(dopasowanie))).jednoznaczne;
  }

  function powodBlokadyKolejki(dopasowanie) {
    if (dopasowanie.element.recordStatus !== "CONFIRMED") return "Rekord kolejki nie jest potwierdzony.";
    if (dopasowanie.terminy.length !== 1) return "Sprawdź dane terminu, lokalizację lub konflikt z innym rekordem.";
    const termin = dopasowanie.terminy[0];
    if (termin.price == null || String(termin.price).trim() === "" || !Number.isFinite(Number(termin.price)) || Number(termin.price) < 0) return "Brak poprawnej ceny netto. Sprawdź i uzupełnij dane terminu.";
    if (!state.mappingVerifiedThisSession && !termin.brakNaZrodle) return "Niepotwierdzone powiązanie ogłoszenia. Zweryfikuj źródło lub zaakceptuj dane kolejki.";
    try { sprawdzDaneTerminu(termin); } catch (blad) { return blad.message; }
    return "";
  }

  function czyTerminKolejkiNiepotwierdzonyNaZrodle(dopasowanie) {
    return dopasowanie.element.recordStatus === "CONFIRMED"
      && dopasowanie.terminy.some(termin => termin.confirmedByQueue && !termin.confirmedOnSemper);
  }

  async function ponowKolejke(id) {
    if (state.trwaWprowadzanieKolejki || state.trwaDodawanieZrodla || state.trwaWypelnianieOperacji || czyTrwaZapis()) return;
    await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element => element.id===id
      ? {...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.OCZEKUJE),operationId:null}
      : element));
    render();
  }

  function obsluzKlikniecieKolejki() {
    wprowadzTerminyZKolejki().catch(blad => toast(blad.message));
  }

  function czyNiezapisanyTerminKompletny(termin) {
    const wiersz = getExistingTerms().find(wpis => existingKey(wpis) === existingKey(termin))?.row;
    if (!wiersz || brakujacePolaTerminu(wiersz,termin).length) return false;
    const pola = pobierzPolaTerminu(wiersz);
    return !!pola.poczatek.value && !!pola.koniec.value && pola.potwierdzenie.value === "1"
      && String(pola.cena.value).trim() !== "" && Number.isFinite(Number(pola.cena.value)) && Number(pola.cena.value) >= 0
      && String(pola.vat.value).trim() !== "" && !!pola.pakiet.value.trim();
  }

  async function wprowadzTerminyZKolejki(identyfikatoryDozwolone = null) {
    if (identyfikatoryDozwolone !== null && !Array.isArray(identyfikatoryDozwolone)) return toast("Nieprawidłowa lista identyfikatorów kolejki.");
    if (state.trwaWprowadzanieKolejki || state.trwaDodawanieZrodla || state.trwaRozpoznawanieNatywne) return;
    const organizator = wykryjOrganizatora();
    if (!state.organization || organizator.organizator !== state.organization) return toast("Organizator formularza nie odpowiada organizatorowi kolejki. Sprawdź pole Firma.");
    const organizacja = state.organization;
    const tytul = normalize(getEventisTitle());
    const adresZrodla = state.source?.url || "";
    const aktualnyKontekst = () => organizacja === state.organization && tytul === normalize(getEventisTitle())
      && tytul === normalize(state.eventisTitle) && adresZrodla === (state.source?.url || "");
    if (!aktualnyKontekst()) return toast("Tytuł lub źródło szkolenia zmieniły się. Odśwież analizę kolejki.");
    state.trwaWprowadzanieKolejki = true;
    render();
    try {
    if (!await sprawdzBrakOczekujacejOperacji(true)) return;
    await odswiezKolejke();
    if (!aktualnyKontekst()) return toast("Tytuł lub źródło szkolenia zmieniły się. Odśwież analizę kolejki.");
    const dozwolone = identyfikatoryDozwolone ? new Set(identyfikatoryDozwolone) : null;
    const dopasowania=dopasowaniaKolejkiDoBiezacegoTytulu().filter(dopasowanie =>
      dopasowanie.element.status === "PENDING" &&
      dopasowanie.element.recordStatus === "CONFIRMED"
      && (!dozwolone || dozwolone.has(dopasowanie.element.id))
      && (state.mappingVerifiedThisSession || dopasowanie.terminy[0]?.brakNaZrodle)
    );
    const {jednoznaczne,nierozwiazane,duplikatyTerminow}=NARZEDZIA_KOLEJKI.rozdzielDopasowaniaKolejki(dopasowania.map(dopasowanie => ({...dopasowanie,
      terminy:powodBlokadyKolejki(dopasowanie) ? [] : dopasowanie.terminy})));
    if (nierozwiazane.length || duplikatyTerminow.length) {
      await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element => {
        const dopasowanie=nierozwiazane.find(kandydat=>kandydat.element.id===element.id);
        const duplikat=duplikatyTerminow.some(kandydat=>kandydat.element.id===element.id);
        return dopasowanie
          ? NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.BLAD,dopasowanie.terminy.length ? "Znaleziono kilka odpowiadających terminów w danych SEMPER/IIST." : "Nie znaleziono odpowiadającego terminu w danych SEMPER/IIST. Sprawdź datę, lokalizację albo źródło szkolenia.")
          : duplikat
            ? NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.BLAD,"Ten sam termin źródłowy jest już powiązany z innym elementem kolejki.")
            : element;
      }));
    }
    if (!jednoznaczne.length) {
      render();
      return toast("Brak jednoznacznych pozycji kolejki dla tego szkolenia.");
    }
    const istniejąceKlucze=new Set(getExistingTerms().map(existingKey));
    const elementyJuzIstniejace=jednoznaczne.filter(dopasowanie=>istniejąceKlucze.has(existingKey(dopasowanie.terminy[0])));
    const doWprowadzenia=jednoznaczne.filter(dopasowanie=>!istniejąceKlucze.has(existingKey(dopasowanie.terminy[0])));
    const zaktualizowanePoIstniejacych=new Set(elementyJuzIstniejace.filter(dopasowanie => state.zapisaneTerminyEventis.some(termin => existingKey(termin) === existingKey(dopasowanie.terminy[0]))).map(dopasowanie=>dopasowanie.element.id));
    const niezapisane=elementyJuzIstniejace.filter(dopasowanie => !zaktualizowanePoIstniejacych.has(dopasowanie.element.id));
    const juzWFormularzu=niezapisane.filter(dopasowanie => czyNiezapisanyTerminKompletny(dopasowanie.terminy[0]));
    const niekompletneId=new Set(niezapisane.filter(dopasowanie => !juzWFormularzu.includes(dopasowanie)).map(dopasowanie => dopasowanie.element.id));
    if (niekompletneId.size) await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element => niekompletneId.has(element.id)
      ? NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.WYMAGA_UWAGI,"Termin jest w niezapisanym formularzu, ale jego dane są niekompletne. Sprawdź natywne pola Eventis i ponów.") : element));
    const doPrzetworzenia=[...doWprowadzenia,...juzWFormularzu];
    if (!doPrzetworzenia.length) {
      await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element=>
        element.organization===state.organization && zaktualizowanePoIstniejacych.has(element.id)
          ? {...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE_ISTNIEJACE),completionReason:"ALREADY_EXISTS"}
          : element));
      render();
      return toast(niekompletneId.size ? "Sprawdź niekompletne terminy w niezapisanym formularzu Eventis." : "Wszystkie dopasowane terminy już istnieją w Eventis.");
    }
    let planOperacji=null;
    try {
      const termy=doWprowadzenia.map(dopasowanie=>dopasowanie.terminy[0]);
      planOperacji=utworzPlanOperacji(unikalneTerminy(doPrzetworzenia.map(dopasowanie=>dopasowanie.terminy[0])),doPrzetworzenia.map(dopasowanie=>dopasowanie.element.id));
      const wykonanie=await NARZEDZIA_OPERACJI.wykonajPoUzyskaniuClaimu(
        () => uzyskajClaimOperacji(planOperacji),
        async operacja => {
          if (!aktualnyKontekst()) throw new Error("Przypisanie szkolenia zmieniło się podczas przygotowania formularza.");
          state.trwaWypelnianieOperacji=true;
          try {
          const wynikWprowadzenia=await addSelectedTerms(unikalneTerminy(termy));
          if (wynikWprowadzenia.bledy.length) {
            const bledyWedlugTerminu=new Map(wynikWprowadzenia.bledy.map(blad => [existingKey(blad.termin),blad.komunikat]));
            const bledyWedlugElementu=new Map(doWprowadzenia
              .filter(dopasowanie=>bledyWedlugTerminu.has(existingKey(dopasowanie.terminy[0])))
              .map(dopasowanie=>[dopasowanie.element.id,bledyWedlugTerminu.get(existingKey(dopasowanie.terminy[0]))]));
            await zaktualizujBiezacaKolejke(kolejka=>kolejka.map(element=>bledyWedlugElementu.has(element.id)
              ? NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.BLAD,bledyWedlugElementu.get(element.id))
              : element));
          }
          const powiazanie=NARZEDZIA_KOLEJKI.powiazDodaneTerminy(doPrzetworzenia,[...wynikWprowadzenia.dodane,...juzWFormularzu.map(dopasowanie=>dopasowanie.terminy[0])]);
          if (!powiazanie.terms.length) return {wynikWprowadzenia,powiazanie,operacja};
          try {
            if (state.source) await uzupelnijDaneWydarzenia(state.source,powiazanie.terms);
          } catch (blad) {
            await potwierdzOperacjeOczekujaca(operacja,powiazanie.terms,powiazanie.queueItemIds);
            state.formularzZmieniony=true;
            throw blad;
          }
          const potwierdzonaOperacja=await potwierdzOperacjeOczekujaca(operacja,powiazanie.terms,powiazanie.queueItemIds);
          return {wynikWprowadzenia,powiazanie,operacja:potwierdzonaOperacja};
          } finally { state.trwaWypelnianieOperacji=false; }
        }
      );
      if (!wykonanie.ok) throw new Error("Dla tego ogłoszenia trwa już inna operacja importu. Zakończ ją lub wróć do karty, w której została rozpoczęta.");
      const {wynikWprowadzenia,powiazanie,operacja}=wykonanie.wynik;
      if (!powiazanie.terms.length) {
        await zwolnijNiepotwierdzonyClaim(operacja);
        render();
        return toast(wynikWprowadzenia.bledy[0]?.komunikat || "Żaden termin kolejki nie został dodany do formularza.");
      }
      if (zaktualizowanePoIstniejacych.size) {
        await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element=>
          element.organization===state.organization && zaktualizowanePoIstniejacych.has(element.id)
            ? {...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE_ISTNIEJACE),completionReason:"ALREADY_EXISTS"}
            : element));
      }
      state.status="FORM_FILLED";
      state.formularzZmieniony=true;
      render();
      const liczbaProblemow=nierozwiazane.length+duplikatyTerminow.length+wynikWprowadzenia.bledy.length;
      toast(`Przygotowano terminów: ${powiazanie.terms.length}.${liczbaProblemow ? ` Pozycje wymagające sprawdzenia: ${liczbaProblemow}.` : ""} Zapisz Eventis ręcznie po kontroli.`);
    } catch (blad) {
      if (planOperacji) await zwolnijNiepotwierdzonyClaim(planOperacji);
      state.status="ERROR"; state.lastError=blad.message; render();
    }
    } finally { state.trwaWprowadzanieKolejki = false; render(); }
  }

  function unikalneTerminy(termy) {
    const widziane=new Set();
    return termy.filter(termin=>{
      const klucz=existingKey(termin);
      if(widziane.has(klucz)) return false;
      widziane.add(klucz);
      return true;
    });
  }

  function deconfirmedExistingMatches() {
    const deconf=state.manualMatches.filter(r=>r.status==="DECONFIRMED"&&!r.error&&r.similarity>=.7);
    const existing=getExistingTerms();
    return deconf.map(r=>({record:r,event:existing.find(e=>e.start===r.start&&normalize(e.city)===normalize(r.city))})).filter(x=>x.event);
  }

  function highlightDeconfirmedTerm(id) {
    $$('.esync-candidate-remove').forEach(x=>x.classList.remove('esync-candidate-remove'));
    const row=$(`#li_eventdate_${CSS.escape(String(id))}`);
    if(row){row.classList.add('esync-candidate-remove');row.scrollIntoView({behavior:'smooth',block:'center'});toast('Podświetlono dokładnie ten termin. v0.1 nie klika jeszcze automatycznie „Usuń”.');}
  }

  function mappingState() {
    if (!state.source) return {kind:"none",score:0};
    const score=titleSimilarity(state.eventisTitle,state.source.title);
    if (score < state.settings.mappingBlockThreshold) return {kind:"danger",score};
    if (score < state.settings.mappingWarningThreshold) return {kind:"warning",score};
    return {kind:"ok",score};
  }

  async function useSource(source, {learn=false,origin="MANUAL_URL",fromMapping=false}={}) {
    const identyfikatorWyszukiwania = state.searchRequestId;
    const kontekst = state.kontekstWydarzenia;
    const organizacja = state.organization;
    const identyfikatorWydarzenia = state.eventisId;
    const czyAktualny = () => identyfikatorWyszukiwania === state.searchRequestId && kontekst === state.kontekstWydarzenia
      && organizacja === state.organization && identyfikatorWydarzenia === state.eventisId;
    state.source=source;
    state.statusZrodla="FOUND";
    state.sourceLoadedFromMapping=fromMapping;
    state.sourceTerms=source.terms || [];
    state.reczniePotwierdzoneTerminy.clear();
    state.analizaTerminowWykonana=false;
    state.analizaWykazalaBraki=false;
    compareTerms();
    state.analizaTerminowWykonana=true;
    state.analizaWykazalaBraki=state.missingTerms.length>0;
    state.mappingVerifiedThisSession=false;
    if (learn) {
      if (!await saveMapping(source,origin) || !czyAktualny()) return false;
    }
    if (MODE === "add" && state.weryfikacjaOtwartejKarty?.status === "VERIFIED" && state.weryfikacjaOtwartejKarty.task?.queueContext) {
      state.mappingVerifiedThisSession = state.weryfikacjaOtwartejKarty.task.queueContext.sourceUrl === source.url && titleSimilarity(state.eventisTitle,source.title) >= state.settings.mappingWarningThreshold;
    } else if (titleSimilarity(state.eventisTitle,source.title) > PROGI_WYSZUKIWANIA.AUTOMATYCZNE_POTWIERDZENIE_MAPOWANIA) {
      await verifyMapping();
      if (!czyAktualny()) return false;
    }
    state.status="SOURCE_READY";
    render();
    return true;
  }

  async function loadRememberedMapping() {
    if (!state.mapping?.sourceUrl) return;
    const identyfikator = state.searchRequestId;
    const organizacja = state.organization;
    try {
      state.status="LOADING_MAPPING"; render();
      const source=await fetchTraining(state.mapping.sourceUrl,organizacja);
      if(identyfikator!==state.searchRequestId||organizacja!==state.organization)return;
      if (!await useSource(source,{learn:false,fromMapping:true})) return;
      await reconcileBiezacejKolejki();
      const ms=mappingState();
      if(ms.kind==="danger"){
        state.mapping.status="REVIEW_REQUIRED";
        await audit("MAPPING_SUSPECTED",{score:ms.score,sourceUrl:source.url});
      }
    } catch (e) {
      if(identyfikator!==state.searchRequestId||organizacja!==state.organization)return;
      state.status="MAPPING_ERROR";
      state.mappingError=e.message;
      render();
    }
  }

  async function verifyMapping() {
    if (!state.source) return;
    const identyfikatorWyszukiwania = state.searchRequestId;
    const kontekst = state.kontekstWydarzenia;
    const organizacja = state.organization;
    const identyfikatorWydarzenia = state.eventisId;
    const czyAktualny = () => identyfikatorWyszukiwania === state.searchRequestId && kontekst === state.kontekstWydarzenia
      && organizacja === state.organization && identyfikatorWydarzenia === state.eventisId;
    const ms=mappingState();
    if (ms.kind === "danger") return toast("Powiązanie jest zbyt niezgodne. Zmień link zamiast je potwierdzać.");
    const mapowanieDotyczyZrodla = czyMapowanieDotyczyZrodla(state.mapping,state.source);
    if (!mapowanieDotyczyZrodla) {
      if (!await saveMapping(state.source,"AUTO_RECOMMENDED_CONFIRMED") || !czyAktualny()) return;
    }
    state.mappingVerifiedThisSession=true;
    await reconcileBiezacejKolejki();
    if (!czyAktualny()) return;
    if (state.mapping) {
      const { mappings = {} } = await storageGet(["mappings"]);
      const key=mappingKey(state.organization,state.eventisId);
      if(mappings[key]) { mappings[key].lastVerifiedAt=new Date().toISOString(); mappings[key].confidence=ms.score; mappings[key].status="ACTIVE"; await storageSet({mappings}); state.mapping=mappings[key]; }
    }
    await audit("MAPPING_VERIFIED_THIS_SESSION",{score:ms.score,sourceUrl:state.source.url});
    compareTerms(); render();
  }

  async function uruchomAutomatycznaKolejkeJesliGotowa() {
    if (MODE !== "edit") return;
    const dane = await storageGet(["eventisAutomaticBatches","eventisImportQueue"]);
    const zadanieSesji = state.weryfikacjaOtwartejKarty?.status === "VERIFIED"
      ? {identyfikatoryKolejki:state.weryfikacjaOtwartejKarty.task?.queueItemIds || []}
      : null;
    const znalezione = zadanieSesji
      ? {seria:{identyfikatorSerii:state.weryfikacjaOtwartejKarty.sessionId},zadanie:zadanieSesji}
      : NARZEDZIA_LISTY.znajdzAktywneZadanie(dane.eventisAutomaticBatches,state.organization,state.eventisId);
    if (!znalezione) return;
    const aktywneId = new Set((dane.eventisImportQueue || [])
      .filter(element => element.organization === state.organization && ["PENDING","ERROR"].includes(element.status))
      .map(element => element.id));
    const identyfikatoryKolejki = (znalezione.zadanie.identyfikatoryKolejki || []).filter(id => aktywneId.has(id));
    if (!identyfikatoryKolejki.length) return;
    const stanMapowania = mappingState();
    const gotoweMapowanie = NARZEDZIA_LISTY.czyMapowanieGotoweDoAutomatyzacji(state.mapping,state.settings.mappingWarningThreshold);
    if (!state.source || !czyMapowanieDotyczyZrodla(state.mapping,state.source) || !gotoweMapowanie || stanMapowania.kind !== "ok") {
      state.status = "ERROR";
      state.lastError = "Automatyczna kolejka została zatrzymana: karta nie ma aktywnego, zgodnego i wcześniej zweryfikowanego mapowania SEMPER/IIST.";
      render();
      toast(state.lastError);
      return;
    }
    state.mappingVerifiedThisSession = true;
    await audit("AUTOMATIC_QUEUE_MAPPING_ACCEPTED",{identyfikatorSerii:znalezione.seria.identyfikatorSerii,queueItemIds:identyfikatoryKolejki});
    render();
    await wprowadzTerminyZKolejki(identyfikatoryKolejki);
  }

  function sourceConfirmedCount(){return state.sourceTerms.filter(czyTerminPotwierdzony).length;}

  async function onLoadUrl() {
    if (!state.organization) return toast("Nie rozpoznano organizatora. Wybierz źródło szkolenia.");
    const input=$("#esync-source-url");
    if(!input) return;
    const url=input.value.trim();
    if(!url) return toast("Wklej link szkolenia.");
    let identyfikatorWyszukiwania = null;
    let kontekst = "";
    try {
      state.searchRequestId++;
      identyfikatorWyszukiwania = state.searchRequestId;
      kontekst = state.kontekstWydarzenia;
      const organizacja = state.organization;
      state.status="LOADING_SOURCE"; render();
      const source=await fetchTraining(url,organizacja);
      if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia || organizacja !== state.organization) return;
      if (!await useSource(source,{learn:true,origin:"MANUAL_URL"})) return;
      toast("Link działa i został zapamiętany. Teraz porównaj tytuły i potwierdź zgodność.");
    } catch(e){
      if (identyfikatorWyszukiwania !== null && (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia)) return;
      state.status="ERROR";state.lastError=e.message;render();
    }
  }

  async function onSearch() {
    if (!state.organization) {
      state.searchMessage = state.statusOrganizatora === "LOADING" ? "Oczekuję na pole Firma w formularzu Eventis." : "Nie rozpoznano organizatora. Wybierz źródło szkolenia.";
      render();
      return;
    }
    if (state.status === "SEARCHING") return;
    const identyfikator = ++state.searchRequestId;
    try {
      state.status="SEARCHING";
      state.statusZrodla="SEARCHING";
      state.searchAttempted=true;
      state.searchChoices=[];
      state.searchMessage=`Szukam szkolenia w ${state.organization}…`;
      state.titleAtSearch=state.eventisTitle;
      render();
      const wynik=await searchTraining(identyfikator);
      sprawdzAktualnoscWyszukiwania(identyfikator);
      let pokazane=wynik.results
        .filter(kandydat=>kandydat.verificationScore>=PROGI_WYSZUKIWANIA.POKAZ_KANDYDATA)
        .slice(0,PROGI_WYSZUKIWANIA.MAKS_WYNIKOW_W_UI);
      if(state.organization==="IIST"&&!pokazane.length&&!wynik.networkVerificationErrors){
        state.searchMessage="Brak podobnego tytułu w IIST. Sprawdzam pomocniczo bazę SEMPER…";
        render();
        try {
          const wynikSemper=await searchSemper(wynik.variants,identyfikator);
          sprawdzAktualnoscWyszukiwania(identyfikator);
          const podobneSemper=wynikSemper.results
            .filter(kandydat=>kandydat.verificationScore>=PROGI_WYSZUKIWANIA.POKAZ_KANDYDATA)
            .slice(0,PROGI_WYSZUKIWANIA.MAKS_WYNIKOW_W_UI);
          if(podobneSemper.length){
            state.searchChoices=podobneSemper;
            state.status="SEARCH_WEAK";
            state.searchFinalReason="iist-empty-semper-fallback";
            state.statusZrodla="NOT_FOUND";
            state.searchMessage="Nie znaleziono podobnego tytułu w IIST, ale wykryto go w SEMPER. Sprawdź wynik i potwierdź zmianę profilu.";
            zapiszDiagnostykeWyszukiwania({provider:"IIST",fallbackProvider:"SEMPER",finalReason:state.searchFinalReason,topCandidate:podobneSemper[0].title,verificationScore:podobneSemper[0].verificationScore});
            render();
            return;
          }
        } catch(bladAwaryjnegoWyszukiwania) {
          zapiszDiagnostykeWyszukiwania({provider:"IIST",fallbackProvider:"SEMPER",finalReason:"semper-fallback-error",error:bladAwaryjnegoWyszukiwania.message});
        }
      }
      if(state.organization==="SEMPER"&&!pokazane.length&&!wynik.networkVerificationErrors){
        state.searchMessage="Brak podobnego tytułu w SEMPER. Sprawdzam pomocniczo bazę IIST…";
        render();
        try {
          const wynikIist=await searchIist(wynik.variants,identyfikator);
          sprawdzAktualnoscWyszukiwania(identyfikator);
          const podobneIist=wynikIist.results
            .filter(kandydat=>kandydat.verificationScore>=PROGI_WYSZUKIWANIA.POKAZ_KANDYDATA)
            .slice(0,PROGI_WYSZUKIWANIA.MAKS_WYNIKOW_W_UI);
          if(podobneIist.length){
            state.searchChoices=podobneIist;
            state.status="SEARCH_WEAK";
            state.searchFinalReason="semper-empty-iist-fallback";
            state.statusZrodla="NOT_FOUND";
            state.searchMessage="Nie znaleziono podobnego tytułu w SEMPER, ale wykryto go w IIST. Sprawdź wynik i potwierdź zmianę profilu.";
            zapiszDiagnostykeWyszukiwania({provider:"SEMPER",fallbackProvider:"IIST",finalReason:state.searchFinalReason,topCandidate:podobneIist[0].title,verificationScore:podobneIist[0].verificationScore});
            render();
            return;
          }
        } catch(bladAwaryjnegoWyszukiwania) {
          zapiszDiagnostykeWyszukiwania({provider:"SEMPER",fallbackProvider:"IIST",finalReason:"iist-fallback-error",error:bladAwaryjnegoWyszukiwania.message});
        }
      }
      const najlepszy=pokazane[0];
      const drugi=pokazane[1];
      const maPrzewage=!drugi||najlepszy.verificationScore-drugi.verificationScore>=PROGI_WYSZUKIWANIA.MINIMALNA_PRZEWAGA;
      if(najlepszy&&najlepszy.verificationScore>=PROGI_WYSZUKIWANIA.AUTO_AKCEPTACJA&&maPrzewage){
        if (!await useSource(najlepszy.source,{learn:false}) || identyfikator !== state.searchRequestId) return;
        state.status="SEARCH_HIGH";
        state.searchFinalReason="high-confidence-single";
        state.searchMessage="Znaleziono prawdopodobne szkolenie — sprawdź zgodność.";
      }else if(pokazane.length){
        state.searchChoices=pokazane;
        const mocne=pokazane.filter(kandydat=>kandydat.verificationScore>=PROGI_WYSZUKIWANIA.MOCNY_KANDYDAT).length;
        state.status=mocne>1||pokazane.length>1?"SEARCH_MULTIPLE":"SEARCH_WEAK";
        state.searchFinalReason=state.status==="SEARCH_MULTIPLE"?"multiple-candidates":"weak-candidate";
        state.searchMessage=state.status==="SEARCH_MULTIPLE"
          ?`Znaleziono ${pokazane.length} możliwe szkolenia. Wybierz właściwe.`
          :"Znaleziono podobny wynik, ale nie jest wystarczająco pewny.";
      }else if(wynik.networkVerificationErrors){
        state.status="SEARCH_NETWORK";
        state.searchFinalReason="candidate-network-error";
        state.searchMessage=`Znaleziono wyniki, ale nie udało się pobrać stron szczegółowych z ${state.organization}.`;
      }else if(wynik.rawCount){
        state.status="SEARCH_WEAK";
        state.searchFinalReason="candidates-failed-verification";
        state.searchMessage="Znaleziono podobne wyniki, ale żaden nie przeszedł weryfikacji tytułu strony.";
      }else{
        state.status="SEARCH_EMPTY";
        state.searchFinalReason="no-search-results";
        state.searchMessage = kandydaciBiezacegoOgloszenia().length ? `Bieżące ogłoszenie #${state.eventisId} pasuje do kolejki. Nie znaleziono jego źródła ${state.organization}; możesz podać link źródła ręcznie.` : `Nie znaleziono szkolenia w wyszukiwarce ${state.organization}. Możesz podać link ręcznie.`;
      }
      state.statusZrodla = state.status === "SEARCH_HIGH" ? "FOUND" : state.status === "SEARCH_EMPTY" ? "NOT_FOUND" : state.status === "SEARCH_NETWORK" ? "ERROR" : "AMBIGUOUS";
      zapiszDiagnostykeWyszukiwania({provider:state.organization,finalReason:state.searchFinalReason,topCandidate:najlepszy?.title||null,searchScore:najlepszy?.searchScore||0,verificationScore:najlepszy?.verificationScore||0});
      render();
    } catch(e){
      if(identyfikator!==state.searchRequestId)return;
      const siec=/HTTP|połą|pobr|czasu|fetch|network/i.test(e.message||"");
      state.status=siec?"SEARCH_NETWORK":"ERROR";
      state.statusZrodla="ERROR";
      state.lastError=e.message;
      state.searchMessage=siec?`Nie udało się połączyć z ${state.organization}.`:e.message;
      state.searchFinalReason=siec?"network-error":"configuration-or-parser-error";
      zapiszDiagnostykeWyszukiwania({provider:state.organization,finalReason:state.searchFinalReason,error:e.message});
      render();
    }
  }

  async function chooseSearchResult(url) {
    const kontekst = state.kontekstWydarzenia;
    let identyfikatorWyszukiwania = state.searchRequestId;
    try {
      const kandydat=state.searchChoices.find(wynik=>wynik.url===url);
      if (!kandydat) return;
      const organizacjaKandydata=kandydat?.provider||state.organization;
      if(organizacjaKandydata!==state.organization){
        const potwierdzono=confirm(`Wynik pochodzi z profilu ${organizacjaKandydata}, a panel działa obecnie jako ${state.organization}. Czy przełączyć profil na ${organizacjaKandydata} i przejść do weryfikacji zgodności?`);
        if(!potwierdzono)return;
        if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia) return;
        state.searchRequestId++;
        identyfikatorWyszukiwania = state.searchRequestId;
        state.organization=organizacjaKandydata;
        state.sposobWyboruZrodla="MANUAL";
        state.source=null;state.statusZrodla="UNKNOWN";state.sourceTerms=[];state.sourceLoadedFromMapping=false;state.mappingVerifiedThisSession=false;
        const {mappings={}}=await storageGet(["mappings"]);
        if (kontekst !== state.kontekstWydarzenia || state.organization !== organizacjaKandydata) return;
        state.mapping=mappings[mappingKey(state.organization,state.eventisId)]||null;
      }
      state.searchRequestId++;
      identyfikatorWyszukiwania = state.searchRequestId;
      const nowyIdWyszukiwania = state.searchRequestId;
      const organizacja = state.organization;
      state.status="LOADING_SOURCE";render();
      const source=kandydat.source||await fetchTraining(url,organizacja);
      if (nowyIdWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia || organizacja !== state.organization) return;
      if (!await useSource(source,{learn:true,origin:"USER_SELECTED"})) return;
    }catch(e){
      if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia) return;
      state.status="ERROR";state.lastError=e.message;render();
    }
  }

  async function onAddMissing() {
    if (state.trwaDodawanieZrodla || state.trwaWprowadzanieKolejki || state.trwaRozpoznawanieNatywne) return;
    state.trwaDodawanieZrodla = true;
    try {
    if (!state.mappingVerifiedThisSession) return toast("Najpierw potwierdź zgodność zapamiętanego/wybranego linku z ogłoszeniem Eventis.");
    if (!await sprawdzBrakOczekujacejOperacji()) return;
    compareTerms();
    const potwierdzoneZrodlem = state.missingTerms.filter(termin => ((termin.confirmedOnSemper ?? termin.confirmed) || termin.confirmedManually) && !termin.confirmationConflict);
    if (!potwierdzoneZrodlem.length) return toast("Brak brakujących terminów potwierdzonych na stronie źródłowej.");
    try {
      const chosen=[...potwierdzoneZrodlem];
      const planOperacji=utworzPlanOperacji(chosen);
      const wykonanie=await NARZEDZIA_OPERACJI.wykonajPoUzyskaniuClaimu(
        () => uzyskajClaimOperacji(planOperacji),
        async operacja => {
          state.trwaWypelnianieOperacji=true;
          try {
          const wynikWprowadzenia=await addSelectedTerms(chosen);
          if (!wynikWprowadzenia.dodane.length) return wynikWprowadzenia;
          try {
            await uzupelnijDaneWydarzenia(state.source,wynikWprowadzenia.dodane);
          } catch (blad) {
            await potwierdzOperacjeOczekujaca(operacja,wynikWprowadzenia.dodane);
            state.formularzZmieniony=true;
            throw blad;
          }
          await potwierdzOperacjeOczekujaca(operacja,wynikWprowadzenia.dodane);
          return wynikWprowadzenia;
          } finally { state.trwaWypelnianieOperacji=false; }
        }
      );
      if (!wykonanie.ok) throw new Error("Dla tego ogłoszenia trwa już inna operacja importu. Zakończ ją lub wróć do karty, w której została rozpoczęta.");
      const wynikWprowadzenia=wykonanie.wynik;
      if (!wynikWprowadzenia.dodane.length) {
        await zwolnijNiepotwierdzonyClaim(planOperacji);
        natywneDodawanie.komunikat = wynikWprowadzenia.bledy[0]?.komunikat || "Żaden termin nie został dodany do formularza.";
        return toast(natywneDodawanie.komunikat);
      }
      await audit("FORM_FILLED",{terms:wynikWprowadzenia.dodane.map(t=>({start:t.start,end:t.end,city:t.city,price:t.price})),errors:wynikWprowadzenia.bledy});
      state.status="FORM_FILLED";
      state.formularzZmieniony=true;
      compareTerms();
      render();
      natywneDodawanie.komunikat = wynikWprowadzenia.bledy.length ? `Operacja częściowa: dodano ${wynikWprowadzenia.dodane.length}. ${wynikWprowadzenia.bledy[0].komunikat}` : `Wprowadzono ${wynikWprowadzenia.dodane.length} terminów. Sprawdź formularz i zapisz ręcznie.`;
      toast(natywneDodawanie.komunikat);
    }catch(e){state.status="ERROR";state.lastError=e.message;render();toast(e.message);}
    } finally { state.trwaDodawanieZrodla = false; render(); }
  }

  async function switchOrganization(org) {
    if (!['SEMPER','IIST'].includes(org)||org===state.organization) return;
    state.searchRequestId++;
    const identyfikatorWyszukiwania = state.searchRequestId;
    const kontekst = state.kontekstWydarzenia;
    const wartoscFirmy = state.wartoscFirmy;
    if (!await zwolnijOczekujacaOperacje()) {
      if (identyfikatorWyszukiwania === state.searchRequestId && kontekst === state.kontekstWydarzenia) {
        state.status = state.source ? "SOURCE_READY" : "INIT";
        render();
      }
      return;
    }
    if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia || wartoscFirmy !== state.wartoscFirmy) return;
    state.organization=org;state.sposobWyboruZrodla="MANUAL";state.source=null;state.statusZrodla="UNKNOWN";state.sourceLoadedFromMapping=false;state.sourceTerms=[];state.mappingVerifiedThisSession=false;state.searchChoices=[];state.searchAttempted=false;state.analizaTerminowWykonana=false;state.analizaWykazalaBraki=false;state.status="INIT";
    const { mappings={}, pendingOperations={} }=await storageGet(["mappings","pendingOperations"]);
    if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia) return;
    state.mapping=mappings[mappingKey(org,state.eventisId)]||null;
    state.pendingOperation=NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,org,state.eventisId,state.eventisTitle,state.tabId);
    state.pendingLooksSaved=false;
    render();
    await inspectPendingAfterReload();
    if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia) return;
    if(state.pendingLooksSaved) render();
    if (state.weryfikacjaOtwartejKarty?.status === "VERIFIED" && state.weryfikacjaOtwartejKarty.task?.queueContext?.sourceUrl) {
      const zrodlo = await fetchTraining(state.weryfikacjaOtwartejKarty.task.queueContext.sourceUrl,org);
      if (identyfikatorWyszukiwania !== state.searchRequestId || kontekst !== state.kontekstWydarzenia || state.organization !== org) return;
      if (!await useSource(zrodlo,{learn:MODE !== "add"})) return;
      compareTerms();
      render();
    }
    else if(state.mapping) await loadRememberedMapping();
    else if(MODE==="edit"&&state.eventisTitle)setTimeout(()=>{
      if (identyfikatorWyszukiwania === state.searchRequestId && kontekst === state.kontekstWydarzenia
        && state.organization === org && state.sposobWyboruZrodla === "MANUAL") onSearch();
    },350);
  }

  function renderTerm(t, status) {
    const kluczTerminu=termKey(t);
    const potwierdzonyRecznie=!t.confirmed&&state.reczniePotwierdzoneTerminy.has(kluczTerminu);
    const potwierdzonyKolejka = t.confirmedByQueue && !t.confirmedOnSemper;
    const brakNaZrodle = t.brakNaZrodle === true;
    const potwierdzonyZrodlem = t.confirmedOnSemper ?? t.confirmed;
    const etykietaZrodla = `<span class="esync-badge ${potwierdzonyZrodlem ? 'esync-zrodlo-potwierdzone' : 'esync-zrodlo-niepotwierdzone'}">${esc(state.organization)} - ${brakNaZrodle ? 'brak terminu' : potwierdzonyZrodlem ? 'potwierdzony' : 'niepotwierdzony'}</span>`;
    const klasaObecnosci = status === "exists" ? "esync-termin-obecny" : "esync-termin-brakujacy";
    const etykietaEventis = `<span class="esync-badge ${status === "exists" ? 'green' : status === "waiting" ? 'yellow' : 'gray'}">EVENTIS: ${status === "exists" ? 'termin istnieje' : status === "waiting" ? 'w formularzu — zapis niepotwierdzony' : 'brak terminu'}</span>`;
    const stylPrzelacznika=potwierdzonyRecznie?'border-color:#599b6e;background:#ecfdf3;color:#166534':'border-color:#e7a568;background:#fff1e3;color:#99511b';
    const przelacznik=!t.confirmed&&!potwierdzonyKolejka?`<button type="button" class="esync-potwierdz-termin" data-reczne-potwierdzenie="${esc(kluczTerminu)}" title="${potwierdzonyRecznie?'Cofnij ręczne potwierdzenie':'Oznacz ten termin jako potwierdzony'}" style="${stylPrzelacznika}">${potwierdzonyRecznie?'RĘCZNIE ✓':'POTWIERDŹ TERMIN'}</button>`:"";
    const daneTerminu=`${esc(t.start)}${t.end&&t.end!==t.start?` → ${esc(t.end)}`:""} · ${esc(t.city)}${t.price?` · ${esc(t.price)} zł`:""} · ${esc(t.durationDays||durationDays(t.start,t.end))} dni`;

    return `<div class="esync-term esync-porownanie-terminu ${klasaObecnosci} ${potwierdzonyKolejka ? 'esync-termin-kolejki-niepotwierdzony' : ''} ${brakNaZrodle ? 'esync-termin-kolejki-brak-na-zrodle' : ''}"><div><div class="esync-term-main">${daneTerminu}</div><div class="esync-term-sub">${brakNaZrodle ? 'Termin wskazany w kolejce; brak na stronie źródłowej' : potwierdzonyKolejka?`Termin potwierdzony przez kolejkę. ${esc(state.organization)} nie oznacza go jeszcze jako potwierdzonego.`:potwierdzonyRecznie?"potwierdzony ręcznie":""}</div>${t.confirmationConflict?'<div class="esync-warning">⚠ Konflikt: kolejka odpotwierdza termin — wymaga uwagi.</div>':''}</div><div>${etykietaZrodla}${etykietaEventis}${potwierdzonyKolejka?'<span class="esync-badge purple">POTW. Z KOLEJKI</span>':''}${przelacznik}</div></div>`;
  }

  function przelaczRecznePotwierdzenie(kluczTerminu) {
    const termin=state.sourceTerms.find(element=>termKey(element)===kluczTerminu&&!element.confirmed);
    if(!termin)return;
    if(state.reczniePotwierdzoneTerminy.has(kluczTerminu))state.reczniePotwierdzoneTerminy.delete(kluczTerminu);
    else state.reczniePotwierdzoneTerminy.add(kluczTerminu);
    compareTerms();
    render();
  }

  function renderMappingCard() {
    const orgClass=state.organization==="SEMPER"?"semper":state.organization==="IIST"?"iist":"";
    const mapping=state.mapping;
    const source=state.source;
    const organizator=state.organizatorWydarzenia || (state.statusOrganizatora==="LOADING"?"ŁADOWANIE":"NIEZNANY");
    const trybZrodla=state.sposobWyboruZrodla==="MANUAL"?"wybrano ręcznie":"wykryto automatycznie";
    const ms=mappingState();
    const remembered=!!(mapping&&source&&(state.sourceLoadedFromMapping||czyMapowanieDotyczyZrodla(mapping,source)));
    const statusClass=ms.kind==="danger"?"esync-danger":ms.kind==="warning"||remembered?"esync-warning":"esync-info";
    const score=Math.round(ms.score*100);
    const wyroznioneTytuly=source
      ? wyroznijRozniceTytulow(state.eventisTitle||"Nie odczytano tytułu",source.title)
      : null;
    let warning="";
    if (remembered) {
      if(ms.kind==="danger") warning=`<div class="esync-danger"><b>🔴 Podejrzane powiązanie — operacje zablokowane</b><div class="esync-small">Podobieństwo tytułów: ${score}%. Wybierz właściwe szkolenie.</div></div>`;
      else if(!state.mappingVerifiedThisSession) warning=`<div class="${statusClass}"><b>⚠ Zapamiętane powiązanie — sprawdź</b><div class="esync-small">Link oszczędza wyszukiwanie, ale przed zmianą Eventis porównaj oba tytuły i potwierdź zgodność.</div><div class="esync-progress"><i style="width:${score}%"></i></div><div class="esync-small">Podobieństwo tytułów: ${score}%</div></div>`;
      else warning=`<div class="esync-success"><b>✓ Powiązanie zweryfikowane w tej sesji</b><div class="esync-small">Możesz uzupełnić brakujące terminy.</div></div>`;
    }
    const choices=state.searchChoices.length?`<div class="esync-card"><h3>Wyniki wyszukiwania</h3>${state.searchChoices.map(c=>`<div class="esync-choice"><b>${esc(c.title)}</b><small>${esc(c.provider||state.organization)} · zgodność tytułu ${Math.round((c.verificationScore??c.similarity??0)*100)}% · wynik wyszukiwarki ${Math.round((c.searchScore??c.similarity??0)*100)}%</small><div class="esync-choice-actions"><a class="esync-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Otwórz stronę</a><button type="button" class="esync-btn primary" data-choice-url="${esc(c.url)}">Wybierz</button></div></div>`).join("")}</div>`:"";
    return `<div class="esync-card">
      <div class="esync-row esync-between"><h3>Źródło szkolenia</h3>${state.organization?`<span class="esync-badge ${orgClass}">${esc(state.organization)}</span>`:""}</div>
      <div class="esync-row esync-wrap">${renderujZnacznikiKarty()}</div>
      <div class="esync-small">Organizator Eventis: ${esc(organizator)} · źródło ${state.organization?`${esc(state.organization)} · ${trybZrodla}`:"nieustalone"}</div>
      <div class="esync-zrodlo-eventis" style="padding:7px;border-radius:8px;background:#F68541;font-size:11px">
        <div class="esync-zrodlo-identyfikator" style="font-weight:700;margin-bottom:2px">Eventis: #${esc(state.eventisId)}</div>
        <div style="line-height:1.35">${wyroznioneTytuly?.pierwszy||esc(state.eventisTitle||"Nie odczytano tytułu")}</div>
      </div>
      ${source?`<div class="esync-zrodlo-zewnetrzne" style="margin-top:6px;padding:7px;border-radius:8px;background:#EDF5FA;font-size:11px">
        <div class="esync-zrodlo-identyfikator" style="font-weight:700;margin-bottom:2px">${esc(state.organization)}: #${esc(source.id)}</div>
        <div>${wyroznioneTytuly.drugi}</div>
      </div>`:""}
      ${warning}
      ${source && !state.mappingVerifiedThisSession && ms.kind!=="danger"?`<button id="esync-verify" class="esync-btn warn" style="width:100%;margin-top:7px">✓ Potwierdzam zgodność tytułu i linku</button>`:""}
      ${state.status==="SEARCHING"?`<div class="esync-neutralny esync-small">${esc(state.searchMessage||`Szukam szkolenia w ${state.organization}…`)}</div>`:""}
      ${state.status==="LOADING_SOURCE"||state.status==="LOADING_MAPPING"?`<div class="esync-neutralny esync-small">Trwa pobieranie danych…</div>`:""}
      ${["SEARCH_HIGH","SEARCH_MULTIPLE"].includes(state.status)?`<div class="esync-warning esync-small">${esc(state.searchMessage)}</div>`:""}
      ${["SEARCH_EMPTY","SEARCH_WEAK"].includes(state.status)?`<div class="${state.statusZrodla === "NOT_FOUND" ? "esync-problem-zrodla" : "esync-warning"} esync-small">${esc(state.searchMessage)}</div>`:""}
      ${state.status==="SEARCH_NETWORK"?`<div class="esync-neutralny esync-small">${esc(state.searchMessage)}</div>`:""}
      ${state.status==="TITLE_CHANGED"?`<div class="esync-warning esync-small">${esc(state.searchMessage)}</div>`:""}
      ${state.status==="ERROR"?`<div class="${state.statusZrodla === "ERROR" ? "esync-neutralny" : "esync-warning"} esync-small">${esc(state.lastError||"Błąd")}</div>`:""}
      ${state.status==="MAPPING_ERROR"?`<div class="esync-neutralny esync-small">Zapamiętany link nie zadziałał: ${esc(state.mappingError||"")}. Wybierz nowy link.</div>`:""}
    </div>${choices}`;
  }

  function renderujAkcjeZrodla() {
    const mapping=state.mapping;
    const source=state.source;
    return `<div class="esync-card esync-source-actions">
      ${!state.organization?`<div class="esync-warning esync-small">${state.statusOrganizatora === "LOADING" ? "Oczekuję na pole Firma w formularzu Eventis." : "Nie rozpoznano organizatora. Wybierz źródło szkolenia."}</div>`:""}
      <input id="esync-source-url" class="esync-input" type="url" value="${esc(source?.url||mapping?.sourceUrl||"")}" placeholder="Link szkolenia ${esc(state.organization)}">
      <div class="esync-grid2" style="margin-top:6px">
        <button id="esync-load-url" class="esync-btn primary">Użyj i zapamiętaj</button>
        <button id="esync-search" class="esync-btn" ${!state.organization||state.status==="SEARCHING"?'disabled':''}>${state.searchAttempted?'Szukaj ponownie':'Szukaj automatycznie'}</button>
        ${source?`<button id="esync-open-source" class="esync-btn">Otwórz źródło</button>`:"<span></span>"}
        ${mapping?`<button id="esync-forget" class="esync-btn danger">Zapomnij link</button>`:""}
      </div>
    </div>`;
  }

  function renderTermsCard() {
    if(!state.source) return "";
    compareTerms();
    const confirmed=state.sourceTerms.filter(czyTerminPotwierdzony);
    const statusTerminu = termin => (state.zapisaneTerminyEventis || []).some(wpis => existingKey(wpis) === existingKey(termin)) ? "exists"
      : state.existingTerms.some(wpis => existingKey(wpis) === existingKey(termin)) ? "waiting" : czyTerminPotwierdzony(termin) ? "missing" : "unconfirmed";
    return `<div class="esync-card">
      <div class="esync-section-title"><span>Porównanie terminów</span><button id="esync-refresh" class="esync-btn" style="min-height:25px;padding:3px 6px">Sprawdź ponownie</button></div>
      ${state.scalenieKolejki?.unmatchedQueueTerms.length?`<div class="esync-problem-zrodla">Nie znaleziono konkretnego terminu na ${esc(state.organization)}. Dane kolejki możesz sprawdzić i uzupełnić w formularzu.</div>`:''}
      ${state.scalenieKolejki?.terms.some(termin => termin.confirmationConflict)?'<div class="esync-danger">⚠ Konflikt potwierdzenia SEMPER/kolejki i odpotwierdzenia w kolejce — wymaga uwagi. Terminy Eventis nie są usuwane.</div>':''}
      <div class="esync-kpi"><div class="${confirmed.length ? "" : "pusty"}"><b>${confirmed.length}</b><span>potwierdzone</span></div><div class="${state.existingTerms.length ? "" : "pusty"}"><b>${state.existingTerms.length}</b><span>Eventis</span></div><div class="${state.missingTerms.length ? "" : "pusty"}"><b>${state.missingTerms.length}</b><span>brakujące</span></div></div>
      ${state.sourceTerms.map(termin=>renderTerm(termin,statusTerminu(termin))).join("")}
      ${(state.scalenieKolejki?.unmatchedQueueTerms || []).filter((termin,indeks,terminy) => terminy.findIndex(inny => termKey(inny) === termKey(termin)) === indeks).map(termin => renderTerm({...termin,confirmed:false,confirmedByQueue:true,confirmedOnSemper:false,brakNaZrodle:true},"missing")).join("")}
      ${state.status==="FORM_FILLED"?`<div class="esync-warning"><b>Formularz został uzupełniony.</b><br>Zweryfikuj go wizualnie i kliknij zapis w Eventis. Rozszerzenie nie zapisuje formularza automatycznie.</div>`:""}
    </div>`;
  }

  function renderPendingCard(){
    const karta = renderujStanOperacji();
    return karta + (state.pendingOperation && state.pendingOperation.status !== "CLAIMED" && !czyTrwaZapis()
      ? `<div class="esync-card"><button id="esync-release-operation" class="esync-btn" style="width:100%">Zwolnij blokadę</button><div class="esync-small">Przerwij oczekiwanie bez potwierdzania zapisu. Dane w formularzu pozostaną; pozycje kolejki będą wymagały sprawdzenia.</div></div>` : "");
  }

  function renderujStanOperacji(){
    if (state.zapis?.saveState === "PREPARING_SAVE" || state.zapis?.saveState === "SUBMITTING") return `<div class="esync-card"><div class="esync-neutralny"><b>Zapisywanie zmian w Eventis…</b></div></div>`;
    if (state.zapis?.saveState === "WAITING_FOR_EVENTIS") return `<div class="esync-card"><div class="esync-neutralny"><b>Oczekiwanie na potwierdzenie Eventis…</b></div></div>`;
    if (state.zapis?.saveState === "SUCCESS") return `<div class="esync-card"><div class="esync-success"><b>✓ Zmiany zostały zapisane w Eventis.</b></div></div>`;
    if (state.zapis?.saveState === "EXPLICIT_ERROR") return `<div class="esync-card"><div class="esync-danger"><b>Eventis nie zapisał zmian.</b><div class="esync-small">${esc(state.zapis.przyczyna || "")}</div>${state.pendingOperation?`<button id="esync-reject-save" class="esync-btn danger" style="width:100%;margin-top:7px">Rozlicz nieudany zapis</button>`:""}</div></div>`;
    if (state.zapis?.saveState === "UNKNOWN") return `<div class="esync-card"><div class="esync-warning"><b>Nie udało się automatycznie potwierdzić zapisu.</b><button id="esync-check-save" class="esync-btn" style="width:100%;margin-top:7px">Sprawdź ponownie</button><button id="esync-confirm-save" class="esync-btn good" style="width:100%;margin-top:7px">Potwierdzam, że zapisano</button><button id="esync-reject-save" class="esync-btn danger" style="width:100%;margin-top:7px">Eventis zgłosił błąd</button></div></div>`;
    if(!state.pendingOperation) {
      if(state.status==="SAVED") return `<div class="esync-card"><div class="esync-success"><b>✓ Zapis Eventis potwierdzony</b><div class="esync-small">Rozliczono wyłącznie terminy przypisane do operacji.</div></div></div>`;
      if(state.status==="SAVE_ERROR") return `<div class="esync-card"><div class="esync-danger"><b>✕ Błąd zapisu Eventis</b><div class="esync-small">${esc(state.lastError||"Zapis nie został potwierdzony.")}</div></div></div>`;
      return "";
    }
    if(state.pendingLooksSaved) return `<div class="esync-card"><div class="esync-warning"><b>⚠ Formularz zawiera oczekiwane terminy, zapis wymaga potwierdzenia</b><div class="esync-small">Nie wykryłem jednoznacznego komunikatu sukcesu Eventis. Jeżeli zapis rzeczywiście się udał, potwierdź ręcznie.</div><button id="esync-confirm-save" class="esync-btn good" style="width:100%;margin-top:7px">Potwierdzam: Eventis zapisał zmiany</button></div></div>`;
    if(state.pendingOperation.createdPageLoadId===PAGE_LOAD_ID && state.pendingOperation.status==="WAITING_FOR_SAVE") return `<div class="esync-card"><div class="esync-warning"><b>1/2 Formularz wypełniony — jeszcze niezapisany</b><div class="esync-small">Sprawdź dane i użyj przycisku „Zapisz kartę”. Rozszerzenie nie zapisze ich bez Twojej decyzji.</div></div></div>`;
    if(state.pendingOperation.status==="SAVE_SUBMITTED") return `<div class="esync-card"><div class="esync-warning"><b>Nie udało się automatycznie potwierdzić zapisu.</b><button id="esync-check-save" class="esync-btn" style="width:100%;margin-top:7px">Sprawdź ponownie</button><button id="esync-confirm-save" class="esync-btn good" style="width:100%;margin-top:7px">Potwierdzam, że zapisano</button><button id="esync-reject-save" class="esync-btn danger" style="width:100%;margin-top:7px">Eventis zgłosił błąd</button></div></div>`;
    return `<div class="esync-card"><div class="esync-warning"><b>Nie udało się automatycznie potwierdzić zapisu.</b><div class="esync-small">Nie wszystkie terminy są widoczne w formularzu po ponownym otwarciu.</div><button id="esync-check-save" class="esync-btn" style="width:100%;margin-top:7px">Sprawdź ponownie</button><button id="esync-confirm-save" class="esync-btn good" style="width:100%;margin-top:7px">Potwierdzam, że zapisano</button><button id="esync-reject-save" class="esync-btn danger" style="width:100%;margin-top:7px">Eventis zgłosił błąd</button></div></div>`;
  }

  function renderManualCard() {
    const matches=state.manualMatches||[];
    const deconf=deconfirmedExistingMatches();
    const podglad=state.manualPreview;
    const listaPodgladu=podglad?.records||[];
    return `<div class="esync-card">
      <details ${(matches.length||podglad)?'open':''}><summary><b>Ręczny import do kolejki Eventis</b></summary>
      <div class="esync-small esync-muted" style="margin:6px 0">Wklej pełne rekordy arkusza albo samą listę terminów dla bieżącego tytułu „${esc(getEventisTitle()||state.eventisTitle||'(brak tytułu)')}”.</div>
      <textarea id="esync-manual-paste" class="esync-textarea" placeholder="2026-09-28 do 2026-09-29 | ONLINE"></textarea>
      <div class="esync-grid2" style="margin-top:5px"><button id="esync-parse-manual" class="esync-btn">Pełne rekordy</button><button id="esync-analizuj-liste-terminow" class="esync-btn primary">Lista terminów</button></div>
      ${podglad?`<div class="esync-manual-preview"><div class="esync-section-title"><span>Podgląd importu</span><span class="esync-small">bez zapisu do kolejki</span></div><div class="esync-import-summary"><span>Wykryto rekordów: <b>${podglad.records.length}</b></span><span>Do dodania: <b>${podglad.queueItems.length}</b></span><span>Odpotwierdzone: <b>${podglad.deconfirmed}</b></span><span>Duplikaty: <b>${podglad.duplicates}</b></span><span>Błędy: <b>${podglad.errors}</b></span></div><button id="esync-add-import-queue" class="esync-btn primary" style="width:100%;margin:6px 0" ${podglad.queueItems.length?'':'disabled'}>Dodaj ${podglad.queueItems.length} pozycji do kolejki Eventis</button>${listaPodgladu.map(rekord=>`<div class="esync-import-row"><div><span class="esync-badge ${rekord.status==='CONFIRMED'?'green':'red'}">${rekord.status==='CONFIRMED'?'POTWIERDZONE':'ODPOTWIERDZONE'}</span><div class="esync-term-main">${esc(rekord.title||'(brak tytułu)')}</div><div class="esync-term-sub">${esc(rekord.start||'?')}${rekord.end&&rekord.end!==rekord.start?` → ${esc(rekord.end)}`:''} · ${esc(rekord.city||'?')}${rekord.participants!=null?` · ${esc(rekord.participants)} uczestn.`:''}</div>${rekord.error?`<div class="esync-small esync-danger">${esc(rekord.error)}</div>`:''}</div><span class="esync-small">${rekord.status==='DECONFIRMED'?'pominięty przy dodawaniu':''}</span></div>`).join('')}${(podglad.bledyWalidacji||[]).map(blad=>`<div class="esync-small esync-danger">Wiersz ${esc(blad.lineNumber)}: ${esc(blad.error)}</div>`).join('')}</div>`:''}
      ${matches.length?`<div class="esync-divider"></div><b class="esync-small">Rekordy pasujące do bieżącego szkolenia:</b>${matches.slice(0,8).map(r=>`<div class="esync-term"><div><div class="esync-term-main">${r.status==="CONFIRMED"?'✓ POTWIERDZONE':'↘ ODPOTWIERDZONE'} · ${esc(r.start||'?')}${r.end&&r.end!==r.start?` → ${esc(r.end)}`:''} · ${esc(r.city||'?')}</div><div class="esync-term-sub">${r.error?`BŁĄD: ${esc(r.error)}`:`Dopasowanie tytułu ${Math.round((r.similarity||0)*100)}%`}</div></div><span class="esync-badge ${r.status==='CONFIRMED'?'green':'red'}">${r.status==='CONFIRMED'?'MA BYĆ':'USUŃ'}</span></div>`).join('')}`:''}
      ${deconf.length?`<div class="esync-danger"><b>Wykryto ODPOTWIERDZONE terminy obecne w Eventis</b>${deconf.map(x=>`<button class="esync-btn danger" data-highlight-remove="${esc(x.event.id)}" style="width:100%;margin-top:5px">Podświetl ${esc(x.record.start)} · ${esc(x.record.city)}</button>`).join('')}<div class="esync-small" style="margin-top:5px">v0.1 tylko podświetla dokładny termin do usunięcia. Automatyczne usuwanie dodamy po potwierdzeniu stabilnego selektora Eventis i reguły „minimum jeden termin”.</div></div>`:''}
      </details>
    </div>`;
  }

  function kandydaciBiezacegoOgloszenia() {
    const ogloszenie = NARZEDZIA_LISTY.pobierzBiezaceOgloszenie(document,location.href);
    if (!ogloszenie) return [];
    return NARZEDZIA_LISTY.pogrupujElementyKolejki(state.eventisImportQueue,state.organization)
      .filter(grupa => NARZEDZIA_LISTY.rozwiazGrupeTytulu(grupa,[ogloszenie],state.organization).status === "AUTO_MATCH");
  }

  function renderujBiezaceOgloszenie() {
    const identyfikator = NARZEDZIA_LISTY.pobierzIdEventisZUrl(location.href);
    return kandydaciBiezacegoOgloszenia().map(grupa => `<div class="esync-info"><div class="esync-small">${esc(grupa.tytul)}</div><button class="esync-btn" data-biezace-ogloszenie="${esc(grupa.klucz)}">Użyj bieżącego ogłoszenia #${esc(identyfikator)}</button></div>`).join("");
  }

  function statusyBiezacejKarty() {
    const statusZrodla = state.status === "SEARCHING" || ["LOADING_SOURCE","LOADING_MAPPING"].includes(state.status) ? "SEARCHING"
      : ["SEARCH_NETWORK","MAPPING_ERROR"].includes(state.status) ? "ERROR"
      : state.status === "TITLE_CHANGED" ? "UNKNOWN" : state.statusZrodla
      || (state.status === "SEARCH_EMPTY" ? "NOT_FOUND"
      : ["SEARCH_MULTIPLE","SEARCH_WEAK","SEARCH_CHOICES"].includes(state.status) ? "AMBIGUOUS"
      : state.source ? "FOUND" : "UNKNOWN");
    return {zrodlo:NARZEDZIA_KOLEJKI.opiszStatusPowiazania(statusZrodla,"zrodlo",state.organization),
      ogloszenie:NARZEDZIA_KOLEJKI.opiszStatusPowiazania(MODE === "edit" ? "FOUND" : "CREATE_NEW","eventis")};
  }

  function renderujZnacznikiKarty() {
    return Object.values(statusyBiezacejKarty()).map(status => `<span class="esync-badge ${status.klasa}">${esc(status.etykieta)}</span>`).join(" ");
  }

  function renderujTerminyKolejkiFormularza() {
    const dopasowania = dopasowaniaKolejkiDoBiezacegoTytulu(true);
    const gotowe = gotoweDopasowaniaKolejki();
    const podsumowanie = NARZEDZIA_KOLEJKI.podsumujKolejke(dopasowania.map(wpis => wpis.element));
    const wiersze = dopasowania.map(dopasowanie => {
      const element = dopasowanie.element;
      const termin = dopasowanie.terminy[0];
      const zrodlo = NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,state.sourceTerms)[0];
      const potwierdzonyZrodlem = zrodlo?.confirmedOnSemper ?? zrodlo?.confirmed ?? false;
      const potwierdzonyKolejka = element.recordStatus === "CONFIRMED";
      const status = NARZEDZIA_KOLEJKI.opiszStatusElementu(element);
      const istnieje = (state.zapisaneTerminyEventis || []).some(wpis => termin ? existingKey(wpis) === existingKey(termin)
        : NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,[wpis]).length);
      const wFormularzu = getExistingTerms().some(wpis => termin ? existingKey(wpis) === existingKey(termin)
        : NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,[wpis]).length);
      const edycja = ["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status) && (!zrodlo || zrodlo.price == null || String(zrodlo.price).trim() === "" || !Number.isFinite(Number(zrodlo.price)) || Number(zrodlo.price) < 0);
      return `<div class="esync-wiersz-kolejki" data-element-kolejki="${esc(element.id)}"><div class="esync-term-main">${esc(element.start || "Brak daty")} — ${esc(element.end || "Brak daty końcowej")} · ${esc(element.city || "Brak lokalizacji")} · ${element.participants == null ? "brak liczby uczestników" : esc(element.participants) + " osób"}</div>
        <div class="esync-row esync-wrap">${potwierdzonyKolejka && !potwierdzonyZrodlem ? '<span class="esync-badge purple">POTW. Z KOLEJKI</span>' : ''}<span class="esync-badge ${potwierdzonyZrodlem ? 'green' : !zrodlo && state.source ? 'blue' : 'gray'}">${esc(state.organization)}: ${!zrodlo ? state.source ? 'brak terminu na stronie źródłowej' : 'termin niezweryfikowany' : potwierdzonyZrodlem ? 'potwierdzony' : 'niepotwierdzony'}</span><span class="esync-badge ${potwierdzonyKolejka ? 'purple' : 'yellow'}">KOLEJKA: ${potwierdzonyKolejka ? 'potwierdzony' : 'odpotwierdzony'}</span><span class="esync-badge ${istnieje ? 'green' : wFormularzu ? 'yellow' : 'gray'}">EVENTIS: ${istnieje ? 'termin istnieje' : wFormularzu ? 'w formularzu — zapis niepotwierdzony' : 'brak terminu'}</span><span class="esync-badge ${status.klasa}" data-status-zapisu="${esc(element.status)}">ZAPIS: ${esc(status.etykieta)}</span></div>
        ${["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status) ? `<div class="esync-small">${gotowe.some(wpis => wpis.element.id === element.id) ? "🟢 Gotowy do dodania" : "🟠 Wymaga sprawdzenia: " + esc(powodBlokadyKolejki(dopasowanie) || element.errorMessage || "Ponów po sprawdzeniu rekordu lub konfliktu z innym terminem.")}</div>` : ""}
        ${element.errorMessage ? `<div class="esync-warning esync-small">${esc(element.errorMessage)}</div>` : ''}
        ${edycja && potwierdzonyKolejka ? `<details class="esync-dane-terminu"><summary>Sprawdź i uzupełnij dane terminu</summary><div class="esync-pola-terminu"><label>Data początkowa<input type="date" data-pole-terminu="start" value="${esc(element.start)}" ${element.start ? 'readonly' : ''}></label><label>Data końcowa<input type="date" data-pole-terminu="end" value="${esc(element.end)}" ${element.end ? 'readonly' : ''}></label><label>Lokalizacja<input data-pole-terminu="city" value="${esc(element.city)}" ${element.city ? 'readonly' : ''}></label><label>Cena netto (zł)<input type="number" min="0" step="0.01" data-pole-terminu="price" value="${esc(element.recznieZweryfikowanyTermin?.price ?? '')}"></label></div><label><input type="checkbox" data-zgoda-terminu> Sprawdziłem daty, lokalizację i cenę. Akceptuję użycie danych kolejki bez potwierdzenia na stronie źródłowej.</label><button type="button" class="esync-btn" data-zatwierdz-dane="${esc(element.id)}">Zatwierdź dane terminu</button></details>` : ''}
        ${["ERROR","NEEDS_ATTENTION"].includes(element.status) ? `<button type="button" class="esync-btn" data-queue-retry="${esc(element.id)}">Ponów po sprawdzeniu</button>` : ''}</div>`;
    }).join("");
    const zapisane = dopasowania.filter(wpis => ["DONE","COMPLETED_EXISTING"].includes(wpis.element.status)).length;
    const oczekujace = gotowe.length;
    const uwaga = dopasowania.filter(wpis => ["PENDING","ERROR","NEEDS_ATTENTION"].includes(wpis.element.status)
      && !gotowe.some(gotowy => gotowy.element.id === wpis.element.id)).length;
    const otwarta = $("#esync-kolejka-ogloszenia")?.open;
    return `<details id="esync-kolejka-ogloszenia" data-wersja-terminow="2026-10-26" class="esync-card esync-kolejka-ogloszenia" ${otwarta ? 'open' : ''}><summary><b>📥 Kolejka dla tego ogłoszenia (${dopasowania.length})</b><span class="esync-import-summary"><span>Do dodania: <b>${oczekujace}</b></span><span>Czeka na zapis: <b>${podsumowanie.waitingForSave}</b></span><span>Zapisane: <b>${zapisane}</b></span><span>Uwaga: <b>${uwaga}</b></span></span></summary>${wiersze || '<div class="esync-small">Brak przypisanych rekordów.</div>'}<div class="esync-small" role="status">${esc(natywneDodawanie.komunikat || 'Przycisk dodawania jest rozpoznawany automatycznie. Ręczne rozpoznanie jest opcją awaryjną.')}<br><button type="button" class="esync-btn" id="esync-rozpoznaj-dodawanie" ${state.trwaWypelnianieOperacji || state.trwaWprowadzanieKolejki || state.trwaDodawanieZrodla || czyTrwaZapis() ? 'disabled' : ''}>Rozpoznaj natywne dodawanie</button></div></details>`;
  }

  async function zatwierdzDaneTerminu(przycisk) {
    const wiersz = przycisk.closest("[data-element-kolejki]");
    if (!wiersz.querySelector("[data-zgoda-terminu]")?.checked) return toast("Najpierw sprawdź dane i zaakceptuj ich wykorzystanie.");
    const dopasowanie = dopasowaniaKolejkiDoBiezacegoTytulu(true).find(wpis => wpis.element.id === przycisk.dataset.zatwierdzDane);
    if (!dopasowanie) return toast("Przypisanie terminu zmieniło się. Odśwież formularz.");
    const dane = Object.fromEntries(Array.from(wiersz.querySelectorAll("[data-pole-terminu]"),pole => [pole.dataset.poleTerminu,pole.value.trim()]));
    if (!dane.price) return toast("Podaj zweryfikowaną cenę netto.");
    dane.price = Number(dane.price);
    const element = {...dopasowanie.element,start:dane.start,end:dane.end,city:dane.city,recznieZweryfikowanyTermin:dane};
    if (["start","end","city"].some(pole => dopasowanie.element[pole] && dopasowanie.element[pole] !== dane[pole])) return toast("Dane muszą odpowiadać terminowi kolejki.");
    const termin = NARZEDZIA_KOLEJKI.przygotujZweryfikowanyTermin(element);
    if (!termin || (termin.city !== "Online" && REGIONS[termin.city] == null)) return toast("Sprawdź poprawność dat, ceny i obsługiwanej lokalizacji.");
    element.recordKey = NARZEDZIA_ARKUSZA.recordKey({...element,status:element.recordStatus});
    element.signature = NARZEDZIA_KOLEJKI.kluczKolejki(element.organization,element.recordKey);
    await zaktualizujBiezacaKolejke(kolejka => kolejka.map(wpis => wpis.id === element.id && ["PENDING","ERROR","NEEDS_ATTENTION"].includes(wpis.status)
      ? {...element,status:"PENDING",operationId:null,errorMessage:""} : wpis));
    przycisk.blur();
    render();
  }

  function odswiezSekcjeKolejkiFormularza() {
    document.querySelectorAll('#eventForm #esync-terminy-formularza.esync-card').forEach(sekcja => sekcja.remove());
  }

  function renderKolejkaCard() {
    return renderujTerminyKolejkiFormularza();
  }

  async function renderOutboxStatus() {
    const {sheetOutbox=[]}=await storageGet(["sheetOutbox"]);
    const pending=sheetOutbox.filter(x=>x.status!=="DONE"&&x.status!=="CANCELLED").length;
    const el=$("#esync-outbox-count"); if(el) el.textContent=String(pending);
  }

  function renderujPrzyciskKolejki(gotowe = gotoweDopasowaniaKolejki()) {
    const fioletowy = gotowe.some(czyTerminKolejkiNiepotwierdzonyNaZrodle);
    const trwa = state.trwaWprowadzanieKolejki || state.trwaWypelnianieOperacji || state.trwaDodawanieZrodla || state.trwaRozpoznawanieNatywne;
    return `<button type="button" id="esync-add-queue-terms" class="esync-btn esync-przycisk-kolejki ${fioletowy ? 'purple' : 'good'}" aria-busy="${!!trwa}" ${!gotowe.length || trwa || czyTrwaZapis() ? 'disabled' : ''}>${trwa ? 'Wprowadzanie terminów…' : `Wprowadź terminy z kolejki (${gotowe.length})`}</button>`;
  }

  function render() {
    let root=$("#esync-root");
    if(!root){root=document.createElement("aside");root.id="esync-root";document.body.appendChild(root);}
    const przewiniecie = $(".esync-body",root)?.scrollTop || 0;
    const szkiceKolejki = $$('[data-element-kolejki]',root).map(wiersz => ({
      id:wiersz.dataset.elementKolejki, otwarty:wiersz.querySelector("details")?.open,
      pola:$$('input',wiersz).map(pole => ({wartosc:pole.value,zaznaczony:pole.checked,aktywny:pole === document.activeElement}))
    }));
    const zamknijKarte=state.analizaTerminowWykonana&&!state.analizaWykazalaBraki&&!state.formularzZmieniony;
    const liczbaPotwierdzonych=potwierdzoneZapisaneTerminy().length;
    const dopasowaniaKolejki=dopasowaniaKolejkiDoBiezacegoTytulu();
    const gotoweTerminyKolejki=gotoweDopasowaniaKolejki();
    const liczbaNiepotwierdzonychNaZrodle=gotoweTerminyKolejki.filter(czyTerminKolejkiNiepotwierdzonyNaZrodle).length;
    root.innerHTML=`<div class="esync-head"><div class="esync-head-text"><div class="esync-head-title">Asystent Eventis</div><div class="esync-head-sub">v${VERSION} · operator ${esc(state.settings.operatorInitial||'K')} · outbox <span id="esync-outbox-count">0</span></div></div><div class="esync-head-actions"><button type="button" class="esync-icon-btn esync-przelacznik-organizatora" id="esync-org" role="switch" aria-checked="${state.organization==='IIST'}" aria-label="Źródło szkolenia: SEMPER lub IIST" title="Zmień źródło na ${state.organization==='SEMPER'?'IIST':'SEMPER'}"><span class="${state.organization==='SEMPER'?'esync-organizator-aktywny semper':''}">SEMPER</span><span class="${state.organization==='IIST'?'esync-organizator-aktywny iist':''}">IIST</span></button><button class="esync-icon-btn" id="esync-settings" title="Ustawienia">⚙</button><button class="esync-icon-btn esync-collapse" id="esync-collapse" title="Zwiń">−</button></div></div><div class="esync-body">${renderKolejkaCard()}${renderujWeryfikacjeOtwartejKarty()}${renderujAkcjeZrodla()}${renderMappingCard()}${MODE === "add" ? '<div id="esync-kategorie"></div>' : ""}${renderTermsCard()}${renderPendingCard()}${renderujBiezaceOgloszenie()}<div class="esync-footer">TYLKO POTWIERDZONE</div></div><div class="esync-panel-action">${liczbaNiepotwierdzonychNaZrodle?`<div class="esync-alarm-kolejki" style="margin-top:0">POTW. Z KOLEJKI: ${liczbaNiepotwierdzonychNaZrodle} · ${esc(state.organization)} jeszcze nie oznacza potwierdzenia</div>`:''}${renderujPrzyciskKolejki(gotoweTerminyKolejki)}<button id="esync-add-missing" class="esync-btn good" ${!state.mappingVerifiedThisSession||!state.missingTerms.some(termin => ((termin.confirmedOnSemper ?? termin.confirmed) || termin.confirmedManually) && !termin.confirmationConflict)||state.trwaDodawanieZrodla||state.trwaWprowadzanieKolejki||state.trwaRozpoznawanieNatywne?'disabled':''}>Uzupełnij brakujące potwierdzone (${state.missingTerms.filter(termin => ((termin.confirmedOnSemper ?? termin.confirmed) || termin.confirmedManually) && !termin.confirmationConflict).length})</button><button id="esync-queue-existing" class="esync-btn" ${!state.mappingVerifiedThisSession||!liczbaPotwierdzonych?'disabled':''}>Zarejestruj potwierdzone, które już istnieją</button><button id="esync-panel-action" data-action="${zamknijKarte?'save-close':'save'}" class="esync-btn ${zamknijKarte?'primary':'good'}" ${(!zamknijKarte&&!state.formularzZmieniony)||state.pendingOperation?.status==='SAVE_SUBMITTED'?'disabled':''}>${zamknijKarte?'Zapisz i wróć do listy':'Zapisz kartę'}</button></div>`;
    $(".esync-head-title",root).textContent = "Asystent Eventis";
    $(".esync-head-sub",root).remove();
    const naglowek = $(".esync-head",root);
    naglowek.style.cursor = "move";
    naglowek.style.touchAction = "none";
    naglowek.addEventListener("pointerdown",zdarzenie => {
      if (zdarzenie.button !== 0 || zdarzenie.target.closest("button")) return;
      zdarzenie.preventDefault();
      const prostokat = root.getBoundingClientRect();
      const przesuniecieX = zdarzenie.clientX - prostokat.left;
      const przesuniecieY = zdarzenie.clientY - prostokat.top;
      const przesun = ruch => {
        root.style.right = "auto";
        root.style.left = `${Math.max(0,Math.min(window.innerWidth - prostokat.width,ruch.clientX - przesuniecieX)) / (Number(getComputedStyle(root).zoom) || 1)}px`;
        root.style.top = `${Math.max(0,Math.min(window.innerHeight - prostokat.height,ruch.clientY - przesuniecieY)) / (Number(getComputedStyle(root).zoom) || 1)}px`;
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
    if (!NARZEDZIA_OPERACJI.czyMoznaRozpoczacZapis(state.zapis,state.trwaRozpoczynanieZapisu)) $("#esync-panel-action").disabled = true;
    odswiezSekcjeKolejkiFormularza();
    bindUI();
    for (const szkic of szkiceKolejki) {
      const wiersz = $$('[data-element-kolejki]',root).find(element => element.dataset.elementKolejki === szkic.id);
      if (!wiersz) continue;
      const szczegoly = wiersz.querySelector("details");
      if (szczegoly) szczegoly.open = !!szkic.otwarty;
      $$('input',wiersz).forEach((pole,indeks) => {
        const zapis = szkic.pola[indeks];
        if (!zapis) return;
        pole.value = zapis.wartosc;
        pole.checked = zapis.zaznaczony;
        if (zapis.aktywny) pole.focus({preventScroll:true});
      });
    }
    $(".esync-body",root).scrollTop = przewiniecie;
    if (MODE === "add" && globalThis.KontrolerKategoriiEventis) {
      kontrolerKategorii ||= globalThis.KontrolerKategoriiEventis.utworzKontrolerKategorii(document,pobierzTekstDlaKategorii);
      kontrolerKategorii.podlacz($("#esync-kategorie",root));
    }
    renderOutboxStatus();
  }

  function bindUI() {
    $$('[data-biezace-ogloszenie]',$("#esync-root") || document).forEach(przycisk => przycisk.addEventListener("click",async () => {
      const grupa = kandydaciBiezacegoOgloszenia().find(grupa => grupa.klucz === przycisk.dataset.biezaceOgloszenie);
      if (!grupa) return;
      const identyfikator = NARZEDZIA_LISTY.pobierzIdEventisZUrl(location.href);
      const dane = await storageGet([MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]);
      await chrome.storage.local.set({[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN]:MAPOWANIA_WYDARZEN.zapiszMapowanie(dane[MAPOWANIA_WYDARZEN.KLUCZ_STORAGE_MAPOWAN],{
        organization:state.organization,sourceTitle:grupa.tytul,normalizedTitle:grupa.klucz,eventId:identyfikator,eventUrl:location.href,eventTitle:getEventisTitle(),resolutionSource:"manual"
      })});
      state.przypisaneRecznieBiezacejKarty = [...new Set([...state.przypisaneRecznieBiezacejKarty,...grupa.elementy.map(element => element.id)])];
      toast(`Zapamiętano bieżące ogłoszenie #${identyfikator}.`);
      render();
    }));
    $("#esync-collapse")?.addEventListener("click",()=>{$("#esync-root")?.classList.toggle("esync-collapsed");});
    $("#esync-settings")?.addEventListener("click",()=>chrome.runtime.sendMessage({type:"OPEN_OPTIONS"}));
    $("#esync-org")?.addEventListener("click",()=>switchOrganization(state.organization==="SEMPER"?"IIST":"SEMPER"));
    $("#esync-load-url")?.addEventListener("click",onLoadUrl);
    $("#esync-search")?.addEventListener("click",onSearch);
    $("#esync-open-source")?.addEventListener("click",()=>{if(state.source?.url)window.open(state.source.url,"_blank","noopener");});
    $("#esync-forget")?.addEventListener("click",async()=>{if(confirm("Usunąć zapamiętane powiązanie dla tego ogłoszenia? Oczekiwanie na wcześniejszy zapis zostanie przerwane bez usuwania danych z formularza.")){await forgetMapping();render();}});
    $("#esync-release-operation")?.addEventListener("click",async()=>{
      if (await zwolnijOczekujacaOperacje()) {
        compareTerms();
        render();
        toast("Blokada zwolniona. Sprawdź dane formularza przed zapisem.");
      }
    });
    $("#esync-verify")?.addEventListener("click",verifyMapping);
    $("#esync-refresh")?.addEventListener("click",()=>{compareTerms();render();});
    $$('[data-reczne-potwierdzenie]',$("#esync-root")||document).forEach(przycisk=>przycisk.addEventListener("click",()=>przelaczRecznePotwierdzenie(przycisk.dataset.recznePotwierdzenie)));
    $("#esync-rozpoznaj-dodawanie")?.addEventListener("click",rozpoznajNatywneDodawanie);
    $$('[data-zatwierdz-dane]',$("#esync-root")||document).forEach(przycisk => przycisk.addEventListener("click",() => zatwierdzDaneTerminu(przycisk).catch(blad => toast(blad.message))));
    $("#esync-add-missing")?.addEventListener("click",onAddMissing);
    $("#esync-queue-existing")?.addEventListener("click",queueExistingTerms);
    $("#esync-check-save")?.addEventListener("click",sprawdzPonownieZapis);
    $("#esync-confirm-save")?.addEventListener("click",async()=>{
      zakonczObserwacjeZapisu();
      sessionStorage.removeItem(KLUCZ_OCZEKUJACEGO_ZAPISU);
      state.zapis = {saveState:"SUCCESS"};
      await confirmPendingSaved("USER_CONFIRM");
      compareTerms();
      render();
    });
    $("#esync-reject-save")?.addEventListener("click",()=>{
      zakonczObserwacjeZapisu();
      sessionStorage.removeItem(KLUCZ_OCZEKUJACEGO_ZAPISU);
      sessionStorage.removeItem(KLUCZ_ZAMKNIECIA_PO_ZAPISIE);
      if (state.pendingOperation) oznaczNieudanyZapis();
      else { state.zapis = {saveState:"EXPLICIT_ERROR",przyczyna:"Użytkownik potwierdził błąd Eventis."}; render(); }
    });
    $("#esync-add-import-queue")?.addEventListener("click",dodajPodgladDoKolejki);
    $("#esync-add-queue-terms")?.addEventListener("click",obsluzKlikniecieKolejki);
    $$('[data-queue-retry]',$("#esync-root")||document).forEach(btn=>btn.addEventListener("click",()=>ponowKolejke(btn.dataset.queueRetry)));
    $("#esync-panel-action")?.addEventListener("click",wykonajAkcjePanelu);
    $$('[data-choice-url]',$("#esync-root")||document).forEach(btn=>btn.addEventListener("click",()=>chooseSearchResult(btn.dataset.choiceUrl)));
    $("#esync-parse-manual")?.addEventListener("click",async()=>{
      const raw=$("#esync-manual-paste")?.value||"";
      const records=parseManualPaste(raw);
      if(!records.length)return toast("Nie znaleziono rekordów POTWIERDZONE SZKOLENIE ani ODPOTWIERDZONE.");
      await saveManualSnapshot(records,raw);render();toast(`Rozpoznano ${records.length} rekordów.`);
    });
    $("#esync-analizuj-liste-terminow")?.addEventListener("click",async()=>{
      const raw=$("#esync-manual-paste")?.value||"";
      const analiza=NARZEDZIA_ARKUSZA.analizujListeTerminow(raw,{title:getEventisTitle()||state.eventisTitle});
      if(!analiza.records.length&&!analiza.errors.length)return toast("Wklej co najmniej jeden termin.");
      await saveManualSnapshot(analiza.records,raw,analiza.errors);
      render();
      toast(`Rozpoznano ${analiza.records.length} terminów. Błędy: ${analiza.errors.length}.`);
    });
    $$('[data-highlight-remove]',$("#esync-root")||document).forEach(btn=>btn.addEventListener("click",()=>highlightDeconfirmedTerm(btn.dataset.highlightRemove)));
  }

  function observeTitleChanges() {
    const field=$('textarea[name="event[title]"],input[name="event[title]"],#title');
    if(!field)return;
    let czasomierz=null;
    const oznaczZmiane=()=>{
      clearTimeout(czasomierz);
      czasomierz=setTimeout(()=>{
        const nowyTytul=getEventisTitle();
        if(normalize(nowyTytul)===normalize(state.eventisTitle))return;
        state.eventisTitle=nowyTytul;
        state.searchRequestId++;
        state.mappingVerifiedThisSession=false;
        state.searchChoices=[];
        state.manualMatches=matchManualRecordsToCurrent(state.manualRecords);
        uzupelnijWymaganeFormyZajec().then(aktualizujStanPrzyciskuPanelu);
        if(state.source||state.searchAttempted){
          state.status="TITLE_CHANGED";
          state.statusZrodla="UNKNOWN";
          state.searchMessage="Tytuł Eventis zmienił się. Dotychczasowy wynik może być nieaktualny — uruchom wyszukiwanie ponownie.";
        }
        render();
      },500);
    };
    field.addEventListener("input",oznaczZmiane);
    field.addEventListener("change",oznaczZmiane);
    field.addEventListener("blur",()=>{
      oznaczZmiane();
      if(MODE==="edit"&&!state.mapping)setTimeout(()=>{if(state.status==="TITLE_CHANGED")onSearch();},850);
    });
  }

  async function uzupelnijTytulNowegoOgloszenia() {
    if (MODE !== "add" || !new URLSearchParams(location.search).get("esyncSession")) return;
    try {
      const {wpis} = await chrome.runtime.sendMessage({type:"POBIERZ_NOWY_TYTUL"});
      if (!wpis) return;
      if (typeof state !== "undefined") state.tytulSemperNowegoOgloszenia = wpis.tytul;
      let znaleziono = false;
      try {
        for (let proba = 0; proba < 100; proba++) {
          const pole = $('input[name="event[title]"],textarea[name="event[title]"],#title');
          if (pole) {
            znaleziono = true;
            if (!pole.value) setValue(pole,wpis.tytul);
            return;
          }
          await sleep(100);
        }
      } finally {
        if (!znaleziono) console.warn("Eventis: nie znaleziono pola tytułu nowego ogłoszenia",wpis.taskId);
        await chrome.runtime.sendMessage({type:"USUN_NOWY_TYTUL"});
      }
    } catch (blad) {
      console.warn("Eventis: nie udało się uzupełnić tytułu nowego ogłoszenia",blad);
    }
  }

  async function init() {
    await uzupelnijTytulNowegoOgloszenia();
    await loadSettingsAndState();
    if (state.organization) await zweryfikujKarteSesjiOtwarcia();
    if (state.organization) przywrocOczekujacyZapis();
    render();
    obserwujZmianyFormularza();
    obserwujRecznyZapisFormularza();
    observeTitleChanges();
    obserwujOrganizatora();
    chrome.storage.onChanged.addListener((zmiany, obszar) => {
      if (obszar !== "local" || !zmiany.eventisImportQueue) return;
      state.eventisImportQueue = Array.isArray(zmiany.eventisImportQueue.newValue) ? zmiany.eventisImportQueue.newValue : [];
      compareTerms();
      render();
    });
    const obserwatorFormularza = new MutationObserver(zmiany => {
      if (!zmiany.some(zmiana => !zmiana.target.closest?.("#esync-root,#esync-terminy-formularza,.esync-toast"))) return;
      odswiezSekcjeKolejkiFormularza();
    });
    obserwatorFormularza.observe(document.body,{childList:true,subtree:true});
    if (MODE === "edit") {
      await uzupelnijWymaganeFormyZajec();
      aktualizujStanPrzyciskuPanelu();
    }
    if (state.organization) await inspectPendingAfterReload();
    if(state.pendingLooksSaved) render();
    if(state.organization && state.mapping) await loadRememberedMapping();
    else if (state.organization) {
      // Uczymy się aliasów tylko jako sugestii: nie przypisujemy automatycznie nowego Eventis ID bez kontroli użytkownika.
      const {mappings={}}=await storageGet(["mappings"]);
      const aliases=Object.values(mappings).filter(m=>m.organization===state.organization&&m.eventisEventId!==state.eventisId).map(m=>({...m,aliasScore:titleSimilarity(state.eventisTitle,m.eventisTitle)})).filter(m=>m.aliasScore>=.93).sort((a,b)=>b.aliasScore-a.aliasScore);
      if(aliases.length){
        state.searchChoices=aliases.slice(0,3).map(m=>({url:m.sourceUrl,title:`[z pamięci] ${m.sourceTitle}`,similarity:m.aliasScore}));
        state.status="SEARCH_CHOICES";render();
      }
      if(MODE==="edit"&&state.eventisTitle){
        const identyfikatorWyszukiwania = state.searchRequestId;
        const kontekst = state.kontekstWydarzenia;
        const organizacja = state.organization;
        setTimeout(()=>{
          if (identyfikatorWyszukiwania === state.searchRequestId && kontekst === state.kontekstWydarzenia
            && state.organization === organizacja && state.sposobWyboruZrodla === "AUTO") onSearch();
        },350);
      }
    }
    if (state.organization) await uruchomAutomatycznaKolejkeJesliGotowa();
  }

  init().catch(e=>{console.error("Eventis Sync init",e);state.status="ERROR";state.lastError=e.message;render();});
})();
