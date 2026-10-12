importScripts("shared/config.js","shared/wyszukiwanie.js","shared/terminy.js","shared/opisy-semper.js","shared/arkusz.js","shared/kolejka-eventis.js","shared/operacje-eventis.js","shared/otwieranie-wydarzen-eventis.js","background/sheet-bridge-client.js");

const DEFAULT_SETTINGS = globalThis.EventisSyncConfig.DEFAULT_SETTINGS;
const KLIENT_MOSTU_ARKUSZA = globalThis.KlientMostuArkuszaEventis;
const OTWIERANIE_WYDARZEN = globalThis.OtwieranieWydarzenEventis;
const NARZEDZIA_KOLEJKI = globalThis.NarzedziaKolejkiEventis;
const kolejkiClaimowOperacji = new Map();

async function wykonajClaimSeryjnie(kluczClaimu, akcja) {
  const poprzedni = kolejkiClaimowOperacji.get(kluczClaimu) || Promise.resolve();
  const biezacy = poprzedni.catch(() => {}).then(akcja);
  kolejkiClaimowOperacji.set(kluczClaimu,biezacy);
  try {
    return await biezacy;
  } finally {
    if (kolejkiClaimowOperacji.get(kluczClaimu) === biezacy) kolejkiClaimowOperacji.delete(kluczClaimu);
  }
}

async function usunOsieroconeOperacje() {
  const operacje = (await chrome.storage.local.get(["pendingOperations"])).pendingOperations || {};
  let zmieniono = false;
  for (const [klucz,wpis] of Object.entries(operacje)) {
    const przeterminowana = !Number.isFinite(Date.parse(wpis.updatedAt || wpis.filledAt || wpis.createdAt))
      || Date.now() - Date.parse(wpis.updatedAt || wpis.filledAt || wpis.createdAt) > 2 * 60 * 60 * 1000;
    let kartaIstnieje = Boolean(wpis.tabId);
    if (kartaIstnieje) {
      try { await chrome.tabs.get(wpis.tabId); } catch (_) { kartaIstnieje = false; }
    }
    if (przeterminowana || !kartaIstnieje) { delete operacje[klucz]; zmieniono = true; }
  }
  if (zmieniono) {
    await chrome.storage.local.set({pendingOperations:operacje});
    await wykonajClaimSeryjnie("eventisImportQueue",async () => {
      const {eventisImportQueue = []} = await chrome.storage.local.get(["eventisImportQueue"]);
      await chrome.storage.local.set({eventisImportQueue:NARZEDZIA_KOLEJKI.reconcileQueueState(eventisImportQueue,operacje)});
    });
  }
  return operacje;
}

async function wykonajAkcjeMostuArkusza(akcja) {
  try {
    const { settings = {} } = await chrome.storage.local.get(["settings"]);
    const konfiguracja = { ...DEFAULT_SETTINGS, ...settings };
    return KLIENT_MOSTU_ARKUSZA.wykonajZadanieMostu({
      action:akcja,
      sheetBridgeEnabled:konfiguracja.sheetBridgeEnabled,
      sheetBridgeUrl:konfiguracja.sheetBridgeUrl,
      sheetBridgeKey:konfiguracja.sheetBridgeKey,
      sheetName:konfiguracja.sheetName,
      timeoutMs:20000
    });
  } catch (_) {
    return KLIENT_MOSTU_ARKUSZA.utworzWynikBledu("INTERNAL_ERROR","");
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["settings", "mappings", "auditLog", "sheetOutbox", "eventisImportQueue", "eventisAutomaticBatches", "eventisOpeningSessions"]);
  if (!current.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  if (!current.mappings) await chrome.storage.local.set({ mappings: {} });
  if (!current.auditLog) await chrome.storage.local.set({ auditLog: [] });
  if (!current.sheetOutbox) await chrome.storage.local.set({ sheetOutbox: [] });
  if (!current.eventisImportQueue) await chrome.storage.local.set({ eventisImportQueue: [] });
  if (!current.eventisAutomaticBatches) await chrome.storage.local.set({ eventisAutomaticBatches: {} });
  if (!current.eventisOpeningSessions) await chrome.storage.local.set({ eventisOpeningSessions: {} });
});

async function otwarteAdresyEventis() {
  const karty = await chrome.tabs.query({});
  return karty.map(karta => karta.url || "");
}

async function przygotujPlanOtwieraniaEventis(pozycje) {
  return OTWIERANIE_WYDARZEN.utworzPlanOtwierania(pozycje,await otwarteAdresyEventis());
}

