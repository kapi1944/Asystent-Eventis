(() => {
  "use strict";
  const korzen = document.querySelector("#esync-root");
  const komunikat = document.querySelector("#komunikat");
  const selektor = "button,input,textarea,select,details,a";
  let ostatniHtml = "";
  let wersja = 0;
  let identyfikatorKarty = null;
  let trwaAkcja = false;
  let ostatnieWartosci = [];
  let trwaZanikanie = false;
  let trwaOdswiezanie = false;
  let identyfikatorOkna = null;
  const przypisanaKarta = Number(new URL(location.href).searchParams.get("karta")) || null;
  let kontekst = null;
  let rewizja = 0;
  let port;
  function zglosWidocznosc() {
    const karta = przypisanaKarta ?? identyfikatorKarty;
    if (karta !== null) port?.postMessage({identyfikatorKarty:karta,widoczny:document.visibilityState !== "hidden"});
  }
  function uniewaznijKontekst() {
    rewizja++;
    korzen.replaceChildren();
    ostatniHtml = "";
    identyfikatorKarty = null;
    kontekst = null;
    komunikat.textContent = "Odczytywanie aktywnej karty Eventis…";
    odswiez();
  }
  function polaczPanel() {
    if (!chrome.runtime.connect) return;
    port = chrome.runtime.connect({name:"panel-boczny"});
    port.onDisconnect.addListener(() => { port = null; uniewaznijKontekst(); setTimeout(polaczPanel,1000); });
    port.onMessage?.addListener(wiadomosc => {
      if (wiadomosc.type === "ZMIANA_KONTEKSTU_PANELU") uniewaznijKontekst();
      if (wiadomosc.type === "ZMIANA_WIDOKU_PANELU") odswiez();
    });
    zglosWidocznosc();
  }
  polaczPanel();

  function kluczPozycji(element) {
    return element.dataset.kluczKarty || element.querySelector('[data-queue-remove]')?.dataset.queueRemove;
  }

  async function zwinPozycje(element) {
    element.style.pointerEvents = "none";
    element.setAttribute("aria-hidden","true");
    await element.animate([{opacity:1},{opacity:0}],{duration:180,fill:"forwards"}).finished;
    const wyglad = getComputedStyle(element);
    await element.animate([
      {height:`${element.getBoundingClientRect().height}px`,marginTop:wyglad.marginTop,marginBottom:wyglad.marginBottom,paddingTop:wyglad.paddingTop,paddingBottom:wyglad.paddingBottom,borderTopWidth:wyglad.borderTopWidth,borderBottomWidth:wyglad.borderBottomWidth},
      {height:"0px",marginTop:"0px",marginBottom:"0px",paddingTop:"0px",paddingBottom:"0px",borderTopWidth:"0px",borderBottomWidth:"0px"}
    ],{duration:240,easing:"ease-in-out",fill:"forwards"}).finished;
    element.remove();
  }

  async function odswiez() {
    if (trwaOdswiezanie || trwaAkcja || trwaZanikanie || (korzen.contains(document.activeElement) && document.activeElement.matches("input,textarea,select"))) return;
    trwaOdswiezanie = true;
    const biezacaRewizja = rewizja;
    try {
      if (identyfikatorOkna === null && chrome.windows?.getCurrent) identyfikatorOkna = (await chrome.windows.getCurrent()).id;
      const widok = await chrome.runtime.sendMessage({type:"PRZEKAZ_DO_PANELU",identyfikatorOkna,identyfikatorKarty:przypisanaKarta,wiadomosc:{type:"POBIERZ_WIDOK_PANELU"}});
      if (biezacaRewizja !== rewizja) return;
      if (trwaAkcja || (korzen.contains(document.activeElement) && document.activeElement.matches("input,textarea,select"))) return;
      if (!widok?.ok) throw new Error(widok?.error || "Otwórz kartę Eventis.");
      komunikat.textContent = widok.komunikat || "";
      const skala = typeof widok.skala === "number" && Number.isFinite(widok.skala) ? Math.max(60,Math.min(140,widok.skala)) : 100;
      korzen.style.setProperty("--esync-skala",String(skala / 100));
      if (widok.html !== ostatniHtml || identyfikatorKarty !== widok.identyfikatorKarty) {
        const przewiniecie = window.scrollY;
        const przewiniecieListy = korzen.querySelector(".esync-body")?.scrollTop || 0;
        const aktywny = document.activeElement;
        const taSamaKarta = identyfikatorKarty === widok.identyfikatorKarty;
        const aktywnyId = taSamaKarta && korzen.contains(aktywny)
          ? aktywny.id || aktywny.closest("summary")?.parentElement.id : "";
        const selektorPozycji = "[data-klucz-karty],.esync-termin-kolejki,.esync-import-row";
        const poprzedniePozycje = Array.from(korzen.querySelectorAll(selektorPozycji));
        korzen.innerHTML = widok.html;
        const nowePozycje = Array.from(korzen.querySelectorAll(selektorPozycji));
        const znajdzPozycje = element => nowePozycje.find(nowy => nowy.matches(element.dataset.kluczKarty ? "[data-klucz-karty]" : element.matches(".esync-import-row") ? ".esync-import-row" : ".esync-termin-kolejki") && kluczPozycji(nowy) === kluczPozycji(element));
        const znikajace = [];
        if (taSamaKarta && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          for (const element of poprzedniePozycje) {
            if (!kluczPozycji(element) || znajdzPozycje(element)) continue;
            const karta = element.parentElement.closest("[data-klucz-karty]");
            if (karta && !znajdzPozycje(karta)) continue;
            const nastepny = Array.from(element.parentElement.children).slice(Array.from(element.parentElement.children).indexOf(element)+1).map(znajdzPozycje).find(Boolean);
            const rodzic = nastepny?.parentElement || (karta ? znajdzPozycje(karta) : nowePozycje.find(nowy => nowy.matches(element.dataset.kluczKarty ? "[data-klucz-karty]" : ".esync-import-row"))?.parentElement);
            if (!rodzic) continue;
            const kopia = element.cloneNode(true);
            kopia.setAttribute("aria-hidden","true");
            kopia.inert = true;
            kopia.style.overflow = "hidden";
            rodzic.insertBefore(kopia,nastepny || null);
            znikajace.push(kopia);
          }
        }
        ostatniHtml = widok.html;
        if (aktywnyId) {
          const odtworzony = korzen.querySelector(`#${CSS.escape(aktywnyId)}`);
          (aktywny.matches("summary") ? odtworzony?.querySelector(":scope > summary") : odtworzony)?.focus({preventScroll:true});
        }
        const lista = korzen.querySelector(".esync-body");
        if (lista) lista.scrollTop = przewiniecieListy;
        window.scrollTo(0,przewiniecie);
        if (znikajace.length) {
          trwaZanikanie = true;
          Promise.all(znikajace.map(zwinPozycje)).finally(() => { trwaZanikanie = false; odswiez(); });
        }
      }
      wersja = widok.wersja;
      identyfikatorKarty = widok.identyfikatorKarty;
      kontekst = widok.kontekst;
      zglosWidocznosc();
      korzen.className = widok.klasy || "";
      ostatnieWartosci = widok.wartosci;
      Array.from(korzen.querySelectorAll(selektor)).filter(element => !element.closest('[aria-hidden="true"]')).forEach((element,indeks) => {
        const zapis = widok.wartosci[indeks];
        if (zapis?.wartosc !== undefined) element.value = zapis.wartosc;
        if (zapis?.zaznaczony !== undefined) element.checked = zapis.zaznaczony;
        if (zapis?.otwarty !== undefined && element.open !== zapis.otwarty) element.open = zapis.otwarty;
      });
    } catch (blad) {
      if (biezacaRewizja !== rewizja) return;
      komunikat.textContent = blad.message;
      korzen.replaceChildren();
      ostatniHtml = "";
      identyfikatorKarty = null;
    } finally {
      trwaOdswiezanie = false;
      if (biezacaRewizja !== rewizja) odswiez();
    }
  }

  async function przekazAkcje(zdarzenie) {
    const element = zdarzenie.target.closest(selektor);
    if (!element || !korzen.contains(element)) return;
    if (trwaZanikanie || trwaAkcja || identyfikatorKarty === null) return;
    if (zdarzenie.type === "click" && !element.matches("button")) return;
    if (zdarzenie.type === "toggle" && !element.matches("details")) return;
    const elementy = Array.from(korzen.querySelectorAll(selektor));
    if (zdarzenie.type === "toggle" && element.open === ostatnieWartosci[elementy.indexOf(element)]?.otwarty) return;
    trwaAkcja = true;
    const biezacaRewizja = rewizja;
    try {
      const wynik = await chrome.runtime.sendMessage({type:"PRZEKAZ_DO_PANELU",identyfikatorOkna,identyfikatorKarty,wiadomosc:{
        type:"AKCJA_PANELU",wersja,kontekst,indeks:elementy.indexOf(element),zdarzenie:zdarzenie.type,otwarty:element.open,
        wartosci:elementy.map(pole => ({wartosc:pole.value,zaznaczony:pole.checked}))
      }});
      if (!wynik?.ok) throw new Error(wynik?.error || "Nie udało się wykonać akcji.");
    } catch (blad) { if (biezacaRewizja === rewizja) komunikat.textContent = blad.message; }
    finally { trwaAkcja = false; if (biezacaRewizja !== rewizja) odswiez(); }
  }
  for (const zdarzenie of ["click","input","change","toggle"]) korzen.addEventListener(zdarzenie,przekazAkcje,true);
  document.querySelector("#plywajacy").addEventListener("click",async () => {
    if (identyfikatorKarty !== null) {
      const wynik = await chrome.runtime.sendMessage({type:"PRZEKAZ_DO_PANELU",identyfikatorOkna,identyfikatorKarty,wiadomosc:{type:"WYBIERZ_PANEL_PLYWAJACY"}});
      if (!wynik?.ok) { komunikat.textContent = wynik?.error || "Aktywna karta zmieniła się."; return; }
    }
    if (chrome.sidePanel?.close) {
      try {
        await chrome.sidePanel.close({tabId:przypisanaKarta ?? identyfikatorKarty});
        return;
      } catch (blad) { console.debug("Zamknięcie panelu bocznego",blad); }
    }
    komunikat.textContent = "Panel pływający aktywny. Możesz zamknąć panel boczny przyciskiem Chrome.";
    window.close();
  });
  document.addEventListener("visibilitychange",() => { zglosWidocznosc(); uniewaznijKontekst(); });
  chrome.tabs?.onActivated?.addListener(dane => { if (dane.windowId === identyfikatorOkna) uniewaznijKontekst(); });
  chrome.tabs?.onUpdated?.addListener((identyfikator,zmiany) => {
    if ((identyfikator === identyfikatorKarty || identyfikator === przypisanaKarta) && (zmiany.url !== undefined || zmiany.status === "loading")) uniewaznijKontekst();
  });
  setInterval(odswiez,2500);
  odswiez();
})();
