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

  async function odswiez() {
    if (trwaAkcja || (korzen.contains(document.activeElement) && document.activeElement.matches("input,textarea,select"))) return;
    try {
      const widok = await chrome.runtime.sendMessage({type:"PRZEKAZ_DO_PANELU",wiadomosc:{type:"POBIERZ_WIDOK_PANELU"}});
      if (!widok?.ok) throw new Error(widok?.error || "Otwórz kartę Eventis.");
      komunikat.textContent = widok.komunikat || "";
      if (widok.html !== ostatniHtml || identyfikatorKarty !== widok.identyfikatorKarty) {
        const przewiniecie = window.scrollY;
        korzen.innerHTML = widok.html;
        ostatniHtml = widok.html;
        window.scrollTo(0,przewiniecie);
      }
      wersja = widok.wersja;
      identyfikatorKarty = widok.identyfikatorKarty;
      korzen.className = widok.klasy || "";
      ostatnieWartosci = widok.wartosci;
      korzen.querySelectorAll(selektor).forEach((element,indeks) => {
        const zapis = widok.wartosci[indeks];
        if (zapis?.wartosc !== undefined) element.value = zapis.wartosc;
        if (zapis?.zaznaczony !== undefined) element.checked = zapis.zaznaczony;
        if (zapis?.otwarty !== undefined && element.open !== zapis.otwarty) element.open = zapis.otwarty;
      });
    } catch (blad) {
      komunikat.textContent = blad.message;
      korzen.replaceChildren();
      ostatniHtml = "";
      identyfikatorKarty = null;
    }
  }

  async function przekazAkcje(zdarzenie) {
    const element = zdarzenie.target.closest(selektor);
    if (!element || !korzen.contains(element)) return;
    if (zdarzenie.type === "click" && !element.matches("button")) return;
    if (zdarzenie.type === "toggle" && !element.matches("details")) return;
    const elementy = Array.from(korzen.querySelectorAll(selektor));
    if (zdarzenie.type === "toggle" && element.open === ostatnieWartosci[elementy.indexOf(element)]?.otwarty) return;
    trwaAkcja = true;
    try {
      const wynik = await chrome.runtime.sendMessage({type:"PRZEKAZ_DO_PANELU",identyfikatorKarty,wiadomosc:{
        type:"AKCJA_PANELU",wersja,indeks:elementy.indexOf(element),zdarzenie:zdarzenie.type,otwarty:element.open,
        wartosci:elementy.map(pole => ({wartosc:pole.value,zaznaczony:pole.checked}))
      }});
      if (!wynik?.ok) throw new Error(wynik?.error || "Nie udało się wykonać akcji.");
    } catch (blad) { komunikat.textContent = blad.message; }
    finally { trwaAkcja = false; }
  }
  for (const zdarzenie of ["click","input","change","toggle"]) korzen.addEventListener(zdarzenie,przekazAkcje,true);
  document.querySelector("#plywajacy").addEventListener("click",async () => {
    await chrome.storage.local.set({eventisTrybPanelu:"plywajacy"});
    if (chrome.sidePanel?.close) {
      try {
        const okno = await chrome.windows.getCurrent();
        await chrome.sidePanel.close({windowId:okno.id});
        return;
      } catch (blad) { console.debug("Zamknięcie panelu bocznego",blad); }
    }
    komunikat.textContent = "Panel pływający aktywny. Możesz zamknąć panel boczny przyciskiem Chrome.";
    window.close();
  });
  setInterval(odswiez,800);
  odswiez();
})();
