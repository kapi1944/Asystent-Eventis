(function (globalny) {
  "use strict";

  function utworzOperationId(generator = globalny.crypto?.randomUUID?.bind(globalny.crypto)) {
    if (typeof generator === "function") return generator();
    return `operacja-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function kluczClaimuOperacji(organizacja, tryb, eventisId, tokenDokumentu) {
    const tozsamoscFormularza = tryb === "add"
      ? `add:${tokenDokumentu}`
      : `event:${eventisId}`;
    return `${organizacja}|${tozsamoscFormularza}`;
  }

  async function uzyskajClaimOperacji(magazyn, operacja) {
    const operacjePrzedClaimem = { ...(await magazyn.pobierz()) };
    const istniejacaOperacja = operacjePrzedClaimem[operacja.operationScopeKey];
    if (istniejacaOperacja) return { ok:false, code:"OPERATION_ALREADY_CLAIMED", operacja:istniejacaOperacja };
    const operacjePoClaimie = { ...operacjePrzedClaimem, [operacja.operationScopeKey]:operacja };
    await magazyn.zapisz(operacjePoClaimie);
    const operacjePoWeryfikacji = await magazyn.pobierz();
    const zweryfikowanaOperacja = operacjePoWeryfikacji[operacja.operationScopeKey];
    if (zweryfikowanaOperacja?.operationId !== operacja.operationId) {
      return { ok:false, code:"OPERATION_CLAIM_LOST", operacja:zweryfikowanaOperacja || null };
    }
    return { ok:true, operacja:zweryfikowanaOperacja };
  }

  async function wykonajPoUzyskaniuClaimu(uzyskajClaim, mutujFormularz) {
    const wynikClaimu = await uzyskajClaim();
    if (!wynikClaimu?.ok) return wynikClaimu || { ok:false, code:"OPERATION_CLAIM_FAILED" };
    return { ok:true, operacja:wynikClaimu.operacja, wynik:await mutujFormularz(wynikClaimu.operacja) };
  }

  function oznaczWyslanieZapisu(operacja, teraz = new Date().toISOString()) {
    if (!operacja || operacja.status !== "WAITING_FOR_SAVE") return null;
    return {...operacja,status:"SAVE_SUBMITTED",saveRequestedAt:teraz};
  }

  const CZAS_OCZEKIWANIA_ZAPISU = 20000;

  function utworzStanZapisu(oczekujacyZapis, teraz = Date.now()) {
    return {saveState:"WAITING_FOR_EVENTIS",submitStartedAt:oczekujacyZapis.timestamp || teraz,
      successDetectedAt:null,errorDetectedAt:null,timeoutAt:null,pendingSave:oczekujacyZapis};
  }

  function rozstrzygnijStanZapisu(stan, wynik, teraz = Date.now()) {
    if (!stan || stan.saveState !== "WAITING_FOR_EVENTIS") return stan;
    if (wynik?.rodzaj === "SUCCESS") return {...stan,saveState:"SUCCESS",successDetectedAt:teraz};
    if (wynik?.rodzaj === "EXPLICIT_ERROR") return {...stan,saveState:"EXPLICIT_ERROR",errorDetectedAt:teraz,przyczyna:wynik.tekst};
    if (teraz - stan.submitStartedAt >= CZAS_OCZEKIWANIA_ZAPISU) return {...stan,saveState:"UNKNOWN",timeoutAt:teraz};
    return stan;
  }

  function czyMoznaRozpoczacZapis(stan, trwaRozpoczynanie) {
    return !trwaRozpoczynanie && !["PREPARING_SAVE","SUBMITTING","WAITING_FOR_EVENTIS"].includes(stan?.saveState);
  }

  function czyPrzywrocicZapis(oczekujacyZapis, eventId, url, operacja, teraz = Date.now()) {
    if (!oczekujacyZapis || !Number.isFinite(oczekujacyZapis.timestamp) || teraz - oczekujacyZapis.timestamp > 120000 || teraz < oczekujacyZapis.timestamp) return false;
    if (oczekujacyZapis.expectedOperation !== (operacja?.operationId || "FORM_SAVE")) return false;
    return oczekujacyZapis.eventId === eventId || (String(oczekujacyZapis.eventId).startsWith("new:")
      && (oczekujacyZapis.url === url || (oczekujacyZapis.url?.startsWith("/event/add") && url.startsWith("/event/edit"))));
  }

  const interfejs = { utworzOperationId, kluczClaimuOperacji, uzyskajClaimOperacji, wykonajPoUzyskaniuClaimu, oznaczWyslanieZapisu,
    CZAS_OCZEKIWANIA_ZAPISU, utworzStanZapisu, rozstrzygnijStanZapisu, czyMoznaRozpoczacZapis, czyPrzywrocicZapis };
  globalny.NarzedziaOperacjiEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
