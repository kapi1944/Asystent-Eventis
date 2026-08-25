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

  function utworzElementKolejki(rekord, opcje = {}) {
    const teraz = opcje.now || new Date().toISOString();
    return {
      id: opcje.id || utworzId(),
      recordKey: NARZEDZIA_ARKUSZA.recordKey(rekord),
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
    const klucze = new Set((kolejka || []).map(element => element.recordKey));
    const nowe = [];
    let pominieteDuplikaty = 0;
    for (const rekord of rekordy || []) {
      if (rekord.status !== "CONFIRMED" || rekord.error) continue;
      const recordKey = NARZEDZIA_ARKUSZA.recordKey(rekord);
      if (klucze.has(recordKey)) {
        pominieteDuplikaty++;
        continue;
      }
      const element = utworzElementKolejki(rekord, { ...opcje, id: undefined });
      klucze.add(recordKey);
      nowe.push(element);
    }
    return { items: nowe, duplicates: pominieteDuplikaty };
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

  function zmienStatusElementu(element, status, errorMessage = "") {
    return { ...element, status, errorMessage, updatedAt: new Date().toISOString() };
  }

  const interfejs = {
    STATUSY_KOLEJKI_EVENTIS,
    utworzElementKolejki,
    przygotujElementyKolejki,
    podsumujKolejke,
    dopasujElementKolejkiDoTerminow,
    zmienStatusElementu
  };

  globalny.NarzedziaKolejkiEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
