const DEFAULT_SETTINGS = globalThis.EventisSyncConfig.DEFAULT_SETTINGS;

const $ = id => document.getElementById(id);
let zapisanyKluczMostu = "";

function ustawStatusMostu(tekst, czyBlad=false) {
  const poleStatusu = $("sheetBridgeStatus");
  poleStatusu.textContent = tekst;
  poleStatusu.classList.toggle("error",czyBlad);
}

function uzupelnijListeKart(karty, wybranaKarta="") {
  const poleKarty = $("sheetName");
  poleKarty.replaceChildren();
  const opcjaPusta = document.createElement("option");
  opcjaPusta.value = "";
  opcjaPusta.textContent = karty.length ? "Wybierz kartę" : "Najpierw pobierz listę kart";
  poleKarty.appendChild(opcjaPusta);
  for (const nazwaKarty of karty) {
    const opcja = document.createElement("option");
    opcja.value = nazwaKarty;
    opcja.textContent = nazwaKarty;
    poleKarty.appendChild(opcja);
  }
  if (wybranaKarta && !karty.includes(wybranaKarta)) {
    const zapisanaOpcja = document.createElement("option");
    zapisanaOpcja.value = wybranaKarta;
    zapisanaOpcja.textContent = wybranaKarta + " (zapisana)";
    poleKarty.appendChild(zapisanaOpcja);
  }
  poleKarty.value = wybranaKarta;
}

async function load() {
  const { settings = DEFAULT_SETTINGS, mappings = {}, auditLog = [], sheetOutbox = [] } = await chrome.storage.local.get(["settings","mappings","auditLog","sheetOutbox"]);
  const s = { ...DEFAULT_SETTINGS, ...settings };
  zapisanyKluczMostu = String(s.sheetBridgeKey || "");
  for (const [key, value] of Object.entries(s)) {
    if (key === "sheetBridgeKey" || key === "sheetName") continue;
    const el = $(key);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!value;
    else el.value = value;
  }
  $("sheetBridgeKey").value = "";
  $("sheetBridgeKey").placeholder = zapisanyKluczMostu ? "Klucz jest zapisany — wpisz nowy, aby zastąpić" : "Wpisz klucz Bridge";
  uzupelnijListeKart([],s.sheetName || "");
  $("stats").textContent = `Powiązania: ${Object.keys(mappings).length} • wpisy audytu: ${auditLog.length} • oczekujące oznaczenia arkusza: ${sheetOutbox.filter(x=>x.status!=="DONE").length}`;
}

async function save(czyPokazacStatus=true) {
  const settings = {
    operatorInitial: $("operatorInitial").value.trim() || "K",
    defaultOrganization: $("defaultOrganization").value,
    semperAccountMarker: $("semperAccountMarker").value.trim(),
    iistAccountMarker: $("iistAccountMarker").value.trim(),
    requireSessionVerification: $("requireSessionVerification").checked,
    mappingWarningThreshold: Number($("mappingWarningThreshold").value || .9),
    mappingBlockThreshold: Number($("mappingBlockThreshold").value || .7),
    manualSnapshotMaxAgeHours: Number($("manualSnapshotMaxAgeHours").value || 24),
    sheetBridgeEnabled: $("sheetBridgeEnabled").checked,
    sheetBridgeUrl: $("sheetBridgeUrl").value.trim(),
    sheetBridgeKey: $("sheetBridgeKey").value.trim() || zapisanyKluczMostu,
    sheetName: $("sheetName").value
  };
  await chrome.storage.local.set({ settings });
  zapisanyKluczMostu = settings.sheetBridgeKey;
  $("sheetBridgeKey").value = "";
  $("sheetBridgeKey").placeholder = zapisanyKluczMostu ? "Klucz jest zapisany — wpisz nowy, aby zastąpić" : "Wpisz klucz Bridge";
  if (czyPokazacStatus) {
    $("status").textContent = "Zapisano.";
    setTimeout(()=>$("status").textContent="",1800);
  }
}

$("saveBtn").addEventListener("click",()=>save());

const PRZYCISKI_MOSTU = ["sheetBridgeHealthBtn","sheetBridgeListBtn","sheetBridgeReadBtn"];

function ustawZajetoscMostu(czyZajety) {
  for (const id of PRZYCISKI_MOSTU) $(id).disabled = czyZajety;
}

function opisBleduMostu(wynik) {
  const kod = wynik?.code || "RUNTIME_ERROR";
  const komunikat = wynik?.data?.message || "Nie udało się wykonać operacji Bridge.";
  return kod + " — " + komunikat;
}

async function wyslijZadanieMostu(typWiadomosci) {
  ustawZajetoscMostu(true);
  ustawStatusMostu("Trwa sprawdzanie…");
  try {
    await save(false);
    return await chrome.runtime.sendMessage({type:typWiadomosci});
  } catch (_) {
    return {
      ok:false,
      code:"RUNTIME_ERROR",
      data:{message:"Nie udało się skontaktować z service workerem rozszerzenia."}
    };
  } finally {
    ustawZajetoscMostu(false);
  }
}

$("sheetBridgeHealthBtn").addEventListener("click",async()=>{
  const wynik = await wyslijZadanieMostu("SHEET_BRIDGE_HEALTH");
  if (!wynik?.ok) return ustawStatusMostu(opisBleduMostu(wynik),true);
  ustawStatusMostu("Połączenie działa. Liczba dostępnych kart: " + Number(wynik.data?.sheetCount || 0) + ".");
});

$("sheetBridgeListBtn").addEventListener("click",async()=>{
  const poprzedniaKarta = $("sheetName").value;
  const wynik = await wyslijZadanieMostu("SHEET_BRIDGE_LIST_SHEETS");
  if (!wynik?.ok) return ustawStatusMostu(opisBleduMostu(wynik),true);
  const karty = wynik.data?.sheets || [];
  uzupelnijListeKart(karty,karty.includes(poprzedniaKarta) ? poprzedniaKarta : "");
  ustawStatusMostu("Pobrano listę kart: " + karty.length + ".");
});

$("sheetBridgeReadBtn").addEventListener("click",async()=>{
  const wynik = await wyslijZadanieMostu("SHEET_BRIDGE_READ_ROWS");
  if (!wynik?.ok) return ustawStatusMostu(opisBleduMostu(wynik),true);
  const liczbaWierszy = wynik.data?.rows?.length || 0;
  ustawStatusMostu("Odczyt zakończony. Pasujące wiersze: " + liczbaWierszy + ".");
});

$("clearMappingsBtn").addEventListener("click", async () => {
  if (!confirm("Usunąć wszystkie zapamiętane powiązania Eventis → SEMPER/IIST?")) return;
  await chrome.storage.local.set({ mappings: {} });
  await load();
});
$("exportBtn").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(null);
  if (data.settings?.sheetBridgeKey) {
    data.settings = { ...data.settings, sheetBridgeKey:"" };
  }
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `eventis-sync-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
load();
