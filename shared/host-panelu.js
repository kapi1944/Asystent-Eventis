(() => {
  "use strict";
  const SELEKTOR_AKCJI = "button,input,textarea,select,details,a";
  let tryb = "plywajacy";
  let obslugiwany = false;
  let aktywnyKontekst = false;
  let numerZapytania = 0;
  let wersja = 0;
  let ostatniHtml = "";
  let skale = {plywajacy:100,boczny:100};
  let trwaZapisSkali = false;

  function poprawnaSkala(wartosc) {
    return typeof wartosc === "number" && Number.isFinite(wartosc)
      ? Math.max(60,Math.min(140,Math.round(wartosc / 5) * 5)) : 100;
  }

  function zastosujSkale(korzen) {
    korzen.style.setProperty("--esync-skala",String(skale[tryb] / 100));
    if (!korzen.querySelector("#esync-skala") && korzen.querySelector(".esync-head")) {
      const grupa = document.createElement("div");
      grupa.id = "esync-skala";
      grupa.setAttribute("role","group");
      grupa.setAttribute("aria-label","Skala interfejsu asystenta");
      grupa.innerHTML = '<button type="button" data-skala="-5" aria-label="Zmniejsz skalę o 5%">−</button><button type="button" data-skala="100" title="Przywróć 100%"></button><button type="button" data-skala="5" aria-label="Zwiększ skalę o 5%">+</button>';
      grupa.addEventListener("click",async zdarzenie => {
        const przycisk = zdarzenie.target.closest("[data-skala]");
        if (!przycisk || przycisk.disabled || trwaZapisSkali) return;
        const widok = tryb;
        const poprzednia = skale[widok];
        skale[widok] = poprawnaSkala(przycisk.dataset.skala === "100" ? 100 : poprzednia + Number(przycisk.dataset.skala));
        trwaZapisSkali = true;
        zastosujSkale(korzen);
        try {
          const {settings = {}} = await chrome.storage.local.get("settings");
          await chrome.storage.local.set({settings:{...settings,skalePanelu:{...settings.skalePanelu,[widok]:skale[widok]}}});
        } catch (blad) {
          skale[widok] = poprzednia;
          console.warn("Nie zapisano skali panelu",blad);
        } finally { trwaZapisSkali = false; zastosujSkale(korzen); }
      });
      korzen.querySelector(".esync-head")?.appendChild(grupa);
    }
    const grupa = korzen.querySelector("#esync-skala");
    if (!grupa) return;
    const srodek = grupa.querySelector('[data-skala="100"]');
    const etykieta = `🔍 ${skale[tryb]}%`;
    if (srodek.textContent !== etykieta) srodek.textContent = etykieta;
    srodek.setAttribute("aria-label",`Skala ${skale[tryb]}%. Przywróć 100%`);
    grupa.querySelectorAll("button").forEach(przycisk => {
      przycisk.disabled = trwaZapisSkali || (przycisk.dataset.skala === "-5" && skale[tryb] === 60)
        || (przycisk.dataset.skala === "5" && skale[tryb] === 140);
    });
  }

  function odczytajSkale(ustawienia = {}) {
    skale = {plywajacy:poprawnaSkala(ustawienia.skalePanelu?.plywajacy),boczny:poprawnaSkala(ustawienia.skalePanelu?.boczny)};
    zastosujTryb();
  }

  Promise.resolve(chrome.storage.local?.get?.("settings")).then(dane => odczytajSkale(dane?.settings)).catch(blad => console.warn("Skala panelu",blad));

  if (!/^\/company\/?$|^\/company\/listevents(?:\/|$)|^\/event\/(?:edit|add)(?:\/|$)/i.test(location.pathname)
      && !document.querySelector("#esync-root")) {
    const korzen = document.createElement("aside");
    korzen.id = "esync-root";
    korzen.innerHTML = '<div class="esync-head"><div class="esync-head-text"><div class="esync-head-title">Asystent Eventis</div></div><div class="esync-head-actions"><button type="button" class="esync-icon-btn esync-collapse" id="esync-collapse" title="Zwiń lub rozwiń panel" aria-label="Zwiń lub rozwiń panel">−</button></div></div><div class="esync-body"><p>Otwórz listę ogłoszeń lub edycję wydarzenia, aby skorzystać z asystenta.</p><a class="esync-link" href="https://eventis.pl/company/listevents">Przejdź do listy ogłoszeń</a></div>';
    korzen.querySelector("#esync-collapse").addEventListener("click",() => korzen.classList.toggle("esync-collapsed"));
    document.body.appendChild(korzen);
  }

  function pobierzWidok() {
    const korzen = document.querySelector("#esync-root");
    if (!korzen) return {ok:false,error:"Panel Eventis jeszcze się ładuje."};
    const html = korzen.innerHTML;
    if (html !== ostatniHtml) { ostatniHtml = html; wersja++; }
    return {ok:true,html,wersja,tryb,skala:skale[tryb],klasy:korzen.className,komunikat:document.querySelector(".esync-toast")?.textContent || "",wartosci:Array.from(korzen.querySelectorAll(SELEKTOR_AKCJI),element => ({wartosc:element.value,zaznaczony:element.checked,otwarty:element.open}))};
  }

  function zastosujTryb() {
    const korzen = document.querySelector("#esync-root");
    if (!korzen) return;
    zastosujSkale(korzen);
    korzen.hidden = !aktywnyKontekst || tryb === "boczny";
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
      korzen.querySelector(".esync-head")?.appendChild(przycisk);
    }
  }

  async function odswiezAktywnosc() {
    const numer = ++numerZapytania;
    try {
      const wynik = await chrome.runtime.sendMessage({type:"CZY_AKTYWNY_KONTEKST_PANELU"});
      if (numer !== numerZapytania) return;
      aktywnyKontekst = !!wynik?.aktywny;
      zastosujTryb();
    } catch (blad) { console.warn("Aktywność panelu",blad); }
  }
  document.addEventListener("visibilitychange",odswiezAktywnosc);
  odswiezAktywnosc();

  chrome.runtime.onMessage.addListener((wiadomosc, nadawca, odpowiedz) => {
    if (nadawca.id !== chrome.runtime.id) return;
    if (wiadomosc?.type === "ODSWIEZ_AKTYWNOSC_PANELU") odswiezAktywnosc();
    if (wiadomosc?.type === "ZAMKNIETO_PANEL_BOCZNY") { tryb = "plywajacy"; zastosujTryb(); odpowiedz({ok:true}); }
    if (wiadomosc?.type === "POBIERZ_WIDOK_PANELU") {
      tryb = "boczny";
      zastosujTryb();
      odpowiedz(pobierzWidok());
    }
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
    if (obszar === "local" && zmiany.settings) odczytajSkale(zmiany.settings.newValue);
  });
  const obserwator = new MutationObserver(zastosujTryb);
  obserwator.observe(document.body,{childList:true,subtree:true});
  chrome.runtime.sendMessage({type:"CZY_PANEL_BOCZNY"}).then(odpowiedz => {
    obslugiwany = !!odpowiedz?.obslugiwany;
    if (!obslugiwany) tryb = "plywajacy";
    zastosujTryb();
  }).catch(blad => console.warn("Tryb panelu",blad));
})();
