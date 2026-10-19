(function (globalny) {
  "use strict";

  async function uzupelnijPolaOpisowe(opisy, mapowanie, ustawPole) {
    const ustawionePola = [];
    for (const { klucz, pole } of mapowanie) {
      const html = opisy?.[klucz];
      if (!html) continue;
      const wynik = await ustawPole(pole, html, {tylkoPuste:false});
      if (!wynik?.pominieto) ustawionePola.push(pole);
    }
    return { ok: true, pominieto: false, ustawionePola };
  }

  const interfejs = { uzupelnijPolaOpisowe };
  globalny.NarzedziaPolRichTextEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
