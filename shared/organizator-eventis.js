(function (globalny) {
  "use strict";

  function rozpoznajOrganizatora(wartosc) {
    const nazwa = String(wartosc || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
    if (!nazwa) return "UNKNOWN";
    const semper = /(^| )semper( |$)/.test(nazwa);
    const iist = /(^| )iist( |$)/.test(nazwa);
    if (semper === iist) return "UNKNOWN";
    return semper ? "SEMPER" : "IIST";
  }

  const interfejs = Object.freeze({ rozpoznajOrganizatora });
  globalny.NarzedziaOrganizatoraEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
