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

  const interfejs = { utworzOperationId, kluczClaimuOperacji, uzyskajClaimOperacji, wykonajPoUzyskaniuClaimu };
  globalny.NarzedziaOperacjiEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
