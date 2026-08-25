(() => {
  "use strict";

  if (!/^\/company\/listevents(?:\/|$)/i.test(location.pathname)) return;
  if (window.__EVENTIS_SYNC_LISTA__) return;
  window.__EVENTIS_SYNC_LISTA__ = true;

  const KONFIGURACJA = globalThis.EventisSyncConfig;
  const NARZEDZIA_WYSZUKIWANIA = globalThis.NarzedziaWyszukiwaniaEventis;
  const NARZEDZIA_ARKUSZA = globalThis.NarzedziaArkuszaEventis;
  const NARZEDZIA_KOLEJKI = globalThis.NarzedziaKolejkiEventis;
  const NARZEDZIA_LISTY = globalThis.NarzedziaListyEventis;
  if (!KONFIGURACJA || !NARZEDZIA_WYSZUKIWANIA || !NARZEDZIA_ARKUSZA || !NARZEDZIA_KOLEJKI || !NARZEDZIA_LISTY) {
    throw new Error("Nie załadowano modułów kolejki listy Eventis.");
  }

  const stan = {
    ustawienia:{...KONFIGURACJA.DEFAULT_SETTINGS},
    organizacja:"SEMPER",
    rekordy:[],
    surowyTekst:"",
    kolejka:[],
    mapowania:{},
    ogloszenia:[],
    dopasowania:[],
    nierozpoznane:[],
    liczbaBledow:0,
    liczbaDuplikatow:0,
    komunikat:""
  };

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

  function pobierzOgloszeniaZListy() {
    const wedlugId = new Map();
    for (const link of $$('a[href*="/event/edit"]')) {
      let url;
      try { url = new URL(link.getAttribute("href"),location.href); } catch (_) { continue; }
      const eventisId = NARZEDZIA_LISTY.pobierzIdEventisZUrl(url.href);
      if (!eventisId) continue;
      const kontener = link.closest("tr, article, li, .event, .card, .panel, .row") || link.parentElement;
      const tytuly = wedlugId.get(eventisId)?.tytuly || [];
      dodajKandydata(tytuly,link.textContent);
      dodajKandydata(tytuly,link.getAttribute("title"));
      dodajKandydata(tytuly,link.getAttribute("aria-label"));
      for (const element of $$('[data-title], .event-title, .title, h2, h3, h4, td, a',kontener || document)) {
        dodajKandydata(tytuly,element.getAttribute?.("data-title"));
        dodajKandydata(tytuly,element.textContent);
      }
      dodajKandydata(tytuly,kontener?.textContent);
      wedlugId.set(eventisId,{eventisId,url:url.href,tytuly});
    }
    return [...wedlugId.values()];
  }

  function elementyDotyczaceRekordow(kolejka, rekordy) {
    const klucze = new Set(rekordy.filter(rekord => rekord.status === "CONFIRMED" && !rekord.error).map(NARZEDZIA_ARKUSZA.recordKey));
    return kolejka.filter(element => element.organization === stan.organizacja && klucze.has(element.recordKey));
  }

  function ocenGotowoscDopasowan(dopasowania) {
    const prog = stan.ustawienia.mappingWarningThreshold;
    return dopasowania.map(dopasowanie => {
      const mapowanie = stan.mapowania[`${stan.organizacja}|${dopasowanie.ogloszenie.eventisId}`];
      return { ...dopasowanie, gotowe:NARZEDZIA_LISTY.czyMapowanieGotoweDoAutomatyzacji(mapowanie,prog) };
    });
  }

  async function analizujWklejonyTekst() {
    const pole = $("#esync-lista-paste");
    const surowyTekst = pole?.value.trim() || "";
    if (!surowyTekst) return pokazKomunikat("Wklej listę potwierdzonych szkoleń.");
    const rekordy = NARZEDZIA_ARKUSZA.parseManualPaste(surowyTekst);
    if (!rekordy.length) return pokazKomunikat("Nie znaleziono wierszy POTWIERDZONE SZKOLENIE.");
    const dane = await chrome.storage.local.get(["eventisImportQueue","mappings"]);
    const kolejka = Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : [];
    const przygotowane = NARZEDZIA_KOLEJKI.przygotujElementyKolejki(rekordy,kolejka,{organization:stan.organizacja});
    const kolejkaPodgladu = [...kolejka,...przygotowane.items];
    stan.surowyTekst = surowyTekst;
    stan.rekordy = rekordy;
    stan.kolejka = kolejka;
    stan.mapowania = dane.mappings || {};
    stan.ogloszenia = pobierzOgloszeniaZListy();
    stan.liczbaBledow = rekordy.filter(rekord => rekord.error).length;
    stan.liczbaDuplikatow = przygotowane.duplicates;
    const wynik = NARZEDZIA_LISTY.dopasujKolejkeDoOgloszen(elementyDotyczaceRekordow(kolejkaPodgladu,rekordy),stan.ogloszenia,stan.organizacja);
    stan.dopasowania = ocenGotowoscDopasowan(wynik.dopasowane);
    stan.nierozpoznane = wynik.nierozpoznane;
    stan.komunikat = "";
    renderuj();
  }

  async function zatwierdzISprawdzKolejke() {
    const gotowe = stan.dopasowania.filter(dopasowanie => dopasowanie.gotowe);
    if (!gotowe.length) return pokazKomunikat("Brak kart z aktywnym, wcześniej zweryfikowanym mapowaniem SEMPER/IIST.");
    const dane = await chrome.storage.local.get(["eventisImportQueue","eventisAutomaticBatches"]);
    const obecnaKolejka = Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : [];
    const przygotowane = NARZEDZIA_KOLEJKI.przygotujElementyKolejki(stan.rekordy,obecnaKolejka,{organization:stan.organizacja});
    const kolejka = [...obecnaKolejka,...przygotowane.items];
    const aktualneElementy = elementyDotyczaceRekordow(kolejka,stan.rekordy);
    const wynik = NARZEDZIA_LISTY.dopasujKolejkeDoOgloszen(aktualneElementy,pobierzOgloszeniaZListy(),stan.organizacja);
    const gotoweId = new Set(gotowe.map(dopasowanie => dopasowanie.ogloszenie.eventisId));
    const zatwierdzone = wynik.dopasowane.filter(dopasowanie => gotoweId.has(dopasowanie.ogloszenie.eventisId));
    if (!zatwierdzone.length) return pokazKomunikat("Dopasowania listy zmieniły się. Uruchom analizę ponownie.");
    const seria = NARZEDZIA_LISTY.utworzSerieAutomatyczna(zatwierdzone,stan.organizacja);
    const serie = {...(dane.eventisAutomaticBatches || {}),[seria.identyfikatorSerii]:seria};
    const migawka = {importedAt:new Date().toISOString(),hash:String(stan.surowyTekst.length)+":"+NARZEDZIA_WYSZUKIWANIA.normalizujTytul(stan.surowyTekst).slice(0,64),records:stan.rekordy,rawText:stan.surowyTekst};
    await chrome.storage.local.set({eventisImportQueue:kolejka,eventisAutomaticBatches:serie,manualSheetSnapshot:migawka});
    const odpowiedz = await chrome.runtime.sendMessage({type:"OPEN_EVENTIS_TABS",urls:seria.zadania.map(zadanie => zadanie.eventisUrl)});
    if (!odpowiedz?.ok) return pokazKomunikat(odpowiedz?.error || "Nie udało się otworzyć kart Eventis.");
    stan.kolejka = kolejka;
    stan.komunikat = `Uruchomiono ${odpowiedz.opened} kart. Formularze zostaną uzupełnione, ale wymagają ręcznej kontroli i zapisu.`;
    renderuj();
    pokazKomunikat(stan.komunikat);
  }

  function renderujWyniki() {
    if (!stan.rekordy.length) return "";
    const gotowe = stan.dopasowania.filter(dopasowanie => dopasowanie.gotowe);
    const bezMapowania = stan.dopasowania.filter(dopasowanie => !dopasowanie.gotowe);
    const wiersze = stan.dopasowania.map(dopasowanie => `<div class="esync-import-row"><div><div class="esync-term-main">${esc(dopasowanie.tytul)}</div><div class="esync-term-sub">Eventis #${esc(dopasowanie.ogloszenie.eventisId)} · ${Math.round(dopasowanie.wynik*100)}% · ${dopasowanie.elementy.length} termin(y)</div>${dopasowanie.gotowe?'<div class="esync-small" style="color:#147a36">Gotowe do uruchomienia</div>':'<div class="esync-small esync-danger">Brak aktywnego, zweryfikowanego mapowania — karta nie zostanie uruchomiona automatycznie.</div>'}</div></div>`).join("");
    const nierozpoznane = stan.nierozpoznane.map(pozycja => `<div class="esync-import-row"><div><div class="esync-term-main">${esc(pozycja.tytul)}</div><div class="esync-small esync-danger">Brak jednoznacznego dopasowania na bieżącej stronie listy.</div></div></div>`).join("");
    return `<div class="esync-card"><div class="esync-section-title"><span>Wynik analizy</span><span>${stan.rekordy.length} rekordów</span></div><div class="esync-import-summary"><span>Gotowe: <b>${gotowe.length}</b></span><span>Bez mapowania: <b>${bezMapowania.length}</b></span><span>Nierozpoznane: <b>${stan.nierozpoznane.length}</b></span><span>Duplikaty: <b>${stan.liczbaDuplikatow}</b></span></div>${stan.liczbaBledow?`<div class="esync-danger esync-small">Błędne rekordy: ${stan.liczbaBledow}. Nie trafią do kolejki.</div>`:""}${wiersze}${nierozpoznane}<button id="esync-lista-start" class="esync-btn good" style="width:100%;margin-top:8px" ${gotowe.length?"":"disabled"}>Zatwierdź i otwórz karty (${gotowe.length})</button><div class="esync-small esync-muted" style="margin-top:6px">Wtyczka nie zapisuje formularzy automatycznie. Każdą otwartą kartę sprawdź i zapisz ręcznie.</div></div>`;
  }

  function renderuj() {
    let korzen = $("#esync-root");
    if (!korzen) {
      korzen = document.createElement("aside");
      korzen.id = "esync-root";
      document.body.appendChild(korzen);
    }
    korzen.innerHTML = `<div class="esync-head"><div class="esync-head-text"><div class="esync-head-title">Kolejka potwierdzonych terminów <span class="esync-badge ${stan.organizacja==='SEMPER'?'semper':'iist'}">${esc(stan.organizacja)}</span></div><div class="esync-head-sub">Lista wydarzeń Eventis · zapis ręczny</div></div><div class="esync-head-actions"><button class="esync-icon-btn esync-collapse" id="esync-lista-collapse" title="Zwiń">−</button></div></div><div class="esync-body"><div class="esync-card"><div class="esync-section-title"><span>Wklej potwierdzone szkolenia</span><span class="esync-small">format tabeli lub wierszy</span></div><textarea id="esync-lista-paste" class="esync-textarea" placeholder='| POTWIERDZONE SZKOLENIE | "Tytuł", 2026-09-21 do 2026-09-22, ONLINE, 2 osoby'>${esc(stan.surowyTekst)}</textarea><button id="esync-lista-analizuj" class="esync-btn primary" style="width:100%;margin-top:7px">Analizuj kolejkę i dopasuj karty</button></div>${renderujWyniki()}${stan.komunikat?`<div class="esync-success">${esc(stan.komunikat)}</div>`:""}<div class="esync-footer">TYLKO POTWIERDZONE · BEZ AUTOMATYCZNEGO ZAPISU</div></div>`;
    $("#esync-lista-collapse")?.addEventListener("click",() => {
      korzen.classList.toggle("esync-collapsed");
      $("#esync-lista-collapse").textContent = korzen.classList.contains("esync-collapsed") ? "+" : "−";
    });
    $("#esync-lista-analizuj")?.addEventListener("click",() => analizujWklejonyTekst().catch(blad => pokazKomunikat(blad.message)));
    $("#esync-lista-start")?.addEventListener("click",() => zatwierdzISprawdzKolejke().catch(blad => pokazKomunikat(blad.message)));
  }

  async function inicjalizuj() {
    const dane = await chrome.storage.local.get(["settings"]);
    stan.ustawienia = {...KONFIGURACJA.DEFAULT_SETTINGS,...(dane.settings || {})};
    stan.organizacja = wykryjOrganizacje();
    stan.ogloszenia = pobierzOgloszeniaZListy();
    renderuj();
  }

  inicjalizuj().catch(blad => console.error("Kolejka listy Eventis",blad));
})();
