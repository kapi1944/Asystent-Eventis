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

  function kluczNowegoOgloszenia(pozycja) {
    return `${String(pozycja?.organization || "").toUpperCase()}|${String(pozycja?.normalizedSourceTitle || "")}`;
  }

  function bezpiecznyUrlNowegoOgloszenia(wartosc) {
    try {
      const url = new URL(String(wartosc || ""));
      if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)eventis\.pl$/i.test(url.hostname) || !/^\/event\/add\/?$/i.test(url.pathname)) return "";
      url.hash = "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function utworzPlanOtwierania(pozycje = [], otwarteUrl = []) {
    const otwarteEventy = new Set(otwarteUrl.map(eventIdZUrl).filter(Boolean));
    const wedlugEventu = new Map();
    const wedlugNowegoOgloszenia = new Map();
    const konflikty = [];
    for (const pozycja of pozycje) {
      if (pozycja?.status === "CREATE_NEW" && pozycja.selectedCandidate?.matchType === "CREATE_NEW") {
        const url = bezpiecznyUrlNowegoOgloszenia(pozycja.selectedCandidate.url);
        const taskId = kluczNowegoOgloszenia(pozycja);
        if (url && taskId && !wedlugNowegoOgloszenia.has(taskId)) {
          wedlugNowegoOgloszenia.set(taskId,{...pozycja,taskId,eventId:"",eventUrl:url,typ:"CREATE_NEW"});
        }
        continue;
      }
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
    const noweOtwarte = new Set(otwarteUrl.map(wartosc => {
      const bezpieczny = bezpiecznyUrlNowegoOgloszenia(wartosc);
      try { return bezpieczny ? new URL(bezpieczny).searchParams.get("esyncNoweId") || "" : ""; } catch (_) { return ""; }
    }).filter(Boolean));
    const gotowe = [...wedlugEventu.values(),...wedlugNowegoOgloszenia.values()];
    const juzOtwarte = gotowe.filter(zadanie => zadanie.typ === "CREATE_NEW" ? noweOtwarte.has(zadanie.taskId) : otwarteEventy.has(zadanie.eventId));
    const doOtwarcia = gotowe.filter(zadanie => zadanie.typ === "CREATE_NEW" ? !noweOtwarte.has(zadanie.taskId) : !otwarteEventy.has(zadanie.eventId));
    return {gotowe:gotowe.length,juzOtwarte,doOtwarcia,konflikty};
  }

  function utworzSesjeOtwarcia(sessionId, organizacja, zadania = [], createdAt = new Date().toISOString()) {
    return {
      sessionId,
      organization:organizacja,
      createdAt,
      tasks:zadania.map(zadanie => ({
        taskId:String(zadanie.taskId || zadanie.eventId || zadanie.selectedCandidate?.eventId),
        sourceTitle:zadanie.sourceTitle,
        normalizedSourceTitle:zadanie.normalizedSourceTitle,
        organization:zadanie.organization || organizacja,
        eventId:zadanie.eventId || zadanie.selectedCandidate?.eventId,
        eventUrl:zadanie.eventUrl || zadanie.selectedCandidate?.url,
        queueItemIds:[...(zadanie.queueItemIds || zadanie.identyfikatoryKolejki || [])],
        status:"PENDING",
        typ:zadanie.typ || "EDIT"
      }))
    };
  }

  function zweryfikujOtwartaKarte(sesja, daneKarty, mapowanie) {
    const identyfikatorSesji = String(daneKarty?.sessionId || "");
    const identyfikatorZadania = String(daneKarty?.taskId || "");
    const organizacja = String(daneKarty?.organization || "").toUpperCase();
    const rzeczywistyEventId = eventIdZUrl(daneKarty?.eventUrl);
    const rzeczywistyTytul = String(daneKarty?.eventTitle || "").replace(/\s+/g," ").trim();
    const zadanie = sesja?.tasks?.find(element => String(element.taskId || element.eventId) === identyfikatorZadania);
    const wynikBazowy = {sessionId:identyfikatorSesji,taskId:identyfikatorZadania,organization:organizacja,eventId:rzeczywistyEventId,eventTitle:rzeczywistyTytul};
    if (!sesja || sesja.sessionId !== identyfikatorSesji || !zadanie) {
      return {...wynikBazowy,status:"INVALID",reason:"SESSION_TASK_NOT_FOUND",task:null,invalidMapping:false};
    }
    const organizacjaZadania = String(zadanie.organization || sesja.organization || "").toUpperCase();
    const oczekiwanyEventId = String(zadanie.eventId || "");
    const oczekiwanyUrl = bezpiecznyUrlEdycjiEventis(zadanie.eventUrl);
    if (!organizacja || organizacja !== organizacjaZadania || !rzeczywistyEventId || rzeczywistyEventId !== oczekiwanyEventId || eventIdZUrl(oczekiwanyUrl) !== oczekiwanyEventId) {
      return {...wynikBazowy,status:"INVALID",reason:"PAGE_ID_OR_ORGANIZATION_INVALID",task:zadanie,invalidMapping:false};
    }
    if (!mapowanie || String(mapowanie.organization || "").toUpperCase() !== organizacjaZadania
      || String(mapowanie.eventId || "") !== oczekiwanyEventId || eventIdZUrl(mapowanie.eventUrl) !== oczekiwanyEventId) {
      return {...wynikBazowy,status:"INVALID",reason:"MAPPING_INVALID",task:zadanie,invalidMapping:!!mapowanie};
    }
    const normalizujTytul = wartosc => String(wartosc || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ąćęłńóśźż]+/gi," ").replace(/\s+/g," ").trim();
    if (!rzeczywistyTytul) {
      return {...wynikBazowy,status:"INVALID",reason:"PAGE_TITLE_MISSING",task:zadanie,invalidMapping:false};
    }
    if (normalizujTytul(rzeczywistyTytul) !== normalizujTytul(mapowanie.eventTitle)) {
      return {...wynikBazowy,status:"MISMATCH",reason:"EVENT_TITLE_MISMATCH",task:zadanie,invalidMapping:true};
    }
    return {...wynikBazowy,status:"VERIFIED",reason:"PAGE_AND_MAPPING_VERIFIED",task:zadanie,invalidMapping:false};
  }

  function zapiszWynikWeryfikacjiSesji(sesja, wynik, teraz = new Date().toISOString()) {
    if (!sesja || !wynik?.taskId) return sesja;
    return {
      ...sesja,
      tasks:(sesja.tasks || []).map(zadanie => String(zadanie.taskId || zadanie.eventId) === String(wynik.taskId)
        ? {...zadanie,status:wynik.status,verificationReason:wynik.reason,verifiedAt:teraz,actualEventId:wynik.eventId,actualEventTitle:wynik.eventTitle}
        : zadanie)
    };
  }

  const interfejs = {bezpiecznyUrlEdycjiEventis,bezpiecznyUrlNowegoOgloszenia,eventIdZUrl,kluczNowegoOgloszenia,utworzPlanOtwierania,utworzSesjeOtwarcia,zweryfikujOtwartaKarte,zapiszWynikWeryfikacjiSesji};
  globalny.OtwieranieWydarzenEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
