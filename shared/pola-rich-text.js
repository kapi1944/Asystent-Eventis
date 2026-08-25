(function (globalny) {
  "use strict";

  async function uzupelnijPolaOpisoweJesliDodawanie(tryb, opisy, mapowanie, ustawPole) {
    if (tryb !== "add") return { ok: true, pominieto: true, ustawionePola: [] };
    const ustawionePola = [];
    for (const { klucz, pole } of mapowanie) {
      const html = opisy?.[klucz];
      if (!html) continue;
      await ustawPole(pole, html);
      ustawionePola.push(pole);
    }
    return { ok: true, pominieto: false, ustawionePola };
  }

  const interfejs = { uzupelnijPolaOpisoweJesliDodawanie };
  globalny.NarzedziaPolRichTextEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
