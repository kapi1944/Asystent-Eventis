(() => {
  "use strict";

  if (!/\/event\/(?:add|edit)(?:\/|$|\?)/.test(location.pathname + location.search)) return;
  if (window.__EVENTIS_SYNC_V010__) return;
  window.__EVENTIS_SYNC_V010__ = true;

  const VERSION = "0.1.0";
  const PAGE_LOAD_ID = crypto.randomUUID();
  const MODE = location.pathname.startsWith("/event/edit") ? "edit" : "add";
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
  if (!KONFIGURACJA) throw new Error("Nie załadowano wspólnej konfiguracji.");
  if (!NARZEDZIA_WYSZUKIWANIA) throw new Error("Nie załadowano modułu wyszukiwania.");
  if (!NARZEDZIA_TERMINOW) throw new Error("Nie załadowano modułu terminów.");
  if (!NARZEDZIA_ARKUSZA) throw new Error("Nie załadowano modułu arkusza.");
  if (!NARZEDZIA_KOLEJKI) throw new Error("Nie załadowano modułu kolejki Eventis.");
  if (!NARZEDZIA_OPISOW_SEMPER) throw new Error("Nie załadowano parsera opisów SEMPER.");
  if (!NARZEDZIA_OPERACJI) throw new Error("Nie załadowano obsługi operacji Eventis.");
  if (!NARZEDZIA_LISTY) throw new Error("Nie załadowano obsługi listy Eventis.");
  if (!NARZEDZIA_POL_RICH_TEXT) throw new Error("Nie załadowano obsługi pól rich-text.");
  const DEFAULT_SETTINGS = KONFIGURACJA.DEFAULT_SETTINGS;
  const PROGI_WYSZUKIWANIA = Object.freeze({
    AUTO_AKCEPTACJA: 0.84,
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
    organization: "SEMPER",
    organizationDetectedBy: "default",
    eventisId: "",
    eventisTitle: "",
    mapping: null,
    source: null,
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
    pendingOperation: null,
    pendingLooksSaved: false,
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
    return termin.confirmed || state.reczniePotwierdzoneTerminy.has(termKey(termin));
  }
  function dedupeTerms(terms) {
    return NARZEDZIA_TERMINOW.dedupeTerms(terms);
  }

  async function storageGet(keys) { return chrome.storage.local.get(keys); }
  async function storageSet(obj) { return chrome.storage.local.set(obj); }

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

  async function loadSettingsAndState() {
    const data = await storageGet(["settings","mappings","pendingOperations","manualSheetSnapshot","eventisImportQueue"]);
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    state.eventisTitle = getEventisTitle();
    state.eventisId = detectEventisId();
    state.organization = detectOrganization(state.settings);
    const key = mappingKey(state.organization,state.eventisId);
    state.mapping = (data.mappings || {})[key] || null;
    const pendingOperations = data.pendingOperations || {};
    state.pendingOperation = pendingOperations[kluczClaimuBiezacegoFormularza()]
      || NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,state.organization,state.eventisId,state.eventisTitle);
    state.eventisImportQueue = Array.isArray(data.eventisImportQueue) ? data.eventisImportQueue : [];
    if (data.manualSheetSnapshot?.records) {
      state.manualRecords = data.manualSheetSnapshot.records;
      state.manualMatches = matchManualRecordsToCurrent(state.manualRecords);
      state.manualPreview = utworzPodgladImportu(state.manualRecords, data.manualSheetSnapshot.rawText || "");
    }
  }

  function detectOrganization(settings) {
    const body = normalize(document.body.innerText || "");
    const semperMarker = normalize(settings.semperAccountMarker || "");
    const iistMarker = normalize(settings.iistAccountMarker || "");
    if (iistMarker && body.includes(iistMarker)) { state.organizationDetectedBy = "marker"; return "IIST"; }
    if (semperMarker && body.includes(semperMarker)) { state.organizationDetectedBy = "marker"; return "SEMPER"; }
    if (/\biist\b/.test(body) && !/\bsemper\b/.test(body)) { state.organizationDetectedBy = "page"; return "IIST"; }
    if (/\bsemper\b/.test(body) && !/\biist\b/.test(body)) { state.organizationDetectedBy = "page"; return "SEMPER"; }
    state.organizationDetectedBy = "default";
    return settings.defaultOrganization || "SEMPER";
  }

  function mappingKey(org,id) { return `${org}|${id}`; }

  function czyMapowanieDotyczyZrodla(mapowanie, zrodlo) {
    if (!mapowanie || !zrodlo) return false;
    if (zrodlo.id && mapowanie.sourceTrainingId === zrodlo.id) return true;
    return mapowanie.sourceUrl === zrodlo.url;
  }

  async function saveMapping(source, origin="MANUAL_URL") {
    const { mappings = {} } = await storageGet(["mappings"]);
    const key = mappingKey(state.organization,state.eventisId);
    const mapping = {
      mappingId: crypto.randomUUID(),
      organization: state.organization,
      eventisEventId: state.eventisId,
      eventisTitle: state.eventisTitle,
      normalizedEventisTitle: normalize(state.eventisTitle),
      sourceTrainingId: source.id || source.url,
      sourceTitle: source.title,
      sourceUrl: source.url,
      mappingOrigin: origin,
      confidence: titleSimilarity(state.eventisTitle, source.title),
      learnedBy: state.settings.operatorInitial || "K",
      learnedAt: new Date().toISOString(),
      lastVerifiedAt: null,
      status: "ACTIVE"
    };
    mappings[key] = mapping;
    await storageSet({ mappings });
    state.mapping = mapping;
    state.mappingVerifiedThisSession = false;
    await audit("MAPPING_LEARNED", { sourceUrl:source.url, sourceTitle:source.title, origin });
  }

  async function forgetMapping() {
    const { mappings = {} } = await storageGet(["mappings"]);
    const key = mappingKey(state.organization,state.eventisId);
    delete mappings[key];
    await storageSet({ mappings });
    await audit("MAPPING_FORGOTTEN", {});
    state.mapping = null;
    state.source = null;
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
    const raw = [];
    for (const row of $$('table tr',doc)) {
      const text = cleanLine(row.textContent || "");
      const cells = Array.from(row.children).map(td=>cleanLine(td.textContent||""));
      const range = dateRangeFromText(cells[0] || text);
      const city = cityFromText(cells[1] || text);
      const price = priceFromText(cells[3] || text);
      if (!range || !city || !price) continue;
      const confirmed = !!row.querySelector(".gw") || isConfirmedText(text);
      const dostosowanyTermin = zastosujReguleCzterodniowegoTerminu(range.start,range.end,city,price);
      raw.push({...dostosowanyTermin,confirmed,rawText:text});
    }
    return dedupeTerms(raw);
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
              return {...weryfikacja,rawCount:kandydaci.size};
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
    return {...weryfikacja,rawCount:kandydaci.size};
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
    return {...weryfikacja,rawCount:kandydaci.size,form:formularz};
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
    const existing = [];
    for (const row of $$('[id^="li_eventdate_"]')) {
      const id = row.id.split("_").pop();
      const dateStart = row.querySelector(`input[name="eventDate[${id}][date_start]"]`)?.value || row.querySelector(`#eventdate_datestart_${id}`)?.value;
      const dateEnd = row.querySelector(`input[name="eventDate[${id}][date_end]"]`)?.value || row.querySelector(`#eventdate_dateend_${id}`)?.value || dateStart;
      const city = row.querySelector(`input[name="eventDate[${id}][city]"]`)?.value || "";
      const info = row.querySelector(`input[name="eventDate[${id}][info]"]`)?.value || "";
      const type = row.querySelector(`select[name="eventDate[${id}][is_online]"]`)?.value || row.querySelector(`#eventdate_is_online_${id}`)?.value;
      const place = type === "1" ? "Online" : (city || info);
      const price = Number(row.querySelector('input[name*="[price]"]')?.value || 0) || null;
      if (dateStart) existing.push({start:dateStart,end:dateEnd||dateStart,city:cleanLine(place),price,row,id});
    }
    return existing;
  }

  function compareTerms() {
    state.existingTerms = getExistingTerms();
    const existingKeys = new Set(state.existingTerms.map(existingKey));
    const confirmed = state.sourceTerms.filter(czyTerminPotwierdzony);
    state.missingTerms = confirmed.filter(t=>!existingKeys.has(existingKey(t)));
    if (state.analizaTerminowWykonana && state.missingTerms.length) state.analizaWykazalaBraki = true;
  }

  function odciskFormularza() {
    const formularz = $("#eventForm");
    if (!formularz) return "";
    return Array.from(formularz.elements).filter(pole=>!pole.closest("#esync-root")).map((pole, indeks) => {
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
    przycisk.dataset.action = zamknijKarte ? "close" : "save";
    przycisk.textContent = zamknijKarte ? "↺ Wróć do listy" : "Zapisz kartę";
    przycisk.classList.toggle("good",!zamknijKarte);
    przycisk.classList.toggle("primary",zamknijKarte);
    przycisk.disabled = !zamknijKarte && !state.formularzZmieniony;
  }

  function obserwujZmianyFormularza() {
    const formularz = $("#eventForm");
    if (!formularz) return;
    state.poczatkowyOdciskFormularza = odciskFormularza();
    const aktualizujZPoznieniem = zdarzenie => {
      if (!zdarzenie.isTrusted || zdarzenie.target.closest("#esync-root")) return;
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

  function zapiszFormularzZPanelu() {
    if (!state.formularzZmieniony) return;
    const formularz = $("#eventForm");
    if (!formularz) return toast("Nie znaleziono formularza Eventis.");
    const przyciskZapisu = znajdzPrzyciskZapisu();
    if (przyciskZapisu) przyciskZapisu.click();
    else formularz.requestSubmit();
  }

  function wykonajAkcjePanelu() {
    const przycisk = $("#esync-panel-action");
    if (przycisk?.dataset.action === "close") chrome.runtime.sendMessage({type:"CLOSE_TAB"});
    else zapiszFormularzZPanelu();
  }

  function setValue(el,val) {
    if (!el) return;
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto,"value")?.set;
    if (setter) setter.call(el,String(val ?? "")); else el.value = String(val ?? "");
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
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

  function findAddTermButton() {
    const precise = $("#eventForm > div.kt-portlet__body > div > div:nth-child(6) > div:nth-child(3) > div > a");
    if (precise) return precise;
    return $$('a,button').find(el=>/dodaj.*termin|termin/i.test(el.textContent||"")&&!/usuń|usun/i.test(el.textContent||""));
  }

  function fillTerm(form,term) {
    const id = form.id.split("_").pop();
    const typeSelect = $(`#eventdate_is_online_${id}`) || form.querySelector(`select[name="eventDate[${id}][is_online]"]`);
    if (term.city === "Online") {
      setValue(typeSelect,"1");
      setValue(form.querySelector(`textarea[name="eventDate[${id}][online_description]"]`),"-");
    } else {
      setValue(typeSelect,"");
      setValue(form.querySelector(`input[name="eventDate[${id}][info]"]`),term.city);
      setValue(form.querySelector(`select[name="eventDate[${id}][region_id]"]`),REGIONS[term.city] ?? "");
      setValue(form.querySelector(`input[name="eventDate[${id}][city]"]`),term.city);
    }
    setValue($(`#eventdate_datestart_${id}`) || form.querySelector(`input[name="eventDate[${id}][date_start]"]`),term.start);
    setValue($(`#eventdate_dateend_${id}`) || form.querySelector(`input[name="eventDate[${id}][date_end]"]`),term.end);
    setValue(form.querySelector(`select[name="eventDate[${id}][is_guaranteed]"]`),"1");
    const packageName=form.querySelector(`input[name="eventDate[${id}][prices][0][price_name]"]`);
    if (packageName) setValue(packageName,term.city === "Online" ? "szkolenie online" : "szkolenie stacjonarne");
    setValue(form.querySelector(`input[name="eventDate[${id}][prices][0][taxRate]"]`),"23");
    setValue(form.querySelector(`input[name*="[price]"]`),term.price);
    form.querySelectorAll(".event_price_contains").forEach(c=>{
      c.checked = term.city === "Online" ? ["1","2","3"].includes(c.value) : ["1","2","3","4","5"].includes(c.value);
      c.dispatchEvent(new Event("change",{bubbles:true}));
    });
    setValue($(`#price_contains_materials_type_select_${id}_0`),term.city === "Online" ? "1" : "2");
  }

  async function addSelectedTerms(terms) {
    const existing = getExistingTerms();
    const keys = new Set(existing.map(existingKey));
    const toAdd = terms.filter(t=>!keys.has(existingKey(t)));
    if (!toAdd.length) return {added:[],skipped:terms};
    const addButton = findAddTermButton();
    if (!addButton) throw new Error("Nie znaleziono przycisku dodawania terminu w formularzu Eventis.");
    const before = $$('[id^="li_eventdate_"]');
    const need = MODE === "edit" ? toAdd.length : Math.max(0,toAdd.length-before.length);
    for (let i=0;i<need;i++) { addButton.click(); await sleep(120); }
    await sleep(850);
    const forms = $$('[id^="li_eventdate_"]');
    const targets = MODE === "edit" ? forms.slice(-toAdd.length) : forms.slice(0,toAdd.length);
    if (targets.length < toAdd.length) throw new Error("Eventis nie utworzył wymaganej liczby formularzy terminów.");
    targets.forEach((form,i)=>fillTerm(form,toAdd[i]));
    return {added:toAdd,skipped:terms.filter(t=>keys.has(existingKey(t)))};
  }

  async function fillEventDetailsIfAdd(source, terms) {
    if (MODE !== "add") return;
    const liczbaDni = Math.max(1,...terms.map(termin=>durationDays(termin.start,termin.end)));
    const poleCzasuTrwania = $('[name="event[hours]"]') || znajdzPolePoEtykiecie("Godziny zajęć (czas trwania)");
    const czasTrwania = liczbaDni === 1 ? "1 dzień" : `${liczbaDni} dni`;
    setValue($('input[name="event[title]"],textarea[name="event[title]"],#title'),source.title);
    if (poleCzasuTrwania?.name || document.getElementById("eventHours")) await ustawPoleRichText(poleCzasuTrwania?.name,`<p>${czasTrwania}</p>`,{elementId:"eventHours"});
    else setValue(poleCzasuTrwania,czasTrwania);
    await wybierzWygladPodstawowy();
    await uzupelnijWymaganeFormyZajec();
    await uzupelnijIZweryfikujZyciorys();
    await NARZEDZIA_POL_RICH_TEXT.uzupelnijPolaOpisoweJesliDodawanie(
      MODE,
      source.opisy,
      NARZEDZIA_OPISOW_SEMPER.MAPOWANIE_POL_OPISOWYCH,
      ustawPoleRichText
    );
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
      price:termin.price
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
      expectedTerms:terms.map(przygotujTerminDoKolejki),
      queueItemIds:[...queueItemIds],
      skipSheetOutbox:queueItemIds.length>0,
      operator:state.settings.operatorInitial || "K",
      createdAt:new Date().toISOString(),
      createdPageLoadId:PAGE_LOAD_ID,
      status:"CLAIMED"
    };
  }

  async function uzyskajClaimOperacji(operacja) {
    const wynik = await chrome.runtime.sendMessage({type:"CLAIM_PENDING_OPERATION",operation:operacja});
    if (!wynik.ok) {
      state.pendingOperation=wynik.operacja || null;
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
      expectedTerms:terms.map(przygotujTerminDoKolejki),
      queueItemIds:[...queueItemIds],
      skipSheetOutbox:queueItemIds.length>0,
      status:"WAITING_FOR_SAVE"
    };
    pendingOperations[key]=potwierdzona;
    const aktualnaKolejka = Array.isArray(eventisImportQueue) ? eventisImportQueue : [];
    const zaktualizowanaKolejka = NARZEDZIA_KOLEJKI.oznaczElementyOczekujaceOperacji(aktualnaKolejka,potwierdzona);
    await storageSet({pendingOperations,eventisImportQueue:zaktualizowanaKolejka});
    state.pendingOperation=potwierdzona;
    state.eventisImportQueue=zaktualizowanaKolejka;
    return potwierdzona;
  }

  async function sprawdzBrakOczekujacejOperacji() {
    if (state.pendingOperation) {
      render();
      toast("Najpierw rozlicz poprzednią operację oczekującą na zapis Eventis.");
      return false;
    }
    const { pendingOperations = {} } = await storageGet(["pendingOperations"]);
    const operacja = pendingOperations[kluczClaimuBiezacegoFormularza()]
      || NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,state.organization,state.eventisId,state.eventisTitle);
    if (!operacja) return true;
    state.pendingOperation=operacja;
    render();
    toast("Najpierw rozlicz poprzednią operację oczekującą na zapis Eventis.");
    return false;
  }

  function pageHasSaveSuccessMarker() {
    const body = normalize(document.body.innerText || "");
    const phrases = ["zapisano","zostal zapisany","zostało zapisane","zmiany zapisane","zaktualizowano","pomyslnie zapisano","pomyślnie zapisano"];
    return phrases.some(p=>body.includes(normalize(p)));
  }

  async function inspectPendingAfterReload() {
    if (!state.pendingOperation || state.pendingOperation.createdPageLoadId === PAGE_LOAD_ID) return;
    const existingKeys = new Set(getExistingTerms().map(existingKey));
    const allExist = terminyOperacji(state.pendingOperation).every(t=>existingKeys.has(existingKey(t)));
    if (!allExist) return;
    if (pageHasSaveSuccessMarker()) await confirmPendingSaved("AUTO_SUCCESS_MARKER");
    else state.pendingLooksSaved = true;
  }

  async function confirmPendingSaved(method="USER_CONFIRM") {
    if (!state.pendingOperation) return;
    const op = state.pendingOperation;
    const { pendingOperations = {}, sheetOutbox = [], eventisImportQueue = [] } = await storageGet(["pendingOperations","sheetOutbox","eventisImportQueue"]);
    const key = kluczStorageOperacji(op);
    if (identyfikatorOperacji(pendingOperations[key]) !== identyfikatorOperacji(op)) {
      state.pendingOperation=pendingOperations[kluczClaimuBiezacegoFormularza()] || null;
      state.pendingLooksSaved=false;
      render();
      return toast("Operacja oczekująca zmieniła się w innej karcie. Odświeżono stan panelu.");
    }
    const eventisIdPoczatkowy = eventisIdPoczatkowyOperacji(op);
    const docelowyEventisId = (!eventisIdPoczatkowy || String(eventisIdPoczatkowy).startsWith("new:")) && !String(state.eventisId || "").startsWith("new:")
      ? state.eventisId
      : op.eventisIdResolved || eventisIdPoczatkowy || state.eventisId;
    const docelowyTytulEventis = getEventisTitle() || op.eventisTitleAtStart || op.eventisTitle;
    if (!op.skipSheetOutbox) {
      for (const term of terminyOperacji(op)) {
        const idem = `${op.organization}|${docelowyEventisId}|${term.start}|${normalize(term.city)}|${op.operator}`;
        if (!sheetOutbox.some(x=>x.idempotencyKey===idem && x.status!=="CANCELLED")) {
          sheetOutbox.push({id:crypto.randomUUID(),idempotencyKey:idem,status:"PENDING_SHEET_MAPPING",createdAt:new Date().toISOString(),operator:op.operator,organization:op.organization,eventisId:docelowyEventisId,eventisTitle:docelowyTytulEventis,term:przygotujTerminDoKolejki(term),sourceUrl:op.sourceUrl});
        }
      }
    }
    const zaktualizowanaKolejka = NARZEDZIA_KOLEJKI.rozliczElementyOperacji(eventisImportQueue,op,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE);
    delete pendingOperations[key];
    await storageSet({pendingOperations,sheetOutbox,eventisImportQueue:zaktualizowanaKolejka});
    state.eventisImportQueue=zaktualizowanaKolejka;
    await audit("EVENTIS_SAVE_CONFIRMED",{method,terms:terminyOperacji(op)});
    state.pendingOperation=null; state.pendingLooksSaved=false;
    toast(op.queueItemIds?.length ? "Zapis Eventis potwierdzony. Pozycje kolejki oznaczono jako zakończone." : "Zapis Eventis potwierdzony. Oznaczenia dodano do lokalnej kolejki arkusza.");
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
    await storageSet({pendingOperations,eventisImportQueue:zaktualizowanaKolejka});
    state.eventisImportQueue=zaktualizowanaKolejka;
    state.pendingOperation=null;
    state.pendingLooksSaved=false;
    await audit("EVENTIS_SAVE_FAILED",{terms:terminyOperacji(op),queueItemIds:op.queueItemIds || []});
    render();
    toast("Nieudany zapis rozliczono. Powiązane pozycje kolejki można ponowić.");
  }

  async function queueExistingTerms() {
    const confirmed = state.sourceTerms.filter(czyTerminPotwierdzony);
    const existingKeys = new Set(getExistingTerms().map(existingKey));
    const matched = confirmed.filter(t=>existingKeys.has(existingKey(t)));
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
    await storageSet({eventisImportQueue:state.eventisImportQueue});
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
    state.eventisImportQueue=modyfikator(aktualnaKolejka);
    await storageSet({eventisImportQueue:state.eventisImportQueue});
    return state.eventisImportQueue;
  }

  async function odswiezKolejke() {
    const { eventisImportQueue = [] } = await storageGet(["eventisImportQueue"]);
    state.eventisImportQueue=Array.isArray(eventisImportQueue) ? eventisImportQueue : [];
  }

  function dopasowaniaKolejkiDoBiezacegoTytulu() {
    return NARZEDZIA_KOLEJKI.filtrujKolejkeOrganizacji(state.eventisImportQueue,state.organization)
      .filter(element => [NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.OCZEKUJE, NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.BLAD].includes(element.status))
      .map(element => ({
        element,
        similarity:titleSimilarity(state.eventisTitle,element.title),
        terminy:NARZEDZIA_KOLEJKI.dopasujElementKolejkiDoTerminow(element,state.sourceTerms)
      }))
      .filter(dopasowanie => dopasowanie.similarity >= .58);
  }

  async function ponowKolejke(id) {
    await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element => element.id===id
      ? {...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.OCZEKUJE),operationId:null}
      : element));
    render();
  }

  async function wprowadzTerminyZKolejki(identyfikatoryDozwolone = null) {
    if (!state.mappingVerifiedThisSession) return toast("Najpierw zweryfikuj zgodność źródła szkolenia.");
    if (!state.source || !state.sourceTerms.length) return toast("Najpierw załaduj źródło SEMPER/IIST.");
    if (!await sprawdzBrakOczekujacejOperacji()) return;
    await odswiezKolejke();
    const dozwolone = identyfikatoryDozwolone ? new Set(identyfikatoryDozwolone) : null;
    const dopasowania=dopasowaniaKolejkiDoBiezacegoTytulu().filter(dopasowanie => !dozwolone || dozwolone.has(dopasowanie.element.id));
    const {jednoznaczne,nierozwiazane,duplikatyTerminow}=NARZEDZIA_KOLEJKI.rozdzielDopasowaniaKolejki(dopasowania);
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
    const zaktualizowanePoIstniejacych=new Set(elementyJuzIstniejace.map(dopasowanie=>dopasowanie.element.id));
    if (!doWprowadzenia.length) {
      await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element=>
        element.organization===state.organization && zaktualizowanePoIstniejacych.has(element.id)
          ? {...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE),completionReason:"ALREADY_EXISTS"}
          : element));
      render();
      return toast("Wszystkie dopasowane terminy już istnieją w Eventis.");
    }
    let planOperacji=null;
    try {
      const termy=doWprowadzenia.map(dopasowanie=>dopasowanie.terminy[0]);
      planOperacji=utworzPlanOperacji(unikalneTerminy(termy),doWprowadzenia.map(dopasowanie=>dopasowanie.element.id));
      const wykonanie=await NARZEDZIA_OPERACJI.wykonajPoUzyskaniuClaimu(
        () => uzyskajClaimOperacji(planOperacji),
        async operacja => {
          const result=await addSelectedTerms(unikalneTerminy(termy));
          const powiazanie=NARZEDZIA_KOLEJKI.powiazDodaneTerminy(doWprowadzenia,result.added);
          if (!powiazanie.terms.length) return {result,powiazanie,operacja};
          const potwierdzonaOperacja=await potwierdzOperacjeOczekujaca(operacja,powiazanie.terms,powiazanie.queueItemIds);
          return {result,powiazanie,operacja:potwierdzonaOperacja};
        }
      );
      if (!wykonanie.ok) throw new Error("Dla tego ogłoszenia trwa już inna operacja importu. Zakończ ją lub wróć do karty, w której została rozpoczęta.");
      const {powiazanie,operacja}=wykonanie.wynik;
      if (!powiazanie.terms.length) {
        await zwolnijNiepotwierdzonyClaim(operacja);
        render();
        return toast("Żaden termin kolejki nie został dodany do formularza.");
      }
      if (zaktualizowanePoIstniejacych.size) {
        await zaktualizujBiezacaKolejke(kolejka => kolejka.map(element=>
          element.organization===state.organization && zaktualizowanePoIstniejacych.has(element.id)
            ? {...NARZEDZIA_KOLEJKI.zmienStatusElementu(element,NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE),completionReason:"ALREADY_EXISTS"}
            : element));
      }
      state.status="FORM_FILLED";
      state.formularzZmieniony=true;
      render();
      const liczbaProblemow=nierozwiazane.length+duplikatyTerminow.length;
      toast(`Przygotowano terminów: ${powiazanie.terms.length}.${liczbaProblemow ? ` Pozycje wymagające sprawdzenia: ${liczbaProblemow}.` : ""} Zapisz Eventis ręcznie po kontroli.`);
    } catch (blad) {
      if (planOperacji) await zwolnijNiepotwierdzonyClaim(planOperacji);
      state.status="ERROR"; state.lastError=blad.message; render();
    }
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
    state.source=source;
    state.sourceLoadedFromMapping=fromMapping;
    state.sourceTerms=source.terms || [];
    state.reczniePotwierdzoneTerminy.clear();
    state.analizaTerminowWykonana=false;
    state.analizaWykazalaBraki=false;
    compareTerms();
    state.analizaTerminowWykonana=true;
    state.analizaWykazalaBraki=state.missingTerms.length>0;
    state.mappingVerifiedThisSession=false;
    if (learn) await saveMapping(source,origin);
    state.status="SOURCE_READY";
    render();
  }

  async function loadRememberedMapping() {
    if (!state.mapping?.sourceUrl) return;
    const identyfikator = state.searchRequestId;
    const organizacja = state.organization;
    try {
      state.status="LOADING_MAPPING"; render();
      const source=await fetchTraining(state.mapping.sourceUrl,organizacja);
      if(identyfikator!==state.searchRequestId||organizacja!==state.organization)return;
      await useSource(source,{learn:false,fromMapping:true});
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
    const ms=mappingState();
    if (ms.kind === "danger") return toast("Powiązanie jest zbyt niezgodne. Zmień link zamiast je potwierdzać.");
    const mapowanieDotyczyZrodla = czyMapowanieDotyczyZrodla(state.mapping,state.source);
    if (!mapowanieDotyczyZrodla) {
      await saveMapping(state.source,"AUTO_RECOMMENDED_CONFIRMED");
    }
    state.mappingVerifiedThisSession=true;
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
    const znalezione = NARZEDZIA_LISTY.znajdzAktywneZadanie(dane.eventisAutomaticBatches,state.organization,state.eventisId);
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
    const input=$("#esync-source-url");
    if(!input) return;
    const url=input.value.trim();
    if(!url) return toast("Wklej link szkolenia.");
    try {
      state.searchRequestId++;
      state.status="LOADING_SOURCE"; render();
      const source=await fetchTraining(url);
      await useSource(source,{learn:true,origin:"MANUAL_URL"});
      toast("Link działa i został zapamiętany. Teraz porównaj tytuły i potwierdź zgodność.");
    } catch(e){ state.status="ERROR";state.lastError=e.message;render(); }
  }

  async function onSearch() {
    if (state.status === "SEARCHING") return;
    const identyfikator = ++state.searchRequestId;
    try {
      state.status="SEARCHING";
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
            state.searchMessage="Nie znaleziono podobnego tytułu w IIST, ale wykryto go w SEMPER. Sprawdź wynik i potwierdź zmianę profilu.";
            zapiszDiagnostykeWyszukiwania({provider:"IIST",fallbackProvider:"SEMPER",finalReason:state.searchFinalReason,topCandidate:podobneSemper[0].title,verificationScore:podobneSemper[0].verificationScore});
            render();
            return;
          }
        } catch(bladAwaryjnegoWyszukiwania) {
          zapiszDiagnostykeWyszukiwania({provider:"IIST",fallbackProvider:"SEMPER",finalReason:"semper-fallback-error",error:bladAwaryjnegoWyszukiwania.message});
        }
      }
      const najlepszy=pokazane[0];
      const drugi=pokazane[1];
      const maPrzewage=!drugi||najlepszy.verificationScore-drugi.verificationScore>=PROGI_WYSZUKIWANIA.MINIMALNA_PRZEWAGA;
      if(najlepszy&&najlepszy.verificationScore>=PROGI_WYSZUKIWANIA.AUTO_AKCEPTACJA&&maPrzewage){
        await useSource(najlepszy.source,{learn:false});
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
        state.searchMessage=`Nie znaleziono szkolenia w wyszukiwarce ${state.organization}. Możesz podać link ręcznie.`;
      }
      zapiszDiagnostykeWyszukiwania({provider:state.organization,finalReason:state.searchFinalReason,topCandidate:najlepszy?.title||null,searchScore:najlepszy?.searchScore||0,verificationScore:najlepszy?.verificationScore||0});
      render();
    } catch(e){
      if(identyfikator!==state.searchRequestId)return;
      const siec=/HTTP|połą|pobr|czasu|fetch|network/i.test(e.message||"");
      state.status=siec?"SEARCH_NETWORK":"ERROR";
      state.lastError=e.message;
      state.searchMessage=siec?`Nie udało się połączyć z ${state.organization}.`:e.message;
      state.searchFinalReason=siec?"network-error":"configuration-or-parser-error";
      zapiszDiagnostykeWyszukiwania({provider:state.organization,finalReason:state.searchFinalReason,error:e.message});
      render();
    }
  }

  async function chooseSearchResult(url) {
    try {
      const kandydat=state.searchChoices.find(wynik=>wynik.url===url);
      const organizacjaKandydata=kandydat?.provider||state.organization;
      if(organizacjaKandydata!==state.organization){
        const potwierdzono=confirm(`Wynik pochodzi z profilu ${organizacjaKandydata}, a panel działa obecnie jako ${state.organization}. Czy przełączyć profil na ${organizacjaKandydata} i przejść do weryfikacji zgodności?`);
        if(!potwierdzono)return;
        state.organization=organizacjaKandydata;
        state.organizationDetectedBy="confirmed-search-fallback";
        const {mappings={}}=await storageGet(["mappings"]);
        state.mapping=mappings[mappingKey(state.organization,state.eventisId)]||null;
      }
      state.searchRequestId++;
      state.status="LOADING_SOURCE";render();
      const source=kandydat?.source||await fetchTraining(url,state.organization);
      await useSource(source,{learn:true,origin:"USER_SELECTED"});
    }catch(e){state.status="ERROR";state.lastError=e.message;render();}
  }

  async function onAddMissing() {
    if (!state.mappingVerifiedThisSession) return toast("Najpierw potwierdź zgodność zapamiętanego/wybranego linku z ogłoszeniem Eventis.");
    if (!await sprawdzBrakOczekujacejOperacji()) return;
    compareTerms();
    if (!state.missingTerms.length) return toast("Brak brakujących potwierdzonych terminów.");
    try {
      const chosen=[...state.missingTerms];
      const planOperacji=utworzPlanOperacji(chosen);
      const wykonanie=await NARZEDZIA_OPERACJI.wykonajPoUzyskaniuClaimu(
        () => uzyskajClaimOperacji(planOperacji),
        async operacja => {
          const result=await addSelectedTerms(chosen);
          await fillEventDetailsIfAdd(state.source,chosen);
          await potwierdzOperacjeOczekujaca(operacja,result.added);
          return result;
        }
      );
      if (!wykonanie.ok) throw new Error("Dla tego ogłoszenia trwa już inna operacja importu. Zakończ ją lub wróć do karty, w której została rozpoczęta.");
      const result=wykonanie.wynik;
      await audit("FORM_FILLED",{terms:result.added.map(t=>({start:t.start,end:t.end,city:t.city,price:t.price}))});
      state.status="FORM_FILLED";
      state.formularzZmieniony=true;
      compareTerms();
      render();
      toast("Formularz uzupełniony. Sprawdź go wizualnie i zapisz ręcznie w Eventis.");
    }catch(e){state.status="ERROR";state.lastError=e.message;render();toast(e.message);}
  }

  async function switchOrganization(org) {
    if (!['SEMPER','IIST'].includes(org)||org===state.organization) return;
    if (state.pendingOperation) return toast("Najpierw rozlicz operację oczekującą na zapis przed zmianą profilu.");
    state.searchRequestId++;
    state.organization=org;state.organizationDetectedBy="manual";state.source=null;state.sourceLoadedFromMapping=false;state.sourceTerms=[];state.mappingVerifiedThisSession=false;state.searchChoices=[];state.searchAttempted=false;state.analizaTerminowWykonana=false;state.analizaWykazalaBraki=false;state.status="INIT";
    const { mappings={}, pendingOperations={} }=await storageGet(["mappings","pendingOperations"]);
    state.mapping=mappings[mappingKey(org,state.eventisId)]||null;
    state.pendingOperation=pendingOperations[kluczClaimuBiezacegoFormularza()]
      || NARZEDZIA_KOLEJKI.znajdzOperacjeDlaStrony(pendingOperations,org,state.eventisId,state.eventisTitle);
    state.pendingLooksSaved=false;
    render();
    await inspectPendingAfterReload();
    if(state.pendingLooksSaved) render();
    if(state.mapping) await loadRememberedMapping();
    else if(MODE==="edit"&&state.eventisTitle)setTimeout(onSearch,350);
  }

  function renderTerm(t, status) {
    const kluczTerminu=termKey(t);
    const potwierdzonyRecznie=!t.confirmed&&state.reczniePotwierdzoneTerminy.has(kluczTerminu);
    const badge = status === "missing" ? '<span class="esync-badge yellow">BRAK</span>' : status === "exists" ? '<span class="esync-badge green">JEST</span>' : '<span class="esync-badge gray">NIEPOTW.</span>';
    const stylPrzelacznika=potwierdzonyRecznie?'border-color:#599b6e;background:#ecfdf3;color:#166534':'border-color:#e7a568;background:#fff1e3;color:#99511b';
    const przelacznik=!t.confirmed?`<button type="button" class="esync-potwierdz-termin" data-reczne-potwierdzenie="${esc(kluczTerminu)}" title="${potwierdzonyRecznie?'Cofnij ręczne potwierdzenie':'Oznacz ten termin jako potwierdzony'}" style="${stylPrzelacznika}">${potwierdzonyRecznie?'RĘCZNIE ✓':'POTWIERDŹ TERMIN'}</button>`:"";
    const daneTerminu=`${esc(t.start)}${t.end&&t.end!==t.start?` → ${esc(t.end)}`:""} · ${esc(t.city)}${t.price?` · ${esc(t.price)} zł`:""} · ${esc(t.durationDays||durationDays(t.start,t.end))} dni`;
    if(status==="unconfirmed") return `<div class="esync-term esync-term-niepotwierdzony"><div class="esync-term-main">${daneTerminu}</div><div class="esync-term-actions">${przelacznik}${badge}</div></div>`;
    return `<div class="esync-term"><div><div class="esync-term-main">${daneTerminu}</div><div class="esync-term-sub">${t.confirmed?"termin potwierdzony":potwierdzonyRecznie?"potwierdzony ręcznie":""}</div></div><div>${badge}</div></div>`;
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
    const orgClass=state.organization==="SEMPER"?"semper":"iist";
    const mapping=state.mapping;
    const source=state.source;
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
      <div class="esync-row esync-between"><h3>Źródło szkolenia</h3><span class="esync-badge ${orgClass}">${esc(state.organization)}</span></div>
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
      ${state.status==="SEARCHING"?`<div class="esync-info esync-small">${esc(state.searchMessage||`Szukam szkolenia w ${state.organization}…`)}</div>`:""}
      ${state.status==="LOADING_SOURCE"||state.status==="LOADING_MAPPING"?`<div class="esync-info esync-small">Trwa pobieranie danych…</div>`:""}
      ${["SEARCH_HIGH","SEARCH_MULTIPLE"].includes(state.status)?`<div class="esync-info esync-small">${esc(state.searchMessage)}</div>`:""}
      ${["SEARCH_EMPTY","SEARCH_WEAK"].includes(state.status)?`<div class="esync-warning esync-small">${esc(state.searchMessage)}</div>`:""}
      ${state.status==="SEARCH_NETWORK"?`<div class="esync-danger esync-small">${esc(state.searchMessage)}</div>`:""}
      ${state.status==="TITLE_CHANGED"?`<div class="esync-warning esync-small">${esc(state.searchMessage)}</div>`:""}
      ${state.status==="ERROR"?`<div class="esync-danger esync-small">${esc(state.lastError||"Błąd")}</div>`:""}
      ${state.status==="MAPPING_ERROR"?`<div class="esync-danger esync-small">Zapamiętany link nie zadziałał: ${esc(state.mappingError||"")}. Wybierz nowy link.</div>`:""}
    </div>${choices}`;
  }

  function renderujAkcjeZrodla() {
    const mapping=state.mapping;
    const source=state.source;
    return `<div class="esync-card esync-source-actions">
      <input id="esync-source-url" class="esync-input" type="url" value="${esc(source?.url||mapping?.sourceUrl||"")}" placeholder="Link szkolenia ${esc(state.organization)}">
      <div class="esync-grid2" style="margin-top:6px">
        <button id="esync-load-url" class="esync-btn primary">Użyj i zapamiętaj</button>
        <button id="esync-search" class="esync-btn" ${state.status==="SEARCHING"?'disabled':''}>${state.searchAttempted?'Szukaj ponownie':'Szukaj automatycznie'}</button>
        ${source?`<button id="esync-open-source" class="esync-btn">Otwórz źródło</button>`:"<span></span>"}
        ${mapping?`<button id="esync-forget" class="esync-btn danger">Zapomnij link</button>`:""}
      </div>
    </div>`;
  }

  function renderTermsCard() {
    if(!state.source) return "";
    compareTerms();
    const confirmed=state.sourceTerms.filter(czyTerminPotwierdzony), unconfirmed=state.sourceTerms.filter(t=>!czyTerminPotwierdzony(t));
    const existingKeys=new Set(state.existingTerms.map(existingKey));
    return `<div class="esync-card">
      <div class="esync-section-title"><span>Porównanie terminów</span><button id="esync-refresh" class="esync-btn" style="min-height:25px;padding:3px 6px">Sprawdź ponownie</button></div>
      <div class="esync-kpi"><div class="${confirmed.length ? "" : "pusty"}"><b>${confirmed.length}</b><span>potwierdzone</span></div><div class="${state.existingTerms.length ? "" : "pusty"}"><b>${state.existingTerms.length}</b><span>Eventis</span></div><div class="${state.missingTerms.length ? "" : "pusty"}"><b>${state.missingTerms.length}</b><span>brakujące</span></div></div>
      ${confirmed.length?confirmed.map(t=>renderTerm(t,existingKeys.has(existingKey(t))?"exists":"missing")).join(""):`<div class="esync-warning esync-small">Na stronie źródłowej nie wykryto żadnego terminu oznaczonego jako potwierdzony/gwarantowany. Rozszerzenie niczego nie doda.</div>`}
       ${unconfirmed.length?`<section class="esync-niepotwierdzone"><div class="esync-niepotwierdzone-naglowek"><b>${unconfirmed.length} niepotwierdzonych terminów</b><span class="esync-small">Potwierdź ręcznie, aby dodać do listy.</span></div>${unconfirmed.map(t=>renderTerm(t,"unconfirmed")).join("")}</section>`:""}
      ${state.status==="FORM_FILLED"?`<div class="esync-success"><b>Formularz został uzupełniony.</b><br>Zweryfikuj go wizualnie i kliknij zapis w Eventis. Rozszerzenie nie zapisuje formularza automatycznie.</div>`:""}
    </div>`;
  }

  function renderPendingCard(){
    if(!state.pendingOperation) return "";
    if(state.pendingOperation.createdPageLoadId===PAGE_LOAD_ID) return `<div class="esync-card"><div class="esync-warning"><b>⏳ Oczekiwanie na ręczny zapis Eventis</b><div class="esync-small">Po zapisaniu i przeładowaniu strony rozszerzenie zweryfikuje obecność nowych terminów.</div></div></div>`;
    if(state.pendingLooksSaved) return `<div class="esync-card"><div class="esync-warning"><b>⚠ Terminy są widoczne po ponownym otwarciu strony</b><div class="esync-small">Nie wykryłem jednoznacznego komunikatu sukcesu Eventis. Jeżeli zapis rzeczywiście się udał, potwierdź ręcznie.</div><button id="esync-confirm-save" class="esync-btn good" style="width:100%;margin-top:7px">Potwierdzam: Eventis zapisał zmiany</button></div></div>`;
    return `<div class="esync-card"><div class="esync-danger"><b>Nie potwierdzono zapisu</b><div class="esync-small">Istnieje oczekująca operacja, ale nie wszystkie dodane terminy są obecne w formularzu po ponownym otwarciu.</div><button id="esync-reject-save" class="esync-btn danger" style="width:100%;margin-top:7px">Oznacz zapis jako nieudany</button></div></div>`;
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
      ${podglad?`<div class="esync-manual-preview"><div class="esync-section-title"><span>Podgląd importu</span><span class="esync-small">bez zapisu do kolejki</span></div><div class="esync-import-summary"><span>Wykryto rekordów: <b>${podglad.records.length}</b></span><span>Do dodania: <b>${podglad.queueItems.length}</b></span><span>Odpotwierdzone: <b>${podglad.deconfirmed}</b></span><span>Duplikaty: <b>${podglad.duplicates}</b></span><span>Błędy: <b>${podglad.errors}</b></span></div><button id="esync-add-import-queue" class="esync-btn primary" style="width:100%;margin:6px 0" ${podglad.queueItems.length?'':'disabled'}>Dodaj ${podglad.queueItems.length} pozycji do kolejki Eventis</button>${listaPodgladu.map(rekord=>`<div class="esync-import-row"><div><span class="esync-badge ${rekord.status==='CONFIRMED'?'green':'red'}">${rekord.status==='CONFIRMED'?'CONFIRMED':'DECONFIRMED'}</span><div class="esync-term-main">${esc(rekord.title||'(brak tytułu)')}</div><div class="esync-term-sub">${esc(rekord.start||'?')}${rekord.end&&rekord.end!==rekord.start?` → ${esc(rekord.end)}`:''} · ${esc(rekord.city||'?')}${rekord.participants!=null?` · ${esc(rekord.participants)} uczestn.`:''}</div>${rekord.error?`<div class="esync-small esync-danger">${esc(rekord.error)}</div>`:''}</div><span class="esync-small">${rekord.status==='DECONFIRMED'?'pominięty przy dodawaniu':''}</span></div>`).join('')}${(podglad.bledyWalidacji||[]).map(blad=>`<div class="esync-small esync-danger">Wiersz ${esc(blad.lineNumber)}: ${esc(blad.error)}</div>`).join('')}</div>`:''}
      ${matches.length?`<div class="esync-divider"></div><b class="esync-small">Rekordy pasujące do bieżącego szkolenia:</b>${matches.slice(0,8).map(r=>`<div class="esync-term"><div><div class="esync-term-main">${r.status==="CONFIRMED"?'✓ POTWIERDZONE':'↘ ODPOTWIERDZONE'} · ${esc(r.start||'?')}${r.end&&r.end!==r.start?` → ${esc(r.end)}`:''} · ${esc(r.city||'?')}</div><div class="esync-term-sub">${r.error?`BŁĄD: ${esc(r.error)}`:`Dopasowanie tytułu ${Math.round((r.similarity||0)*100)}%`}</div></div><span class="esync-badge ${r.status==='CONFIRMED'?'green':'red'}">${r.status==='CONFIRMED'?'MA BYĆ':'USUŃ'}</span></div>`).join('')}`:''}
      ${deconf.length?`<div class="esync-danger"><b>Wykryto ODPOTWIERDZONE terminy obecne w Eventis</b>${deconf.map(x=>`<button class="esync-btn danger" data-highlight-remove="${esc(x.event.id)}" style="width:100%;margin-top:5px">Podświetl ${esc(x.record.start)} · ${esc(x.record.city)}</button>`).join('')}<div class="esync-small" style="margin-top:5px">v0.1 tylko podświetla dokładny termin do usunięcia. Automatyczne usuwanie dodamy po potwierdzeniu stabilnego selektora Eventis i reguły „minimum jeden termin”.</div></div>`:''}
      </details>
    </div>`;
  }

  function renderKolejkaCard() {
    const kolejkaOrganizacji=NARZEDZIA_KOLEJKI.filtrujKolejkeOrganizacji(state.eventisImportQueue,state.organization);
    const podsumowanie=NARZEDZIA_KOLEJKI.podsumujKolejke(kolejkaOrganizacji);
    const dopasowania=dopasowaniaKolejkiDoBiezacegoTytulu();
    const gotowe=NARZEDZIA_KOLEJKI.rozdzielDopasowaniaKolejki(dopasowania).jednoznaczne;
    return `<div class="esync-card"><div class="esync-section-title"><span>Seryjna kolejka Eventis</span><span class="esync-small">trwała</span></div><div class="esync-import-summary"><span>Oczekujące: <b>${podsumowanie.pending}</b></span><span>Czekają na zapis: <b>${podsumowanie.waitingForSave}</b></span><span>Zakończone: <b>${podsumowanie.done}</b></span><span>Błędy: <b>${podsumowanie.errors}</b></span></div>${dopasowania.length?`<div class="esync-small" style="margin-top:7px"><b>Pasujące do bieżącego szkolenia</b></div>${dopasowania.map(dopasowanie=>`<div class="esync-import-row"><div><div class="esync-term-main">${esc(dopasowanie.element.title)}</div><div class="esync-term-sub">${esc(dopasowanie.element.start)}${dopasowanie.element.end!==dopasowanie.element.start?` → ${esc(dopasowanie.element.end)}`:''} · ${esc(dopasowanie.element.city)}${dopasowanie.element.participants!=null?` · ${esc(dopasowanie.element.participants)} uczestn.`:''} · podobieństwo ${Math.round(dopasowanie.similarity*100)}%</div>${dopasowanie.element.errorMessage?`<div class="esync-small esync-danger">${esc(dopasowanie.element.errorMessage)}</div>`:''}</div>${dopasowanie.element.status===NARZEDZIA_KOLEJKI.STATUSY_KOLEJKI_EVENTIS.BLAD?`<button class="esync-btn warn" data-queue-retry="${esc(dopasowanie.element.id)}">Ponów</button>`:''}</div>`).join('')} ${state.mappingVerifiedThisSession&&gotowe.length?`<button id="esync-add-queue-terms" class="esync-btn good" style="width:100%;margin-top:7px">Wprowadź terminy z kolejki (${gotowe.length})</button>`:''}`:`<div class="esync-small esync-muted" style="margin-top:7px">Na tym ogłoszeniu nie znaleziono oczekujących pozycji o podobnym tytule.</div>`}</div>`;
  }

  async function renderOutboxStatus() {
    const {sheetOutbox=[]}=await storageGet(["sheetOutbox"]);
    const pending=sheetOutbox.filter(x=>x.status!=="DONE"&&x.status!=="CANCELLED").length;
    const el=$("#esync-outbox-count"); if(el) el.textContent=String(pending);
  }

  function render() {
    let root=$("#esync-root");
    if(!root){root=document.createElement("aside");root.id="esync-root";document.body.appendChild(root);}
    const zamknijKarte=state.analizaTerminowWykonana&&!state.analizaWykazalaBraki&&!state.formularzZmieniony;
    const liczbaPotwierdzonych=state.sourceTerms.filter(czyTerminPotwierdzony).length;
    root.innerHTML=`<div class="esync-head"><div class="esync-head-text"><div class="esync-head-title">Eventis Sync <span class="esync-badge ${state.organization==='SEMPER'?'semper':'iist'}">${esc(state.organization)}</span></div><div class="esync-head-sub">v${VERSION} · operator ${esc(state.settings.operatorInitial||'K')} · outbox <span id="esync-outbox-count">0</span></div></div><div class="esync-head-actions"><button class="esync-icon-btn ${state.organization==='SEMPER'?'semper':'iist'}" id="esync-org" title="Zmień SEMPER / IIST">${esc(state.organization)}</button><button class="esync-icon-btn" id="esync-settings" title="Ustawienia">⚙</button><button class="esync-icon-btn esync-collapse" id="esync-collapse" title="Zwiń">−</button></div></div><div class="esync-body">${renderujAkcjeZrodla()}${renderMappingCard()}${renderPendingCard()}${renderTermsCard()}${renderKolejkaCard()}${renderManualCard()}<div class="esync-footer">TYLKO POTWIERDZONE</div></div><div class="esync-panel-action"><button id="esync-add-missing" class="esync-btn good" ${!state.mappingVerifiedThisSession||!state.missingTerms.length?'disabled':''}>Uzupełnij brakujące potwierdzone (${state.missingTerms.length})</button><button id="esync-queue-existing" class="esync-btn" ${!state.mappingVerifiedThisSession||!liczbaPotwierdzonych?'disabled':''}>Zarejestruj potwierdzone, które już istnieją</button><button id="esync-panel-action" data-action="${zamknijKarte?'close':'save'}" class="esync-btn ${zamknijKarte?'primary':'good'}" ${!zamknijKarte&&!state.formularzZmieniony?'disabled':''}>${zamknijKarte?'↺ Wróć do listy':'Zapisz kartę'}</button></div>`;
    bindUI();
    renderOutboxStatus();
  }

  function bindUI() {
    $("#esync-collapse")?.addEventListener("click",()=>{$("#esync-root")?.classList.toggle("esync-collapsed");});
    $("#esync-settings")?.addEventListener("click",()=>chrome.runtime.sendMessage({type:"OPEN_OPTIONS"}));
    $("#esync-org")?.addEventListener("click",()=>switchOrganization(state.organization==="SEMPER"?"IIST":"SEMPER"));
    $("#esync-load-url")?.addEventListener("click",onLoadUrl);
    $("#esync-search")?.addEventListener("click",onSearch);
    $("#esync-open-source")?.addEventListener("click",()=>{if(state.source?.url)window.open(state.source.url,"_blank","noopener");});
    $("#esync-forget")?.addEventListener("click",async()=>{if(confirm("Usunąć zapamiętane powiązanie dla tego ogłoszenia?")){await forgetMapping();render();}});
    $("#esync-verify")?.addEventListener("click",verifyMapping);
    $("#esync-refresh")?.addEventListener("click",()=>{compareTerms();render();});
    $$('[data-reczne-potwierdzenie]',$("#esync-root")||document).forEach(przycisk=>przycisk.addEventListener("click",()=>przelaczRecznePotwierdzenie(przycisk.dataset.recznePotwierdzenie)));
    $("#esync-add-missing")?.addEventListener("click",onAddMissing);
    $("#esync-queue-existing")?.addEventListener("click",queueExistingTerms);
    $("#esync-confirm-save")?.addEventListener("click",()=>confirmPendingSaved("USER_CONFIRM"));
    $("#esync-reject-save")?.addEventListener("click",oznaczNieudanyZapis);
    $("#esync-add-import-queue")?.addEventListener("click",dodajPodgladDoKolejki);
    $("#esync-add-queue-terms")?.addEventListener("click",wprowadzTerminyZKolejki);
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

  async function init() {
    await loadSettingsAndState();
    render();
    obserwujZmianyFormularza();
    observeTitleChanges();
    if (MODE === "edit") {
      await uzupelnijWymaganeFormyZajec();
      aktualizujStanPrzyciskuPanelu();
    }
    await inspectPendingAfterReload();
    if(state.pendingLooksSaved) render();
    if(state.mapping) await loadRememberedMapping();
    else {
      // Uczymy się aliasów tylko jako sugestii: nie przypisujemy automatycznie nowego Eventis ID bez kontroli użytkownika.
      const {mappings={}}=await storageGet(["mappings"]);
      const aliases=Object.values(mappings).filter(m=>m.organization===state.organization&&m.eventisEventId!==state.eventisId).map(m=>({...m,aliasScore:titleSimilarity(state.eventisTitle,m.eventisTitle)})).filter(m=>m.aliasScore>=.93).sort((a,b)=>b.aliasScore-a.aliasScore);
      if(aliases.length){
        state.searchChoices=aliases.slice(0,3).map(m=>({url:m.sourceUrl,title:`[z pamięci] ${m.sourceTitle}`,similarity:m.aliasScore}));
        state.status="SEARCH_CHOICES";render();
      }
      if(MODE==="edit"&&state.eventisTitle)setTimeout(onSearch,350);
    }
    await uruchomAutomatycznaKolejkeJesliGotowa();
  }

  init().catch(e=>{console.error("Eventis Sync init",e);state.status="ERROR";state.lastError=e.message;render();});
})();
