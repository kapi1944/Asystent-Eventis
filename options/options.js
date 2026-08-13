const DEFAULT_SETTINGS = {
  operatorInitial: "K",
  defaultOrganization: "SEMPER",
  semperAccountMarker: "SEMPER",
  iistAccountMarker: "IIST",
  requireSessionVerification: true,
  mappingWarningThreshold: 0.90,
  mappingBlockThreshold: 0.70,
  manualSnapshotMaxAgeHours: 24
};

const $ = id => document.getElementById(id);

async function load() {
  const { settings = DEFAULT_SETTINGS, mappings = {}, auditLog = [], sheetOutbox = [] } = await chrome.storage.local.get(["settings","mappings","auditLog","sheetOutbox"]);
  const s = { ...DEFAULT_SETTINGS, ...settings };
  for (const [key, value] of Object.entries(s)) {
    const el = $(key);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!value;
    else el.value = value;
  }
  $("stats").textContent = `Powiązania: ${Object.keys(mappings).length} • wpisy audytu: ${auditLog.length} • oczekujące oznaczenia arkusza: ${sheetOutbox.filter(x=>x.status!=="DONE").length}`;
}

async function save() {
  const settings = {
    operatorInitial: $("operatorInitial").value.trim() || "K",
    defaultOrganization: $("defaultOrganization").value,
    semperAccountMarker: $("semperAccountMarker").value.trim(),
    iistAccountMarker: $("iistAccountMarker").value.trim(),
    requireSessionVerification: $("requireSessionVerification").checked,
    mappingWarningThreshold: Number($("mappingWarningThreshold").value || .9),
    mappingBlockThreshold: Number($("mappingBlockThreshold").value || .7),
    manualSnapshotMaxAgeHours: Number($("manualSnapshotMaxAgeHours").value || 24)
  };
  await chrome.storage.local.set({ settings });
  $("status").textContent = "Zapisano.";
  setTimeout(()=>$("status").textContent="",1800);
}

$("saveBtn").addEventListener("click", save);
$("clearMappingsBtn").addEventListener("click", async () => {
  if (!confirm("Usunąć wszystkie zapamiętane powiązania Eventis → SEMPER/IIST?")) return;
  await chrome.storage.local.set({ mappings: {} });
  await load();
});
$("exportBtn").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `eventis-sync-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
load();
