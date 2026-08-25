importScripts("shared/config.js","background/sheet-bridge-client.js");

const DEFAULT_SETTINGS = globalThis.EventisSyncConfig.DEFAULT_SETTINGS;
const KLIENT_MOSTU_ARKUSZA = globalThis.KlientMostuArkuszaEventis;

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
  const current = await chrome.storage.local.get(["settings", "mappings", "auditLog", "sheetOutbox", "eventisImportQueue"]);
  if (!current.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  if (!current.mappings) await chrome.storage.local.set({ mappings: {} });
  if (!current.auditLog) await chrome.storage.local.set({ auditLog: [] });
  if (!current.sheetOutbox) await chrome.storage.local.set({ sheetOutbox: [] });
  if (!current.eventisImportQueue) await chrome.storage.local.set({ eventisImportQueue: [] });
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
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (fieldName, value, identyfikatorEdytora) => {
      const field = Array.from(document.querySelectorAll("input,textarea,select")).find(el => el.name === fieldName);
      const bezposredniEdytor = identyfikatorEdytora ? document.getElementById(identyfikatorEdytora) : null;
      if (!field && !bezposredniEdytor) return { ok: false, reason: "field-not-found" };

      const fire = (el) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };

      if (field) {
        field.value = value;
        fire(field);
      }

      try {
        if (window.CKEDITOR && window.CKEDITOR.instances) {
          const instance = field && (window.CKEDITOR.instances[field.id] || window.CKEDITOR.instances[field.name]);
          if (instance && typeof instance.setData === "function") instance.setData(value);
        }
      } catch (_) {}

      const areas = [bezposredniEdytor, field?.parentElement, field?.closest(".form-group"), field?.closest(".row")].filter(Boolean);
      for (const area of areas) {
        const edytory = area.matches?.('[contenteditable="true"]')
          ? [area]
          : area.querySelectorAll('.ck-editor__editable[contenteditable="true"], [contenteditable="true"]');
        for (const editable of edytory) {
          try {
            if (editable.ckeditorInstance && typeof editable.ckeditorInstance.setData === "function") {
              editable.ckeditorInstance.setData(value);
              if (typeof editable.ckeditorInstance.updateSourceElement === "function") {
                editable.ckeditorInstance.updateSourceElement();
              }
            } else {
              editable.innerHTML = value;
              editable.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: null }));
              editable.dispatchEvent(new Event("blur", { bubbles: true }));
            }
          } catch (_) {}
        }
      }
      return { ok: true };
    },
    args: [name, html, identyfikatorElementu]
  });
  return result || { ok: false };
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
        const result = await setRichFieldInMainWorld(sender.tab.id, message.name, message.html, message.elementId);
        sendResponse({ ok: true, result });
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
