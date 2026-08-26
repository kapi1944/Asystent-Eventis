(function (globalny) {
  "use strict";

  const NARZEDZIA_ARKUSZA = globalny.NarzedziaArkuszaEventis
    || (typeof require === "function" ? require("./arkusz") : null);
  if (!NARZEDZIA_ARKUSZA) throw new Error("Nie załadowano parsera ręcznego importu.");

  const STATUSY_KOLEJKI_EVENTIS = Object.freeze({
    OCZEKUJE: "PENDING",
    CZEKA_NA_ZAPIS: "WAITING_FOR_SAVE",
    ZAKONCZONE: "DONE",
    BLAD: "ERROR"
  });
  const AKTYWNE_STATUSY_KOLEJKI = new Set([
    STATUSY_KOLEJKI_EVENTIS.OCZEKUJE,
    STATUSY_KOLEJKI_EVENTIS.CZEKA_NA_ZAPIS,
    STATUSY_KOLEJKI_EVENTIS.BLAD
  ]);
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

  function utworzId() {
    if (globalny.crypto && typeof globalny.crypto.randomUUID === "function") return globalny.crypto.randomUUID();
    return `eventis-import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    return {
      id: opcje.id || utworzId(),
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
      .filter(element => element.organization === organizacja && AKTYWNE_STATUSY_KOLEJKI.has(element.status))
      .map(element => kluczKolejki(element.organization,element.recordKey)));
    const nowe = [];
    let pominieteDuplikaty = 0;
    for (const rekord of rekordy || []) {
      if (rekord.status !== "CONFIRMED" || rekord.error) continue;
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

  function podsumujKolejke(kolejka = []) {
    return (kolejka || []).reduce((wynik, element) => {
      if (element.status === STATUSY_KOLEJKI_EVENTIS.OCZEKUJE) wynik.pending++;
      else if (element.status === STATUSY_KOLEJKI_EVENTIS.CZEKA_NA_ZAPIS) wynik.waitingForSave++;
      else if (element.status === STATUSY_KOLEJKI_EVENTIS.ZAKONCZONE) wynik.done++;
      else if (element.status === STATUSY_KOLEJKI_EVENTIS.BLAD) wynik.errors++;
      return wynik;
    }, { pending: 0, waitingForSave: 0, done: 0, errors: 0 });
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
    return [termin.start,normalizujMiasto(termin.city)].join("|");
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
    return { ...element, status, errorMessage, updatedAt: new Date().toISOString() };
  }

  function oznaczElementyOczekujaceOperacji(kolejka = [], operacja) {
    const identyfikatory = new Set(operacja?.queueItemIds || []);
    if (!identyfikatory.size || !operacja?.operationId) return kolejka;
    return kolejka.map(element =>
      element.organization === operacja.organization
        && identyfikatory.has(element.id)
        && [STATUSY_KOLEJKI_EVENTIS.OCZEKUJE,STATUSY_KOLEJKI_EVENTIS.BLAD].includes(element.status)
        ? { ...zmienStatusElementu(element,STATUSY_KOLEJKI_EVENTIS.CZEKA_NA_ZAPIS), operationId:operacja.operationId }
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
        ? zmienStatusElementu(element,status,komunikatBledu)
        : element
    );
  }

  function znajdzOperacjeDlaStrony(operacje = {}, organizacja, eventisId, eventisTitle) {
    const dokladna = operacje[`${organizacja}|${eventisId}`];
    if (dokladna) return dokladna;
    const normalizujTytul = wartosc => String(wartosc || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    const tytul = normalizujTytul(eventisTitle);
    const kandydaci = Object.values(operacje).filter(operacja =>
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
    podsumujKolejke,
    dopasujElementKolejkiDoTerminow,
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
