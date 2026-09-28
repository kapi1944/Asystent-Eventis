(function (globalny) {
  "use strict";

  const NARZEDZIA_ARKUSZA = globalny.NarzedziaArkuszaEventis
    || (typeof require === "function" ? require("./arkusz") : null);
  if (!NARZEDZIA_ARKUSZA) throw new Error("Nie załadowano parsera ręcznego importu.");

  const STATUSY_KOLEJKI_EVENTIS = Object.freeze({
    OCZEKUJE: "PENDING",
    CZEKA_NA_ZAPIS: "WAITING_FOR_SAVE",
    ZAKONCZONE: "DONE",
    ZAKONCZONE_ISTNIEJACE: "COMPLETED_EXISTING",
    POMINIETE: "SKIPPED",
    WYMAGA_UWAGI: "NEEDS_ATTENTION",
    BLAD: "ERROR"
  });
  const DOZWOLONE_ORGANIZACJE = new Set(["SEMPER", "IIST"]);

  function normalizujMiasto(wartosc) {
    return String(wartosc || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sprawdzOrganizacje(organizacja) {
    if (!DOZWOLONE_ORGANIZACJE.has(organizacja)) throw new Error("Nieprawidłowa organizacja kolejki Eventis.");
    return organizacja;
  }

  function kluczKolejki(organizacja, recordKey) {
    return `${sprawdzOrganizacje(organizacja)}|${recordKey}`;
  }

  function utworzElementKolejki(rekord, opcje = {}) {
    const teraz = opcje.now || new Date().toISOString();
    const organizacja = sprawdzOrganizacje(opcje.organization);
    const queueItemId = opcje.id || kluczKolejki(organizacja,NARZEDZIA_ARKUSZA.recordKey(rekord));
    return {
      id: queueItemId,
      queueItemId,
      schemaVersion: 2,
      signature: kluczKolejki(organizacja,NARZEDZIA_ARKUSZA.recordKey(rekord)),
      recordKey: NARZEDZIA_ARKUSZA.recordKey(rekord),
      organization: organizacja,
      status: STATUSY_KOLEJKI_EVENTIS.OCZEKUJE,
      recordStatus: rekord.status,
      title: rekord.title,
      normalizedTitle: rekord.normalizedTitle || "",
      start: rekord.start,
      end: rekord.end,
      city: rekord.city,
      participants: rekord.participants == null ? null : rekord.participants,
      source: "MANUAL_PASTE",
      rawText: rekord.rawText || "",
      createdAt: teraz,
      updatedAt: teraz,
      errorMessage: ""
    };
  }

  function przygotujElementyKolejki(rekordy, kolejka = [], opcje = {}) {
    const organizacja = sprawdzOrganizacje(opcje.organization);
    const klucze = new Set((kolejka || [])
      .filter(element => element.organization === organizacja)
      .map(element => kluczKolejki(element.organization,element.recordKey)));
    const nowe = [];
    let pominieteDuplikaty = 0;
    for (const rekord of rekordy || []) {
      if (!["CONFIRMED","DECONFIRMED"].includes(rekord.status) || rekord.error) continue;
      const recordKey = NARZEDZIA_ARKUSZA.recordKey(rekord);
      const klucz = kluczKolejki(organizacja,recordKey);
      if (klucze.has(klucz)) {
        pominieteDuplikaty++;
        continue;
      }
      const element = utworzElementKolejki(rekord, { ...opcje, organization: organizacja, id: undefined });
      klucze.add(klucz);
      nowe.push(element);
    }
    return { items: nowe, duplicates: pominieteDuplikaty };
  }

  function filtrujKolejkeOrganizacji(kolejka = [], organizacja) {
    return (kolejka || []).filter(element => element.organization === organizacja);
  }

  function przypiszElementyDoZadania(kolejka = [], zadanie, organizacja) {
    const identyfikatory = new Set(zadanie?.queueItemIds || zadanie?.identyfikatoryKolejki || []);
    const tytulGrupy = String(zadanie?.normalizedSourceTitle || "");
    if (!identyfikatory.size || !tytulGrupy || zadanie?.status !== "VERIFIED") return [];
    return (kolejka || []).filter(element =>
      element.organization === organizacja
      && identyfikatory.has(element.id)
      && String(element.normalizedTitle || "") === tytulGrupy
      && [STATUSY_KOLEJKI_EVENTIS.OCZEKUJE,STATUSY_KOLEJKI_EVENTIS.BLAD,STATUSY_KOLEJKI_EVENTIS.WYMAGA_UWAGI].includes(element.status)
      && ["CONFIRMED","DECONFIRMED"].includes(element.recordStatus)
    );
  }

  function podsumujKolejke(kolejka = []) {
    return (kolejka || []).reduce((wynik, element) => {
      if (element.status === STATUSY_KOLEJKI_EVENTIS.OCZEKUJE) wynik.pending++;
      else if (element.status === STATUSY_KOLEJKI_EVENTIS.CZEKA_NA_ZAPIS) wynik.waitingForSave++;
      else if ([STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE,STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE_ISTNIEJACE].includes(element.status)) wynik.done++;
      else if (element.status === STATUSY_KOLEJKI_EVENTIS.POMINIETE) wynik.skipped++;
      else if ([STATUSY_KOLEJKI_EVENTIS.BLAD,STATUSY_KOLEJKI_EVENTIS.WYMAGA_UWAGI].includes(element.status)) wynik.errors++;
      return wynik;
    }, { pending: 0, waitingForSave: 0, done: 0, skipped: 0, errors: 0 });
  }

  function migrujKolejke(kolejka = []) {
    const wynik = new Map();
    for (const element of kolejka || []) {
      if (!element?.organization || !element.recordKey) {
        if (element) wynik.set(`legacy|${element.id || wynik.size}`,element);
        continue;
      }
      const signature = kluczKolejki(element.organization,element.recordKey);
      const poprzedni = wynik.get(signature);
      const zakonczone = new Set([STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE,STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE_ISTNIEJACE]);
      if (!poprzedni || (!zakonczone.has(poprzedni.status) && zakonczone.has(element.status))) {
        wynik.set(signature,{...element,queueItemId:element.id,signature,schemaVersion:2});
      }
    }
    return [...wynik.values()];
  }

  function scalElementyKolejki(kolejka = [], zmiany = []) {
    const wynik = migrujKolejke(kolejka);
    for (const element of zmiany) {
      if (!element?.id || !element.organization || !element.recordKey) continue;
      const indeks = wynik.findIndex(istniejacy => istniejacy.id === element.id);
      if (indeks >= 0) wynik[indeks] = element;
      else if (!wynik.some(istniejacy => istniejacy.signature === element.signature)) wynik.push(element);
    }
    return wynik;
  }

  function reconcileQueueState(kolejka = [], operacje = {}, istniejaceId = new Set(), teraz = Date.now()) {
    const aktualneOperacje = Object.values(operacje);
    return kolejka.map(element => {
      if (istniejaceId.has(element.id) && ["PENDING","ERROR","NEEDS_ATTENTION","WAITING_FOR_SAVE"].includes(element.status)) {
        return {...zmienStatusElementu(element,STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE_ISTNIEJACE),completionReason:"ALREADY_EXISTS",completedAt:new Date(teraz).toISOString(),operationId:null};
      }
      if (element.status !== STATUSY_KOLEJKI_EVENTIS.CZEKA_NA_ZAPIS) return element;
      const operacja = aktualneOperacje.find(wpis => wpis.operationId === element.operationId);
      if (operacja && teraz - Date.parse(operacja.updatedAt || operacja.filledAt || operacja.createdAt) < 2 * 60 * 60 * 1000) return element;
      return {...zmienStatusElementu(element,STATUSY_KOLEJKI_EVENTIS.WYMAGA_UWAGI,"Sprawdź wynik wcześniejszego zapisu Eventis."),operationId:null};
    });
  }

  function oznaczKompletnePoPreflighcie(kolejka = [], wyniki = {}, organizacja, dozwoloneKlucze = null) {
    return kolejka.map(element => {
      const wynik = wyniki[`${element.organization}|${element.normalizedTitle}`];
      if (element.organization !== organizacja || element.recordStatus !== "CONFIRMED"
        || (dozwoloneKlucze && !dozwoloneKlucze.has(element.recordKey))
        || wynik?.status !== "COMPLETE" || !["PENDING","ERROR","NEEDS_ATTENTION"].includes(element.status)) return element;
      const zmieniony = zmienStatusElementu(element,STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE_ISTNIEJACE);
      return {...zmieniony,eventisEventId:wynik.eventId,completionReason:"ALREADY_EXISTS",completion:{status:"COMPLETED",completedAt:zmieniony.completedAt,eventisEventId:wynik.eventId,source:"preflight-existing"}};
    });
  }

  function czyPasujeDoTerminu(element, termin) {
    const miastoPasuje = normalizujMiasto(element.city) === normalizujMiasto(termin.city);
    if (!miastoPasuje) return false;
    if (termin.sourceStart && termin.sourceEnd) {
      return element.start === termin.sourceStart && element.end === termin.sourceEnd;
    }
    return element.start === termin.start && element.end === termin.end;
  }

  function dopasujElementKolejkiDoTerminow(element, terminy = []) {
    return (terminy || []).filter(termin => czyPasujeDoTerminu(element, termin));
  }

  function kluczTerminuEventis(termin) {
    return [termin.start,termin.end || termin.start,normalizujMiasto(termin.city)].join("|");
  }

  function rozdzielTerminyDoWprowadzenia(terminy = [], istniejaceTerminy = []) {
    const zajeteKlucze = new Set((istniejaceTerminy || []).map(kluczTerminuEventis));
    const doWprowadzenia = [];
    const pominiete = [];
    for (const termin of terminy || []) {
      const klucz = kluczTerminuEventis(termin);
      if (!klucz || zajeteKlucze.has(klucz)) {
        pominiete.push(termin);
        continue;
      }
      zajeteKlucze.add(klucz);
      doWprowadzenia.push(termin);
    }
    return {doWprowadzenia,pominiete};
  }

  function wypelnijTerminyOsobno(terminy = [], formularze = [], wypelnij) {
    const dodane = [];
    const bledy = [];
    for (let indeks=0;indeks<terminy.length;indeks++) {
      const termin = terminy[indeks];
      const formularz = formularze[indeks];
      if (!formularz) {
        bledy.push({termin,komunikat:"Eventis nie utworzył formularza dla tego terminu."});
        continue;
      }
      try {
        wypelnij(formularz,termin);
        dodane.push(termin);
      } catch (blad) {
        bledy.push({termin,komunikat:blad?.message || "Nie udało się wypełnić terminu."});
      }
    }
    return {dodane,bledy};
  }

  function rozdzielDopasowaniaKolejki(dopasowania = []) {
    const jednoznaczne = [];
    const nierozwiazane = [];
    const duplikatyTerminow = [];
    const zajeteTerminy = new Set();
    for (const dopasowanie of dopasowania || []) {
      if (dopasowanie.terminy.length !== 1) {
        nierozwiazane.push(dopasowanie);
        continue;
      }
      const klucz = kluczTerminuEventis(dopasowanie.terminy[0]);
      if (zajeteTerminy.has(klucz)) {
        duplikatyTerminow.push(dopasowanie);
        continue;
      }
      zajeteTerminy.add(klucz);
      jednoznaczne.push(dopasowanie);
    }
    return { jednoznaczne, nierozwiazane, duplikatyTerminow };
  }

  function powiazDodaneTerminy(dopasowania = [], dodaneTerminy = []) {
    const dopasowaniaWedlugTerminu = new Map(dopasowania.map(dopasowanie => [
      kluczTerminuEventis(dopasowanie.terminy[0]),
      dopasowanie
    ]));
    const terminy = [];
    const identyfikatoryElementow = [];
    for (const termin of dodaneTerminy || []) {
      const dopasowanie = dopasowaniaWedlugTerminu.get(kluczTerminuEventis(termin));
      if (!dopasowanie) continue;
      terminy.push(termin);
      identyfikatoryElementow.push(dopasowanie.element.id);
    }
    return { terms: terminy, queueItemIds: identyfikatoryElementow };
  }

  function zmienStatusElementu(element, status, errorMessage = "") {
    const teraz = new Date().toISOString();
    return { ...element, status, errorMessage, updatedAt: teraz,
      historia:[...(element.historia || []).slice(-9),{status,at:teraz}],
      ...([STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE,STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE_ISTNIEJACE].includes(status) ? {completedAt:teraz} : {}) };
  }

  function oznaczElementyOczekujaceOperacji(kolejka = [], operacja) {
    const identyfikatory = new Set(operacja?.queueItemIds || []);
    if (!identyfikatory.size || !operacja?.operationId) return kolejka;
    return kolejka.map(element =>
      element.organization === operacja.organization
        && identyfikatory.has(element.id)
        && [STATUSY_KOLEJKI_EVENTIS.OCZEKUJE,STATUSY_KOLEJKI_EVENTIS.BLAD,STATUSY_KOLEJKI_EVENTIS.WYMAGA_UWAGI].includes(element.status)
        ? { ...zmienStatusElementu(element,STATUSY_KOLEJKI_EVENTIS.CZEKA_NA_ZAPIS), operationId:operacja.operationId, pendingOperationId:operacja.operationId, eventisEventId:operacja.eventisIdResolved || operacja.eventisIdAtStart || null,tabId:operacja.tabId || null,filledAt:new Date().toISOString() }
        : element
    );
  }

  function rozliczElementyOperacji(kolejka = [], operacja, status, komunikatBledu = "") {
    const identyfikatory = new Set(operacja?.queueItemIds || []);
    if (!identyfikatory.size) return kolejka;
    return kolejka.map(element =>
      element.organization === operacja.organization
        && identyfikatory.has(element.id)
        && (!operacja.operationId || element.operationId === operacja.operationId)
        ? {
          ...zmienStatusElementu(element,status,komunikatBledu),
          ...(status === STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE ? {completionReason:"SAVED",savedAt:new Date().toISOString(),completion:{status:"COMPLETED",completedAt:new Date().toISOString(),eventisEventId:operacja.eventisIdResolved || operacja.eventisIdAtStart || null,source:"verified-save"}} : {}),
          ...(status === STATUSY_KOLEJKI_EVENTIS.BLAD ? {saveErrorAt:new Date().toISOString()} : {})
        }
        : element
    );
  }

  function znajdzOperacjeDlaStrony(operacje = {}, organizacja, eventisId, eventisTitle, tabId = null) {
    const dostepne = Object.values(operacje).filter(operacja => tabId == null || operacja?.tabId === tabId);
    const dokladna = dostepne.find(operacja => operacja?.organization === organizacja
      && String(operacja?.eventisIdResolved || operacja?.eventisIdAtStart || operacja?.eventisId) === String(eventisId));
    if (dokladna) return dokladna;
    const normalizujTytul = wartosc => String(wartosc || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    const tytul = normalizujTytul(eventisTitle);
    const kandydaci = dostepne.filter(operacja =>
      operacja?.organization === organizacja
      && (String(operacja.operationScopeKey || "").startsWith(`${organizacja}|add:`)
        || String(operacja.eventisIdAtStart ?? operacja.eventisId ?? "").startsWith("new:"))
      && normalizujTytul(operacja.eventisTitleAtStart || operacja.eventisTitle) === tytul
    );
    return kandydaci.length === 1 ? kandydaci[0] : null;
  }

  const interfejs = {
    STATUSY_KOLEJKI_EVENTIS,
    kluczKolejki,
    utworzElementKolejki,
    przygotujElementyKolejki,
    filtrujKolejkeOrganizacji,
    przypiszElementyDoZadania,
    podsumujKolejke,
    migrujKolejke,
    scalElementyKolejki,
    reconcileQueueState,
    oznaczKompletnePoPreflighcie,
    dopasujElementKolejkiDoTerminow,
    rozdzielTerminyDoWprowadzenia,
    wypelnijTerminyOsobno,
    rozdzielDopasowaniaKolejki,
    powiazDodaneTerminy,
    zmienStatusElementu,
    oznaczElementyOczekujaceOperacji,
    rozliczElementyOperacji,
    znajdzOperacjeDlaStrony
  };

  globalny.NarzedziaKolejkiEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
