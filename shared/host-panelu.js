(() => {
  "use strict";
  const KLUCZ_TRYBU = "eventisTrybPanelu";
  const SELEKTOR_AKCJI = "button,input,textarea,select,details,a";
  let tryb = "plywajacy";
  let obslugiwany = false;
  let wersja = 0;
  let ostatniHtml = "";

  function pobierzWidok() {
    const korzen = document.querySelector("#esync-root");
    if (!korzen) return {ok:false,error:"Panel Eventis jeszcze się ładuje."};
    const html = korzen.innerHTML;
    if (html !== ostatniHtml) { ostatniHtml = html; wersja++; }
    return {ok:true,html,wersja,tryb,klasy:korzen.className,komunikat:document.querySelector(".esync-toast")?.textContent || "",wartosci:Array.from(korzen.querySelectorAll(SELEKTOR_AKCJI),element => ({wartosc:element.value,zaznaczony:element.checked,otwarty:element.open}))};
  }

  function zastosujTryb() {
    const korzen = document.querySelector("#esync-root");
    if (!korzen) return;
    korzen.hidden = tryb === "boczny";
    if (!korzen.querySelector("#esync-tryb-panelu")) {
      const przycisk = document.createElement("button");
      przycisk.type = "button";
      przycisk.id = "esync-tryb-panelu";
      przycisk.className = "esync-icon-btn";
      przycisk.textContent = "◧";
      przycisk.title = "Panel boczny";
      przycisk.setAttribute("aria-label","Panel boczny");
      przycisk.addEventListener("click",() => {
        chrome.runtime.sendMessage({type:"OTWORZ_PANEL_BOCZNY"}).then(odpowiedz => {
          if (!odpowiedz?.ok) alert(odpowiedz?.error || "Panel boczny jest niedostępny. Użyj panelu pływającego.");
        }).catch(blad => console.warn("Panel boczny",blad));
      });
      korzen.querySelector(".esync-head-actions")?.prepend(przycisk);
    }
  }

  chrome.runtime.onMessage.addListener((wiadomosc, nadawca, odpowiedz) => {
    if (nadawca.id !== chrome.runtime.id) return;
    if (wiadomosc?.type === "POBIERZ_WIDOK_PANELU") odpowiedz(pobierzWidok());
    if (wiadomosc?.type === "AKCJA_PANELU") {
      const widok = pobierzWidok();
      if (!widok.ok || wiadomosc.wersja !== widok.wersja) return odpowiedz({ok:false,error:"Widok zmienił się. Ponów działanie."});
      const elementy = document.querySelector("#esync-root").querySelectorAll(SELEKTOR_AKCJI);
      const element = elementy[wiadomosc.indeks];
      if (!element || element.disabled) return odpowiedz({ok:false,error:"Akcja jest niedostępna."});
      for (const [indeks,zapis] of (wiadomosc.wartosci || []).entries()) {
        const pole = elementy[indeks];
        if (!pole || !pole.matches("input,textarea,select")) continue;
        pole.value = zapis.wartosc ?? "";
        if (typeof zapis.zaznaczony === "boolean") pole.checked = zapis.zaznaczony;
      }
      if (wiadomosc.zdarzenie === "click" && element.matches("button")) element.click();
      else if (["input","change"].includes(wiadomosc.zdarzenie) && element.matches("input,textarea,select")) element.dispatchEvent(new Event(wiadomosc.zdarzenie,{bubbles:true}));
      else if (wiadomosc.zdarzenie === "toggle" && element.matches("details")) element.open = !!wiadomosc.otwarty;
      else return odpowiedz({ok:false,error:"Nieobsługiwana akcja panelu."});
      odpowiedz({ok:true});
    }
  });
  chrome.storage.onChanged.addListener((zmiany,obszar) => {
    if (obszar === "local" && zmiany[KLUCZ_TRYBU]) {
      tryb = zmiany[KLUCZ_TRYBU].newValue === "boczny" && obslugiwany ? "boczny" : "plywajacy";
      zastosujTryb();
    }
  });
  const obserwator = new MutationObserver(zastosujTryb);
  obserwator.observe(document.body,{childList:true,subtree:true});
  chrome.storage.local.get([KLUCZ_TRYBU]).then(async dane => {
    const odpowiedz = await chrome.runtime.sendMessage({type:"CZY_PANEL_BOCZNY"});
    obslugiwany = !!odpowiedz?.obslugiwany;
    tryb = dane[KLUCZ_TRYBU] === "boczny" && obslugiwany ? "boczny" : "plywajacy";
    zastosujTryb();
  }).catch(blad => console.warn("Tryb panelu",blad));
})();
