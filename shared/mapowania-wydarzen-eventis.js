(function (globalny) {
  "use strict";

  const NARZEDZIA_WYSZUKIWANIA = globalny.NarzedziaWyszukiwaniaEventis
    || (typeof require === "function" ? require("./wyszukiwanie") : null);
  if (!NARZEDZIA_WYSZUKIWANIA) throw new Error("Nie załadowano modułu wyszukiwania.");

  const KLUCZ_STORAGE_MAPOWAN = "eventisResolvedMappings";
  const WERSJA_SCHEMATU_MAPOWAN = 1;

  function kluczMapowania(organizacja, normalizedTitle) {
    return `${String(organizacja || "").toUpperCase()}|${NARZEDZIA_WYSZUKIWANIA.normalizujTytul(normalizedTitle)}`;
  }

  function bezpiecznyUrlEventis(wartosc) {
    try {
      if (!String(wartosc || "").trim()) return "";
      const url = new URL(String(wartosc || ""),"https://eventis.pl/");
      if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)eventis\.pl$/i.test(url.hostname)) return "";
      if (!/^\/event\/edit(?:\/|$)/i.test(url.pathname)) return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function poprawneMapowanie(wpis) {
    const organization = String(wpis?.organization || "").toUpperCase();
    const normalizedTitle = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(wpis?.normalizedTitle);
    const eventId = String(wpis?.eventId || "");
    const eventUrl = bezpiecznyUrlEventis(wpis?.eventUrl);
    const idZUrl = eventUrl.match(/^https:\/\/[^/]+\/event\/edit\/(\d+)(?:\/|$)/i)?.[1]
      || new URL(eventUrl || "https://eventis.pl/").searchParams.get("id")
      || new URL(eventUrl || "https://eventis.pl/").searchParams.get("event_id")
      || new URL(eventUrl || "https://eventis.pl/").searchParams.get("eventId");
    if (!organization || !normalizedTitle || !eventId || !eventUrl || String(idZUrl) !== eventId) return null;
    return {
      schemaVersion:WERSJA_SCHEMATU_MAPOWAN,
      organization,
      normalizedTitle,
      sourceTitle:String(wpis.sourceTitle || normalizedTitle),
      eventId,
      eventUrl,
      eventTitle:String(wpis.eventTitle || ""),
      resolutionSource:["manual","exact","fuzzy"].includes(wpis.resolutionSource) ? wpis.resolutionSource : "manual",
      createdAt:String(wpis.createdAt || ""),
      updatedAt:String(wpis.updatedAt || ""),
      lastVerifiedAt:wpis.lastVerifiedAt ? String(wpis.lastVerifiedAt) : null,
      status:wpis.status === "INVALID" ? "INVALID" : "ACTIVE",
      invalidAt:wpis.invalidAt ? String(wpis.invalidAt) : null
    };
  }

  function normalizujMagazynMapowan(dane) {
    const entries = dane?.entries && typeof dane.entries === "object"
      ? Object.values(dane.entries)
      : Array.isArray(dane) ? dane
      : [];
    const mapowania = {};
    for (const wpis of entries) {
      const poprawny = poprawneMapowanie(wpis);
      if (!poprawny) continue;
      const klucz = kluczMapowania(poprawny.organization,poprawny.normalizedTitle);
      const poprzedni = mapowania[klucz];
      if (!poprzedni || String(poprawny.updatedAt).localeCompare(String(poprzedni.updatedAt)) >= 0) mapowania[klucz] = poprawny;
    }
    return {schemaVersion:WERSJA_SCHEMATU_MAPOWAN,entries:mapowania};
  }

  function pobierzMapowanie(magazyn, organizacja, normalizedTitle) {
    const wpis = normalizujMagazynMapowan(magazyn).entries[kluczMapowania(organizacja,normalizedTitle)];
    return wpis?.status === "ACTIVE" ? wpis : null;
  }

  function zapiszMapowanie(magazyn, dane, teraz = new Date().toISOString()) {
    const wynik = normalizujMagazynMapowan(magazyn);
    const normalizedTitle = NARZEDZIA_WYSZUKIWANIA.normalizujTytul(dane?.normalizedTitle || dane?.sourceTitle);
    const klucz = kluczMapowania(dane?.organization,normalizedTitle);
    const poprzedni = wynik.entries[klucz];
    const wpis = poprawneMapowanie({...dane,normalizedTitle,createdAt:poprzedni?.createdAt || teraz,updatedAt:teraz,status:"ACTIVE",invalidAt:null});
    if (!wpis) return wynik;
    wynik.entries[klucz] = wpis;
    return wynik;
  }

  function oznaczMapowanieNieprawidlowe(magazyn, organizacja, normalizedTitle, teraz = new Date().toISOString()) {
    const wynik = normalizujMagazynMapowan(magazyn);
    const klucz = kluczMapowania(organizacja,normalizedTitle);
    if (wynik.entries[klucz]) wynik.entries[klucz] = {...wynik.entries[klucz],status:"INVALID",invalidAt:teraz,updatedAt:teraz};
    return wynik;
  }

  function usunMapowanie(magazyn, organizacja, normalizedTitle) {
    const wynik = normalizujMagazynMapowan(magazyn);
    delete wynik.entries[kluczMapowania(organizacja,normalizedTitle)];
    return wynik;
  }

  function resolverZMapowania(mapowanie) {
    if (!mapowanie || mapowanie.status !== "ACTIVE") return null;
    return {
      status:"KNOWN_MAPPING",
      sourceTitle:mapowanie.sourceTitle,
      normalizedSourceTitle:mapowanie.normalizedTitle,
      organization:mapowanie.organization,
      selectedCandidate:{eventId:mapowanie.eventId,url:mapowanie.eventUrl,title:mapowanie.eventTitle,normalizedTitle:NARZEDZIA_WYSZUKIWANIA.normalizujTytul(mapowanie.eventTitle) || mapowanie.normalizedTitle,score:1,matchType:"CACHE"},
      candidates:[],
      reason:"CACHE_MAPPING",
      confidence:1
    };
  }

  const interfejs = {
    KLUCZ_STORAGE_MAPOWAN,
    WERSJA_SCHEMATU_MAPOWAN,
    kluczMapowania,
    normalizujMagazynMapowan,
    pobierzMapowanie,
    zapiszMapowanie,
    oznaczMapowanieNieprawidlowe,
    usunMapowanie,
    resolverZMapowania
  };

  globalny.MapowaniaWydarzenEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
