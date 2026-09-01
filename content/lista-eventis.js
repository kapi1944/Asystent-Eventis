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
    rozstrzygniecia:[],
    decyzje:{},
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
    stan.rozstrzygniecia = [
      ...wynik.dopasowane.map(dopasowanie => dopasowanie.resolver),
      ...wynik.nierozpoznane.map(pozycja => pozycja.powod === "COLLISION"
        ? {...pozycja.resolver,status:"AMBIGUOUS",selectedCandidate:null,reason:"COLLISION"}
        : pozycja.resolver)
    ];
    stan.decyzje = {};
    stan.komunikat = "";
    renderuj();
  }

  function renderujWyniki() {
    if (!stan.rekordy.length) return "";
    const automatyczne = stan.rozstrzygniecia.filter(pozycja => pozycja.status === "AUTO_MATCH").length;
    const wymagajaWyboru = stan.rozstrzygniecia.filter(pozycja => pozycja.status === "AMBIGUOUS").length;
    const nieZnaleziono = stan.rozstrzygniecia.filter(pozycja => pozycja.status === "NOT_FOUND").length;
    const wymagajaceRozstrzygniecia = stan.rozstrzygniecia.filter(pozycja => pozycja.status !== "AUTO_MATCH").map((pozycja, indeks) => {
      const aktualna = aktualneRozstrzygniecie(pozycja);
      const liczby = liczbyTerminow(pozycja);
      const wybrano = aktualna.manualStatus === "MANUAL_MATCH" ? `<div class="esync-success esync-small">Wybrano Eventis #${esc(aktualna.selectedCandidate.eventId)}.</div>` : "";
      const pominieto = aktualna.manualStatus === "SKIPPED" ? '<div class="esync-info esync-small">Tytuł pominięty.</div>' : "";
      const kandydaci = pozycja.status === "AMBIGUOUS" ? (pozycja.candidates || []).map(kandydat => `<label class="esync-choice"><input type="radio" name="esync-wybor-${indeks}" data-wybor-klucz="${esc(kluczRozstrzygniecia(pozycja))}" value="${esc(kandydat.eventId)}" ${aktualna.manualStatus === "MANUAL_MATCH" && aktualna.selectedCandidate.eventId === kandydat.eventId ? "checked" : ""}> <b>${esc(kandydat.title)}</b><small>${esc(kandydat.url)}</small></label>`).join("") : "";
      const recznyUrl = pozycja.status === "NOT_FOUND" ? `<div class="esync-manual-preview"><input class="esync-input" data-reczny-url="${esc(kluczRozstrzygniecia(pozycja))}" placeholder="https://eventis.pl/event/edit/123"><button class="esync-btn" data-zatwierdz-url="${esc(kluczRozstrzygniecia(pozycja))}" style="width:100%;margin-top:5px">Wybierz ręcznie URL Eventis</button></div>` : "";
      const szukaj = pozycja.status === "NOT_FOUND" ? `<button class="esync-btn" data-ponow-wyszukiwanie="1" style="width:100%;margin-top:5px">Wyszukaj ponownie</button>` : "";
      return `<div class="esync-import-row"><div style="width:100%"><div class="esync-term-main">${esc(pozycja.sourceTitle)}</div><div class="esync-term-sub">${liczby.potwierdzone} potwierdzone · ${liczby.odpotwierdzone} odpotwierdzone</div>${pozycja.status === "AMBIGUOUS" ? '<div class="esync-warning esync-small">Wybierz dokładnie jedno wydarzenie Eventis.</div>' : '<div class="esync-danger esync-small">Nie znaleziono automatycznego dopasowania.</div>'}${kandydaci}${wybrano}${pominieto}${recznyUrl}${szukaj}<button class="esync-btn warn" data-pomin-tytul="${esc(kluczRozstrzygniecia(pozycja))}" style="width:100%;margin-top:5px">Pomiń ten tytuł</button></div></div>`;
    }).join("");
    const plan = NARZEDZIA_LISTY.utworzPlanOtwarcia(stan.rozstrzygniecia.map(aktualneRozstrzygniecie));
    const planWiersze = plan.pozycje.map(pozycja => pozycja.status === "READY"
      ? `<div class="esync-small">✓ ${esc(pozycja.sourceTitle)} → ${esc(pozycja.selectedCandidate.url)}</div>`
      : `<div class="esync-small">○ ${esc(pozycja.sourceTitle)} → pominięte</div>`).join("");
    return `<div class="esync-card"><div class="esync-section-title"><span>Podsumowanie resolucji</span><span>${stan.rozstrzygniecia.length} tytułów</span></div><div class="esync-import-summary"><span>✓ automatycznie: <b>${automatyczne}</b></span><span>⚠ wybór: <b>${wymagajaWyboru}</b></span><span>✕ nie znaleziono: <b>${nieZnaleziono}</b></span><span>Duplikaty: <b>${stan.liczbaDuplikatow}</b></span></div>${stan.liczbaBledow?`<div class="esync-danger esync-small">Błędne rekordy: ${stan.liczbaBledow}. Nie trafią do kolejki.</div>`:""}${wymagajaceRozstrzygniecia}<div class="esync-divider"></div><div class="esync-section-title"><span>Plan otwarcia</span></div>${planWiersze || '<div class="esync-small esync-muted">Brak pozycji w planie.</div>'}<div class="esync-import-summary"><span>Gotowe do otwarcia: <b>${plan.gotoweDoOtwarcia}</b></span><span>Nierozstrzygnięte: <b>${plan.nierozstrzygniete}</b></span></div><div class="esync-small esync-muted">Ten etap tylko tworzy plan — nie otwiera kart i nie zapisuje zmian.</div></div>`;
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
    $$('[data-wybor-klucz]').forEach(pole => pole.addEventListener("change",() => {
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === pole.dataset.wyborKlucz);
      const wybor = NARZEDZIA_LISTY.wybierzKandydataRozstrzygniecia(zrodlo,pole.value);
      if (wybor) stan.decyzje[pole.dataset.wyborKlucz] = wybor;
      renderuj();
    }));
    $$('[data-pomin-tytul]').forEach(przycisk => przycisk.addEventListener("click",() => {
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === przycisk.dataset.pominTytul);
      if (zrodlo) stan.decyzje[przycisk.dataset.pominTytul] = NARZEDZIA_LISTY.pominRozstrzygniecie(zrodlo);
      renderuj();
    }));
    $$('[data-zatwierdz-url]').forEach(przycisk => przycisk.addEventListener("click",() => {
      const klucz = przycisk.dataset.zatwierdzUrl;
      const pole = $$('[data-reczny-url]').find(element => element.dataset.recznyUrl === klucz);
      const zrodlo = stan.rozstrzygniecia.find(pozycja => kluczRozstrzygniecia(pozycja) === klucz);
      const wybor = NARZEDZIA_LISTY.wybierzRecznyUrlEventis(zrodlo,pole?.value || "");
      if (!wybor) return pokazKomunikat("Podaj bezpieczny adres edycji wydarzenia Eventis.");
      stan.decyzje[klucz] = wybor;
      renderuj();
    }));
    $$('[data-ponow-wyszukiwanie]').forEach(przycisk => przycisk.addEventListener("click",() => analizujWklejonyTekst().catch(blad => pokazKomunikat(blad.message))));
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
