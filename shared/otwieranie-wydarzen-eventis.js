(function (globalny) {
  "use strict";

  function bezpiecznyUrlEdycjiEventis(wartosc) {
    try {
      const url = new URL(String(wartosc || ""));
      if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)eventis\.pl$/i.test(url.hostname)) return "";
      const eventId = url.pathname.match(/^\/event\/edit\/(\d+)(?:\/|$)/i)?.[1]
        || url.searchParams.get("id") || url.searchParams.get("event_id") || url.searchParams.get("eventId");
      if (!eventId) return "";
      url.hash = "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function eventIdZUrl(url) {
    const bezpieczny = bezpiecznyUrlEdycjiEventis(url);
    if (!bezpieczny) return "";
    const parsed = new URL(bezpieczny);
    return parsed.pathname.match(/^\/event\/edit\/(\d+)(?:\/|$)/i)?.[1]
      || parsed.searchParams.get("id") || parsed.searchParams.get("event_id") || parsed.searchParams.get("eventId") || "";
  }

  function utworzPlanOtwierania(pozycje = [], otwarteUrl = []) {
    const otwarteEventy = new Set(otwarteUrl.map(eventIdZUrl).filter(Boolean));
    const wedlugEventu = new Map();
    const konflikty = [];
    for (const pozycja of pozycje) {
      if (pozycja?.status !== "READY" || !pozycja.selectedCandidate) continue;
      const url = bezpiecznyUrlEdycjiEventis(pozycja.selectedCandidate.url);
      const eventId = String(pozycja.selectedCandidate.eventId || eventIdZUrl(url));
      if (!url || !eventId || eventId !== eventIdZUrl(url)) continue;
      const zadanie = {...pozycja,eventId,eventUrl:url};
      const poprzednie = wedlugEventu.get(eventId);
      if (poprzednie) {
        konflikty.push({eventId,eventUrl:url,sourceTitles:[poprzednie.sourceTitle,pozycja.sourceTitle]});
        continue;
      }
      wedlugEventu.set(eventId,zadanie);
    }
    const gotowe = [...wedlugEventu.values()];
    const juzOtwarte = gotowe.filter(zadanie => otwarteEventy.has(zadanie.eventId));
    const doOtwarcia = gotowe.filter(zadanie => !otwarteEventy.has(zadanie.eventId));
    return {gotowe:gotowe.length,juzOtwarte,doOtwarcia,konflikty};
  }

  function utworzSesjeOtwarcia(sessionId, organizacja, zadania = [], createdAt = new Date().toISOString()) {
    return {
      sessionId,
      organization:organizacja,
      createdAt,
      tasks:zadania.map(zadanie => ({
        sourceTitle:zadanie.sourceTitle,
        normalizedSourceTitle:zadanie.normalizedSourceTitle,
        organization:zadanie.organization || organizacja,
        eventId:zadanie.eventId || zadanie.selectedCandidate?.eventId,
        eventUrl:zadanie.eventUrl || zadanie.selectedCandidate?.url
      }))
    };
  }

  const interfejs = {bezpiecznyUrlEdycjiEventis,eventIdZUrl,utworzPlanOtwierania,utworzSesjeOtwarcia};
  globalny.OtwieranieWydarzenEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
