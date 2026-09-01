importScripts("shared/config.js","shared/operacje-eventis.js","shared/otwieranie-wydarzen-eventis.js","background/sheet-bridge-client.js");

const DEFAULT_SETTINGS = globalThis.EventisSyncConfig.DEFAULT_SETTINGS;
const KLIENT_MOSTU_ARKUSZA = globalThis.KlientMostuArkuszaEventis;
const OTWIERANIE_WYDARZEN = globalThis.OtwieranieWydarzenEventis;
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
  for (let indeks = 0; indeks < zadania.length; indeks++) {
    const url = new URL(zadania[indeks].eventUrl);
    url.searchParams.set("esyncSession",sessionId);
    await chrome.tabs.create({url:url.href,active:indeks === 0});
  }
  return {ok:true,...plan,opened:zadania.length,sessionId};
}

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
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (fieldName, value, identyfikatorEdytora) => {
      const field = Array.from(document.querySelectorAll("input,textarea,select")).find(el => el.name === fieldName);
      const bezposredniEdytor = identyfikatorEdytora ? document.getElementById(identyfikatorEdytora) : null;
      const nazwaPola = fieldName || identyfikatorEdytora || "nieznane";
      const blad = (code, message) => ({ ok: false, code, field: nazwaPola, message });
      if (!field && !bezposredniEdytor) {
        return blad("FIELD_NOT_FOUND", `Nie znaleziono pola „${nazwaPola}”.`);
      }

      const wyemitujZmiany = (el) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const areas = [bezposredniEdytor, field?.parentElement, field?.closest(".form-group"), field?.closest(".row")].filter(Boolean);
      const edytowalneElementy = areas.flatMap(area => area.matches?.('[contenteditable="true"]')
        ? [area]
        : Array.from(area.querySelectorAll('.ck-editor__editable[contenteditable="true"], [contenteditable="true"]')));

      try {
        const instancjaCkeditora4 = field && window.CKEDITOR?.instances
          && (window.CKEDITOR.instances[field.id] || window.CKEDITOR.instances[field.name]);
        if (instancjaCkeditora4) {
          if (typeof instancjaCkeditora4.setData !== "function" || typeof instancjaCkeditora4.updateElement !== "function") {
            return blad("EDITOR_INSTANCE_UNSUPPORTED", `Instancja edytora pola „${nazwaPola}” nie udostępnia wymaganego API.`);
          }
          await new Promise((rozwiaz, odrzuc) => {
            let zakonczono = false;
            const potwierdz = () => {
              if (zakonczono) return;
              zakonczono = true;
              rozwiaz();
            };
            try {
              const wynik = instancjaCkeditora4.setData(value, potwierdz);
              if (wynik && typeof wynik.then === "function") wynik.then(potwierdz, odrzuc);
              else if (instancjaCkeditora4.setData.length < 2) potwierdz();
            } catch (bladAktualizacji) {
              odrzuc(bladAktualizacji);
            }
          });
          instancjaCkeditora4.updateElement();
          wyemitujZmiany(field);
          return { ok: true, method: "ckeditor4", field: nazwaPola, modelUpdated: true, sourceUpdated: true };
        }

        const bezposrednieInstancje = [field?.ckeditorInstance, bezposredniEdytor?.ckeditorInstance, ...edytowalneElementy.map(editable => editable.ckeditorInstance)]
          .filter((instancja, indeks, wszystkie) => instancja && wszystkie.indexOf(instancja) === indeks);
        if (bezposrednieInstancje.length) {
          const instancja = bezposrednieInstancje.find(kandydat => typeof kandydat.setData === "function");
          if (!instancja) {
            return blad("EDITOR_INSTANCE_UNSUPPORTED", `Instancja edytora pola „${nazwaPola}” nie udostępnia metody setData().`);
          }
          const wynik = instancja.setData(value);
          if (wynik && typeof wynik.then === "function") await wynik;
          if (typeof instancja.updateSourceElement === "function") instancja.updateSourceElement();
          else if (typeof instancja.updateElement === "function") instancja.updateElement();
          else if (field) field.value = value;
          else return blad("EDITOR_SOURCE_UNAVAILABLE", `Edytor pola „${nazwaPola}” nie potwierdził aktualizacji źródła danych.`);
          if (field) wyemitujZmiany(field);
          return { ok: true, method: "ckeditor-instance", field: nazwaPola, modelUpdated: true, sourceUpdated: true };
        }

        if (edytowalneElementy.length) {
          return blad("EDITOR_MODEL_UNAVAILABLE", `Edytor pola „${nazwaPola}” nie udostępnia modelu ani źródła danych.`);
        }

        if (field) {
          field.value = value;
          wyemitujZmiany(field);
          return { ok: true, method: "form-control", field: nazwaPola, modelUpdated: true, sourceUpdated: true };
        }
      } catch (bladAktualizacji) {
        return blad("EDITOR_UPDATE_FAILED", `Nie udało się zaktualizować pola „${nazwaPola}”: ${bladAktualizacji?.message || "nieznany błąd"}.`);
      }

      return blad("EDITOR_MODEL_UNAVAILABLE", `Nie znaleziono obsługiwanej instancji edytora pola „${nazwaPola}”.`);
    },
    args: [name, html, identyfikatorElementu]
  });
  return result || {
    ok: false,
    code: "EXECUTION_NO_RESULT",
    field: name || identyfikatorElementu || "nieznane",
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
        const wynik = await wykonajClaimSeryjnie(operacja.operationScopeKey,() => NARZEDZIA_OPERACJI.uzyskajClaimOperacji({
          pobierz:async () => (await chrome.storage.local.get(["pendingOperations"])).pendingOperations || {},
          zapisz:async pendingOperations => chrome.storage.local.set({pendingOperations})
        },operacja));
        sendResponse(wynik);
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
      case "OPEN_EVENTIS_PLAN": {
        sendResponse(await otworzPlanEventis(message.plan,message.organization));
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
