(function (globalny) {
  "use strict";

  const DOMYSLNE_USTAWIENIA = Object.freeze({
    operatorInitial: "K",
    defaultOrganization: "SEMPER",
    semperAccountMarker: "SEMPER",
    iistAccountMarker: "IIST",
    requireSessionVerification: true,
    mappingWarningThreshold: 0.90,
    mappingBlockThreshold: 0.70,
    manualSnapshotMaxAgeHours: 24,
    sheetBridgeEnabled: false,
    sheetBridgeUrl: "",
    sheetBridgeKey: "",
    sheetName: ""
  });

  const interfejs = Object.freeze({ DEFAULT_SETTINGS: DOMYSLNE_USTAWIENIA });

  globalny.EventisSyncConfig = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