function identyfikatorSesjiOtwarcia() {
  return globalThis.crypto?.randomUUID?.() || `otwarcie-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function otworzPlanEventis(pozycje, organizacja) {
  const plan = await przygotujPlanOtwieraniaEventis(pozycje);
  if (!plan.doOtwarcia.length) return {ok:true,...plan,opened:0,sessionId:null};
  const sessionId = identyfikatorSesjiOtwarcia();
  const {eventisOpeningSessions = {}} = await chrome.storage.local.get(["eventisOpeningSessions"]);
  const zadania = plan.doOtwarcia;
  await chrome.storage.local.set({eventisOpeningSessions:{...eventisOpeningSessions,[sessionId]:OTWIERANIE_WYDARZEN.utworzSesjeOtwarcia(sessionId,organizacja,zadania)}});
  const bledyOtwarcia = [];
  let liczbaOtwartych = 0;
  for (let indeks = 0; indeks < zadania.length; indeks++) {
    try {
      const url = new URL(zadania[indeks].eventUrl);
      url.searchParams.set("esyncSession",sessionId);
      url.searchParams.set("esyncTask",String(zadania[indeks].taskId || zadania[indeks].eventId));
      if (zadania[indeks].typ === "CREATE_NEW") {
        url.searchParams.set("esyncNoweId",zadania[indeks].taskId);
      } else {
        url.searchParams.set("esyncSession",sessionId);
        url.searchParams.set("esyncTask",String(zadania[indeks].eventId));
      }
      await wykonajClaimSeryjnie("noweTytuly",async () => {
        await usunOsieroconeTytuly();
        const karta = await chrome.tabs.create({url:url.href,active:indeks === 0});
        if (zadania[indeks].typ === "CREATE_NEW") {
          await chrome.storage.local.set({[`nowyTytul:${karta.id}`]:{
            sessionId,taskId:zadania[indeks].taskId,tytul:zadania[indeks].sourceTitle,
            identyfikatoryKolejki:zadania[indeks].queueItemIds || [],utworzono:Date.now()
          }});
        }
      });
      liczbaOtwartych++;
      if (indeks < zadania.length - 1) await new Promise(rozwiaz => setTimeout(rozwiaz,200));
    } catch (blad) {
      console.warn("Eventis: nie udało się otworzyć lub przygotować karty",blad);
      bledyOtwarcia.push({eventId:zadania[indeks].eventId,error:blad?.message || String(blad)});
    }
  }
  return {ok:true,...plan,opened:liczbaOtwartych,bledyOtwarcia,sessionId,error:bledyOtwarcia.length ? `Nie udało się otworzyć ${bledyOtwarcia.length} kart.` : ""};
}

async function usunOsieroconeTytuly() {
  const dane = await chrome.storage.local.get(null);
  for (const [klucz,wpis] of Object.entries(dane)) {
    if (!klucz.startsWith("nowyTytul:")) continue;
    let osierocony = !Number.isFinite(wpis.utworzono) || Date.now() - wpis.utworzono > 120000;
    if (!osierocony) {
      try { await chrome.tabs.get(Number(klucz.split(":")[1])); } catch (_) { osierocony = true; }
    }
    if (osierocony) {
      console.warn("Eventis: usunięto niewykorzystany tytuł nowego ogłoszenia",klucz);
      await chrome.storage.local.remove(klucz);
    }
  }
}

chrome.tabs.onRemoved.addListener(identyfikator => {
  wykonajClaimSeryjnie("noweTytuly",async () => {
    const klucz = `nowyTytul:${identyfikator}`;
    if ((await chrome.storage.local.get(klucz))[klucz]) console.warn("Eventis: zamknięto kartę przed wykorzystaniem tytułu",identyfikator);
    await chrome.storage.local.remove(klucz);
  }).catch(blad => console.warn("Eventis: błąd usuwania oczekującego tytułu",blad));
});

async function fetchText({ url, method = "GET", body = null, headers = {}, timeoutMs = 15000 }) {
  const kontroler = new AbortController();
  const czasomierz = setTimeout(() => kontroler.abort(), Math.max(1000, Number(timeoutMs) || 15000));
  try {
    const response = await fetch(url, {
      method,
      body,
      headers,
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      signal: kontroler.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return { text, finalUrl: response.url, status: response.status };
  } catch (blad) {
    if (blad?.name === "AbortError") throw new Error("Przekroczono limit czasu pobierania strony.");
    throw blad;
  } finally {
    clearTimeout(czasomierz);
  }
}

async function setRichFieldInMainWorld(tabId, name, html, identyfikatorElementu) {
  const nazwaPola = typeof name === "string" ? name : "";
  const wartoscHtml = typeof html === "string" ? html : "";
  const identyfikatorEdytora = typeof identyfikatorElementu === "string" ? identyfikatorElementu : null;
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (fieldName, value, identyfikatorEdytora, czyDotknac) => {
      const field = Array.from(document.querySelectorAll("input,textarea,select")).find(el => el.name === fieldName);
      const bezposredniEdytor = identyfikatorEdytora ? document.getElementById(identyfikatorEdytora) : null;
      const nazwaPola = fieldName || identyfikatorEdytora || "nieznane";
      const blad = (code, message) => ({ ok: false, code, field: nazwaPola, message });
      if (!field && !bezposredniEdytor) {
        return blad("FIELD_NOT_FOUND", `Nie znaleziono pola „${nazwaPola}”.`);
      }

      const ustawWartoscNatywnie = (element, tresc) => {
        const prototyp = element.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement?.prototype
          : element.tagName === "INPUT" ? window.HTMLInputElement?.prototype : null;
        const ustaw = prototyp && Object.getOwnPropertyDescriptor(prototyp,"value")?.set;
        if (ustaw) ustaw.call(element,tresc);
        else element.value = tresc;
      };
      const wyemitujZmiany = (element, usuwanie = false) => {
        if (!element) return;
        const widok = element.ownerDocument?.defaultView || window;
        const Zdarzenie = widok.Event || Event;
        element.dispatchEvent(typeof widok.InputEvent === "function"
          ? new widok.InputEvent("input",{bubbles:true,inputType:usuwanie ? "deleteContentBackward" : "insertText",data:usuwanie ? null : " "})
          : new Zdarzenie("input",{bubbles:true}));
        element.dispatchEvent(new Zdarzenie("change",{bubbles:true}));
        element.dispatchEvent(typeof widok.KeyboardEvent === "function"
          ? new widok.KeyboardEvent("keyup",{bubbles:true,key:usuwanie ? "Backspace" : " ",code:usuwanie ? "Backspace" : "Space"})
          : new Zdarzenie("keyup",{bubbles:true}));
        element.dispatchEvent(new Zdarzenie("blur",{bubbles:false}));
        element.dispatchEvent(new Zdarzenie("focusout",{bubbles:true}));
      };
      const dotknijEdytor = async (odczytaj, ustaw, synchronizuj, element, instancja, czyHtml = true) => {
        const tresc = odczytaj();
        if (!czyDotknac) {
          synchronizuj();
          if (field) {
            field.dispatchEvent(new Event("input",{bubbles:true}));
            field.dispatchEvent(new Event("change",{bubbles:true}));
          }
          return;
        }
        const czyNiepuste = String(tresc).replace(/<[^>]*>/g,"").replace(/&nbsp;|&#160;/gi," ").trim();
        const powiadom = usuwanie => {
          synchronizuj();
          instancja?.fire?.("change");
          wyemitujZmiany(element,usuwanie);
          if (field && field !== element) wyemitujZmiany(field,usuwanie);
        };
        if (!czyNiepuste) {
          powiadom(true);
        } else {
          // Spacja trafia przed końcowe znaczniki, bez zmiany struktury HTML.
          const zeSpacja = czyHtml ? tresc.replace(/((?:<\/[^>]+>\s*)*)$/, " $1") : tresc + " ";
          try {
            await ustaw(zeSpacja);
            powiadom(false);
          } finally {
            await ustaw(tresc);
            powiadom(true);
          }
        }
        if (odczytaj() !== tresc || (field && field.value !== tresc)) {
          throw new Error("Model edytora i pole źródłowe nie zachowały tej samej treści po edycji.");
        }
      };

      const areas = [bezposredniEdytor, field?.parentElement, field?.closest(".form-group"), field?.closest(".row")].filter(Boolean);
      const edytowalneElementy = areas.map(area => area.matches?.('[contenteditable="true"]')
        ? [area]
        : Array.from(area.querySelectorAll('.ck-editor__editable[contenteditable="true"], [contenteditable="true"]')))
        .find(elementy => elementy.length) || [];
      if (edytowalneElementy.length > 1 && !field?.ckeditorInstance) {
        return blad("EDITOR_MODEL_UNAVAILABLE", `Nie można jednoznacznie wskazać edytora pola „${nazwaPola}”.`);
      }

      try {
        const instancjaCkeditora4 = field && window.CKEDITOR?.instances
          && (window.CKEDITOR.instances[field.id] || window.CKEDITOR.instances[field.name]);
        if (instancjaCkeditora4) {
          if (typeof instancjaCkeditora4.setData !== "function"
            || !(typeof instancjaCkeditora4.updateSourceElement === "function" || typeof instancjaCkeditora4.updateElement === "function")) {
            return blad("EDITOR_INSTANCE_UNSUPPORTED", `Instancja edytora pola „${nazwaPola}” nie udostępnia wymaganego API.`);
          }
          const ustaw = tresc => new Promise((rozwiaz, odrzuc) => {
            let zakonczono = false;
            const potwierdz = () => {
              if (zakonczono) return;
              zakonczono = true;
              rozwiaz();
            };
            try {
              const wynik = instancjaCkeditora4.setData(tresc, potwierdz);
              if (wynik && typeof wynik.then === "function") wynik.then(potwierdz, odrzuc);
              else if (instancjaCkeditora4.setData.length < 2) potwierdz();
            } catch (bladAktualizacji) {
              odrzuc(bladAktualizacji);
            }
          });
          const synchronizuj = () => {
            if (typeof instancjaCkeditora4.updateSourceElement === "function") instancjaCkeditora4.updateSourceElement();
            else instancjaCkeditora4.updateElement();
          };
          await ustaw(value);
          synchronizuj();
          await dotknijEdytor(() => instancjaCkeditora4.getData?.() ?? field.value,
            ustaw,synchronizuj,instancjaCkeditora4.editable?.()?.$ || field,instancjaCkeditora4);
          return { ok: true, method: "ckeditor4", field: nazwaPola, modelUpdated: true, sourceUpdated: true };
        }

        const bezposrednieInstancje = [field?.ckeditorInstance, bezposredniEdytor?.ckeditorInstance, ...edytowalneElementy.map(editable => editable.ckeditorInstance)]
          .filter((instancja, indeks, wszystkie) => instancja && wszystkie.indexOf(instancja) === indeks);
        if (bezposrednieInstancje.length) {
          const instancja = bezposrednieInstancje.find(kandydat => typeof kandydat.setData === "function");
          if (!instancja) {
            return blad("EDITOR_INSTANCE_UNSUPPORTED", `Instancja edytora pola „${nazwaPola}” nie udostępnia metody setData().`);
          }
          let biezacaTresc = value;
          const ustaw = async tresc => { await instancja.setData(tresc); biezacaTresc = tresc; };
          const odczytaj = () => instancja.getData?.() ?? biezacaTresc;
          const synchronizuj = () => {
            if (typeof instancja.updateSourceElement === "function") instancja.updateSourceElement();
            else if (typeof instancja.updateElement === "function") instancja.updateElement();
            else if (field) ustawWartoscNatywnie(field,odczytaj());
            else throw new Error("Brak źródła danych edytora.");
          };
          await ustaw(value);
          synchronizuj();
          const edytowalny = instancja.ui?.getEditableElement?.()
            || edytowalneElementy.find(element => element.ckeditorInstance === instancja)
            || bezposredniEdytor || field;
          await dotknijEdytor(odczytaj,ustaw,synchronizuj,edytowalny,instancja);
          return { ok: true, method: "ckeditor-instance", field: nazwaPola, modelUpdated: true, sourceUpdated: true };
        }

        if (edytowalneElementy.length) {
          const edytowalny = edytowalneElementy[0];
          if (!edytowalny.matches?.('[contenteditable="true"]')
            || edytowalny.matches?.(".ck-editor__editable") || edytowalny.closest?.(".cke")) {
            return blad("EDITOR_MODEL_UNAVAILABLE", `Edytor pola „${nazwaPola}” nie udostępnia modelu ani źródła danych.`);
          }
          edytowalny.innerHTML = value;
          const synchronizuj = () => { if (field) ustawWartoscNatywnie(field,edytowalny.innerHTML); };
          synchronizuj();
          const tresc = edytowalny.innerHTML;
          // Touch zmienia wyłącznie tymczasowy węzeł tekstowy.
          const bloki = edytowalny.querySelectorAll("p,li,blockquote,td,th");
          const koniec = bloki[bloki.length - 1] || edytowalny;
          const spacja = edytowalny.ownerDocument.createTextNode(" ");
          await dotknijEdytor(() => edytowalny.innerHTML,wartosc => {
            if (wartosc === tresc) spacja.remove();
            else koniec.appendChild(spacja);
          },synchronizuj,edytowalny,null);
          return { ok: true, method: "contenteditable", field: nazwaPola, modelUpdated: true, sourceUpdated: true };
        }

        if (field) {
          ustawWartoscNatywnie(field,value);
          await dotknijEdytor(() => field.value,tresc => ustawWartoscNatywnie(field,tresc),() => {},field,null,false);
          return { ok: true, method: "form-control", field: nazwaPola, modelUpdated: true, sourceUpdated: true };
        }
      } catch (bladAktualizacji) {
        return blad("EDITOR_UPDATE_FAILED", `Nie udało się zaktualizować pola „${nazwaPola}”: ${bladAktualizacji?.message || "nieznany błąd"}.`);
      }

      return blad("EDITOR_MODEL_UNAVAILABLE", `Nie znaleziono obsługiwanej instancji edytora pola „${nazwaPola}”.`);
    },
    args: [nazwaPola, wartoscHtml, identyfikatorEdytora,
      nazwaPola === "event[hours]" || identyfikatorEdytora === "eventHours"
        || globalThis.NarzedziaOpisowSemper.MAPOWANIE_POL_OPISOWYCH.some(({pole}) => pole === nazwaPola)]
  });
  return result || {
    ok: false,
    code: "EXECUTION_NO_RESULT",
    field: nazwaPola || identyfikatorEdytora || "nieznane",
    message: "Nie otrzymano wyniku aktualizacji pola rich-text."
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "FETCH_TEXT": {
        const result = await fetchText(message.payload);
        sendResponse({ ok: true, ...result });
        break;
      }
      case "SET_RICH_FIELD": {
        if (!sender.tab?.id) throw new Error("Brak identyfikatora karty.");
        try {
          const result = await setRichFieldInMainWorld(sender.tab.id, message.name, message.html, message.elementId);
          sendResponse(result);
        } catch (blad) {
          sendResponse({
            ok: false,
            code: "EXECUTION_FAILED",
            field: message.name || message.elementId || "nieznane",
            message: `Nie udało się uruchomić aktualizacji pola rich-text: ${blad?.message || "nieznany błąd"}.`
          });
        }
        break;
      }
      case "CLAIM_PENDING_OPERATION": {
        const operacja = message.operation;
        if (!operacja?.operationId || !operacja?.operationScopeKey) throw new Error("Nieprawidłowy claim operacji importu.");
        const NARZEDZIA_OPERACJI = globalThis.NarzedziaOperacjiEventis;
        if (!NARZEDZIA_OPERACJI) throw new Error("Nie załadowano obsługi operacji Eventis.");
        if (!sender.tab?.id) throw new Error("Brak identyfikatora karty operacji.");
        const wynik = await wykonajClaimSeryjnie("pendingOperations",() => NARZEDZIA_OPERACJI.uzyskajClaimOperacji({
          pobierz:usunOsieroconeOperacje,
          zapisz:async pendingOperations => chrome.storage.local.set({pendingOperations})
        },{...operacja,tabId:sender.tab.id}));
        sendResponse(wynik);
        break;
      }
      case "GET_TAB_CONTEXT": {
        await wykonajClaimSeryjnie("pendingOperations",usunOsieroconeOperacje);
        sendResponse({ok:true,tabId:sender.tab?.id || null});
        break;
      }
      case "RECONCILE_QUEUE": {
        await wykonajClaimSeryjnie("pendingOperations",usunOsieroconeOperacje);
        const {eventisImportQueue = []} = await chrome.storage.local.get(["eventisImportQueue"]);
        sendResponse({ok:true,items:eventisImportQueue});
        break;
      }
      case "MERGE_QUEUE_ITEMS": {
        const wynik = await wykonajClaimSeryjnie("eventisImportQueue",async () => {
          const dane = await chrome.storage.local.get(["eventisImportQueue"]);
          const kolejka = NARZEDZIA_KOLEJKI.scalElementyKolejki(Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : [],message.items || []);
          await chrome.storage.local.set({eventisImportQueue:kolejka,eventisQueueSchemaVersion:2});
          return kolejka;
        });
        sendResponse({ok:true,items:wynik});
        break;
      }
      case "REMOVE_QUEUE_ITEMS": {
        const identyfikatory = new Set(Array.isArray(message.itemIds) ? message.itemIds.filter(Boolean) : []);
        const wynik = await wykonajClaimSeryjnie("eventisImportQueue",async () => {
          const dane = await chrome.storage.local.get(["eventisImportQueue","pendingOperations"]);
          const kolejka = (Array.isArray(dane.eventisImportQueue) ? dane.eventisImportQueue : [])
            .filter(element => !identyfikatory.has(element.id));
          const operacje = {...(dane.pendingOperations || {})};
          for (const [klucz,operacja] of Object.entries(operacje)) {
            const queueItemIds = (operacja.queueItemIds || []).filter(id => !identyfikatory.has(id));
            if ((operacja.queueItemIds || []).length && !queueItemIds.length) delete operacje[klucz];
            else if (queueItemIds.length !== (operacja.queueItemIds || []).length) operacje[klucz] = {...operacja,queueItemIds};
          }
          await chrome.storage.local.set({eventisImportQueue:kolejka,pendingOperations:operacje,eventisQueueSchemaVersion:2});
          return kolejka;
        });
        sendResponse({ok:true,items:wynik});
        break;
      }
      case "CLEAR_QUEUE": {
        const wynik = await wykonajClaimSeryjnie("eventisImportQueue",async () => {
          const {pendingOperations = {}} = await chrome.storage.local.get(["pendingOperations"]);
          const operacje = Object.fromEntries(Object.entries(pendingOperations)
            .filter(([,operacja]) => !(operacja.queueItemIds || []).length));
          await chrome.storage.local.set({eventisImportQueue:[],pendingOperations:operacje,eventisQueueSchemaVersion:2});
          return [];
        });
        sendResponse({ok:true,items:wynik});
        break;
      }
      case "SHEET_BRIDGE_HEALTH": {
        sendResponse(await wykonajAkcjeMostuArkusza("health"));
        break;
      }
      case "SHEET_BRIDGE_LIST_SHEETS": {
        sendResponse(await wykonajAkcjeMostuArkusza("listSheets"));
        break;
      }
      case "SHEET_BRIDGE_READ_ROWS": {
        sendResponse(await wykonajAkcjeMostuArkusza("readRows"));
        break;
      }
      case "OPEN_OPTIONS": {
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        break;
      }
      case "PREPARE_EVENTIS_OPENING": {
        sendResponse({ok:true,...await przygotujPlanOtwieraniaEventis(message.plan)});
        break;
      }
      case "OTWORZ_EVENTIS_RECZNIE": {
        const adres = OTWIERANIE_WYDARZEN.bezpiecznyUrlEdycjiEventis(message.url);
        if (!adres || OTWIERANIE_WYDARZEN.eventIdZUrl(adres) !== String(message.eventId)) throw new Error("Brak bezpiecznego adresu wydarzenia Eventis.");
        const url = new URL(adres);
        for (const parametr of ["esyncSession","esyncTask","esyncNoweId"]) url.searchParams.delete(parametr);
        await chrome.tabs.create({url:url.href,active:true});
        sendResponse({ok:true});
        break;
      }
      case "OPEN_EVENTIS_PLAN": {
        sendResponse(await otworzPlanEventis(message.plan,message.organization));
        break;
      }
      case "POBIERZ_NOWY_TYTUL":
      case "USUN_NOWY_TYTUL": {
        const wynik = await wykonajClaimSeryjnie("noweTytuly",async () => {
          await usunOsieroconeTytuly();
          const klucz = `nowyTytul:${sender.tab?.id}`;
          const wpis = (await chrome.storage.local.get(klucz))[klucz];
          const url = new URL(sender.url || sender.tab?.url || "https://eventis.pl/");
          if (!wpis || !OTWIERANIE_WYDARZEN.bezpiecznyUrlNowegoOgloszenia(url.href)
            || url.searchParams.get("esyncSession") !== wpis.sessionId
            || url.searchParams.get("esyncTask") !== wpis.taskId) return null;
          if (message.type === "USUN_NOWY_TYTUL") await chrome.storage.local.remove(klucz);
          return wpis;
        });
        sendResponse({ok:true,wpis:wynik});
        break;
      }
      case "CLOSE_TAB": {
        if (!sender.tab?.id) throw new Error("Brak identyfikatora karty.");
        await chrome.tabs.remove(sender.tab.id);
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message" });
    }
  })().catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
