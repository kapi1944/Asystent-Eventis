(() => {
  "use strict";

  if (!/\/event\/(?:add|edit)(?:\/|$|\?)/.test(location.pathname + location.search)) return;
  if (window.__EVENTIS_SYNC_V010__) return;
  window.__EVENTIS_SYNC_V010__ = true;

  const VERSION = "0.1.0";
  const PAGE_LOAD_ID = crypto.randomUUID();
  const MODE = location.pathname.startsWith("/event/edit") ? "edit" : "add";
  const CITIES = ["Warszawa","Kraków","Poznań","Wrocław","Gdańsk","Katowice","Szczecin","Zakopane","Kołobrzeg"];
  const REGIONS = { Warszawa:7, Kraków:6, Poznań:15, Wrocław:1, Gdańsk:11, Katowice:12, Szczecin:16, Zakopane:6, Kołobrzeg:16 };
  const DEFAULT_SETTINGS = {
    operatorInitial: "K",
    defaultOrganization: "SEMPER",
    semperAccountMarker: "SEMPER",
    iistAccountMarker: "IIST",
    requireSessionVerification: true,
    mappingWarningThreshold: 0.90,
    mappingBlockThreshold: 0.70,
    manualSnapshotMaxAgeHours: 24
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    organization: "SEMPER",
    organizationDetectedBy: "default",
    eventisId: "",
    eventisTitle: "",
    mapping: null,
    source: null,
    mappingVerifiedThisSession: false,
    sourceTerms: [],
    existingTerms: [],
    missingTerms: [],
    searchChoices: [],
    manualRecords: [],
    manualMatches: [],
    pendingOperation: null,
    pendingLooksSaved: false,
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

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/certyfikowane szkolenie online/g, " ")
      .replace(/szkolenie online/g, " online ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanLine(value) {
    return String(value || "").replace(/\u00a0/g," ").replace(/\s+/g," ").replace(/^[-*•–·▪▫]\s*/,"").trim();
  }

  function titleBeforeFirstPunctuation(title) {
    const clean = cleanLine(title);
    const protectedClean = clean.replace(/\bds\.\s*/gi,"ds§ ").replace(/\bm\.in\.\s*/gi,"m§in§ ");
    const firstPart = (protectedClean.split(/[.,;:!?|…–—-]/)[0] || protectedClean).trim();
    return firstPart.replace(/\bds§\s*/gi,"ds. ").replace(/\bm§in§\s*/gi,"m.in. ").trim();
  }

  function tokenSet(value) {
    const skip = new Set(["oraz","wraz","wedlug","praktyczne","kompleksowe","warsztaty","szkolenie","kurs","dla","nad","pod","online","dniowe","dniowy","dniowa","certyfikowane"]);
    return new Set(normalize(value).split(" ").filter(x => x.length > 2 && !skip.has(x)));
  }

  function titleSimilarity(a, b) {
    const A = tokenSet(a), B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let common = 0;
    for (const x of A) if (B.has(x)) common++;
    const jaccard = common / new Set([...A, ...B]).size;
    const containment = common / Math.min(A.size, B.size);
    const an = normalize(titleBeforeFirstPunctuation(a) || a);
    const bn = normalize(titleBeforeFirstPunctuation(b) || b);
    const prefixBonus = an && bn && (an.startsWith(bn.slice(0, Math.min(22,bn.length))) || bn.startsWith(an.slice(0, Math.min(22,an.length)))) ? .08 : 0;
    return Math.max(0, Math.min(1, .48 * jaccard + .52 * containment + prefixBonus));
  }

  function dateRangeFromText(text) {
    const m = String(text || "").match(/(?:od:\s*)?(\d{4}-\d{2}-\d{2})\s*(?:do:|do|-|–|—)\s*(\d{4}-\d{2}-\d{2})/i);
    if (m) return { start:m[1], end:m[2] };
    const dates = String(text || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
    if (dates.length >= 2) return { start:dates[0], end:dates[1] };
    if (dates.length === 1) return { start:dates[0], end:dates[0] };
    return null;
  }

  function durationDays(start,end) {
    const a = new Date(start + "T00:00:00"), b = new Date(end + "T00:00:00");
    return Math.max(1, Math.round((b-a)/86400000)+1);
  }

  function cityFromText(text) {
    const n = normalize(text);
    if (/\bonline\b/.test(n)) return "Online";
    for (const city of CITIES) if (n.includes(normalize(city))) return city;
    return "";
  }

  function priceFromText(text) {
    const m = String(text || "").replace(/\s+/g," ").match(/(\d{3,5})(?:[.,]\d{2})?\s*zł/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function isConfirmedText(text) {
    const n = normalize(text).replace(/\s+/g,"");
    return n.includes("ostatniewolnemiejsca") || n.includes("ostatniewolne") || n.includes("potwierdzony") || n.includes("gwarantowany") || n.includes("gwarancjaterminu");
  }

  function termKey(t) { return `${t.start}|${t.end}|${normalize(t.city)}`; }
  function existingKey(t) { return `${t.start}|${normalize(t.city)}`; }
  function dedupeTerms(terms) {
    const map = new Map();
    for (const t of terms) {
      const k = termKey(t);
      const prev = map.get(k);
      if (!prev || (t.confirmed && !prev.confirmed)) map.set(k,t);
    }
    return Array.from(map.values()).sort((a,b)=>a.start.localeCompare(b.start)||String(a.city).localeCompare(String(b.city)));
  }

  async function storageGet(keys) { return chrome.storage.local.get(keys); }
  async function storageSet(obj) { return chrome.storage.local.set(obj); }

  async function fetchText(url, opts={}) {
    const payload = { url, method: opts.method || "GET", body: opts.body || null, headers: opts.headers || {} };
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
    const data = await storageGet(["settings","mappings","pendingOperations","manualSheetSnapshot"]);
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    state.eventisTitle = getEventisTitle();
    state.eventisId = detectEventisId();
    state.organization = detectOrganization(state.settings);
    const key = mappingKey(state.organization,state.eventisId);
    state.mapping = (data.mappings || {})[key] || null;
    state.pendingOperation = (data.pendingOperations || {})[key] || null;
    if (data.manualSheetSnapshot?.records) {
      state.manualRecords = data.manualSheetSnapshot.records;
      state.manualMatches = matchManualRecordsToCurrent(state.manualRecords);
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
    state.sourceTerms = [];
    state.missingTerms = [];
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
    try {
      const u = new URL(String(value || "").trim());
      if (!/(^|\.)szkolenia-semper\.pl$/i.test(u.hostname)) return "";
      return u.href;
    } catch { return ""; }
  }

  function normalizeIistUrl(value) {
    try {
      const u = new URL(String(value || "").trim());
      if (!/(^|\.)szkoleniaiist\.com\.pl$/i.test(u.hostname)) return "";
      return u.href;
    } catch { return ""; }
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
      let start = range.start, end = range.end, finalPrice = price;
      const rawDuration = durationDays(start,end);
      // Zachowanie biznesowe ze starego skryptu: 4-dniowe wpisy są publikowane w Eventis jako ostatnie 3 dni,
      // a dla szkolenia stacjonarnego cena jest pomniejszana o 300 zł.
      if (rawDuration === 4) {
        const d = new Date(start + "T00:00:00");
        d.setDate(d.getDate()+1);
        start = d.toISOString().slice(0,10);
        if (city !== "Online") finalPrice = price - 300;
      }
      raw.push({ start,end,city,price:finalPrice,confirmed,durationDays: rawDuration === 4 ? 3 : rawDuration, rawText:text });
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
    let guard = 0;
    while (node && guard++ < 20) {
      if (/^H[1-5]$/.test(node.tagName)) break;
      const txt = normalize(node.textContent);
      if (txt.includes("informacje organizacyjne") || txt.includes("inwestycja")) break;
      html += node.outerHTML || "";
      node = node.nextElementSibling;
    }
    return sanitizeHtml(html);
  }

  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`,"text/html");
    const root = doc.body.firstElementChild;
    root.querySelectorAll("script,style,img,svg,iframe,object,form,input,button").forEach(x=>x.remove());
    root.querySelectorAll("a").forEach(a=>a.replaceWith(doc.createTextNode(a.textContent||"")));
    root.querySelectorAll("*").forEach(el=>Array.from(el.attributes).forEach(a=>{ if (/^on/i.test(a.name)||["style","class","id"].includes(a.name)) el.removeAttribute(a.name); }));
    return root.innerHTML.replace(/Program szkolenia[\s\S]*?zabronione\.?/gi,"").replace(/Szkolenie realizowane w ramach programu partnerskiego[\s\S]*?(?=<h|$)/gi,"").trim();
  }

  function parseSemperPage(html,url) {
    const doc = new DOMParser().parseFromString(html,"text/html");
    const title = cleanLine((doc.querySelector("h1") || doc.querySelector("title"))?.textContent || "");
    const idMatch = url.match(/(?:szkolenie,|,)(\d+)(?:\.html|,html)/i);
    return {
      provider:"SEMPER", id:idMatch?.[1] || url, url, title,
      terms: parseSemperTerms(doc),
      liczbaDni: odczytajLiczbeDni(doc),
      groupHtml: collectSectionByMarker(doc,"grupa docelowa") || collectSectionByMarker(doc,"adresaci"),
      goalHtml: collectSectionByMarker(doc,"cel szkolenia"),
      benefitsHtml: collectSectionByMarker(doc,"korzyści"),
      programHtml: collectSectionByMarker(doc,"program szkolenia")
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
      terms.push({ start:range.start,end:range.end,city,price,confirmed,durationDays:durationDays(range.start,range.end),rawText:text });
    }
    // Awaryjny parser tekstowy, gdy layout strony nie da minimalnych bloków.
    if (!terms.length) {
      const lines = (doc.body?.innerText || doc.body?.textContent || "").split(/\n+/).map(cleanLine).filter(Boolean);
      for (const line of lines) {
        if (!/od:\s*\d{4}-\d{2}-\d{2}/i.test(line) || !/do:\s*\d{4}-\d{2}-\d{2}/i.test(line)) continue;
        const range = dateRangeFromText(line), city = cityFromText(line), price = priceFromText(line);
        if (range && city && price) terms.push({start:range.start,end:range.end,city,price,confirmed:isConfirmedText(line),durationDays:durationDays(range.start,range.end),rawText:line});
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
      groupHtml: collectSectionByMarker(doc,"grupa docelowa"),
      goalHtml: collectSectionByMarker(doc,"cel szkolenia"),
      benefitsHtml: collectSectionByMarker(doc,"korzyści dla uczestników"),
      programHtml: collectSectionByMarker(doc,"program szkolenia")
    };
  }

  async function fetchTraining(url) {
    const normalizedUrl = state.organization === "SEMPER" ? normalizeSemperUrl(url) : normalizeIistUrl(url);
    if (!normalizedUrl) throw new Error(`Link nie należy do źródła ${state.organization}.`);
    const { text, finalUrl } = await fetchText(normalizedUrl);
    const source = state.organization === "SEMPER" ? parseSemperPage(text,finalUrl || normalizedUrl) : parseIistPage(text,finalUrl || normalizedUrl);
    if (!source.title) throw new Error("Nie udało się odczytać tytułu szkolenia ze strony źródłowej.");
    return source;
  }

  function importantSearchWords(value) {
    const skip = new Set(["oraz","wraz","wedlug","praktyczne","kompleksowe","warsztaty","szkolenie","kurs","dla","nad","pod"]);
    return normalize(value).split(" ").filter(w=>w.length>2&&!skip.has(w));
  }

  function absoluteSemperUrl(value) {
    try { return new URL(value,"https://www.szkolenia-semper.pl/").href; } catch { return ""; }
  }

  function isSemperDetailsUrl(url) {
    return /^https:\/\/(?:www\.)?szkolenia-semper\.pl\/component\/trainings\/details\//i.test(String(url||""));
  }

  function linksFromSemperSearch(html, phrase) {
    let decoded = String(html||"");
    try { const parsed=JSON.parse(decoded); if (typeof parsed === "string") decoded=parsed; } catch {}
    const doc = new DOMParser().parseFromString(decoded,"text/html");
    const words = importantSearchWords(phrase);
    const seen = new Set();
    return $$('a[href]',doc).map(a=>{
      const href = absoluteSemperUrl(a.getAttribute("href") || "");
      const title = cleanLine(a.getAttribute("title") || a.textContent || href);
      const n = normalize(`${title} ${href}`);
      const score = words.reduce((s,w)=>s+(n.includes(w)?1:0),0);
      return {url:href,title,score,similarity:titleSimilarity(phrase,title)};
    }).filter(x=>isSemperDetailsUrl(x.url)&&x.score>0&&!seen.has(x.url)&&seen.add(x.url)).sort((a,b)=>b.similarity-a.similarity||b.score-a.score);
  }

  async function searchSemper(phrase) {
    const headers = {"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"};
    try {
      const direct = await fetchText("https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj.php", {method:"POST",headers,body:formUrlEncoded({opc:"szukaj",co:phrase})});
      try {
        const parsed = JSON.parse(direct.text);
        const url = absoluteSemperUrl(parsed?.url || "");
        if (isSemperDetailsUrl(url)) {
          const src = await fetchTraining(url);
          if (titleSimilarity(phrase,src.title) >= .65) return [{url:src.url,title:src.title,similarity:titleSimilarity(phrase,src.title)}];
        }
      } catch {}
    } catch {}
    const auto = await fetchText("https://www.szkolenia-semper.pl/__ajax/_ajax_szukaj_auto.php", {method:"POST",headers,body:formUrlEncoded({opc:"szukaj",co:phrase})});
    return linksFromSemperSearch(auto.text,phrase).slice(0,8);
  }

  async function searchIist(phrase) {
    // v0.1: bez zgadywania nieudokumentowanych parametrów wyszukiwarki IIST.
    // Pobieramy kalendarz i oceniamy widoczne linki szkoleniowe; ręcznie wskazany link zostaje zapamiętany.
    const { text } = await fetchText("https://szkoleniaiist.com.pl/szkolenia.php");
    const doc = new DOMParser().parseFromString(text,"text/html");
    const seen = new Set();
    return $$('a[href]',doc).map(a=>{
      let url=""; try { url=new URL(a.getAttribute("href"),"https://szkoleniaiist.com.pl/").href; } catch {}
      const title=cleanLine(a.textContent||"");
      return {url,title,similarity:titleSimilarity(phrase,title)};
    }).filter(x=>x.title.length>15&&/,(?:\d+)\.html(?:$|[?#])/i.test(decodeURIComponent(x.url))&&x.similarity>=.45&&!seen.has(x.url)&&seen.add(x.url)).sort((a,b)=>b.similarity-a.similarity).slice(0,8);
  }

  async function searchTraining() {
    const phrase = titleBeforeFirstPunctuation(state.eventisTitle) || state.eventisTitle;
    if (!phrase || phrase.length < 3) throw new Error("Nie odczytano tytułu ogłoszenia Eventis.");
    return state.organization === "SEMPER" ? searchSemper(phrase) : searchIist(phrase);
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
    const confirmed = state.sourceTerms.filter(t=>t.confirmed);
    state.missingTerms = confirmed.filter(t=>!existingKeys.has(existingKey(t)));
  }

  function setValue(el,val) {
    if (!el) return;
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto,"value")?.set;
    if (setter) setter.call(el,String(val ?? "")); else el.value = String(val ?? "");
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
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

  function zaznaczOpcjePoEtykiecie(tekstEtykiety) {
    const pole = znajdzPolePoEtykiecie(tekstEtykiety);
    if (!(pole instanceof HTMLInputElement)) return false;
    if (!pole.checked) pole.click();
    return true;
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
    const liczbaDni = source.liczbaDni || Math.max(1,...terms.map(t=>t.durationDays||1));
    setValue($('input[name="event[title]"],textarea[name="event[title]"],#title'),source.title);
    setValue($('input[name="event[hours]"]') || znajdzPolePoEtykiecie("Godziny zajęć (czas trwania)"), liczbaDni === 1 ? "1 dzień" : `${liczbaDni} dni`);
    if (zaznaczOpcjePoEtykiecie("Podstawowy")) await sleep(100);
    setValue(znajdzPolePoEtykiecie("Życiorys"), state.organization === "SEMPER" ? "Ekspert SEMPER" : "Trener IIST");
    const rich = [
      ["event[reason]",source.benefitsHtml],
      ["event[information]",source.goalHtml],
      ["event[forWho]",source.groupHtml],
      ["event[plan]",source.programHtml]
    ];
    for (const [name,html] of rich) if (html) await chrome.runtime.sendMessage({type:"SET_RICH_FIELD",name,html});
    const participantType=$('input[name="event[participantsType]"][value="1"]'); if(participantType){participantType.checked=true;participantType.dispatchEvent(new Event("change",{bubbles:true}));}
    const adult=$('input[name="ageGroup[]"][value="4"]'); if(adult){adult.checked=true;adult.dispatchEvent(new Event("change",{bubbles:true}));}
    const category=$("#tematSelect") || $('select[name="event[category_id]"]');
    if(category) category.classList.add("esync-manual-highlight");
  }

  async function createPendingOperation(terms) {
    const { pendingOperations = {} } = await storageGet(["pendingOperations"]);
    const key = mappingKey(state.organization,state.eventisId);
    pendingOperations[key] = {
      id:crypto.randomUUID(), organization:state.organization,eventisId:state.eventisId,eventisTitle:state.eventisTitle,
      sourceUrl:state.source?.url || state.mapping?.sourceUrl || "", terms:terms.map(t=>({start:t.start,end:t.end,city:t.city,price:t.price})),
      operator:state.settings.operatorInitial || "K", createdAt:new Date().toISOString(), createdPageLoadId:PAGE_LOAD_ID, status:"WAITING_FOR_SAVE"
    };
    await storageSet({pendingOperations});
    state.pendingOperation=pendingOperations[key];
  }

  function pageHasSaveSuccessMarker() {
    const body = normalize(document.body.innerText || "");
    const phrases = ["zapisano","zostal zapisany","zostało zapisane","zmiany zapisane","zaktualizowano","pomyslnie zapisano","pomyślnie zapisano"];
    return phrases.some(p=>body.includes(normalize(p)));
  }

  async function inspectPendingAfterReload() {
    if (!state.pendingOperation || state.pendingOperation.createdPageLoadId === PAGE_LOAD_ID) return;
    const existingKeys = new Set(getExistingTerms().map(existingKey));
    const allExist = state.pendingOperation.terms.every(t=>existingKeys.has(existingKey(t)));
    if (!allExist) return;
    if (pageHasSaveSuccessMarker()) await confirmPendingSaved("AUTO_SUCCESS_MARKER");
    else state.pendingLooksSaved = true;
  }

  async function confirmPendingSaved(method="USER_CONFIRM") {
    if (!state.pendingOperation) return;
    const op = state.pendingOperation;
    const { pendingOperations = {}, sheetOutbox = [] } = await storageGet(["pendingOperations","sheetOutbox"]);
    const key = mappingKey(state.organization,state.eventisId);
    for (const term of op.terms) {
      const idem = `${state.organization}|${state.eventisId}|${term.start}|${normalize(term.city)}|${op.operator}`;
      if (!sheetOutbox.some(x=>x.idempotencyKey===idem && x.status!=="CANCELLED")) {
        sheetOutbox.push({id:crypto.randomUUID(),idempotencyKey:idem,status:"PENDING_SHEET_MAPPING",createdAt:new Date().toISOString(),operator:op.operator,organization:state.organization,eventisId:state.eventisId,eventisTitle:state.eventisTitle,term,sourceUrl:op.sourceUrl});
      }
    }
    delete pendingOperations[key];
    await storageSet({pendingOperations,sheetOutbox});
    await audit("EVENTIS_SAVE_CONFIRMED",{method,terms:op.terms});
    state.pendingOperation=null; state.pendingLooksSaved=false;
    toast("Zapis Eventis potwierdzony. Oznaczenia dodano do lokalnej kolejki arkusza.");
    render();
  }

  async function queueExistingTerms() {
    const confirmed = state.sourceTerms.filter(t=>t.confirmed);
    const existingKeys = new Set(getExistingTerms().map(existingKey));
    const matched = confirmed.filter(t=>existingKeys.has(existingKey(t)));
    if (!matched.length) return toast("Brak potwierdzonych terminów, które już istnieją w Eventis.");
    const { sheetOutbox = [] } = await storageGet(["sheetOutbox"]);
    let added=0;
    for (const term of matched) {
      const idem=`${state.organization}|${state.eventisId}|${term.start}|${normalize(term.city)}|${state.settings.operatorInitial}`;
      if (!sheetOutbox.some(x=>x.idempotencyKey===idem&&x.status!=="CANCELLED")) {
        sheetOutbox.push({id:crypto.randomUUID(),idempotencyKey:idem,status:"PENDING_SHEET_MAPPING",createdAt:new Date().toISOString(),operator:state.settings.operatorInitial,organization:state.organization,eventisId:state.eventisId,eventisTitle:state.eventisTitle,term:{start:term.start,end:term.end,city:term.city,price:term.price},sourceUrl:state.source?.url||state.mapping?.sourceUrl||"",reason:"ALREADY_EXISTS"});
        added++;
      }
    }
    await storageSet({sheetOutbox});
    await audit("EXISTING_TERMS_CONFIRMED",{count:added});
    toast(`Dodano do kolejki arkusza: ${added}.`);
  }

  function normalizeManualDatePart(raw) {
    return String(raw).replace(/[.]/g,"-");
  }

  function parseManualRecordLine(line) {
    const raw = String(line || "").replace(/<br\s*\/?\s*>/gi," ").replace(/\\\|/g,"|").replace(/\|/g," ").replace(/\s+/g," ").trim();
    const n = normalize(raw);
    let status = null;
    if (n.includes("odpotwierdzone")) status="DECONFIRMED";
    else if (n.includes("potwierdzone szkolenie")) status="CONFIRMED";
    if (!status) return null;

    let start=null,end=null,dateToken="";
    let m = raw.match(/(\d{4}[.-]\d{2}[.-]\d{2})\s*(?:do|[-–—])\s*(\d{4}[.-]\d{2}[.-]\d{2})/i);
    if (m) { start=normalizeManualDatePart(m[1]); end=normalizeManualDatePart(m[2]); dateToken=m[0]; }
    if (!m) {
      m = raw.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})[.]([01]?\d)[.](\d{4})/);
      if (m) {
        const pad=x=>String(x).padStart(2,"0");
        start=`${m[4]}-${pad(m[3])}-${pad(m[1])}`; end=`${m[4]}-${pad(m[3])}-${pad(m[2])}`; dateToken=m[0];
      }
    }
    if (!m) {
      m = raw.match(/(\d{4}[.-]\d{2}[.-]\d{2})/);
      if (m) { start=end=normalizeManualDatePart(m[1]); dateToken=m[0]; }
    }
    if (!start) return {status,rawText:raw,error:"Nie rozpoznano daty"};
    const city = cityFromText(raw);
    if (!city) return {status,rawText:raw,start,end,error:"Nie rozpoznano lokalizacji"};
    const participantsMatch = raw.match(/(\d+)\s*(?:os(?:oby|ób|oba)?|osoby|osób)/i);
    const participants = participantsMatch ? Number(participantsMatch[1]) : null;
    let title = raw
      .replace(/POTWIERDZONE\s+SZKOLENIE/ig,"")
      .replace(/ODPOTWIERDZONE/ig,"")
      .replace(dateToken,"")
      .replace(new RegExp(city === "Online" ? "(?:SZKOLENIE\\s+)?ONLINE" : city,"ig"),"")
      .replace(/\d+\s*(?:os(?:oby|ób|oba)?|osoby|osób)/ig,"")
      .replace(/^\s*["']|["']\s*$/g,"")
      .replace(/^[,.;:\s]+|[,.;:\s]+$/g,"")
      .trim();
    return {status,title,normalizedTitle:normalize(title),start,end,city,participants,rawText:raw};
  }

  function parseManualPaste(text) {
    return String(text||"").split(/\n+/).map(cleanLine).filter(line=>/POTWIERDZONE\s+SZKOLENIE|ODPOTWIERDZONE/i.test(line)).map(parseManualRecordLine).filter(Boolean);
  }

  function matchManualRecordsToCurrent(records) {
    return (records||[]).map(r=>({...r,similarity:r.title?titleSimilarity(state.eventisTitle,r.title):0})).filter(r=>r.error || r.similarity>=.58).sort((a,b)=>(b.similarity||0)-(a.similarity||0));
  }

  async function saveManualSnapshot(records, rawText) {
    const snapshot = { importedAt:new Date().toISOString(),hash:String(rawText.length)+":"+normalize(rawText).slice(0,64),records,rawText };
    await storageSet({manualSheetSnapshot:snapshot});
    state.manualRecords=records; state.manualMatches=matchManualRecordsToCurrent(records);
    await audit("MANUAL_SHEET_SNAPSHOT_IMPORTED",{records:records.length});
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

  async function useSource(source, {learn=false,origin="MANUAL_URL"}={}) {
    state.source=source;
    state.sourceTerms=source.terms || [];
    compareTerms();
    state.mappingVerifiedThisSession=false;
    if (learn) await saveMapping(source,origin);
    state.status="SOURCE_READY";
    render();
  }

  async function loadRememberedMapping() {
    if (!state.mapping?.sourceUrl) return;
    try {
      state.status="LOADING_MAPPING"; render();
      const source=await fetchTraining(state.mapping.sourceUrl);
      await useSource(source,{learn:false});
      const ms=mappingState();
      if(ms.kind==="danger"){
        state.mapping.status="REVIEW_REQUIRED";
        await audit("MAPPING_SUSPECTED",{score:ms.score,sourceUrl:source.url});
      }
    } catch (e) {
      state.status="MAPPING_ERROR";
      state.mappingError=e.message;
      render();
    }
  }

  async function verifyMapping() {
    if (!state.source) return;
    const ms=mappingState();
    if (ms.kind === "danger") return toast("Powiązanie jest zbyt niezgodne. Zmień link zamiast je potwierdzać.");
    state.mappingVerifiedThisSession=true;
    if (state.mapping) {
      const { mappings = {} } = await storageGet(["mappings"]);
      const key=mappingKey(state.organization,state.eventisId);
      if(mappings[key]) { mappings[key].lastVerifiedAt=new Date().toISOString(); mappings[key].confidence=ms.score; mappings[key].status="ACTIVE"; await storageSet({mappings}); state.mapping=mappings[key]; }
    }
    await audit("MAPPING_VERIFIED_THIS_SESSION",{score:ms.score,sourceUrl:state.source.url});
    compareTerms(); render();
  }

  function sourceConfirmedCount(){return state.sourceTerms.filter(t=>t.confirmed).length;}

  async function onLoadUrl() {
    const input=$("#esync-source-url");
    if(!input) return;
    const url=input.value.trim();
    if(!url) return toast("Wklej link szkolenia.");
    try {
      state.status="LOADING_SOURCE"; render();
      const source=await fetchTraining(url);
      await useSource(source,{learn:true,origin:"MANUAL_URL"});
      toast("Link działa i został zapamiętany. Teraz porównaj tytuły i potwierdź zgodność.");
    } catch(e){ state.status="ERROR";state.lastError=e.message;render(); }
  }

  async function onSearch() {
    try {
      state.status="SEARCHING";state.searchChoices=[];render();
      const choices=await searchTraining();
      state.searchChoices=choices;
      state.status=choices.length?"SEARCH_CHOICES":"SEARCH_EMPTY";
      render();
    } catch(e){state.status="ERROR";state.lastError=e.message;render();}
  }

  async function chooseSearchResult(url) {
    try {
      state.status="LOADING_SOURCE";render();
      const source=await fetchTraining(url);
      await useSource(source,{learn:true,origin:"USER_SELECTED"});
    }catch(e){state.status="ERROR";state.lastError=e.message;render();}
  }

  async function onAddMissing() {
    if (!state.mappingVerifiedThisSession) return toast("Najpierw potwierdź zgodność zapamiętanego/wybranego linku z ogłoszeniem Eventis.");
    compareTerms();
    if (!state.missingTerms.length) return toast("Brak brakujących potwierdzonych terminów.");
    try {
      const chosen=[...state.missingTerms];
      const result=await addSelectedTerms(chosen);
      await fillEventDetailsIfAdd(state.source,chosen);
      await createPendingOperation(result.added);
      await audit("FORM_FILLED",{terms:result.added.map(t=>({start:t.start,end:t.end,city:t.city,price:t.price}))});
      state.status="FORM_FILLED"; compareTerms(); render();
      toast("Formularz uzupełniony. Sprawdź go wizualnie i zapisz ręcznie w Eventis.");
    }catch(e){state.status="ERROR";state.lastError=e.message;render();}
  }

  async function switchOrganization(org) {
    if (!['SEMPER','IIST'].includes(org)||org===state.organization) return;
    state.organization=org;state.organizationDetectedBy="manual";state.source=null;state.sourceTerms=[];state.mappingVerifiedThisSession=false;state.searchChoices=[];
    const { mappings={} }=await storageGet(["mappings"]);
    state.mapping=mappings[mappingKey(org,state.eventisId)]||null;
    render();
    if(state.mapping) await loadRememberedMapping();
  }

  function renderTerm(t, status) {
    const badge = status === "missing" ? '<span class="esync-badge yellow">BRAK</span>' : status === "exists" ? '<span class="esync-badge green">JEST</span>' : '<span class="esync-badge gray">NIEPOTW.</span>';
    return `<div class="esync-term"><div><div class="esync-term-main">${esc(t.start)}${t.end&&t.end!==t.start?` → ${esc(t.end)}`:""} · ${esc(t.city)}</div><div class="esync-term-sub">${t.price?`${esc(t.price)} zł · `:""}${esc(t.durationDays||durationDays(t.start,t.end))} dni${t.confirmed?" · termin potwierdzony":""}</div></div><div>${badge}</div></div>`;
  }

  function renderMappingCard() {
    const orgClass=state.organization==="SEMPER"?"semper":"iist";
    const mapping=state.mapping;
    const source=state.source;
    const ms=mappingState();
    const remembered=mapping && source;
    const statusClass=ms.kind==="danger"?"esync-danger":ms.kind==="warning"||remembered?"esync-warning":"esync-info";
    const score=Math.round(ms.score*100);
    let warning="";
    if (remembered) {
      if(ms.kind==="danger") warning=`<div class="esync-danger"><b>🔴 Podejrzane powiązanie — operacje zablokowane</b><div class="esync-small">Podobieństwo tytułów: ${score}%. Wybierz właściwe szkolenie.</div></div>`;
      else if(!state.mappingVerifiedThisSession) warning=`<div class="${statusClass}"><b>⚠ Zapamiętane powiązanie — sprawdź</b><div class="esync-small">Link oszczędza wyszukiwanie, ale przed zmianą Eventis porównaj oba tytuły i potwierdź zgodność.</div><div class="esync-progress"><i style="width:${score}%"></i></div><div class="esync-small">Podobieństwo tytułów: ${score}%</div></div>`;
      else warning=`<div class="esync-success"><b>✓ Powiązanie zweryfikowane w tej sesji</b><div class="esync-small">Możesz uzupełnić brakujące terminy.</div></div>`;
    }
    const choices=state.searchChoices.length?`<div class="esync-card"><h3>Wyniki wyszukiwania</h3>${state.searchChoices.map(c=>`<button class="esync-choice" data-choice-url="${esc(c.url)}"><b>${esc(c.title)}</b><small>Dopasowanie ${Math.round((c.similarity||0)*100)}%</small></button>`).join("")}</div>`:"";
    return `<div class="esync-card">
      <div class="esync-row esync-between"><h3>Źródło szkolenia</h3><span class="esync-badge ${orgClass}">${esc(state.organization)}</span></div>
      <div class="esync-small esync-muted">Eventis: <b>#${esc(state.eventisId)}</b></div>
      <div class="esync-title">${esc(state.eventisTitle||"Nie odczytano tytułu")}</div>
      ${source?`<div class="esync-source-title"><b>${esc(state.organization)}:</b> ${esc(source.title)}</div>`:""}
      ${warning}
      <div class="esync-divider"></div>
      <input id="esync-source-url" class="esync-input" type="url" value="${esc(source?.url||mapping?.sourceUrl||"")}" placeholder="Link szkolenia ${esc(state.organization)}">
      <div class="esync-grid2" style="margin-top:6px">
        <button id="esync-load-url" class="esync-btn primary">Użyj i zapamiętaj</button>
        <button id="esync-search" class="esync-btn">Szukaj automatycznie</button>
        ${source?`<button id="esync-open-source" class="esync-btn">Otwórz źródło</button>`:"<span></span>"}
        ${mapping?`<button id="esync-forget" class="esync-btn danger">Zapomnij link</button>`:""}
      </div>
      ${source && !state.mappingVerifiedThisSession && ms.kind!=="danger"?`<button id="esync-verify" class="esync-btn warn" style="width:100%;margin-top:7px">✓ Potwierdzam zgodność tytułu i linku</button>`:""}
      ${state.status==="SEARCHING"||state.status==="LOADING_SOURCE"||state.status==="LOADING_MAPPING"?`<div class="esync-info esync-small">Trwa pobieranie danych…</div>`:""}
      ${state.status==="SEARCH_EMPTY"?`<div class="esync-warning esync-small">Nie znaleziono pewnego wyniku. Wklej link ręcznie — po poprawnym odczycie zostanie zapamiętany.</div>`:""}
      ${state.status==="ERROR"?`<div class="esync-danger esync-small">${esc(state.lastError||"Błąd")}</div>`:""}
      ${state.status==="MAPPING_ERROR"?`<div class="esync-danger esync-small">Zapamiętany link nie zadziałał: ${esc(state.mappingError||"")}. Wybierz nowy link.</div>`:""}
    </div>${choices}`;
  }

  function renderTermsCard() {
    if(!state.source) return "";
    compareTerms();
    const confirmed=state.sourceTerms.filter(t=>t.confirmed), unconfirmed=state.sourceTerms.filter(t=>!t.confirmed);
    const existingKeys=new Set(state.existingTerms.map(existingKey));
    return `<div class="esync-card">
      <div class="esync-section-title"><span>Porównanie terminów</span><button id="esync-refresh" class="esync-btn" style="min-height:25px;padding:3px 6px">Sprawdź ponownie</button></div>
      <div class="esync-kpi"><div><b>${confirmed.length}</b><span>potwierdzone</span></div><div><b>${state.existingTerms.length}</b><span>Eventis</span></div><div><b>${state.missingTerms.length}</b><span>brakujące</span></div></div>
      ${confirmed.length?confirmed.map(t=>renderTerm(t,existingKeys.has(existingKey(t))?"exists":"missing")).join(""):`<div class="esync-warning esync-small">Na stronie źródłowej nie wykryto żadnego terminu oznaczonego jako potwierdzony/gwarantowany. Rozszerzenie niczego nie doda.</div>`}
      ${unconfirmed.length?`<details><summary class="esync-small esync-muted">Pokaż ${unconfirmed.length} niepotwierdzonych (tylko informacyjnie)</summary>${unconfirmed.map(t=>renderTerm(t,"unconfirmed")).join("")}</details>`:""}
      <button id="esync-add-missing" class="esync-btn good" style="width:100%;margin-top:8px" ${!state.mappingVerifiedThisSession||!state.missingTerms.length?'disabled':''}>Uzupełnij brakujące potwierdzone (${state.missingTerms.length})</button>
      <button id="esync-queue-existing" class="esync-btn" style="width:100%;margin-top:5px" ${!state.mappingVerifiedThisSession||!confirmed.length?'disabled':''}>Zarejestruj potwierdzone, które już istnieją</button>
      ${state.status==="FORM_FILLED"?`<div class="esync-success"><b>Formularz został uzupełniony.</b><br>Zweryfikuj go wizualnie i kliknij zapis w Eventis. Rozszerzenie nie zapisuje formularza automatycznie.</div>`:""}
    </div>`;
  }

  function renderPendingCard(){
    if(!state.pendingOperation) return "";
    if(state.pendingOperation.createdPageLoadId===PAGE_LOAD_ID) return `<div class="esync-card"><div class="esync-warning"><b>⏳ Oczekiwanie na ręczny zapis Eventis</b><div class="esync-small">Po zapisaniu i przeładowaniu strony rozszerzenie zweryfikuje obecność nowych terminów.</div></div></div>`;
    if(state.pendingLooksSaved) return `<div class="esync-card"><div class="esync-warning"><b>⚠ Terminy są widoczne po ponownym otwarciu strony</b><div class="esync-small">Nie wykryłem jednoznacznego komunikatu sukcesu Eventis. Jeżeli zapis rzeczywiście się udał, potwierdź ręcznie.</div><button id="esync-confirm-save" class="esync-btn good" style="width:100%;margin-top:7px">Potwierdzam: Eventis zapisał zmiany</button></div></div>`;
    return `<div class="esync-card"><div class="esync-danger"><b>Nie potwierdzono zapisu</b><div class="esync-small">Istnieje oczekująca operacja, ale nie wszystkie dodane terminy są obecne w formularzu po ponownym otwarciu.</div></div></div>`;
  }

  function renderManualCard() {
    const matches=state.manualMatches||[];
    const deconf=deconfirmedExistingMatches();
    return `<div class="esync-card">
      <details ${matches.length?'open':''}><summary><b>Awaryjny import POTWIERDZONE / ODPOTWIERDZONE</b></summary>
      <div class="esync-small esync-muted" style="margin:6px 0">Fallback na wypadek problemów z Google Sheets. Dane są zapisywane lokalnie jako snapshot.</div>
      <textarea id="esync-manual-paste" class="esync-textarea" placeholder="Wklej rekordy z arkusza…"></textarea>
      <button id="esync-parse-manual" class="esync-btn" style="width:100%;margin-top:5px">Analizuj i zapisz snapshot</button>
      ${matches.length?`<div class="esync-divider"></div><b class="esync-small">Rekordy pasujące do bieżącego szkolenia:</b>${matches.slice(0,8).map(r=>`<div class="esync-term"><div><div class="esync-term-main">${r.status==="CONFIRMED"?'✓ POTWIERDZONE':'↘ ODPOTWIERDZONE'} · ${esc(r.start||'?')}${r.end&&r.end!==r.start?` → ${esc(r.end)}`:''} · ${esc(r.city||'?')}</div><div class="esync-term-sub">${r.error?`BŁĄD: ${esc(r.error)}`:`Dopasowanie tytułu ${Math.round((r.similarity||0)*100)}%`}</div></div><span class="esync-badge ${r.status==='CONFIRMED'?'green':'red'}">${r.status==='CONFIRMED'?'MA BYĆ':'USUŃ'}</span></div>`).join('')}`:''}
      ${deconf.length?`<div class="esync-danger"><b>Wykryto ODPOTWIERDZONE terminy obecne w Eventis</b>${deconf.map(x=>`<button class="esync-btn danger" data-highlight-remove="${esc(x.event.id)}" style="width:100%;margin-top:5px">Podświetl ${esc(x.record.start)} · ${esc(x.record.city)}</button>`).join('')}<div class="esync-small" style="margin-top:5px">v0.1 tylko podświetla dokładny termin do usunięcia. Automatyczne usuwanie dodamy po potwierdzeniu stabilnego selektora Eventis i reguły „minimum jeden termin”.</div></div>`:''}
      </details>
    </div>`;
  }

  async function renderOutboxStatus() {
    const {sheetOutbox=[]}=await storageGet(["sheetOutbox"]);
    const pending=sheetOutbox.filter(x=>x.status!=="DONE"&&x.status!=="CANCELLED").length;
    const el=$("#esync-outbox-count"); if(el) el.textContent=String(pending);
  }

  function render() {
    let root=$("#esync-root");
    if(!root){root=document.createElement("aside");root.id="esync-root";document.body.appendChild(root);}
    root.innerHTML=`<div class="esync-head"><div class="esync-head-text"><div class="esync-head-title">Eventis Sync <span class="esync-badge ${state.organization==='SEMPER'?'semper':'iist'}">${esc(state.organization)}</span></div><div class="esync-head-sub">v${VERSION} · operator ${esc(state.settings.operatorInitial||'K')} · outbox <span id="esync-outbox-count">0</span></div></div><div class="esync-head-actions"><button class="esync-icon-btn ${state.organization==='SEMPER'?'semper':'iist'}" id="esync-org" title="Zmień SEMPER / IIST">${esc(state.organization)}</button><button class="esync-icon-btn" id="esync-settings" title="Ustawienia">⚙</button><button class="esync-icon-btn esync-collapse" id="esync-collapse" title="Zwiń">−</button></div></div><div class="esync-body">${renderMappingCard()}${renderPendingCard()}${renderTermsCard()}${renderManualCard()}<div class="esync-footer">TYLKO POTWIERDZONE · brak automatycznego zapisu formularza</div></div>`;
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
    $("#esync-add-missing")?.addEventListener("click",onAddMissing);
    $("#esync-queue-existing")?.addEventListener("click",queueExistingTerms);
    $("#esync-confirm-save")?.addEventListener("click",()=>confirmPendingSaved("USER_CONFIRM"));
    $$('[data-choice-url]',$("#esync-root")||document).forEach(btn=>btn.addEventListener("click",()=>chooseSearchResult(btn.dataset.choiceUrl)));
    $("#esync-parse-manual")?.addEventListener("click",async()=>{
      const raw=$("#esync-manual-paste")?.value||"";
      const records=parseManualPaste(raw);
      if(!records.length)return toast("Nie znaleziono rekordów POTWIERDZONE SZKOLENIE ani ODPOTWIERDZONE.");
      await saveManualSnapshot(records,raw);render();toast(`Rozpoznano ${records.length} rekordów.`);
    });
    $$('[data-highlight-remove]',$("#esync-root")||document).forEach(btn=>btn.addEventListener("click",()=>highlightDeconfirmedTerm(btn.dataset.highlightRemove)));
  }

  function observeTitleChanges() {
    const field=$('textarea[name="event[title]"],input[name="event[title]"],#title');
    if(!field)return;
    field.addEventListener("change",()=>{state.eventisTitle=getEventisTitle();state.manualMatches=matchManualRecordsToCurrent(state.manualRecords);render();});
  }

  async function init() {
    await loadSettingsAndState();
    render();
    observeTitleChanges();
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
    }
  }

  init().catch(e=>{console.error("Eventis Sync init",e);state.status="ERROR";state.lastError=e.message;render();});
})();
