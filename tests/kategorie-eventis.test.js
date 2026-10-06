"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const sciezki = require("node:path");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const { chromium: przegladarkaChromium } = require("playwright");
const matcher = require("../shared/kategorie-eventis");

// Katalog syntetyczny: repo nie zawiera zrzutu aktualnego formularza Eventis.
const nazwy = ["Fundusze europejskie", "Zarządzanie projektami", "Prawo budowlane", "Zamówienia publiczne", "Kadry i płace", "Ochrona środowiska", "Finanse i księgowość", "Cyberbezpieczeństwo", "Administracja publiczna"];
const katalog = nazwy.map(nazwa => ({ nazwa }));
const przyklady = [
  ["Kontrola finansowa w projektach unijnych - aspekt praktyczny z analizą uprawnień kontrolujących", "Fundusze europejskie"],
  ["Energetyka w samorządach 2026 - jak planować, finansować i realizować inwestycje z KPO i FEnIKS", "Fundusze europejskie"],
  ["Kontrola i audyt inwestycji budowlanych w praktyce", "Prawo budowlane"],
  ["Prawo zamówień publicznych — tryb podstawowy", "Zamówienia publiczne"],
  ["Kadry i płace — wynagrodzenia, ZUS i czas pracy", "Kadry i płace"],
  ["Ochrona środowiska — odpady i BDO", "Ochrona środowiska"],
  ["Podatki VAT i CIT — KSeF", "Finanse i księgowość"],
  ["Cyberbezpieczeństwo — NIS2 i phishing", "Cyberbezpieczeństwo"]
];

for (const [tytul, oczekiwana] of przyklady) test(`ranking: ${tytul}`, () => {
  const ranking = matcher.rankingKategorii(katalog, { tytul });
  asercje.equal(ranking[0].nazwa, oczekiwana);
  asercje.ok(ranking[0].wynik > 40);
  asercje.ok(ranking.every((kategoria, indeks) => !indeks || ranking[indeks - 1].punkty >= kategoria.punkty));
});

test("ogólne określenia nie dają sugestii, także dla nieznanych nazw", () => {
  for (const tytul of ["certyfikowane szkolenie online", "warsztaty praktyczne"]) {
    asercje.ok(matcher.rankingKategorii([...katalog, { nazwa: "Szkolenia online" }], { tytul }).every(kategoria => kategoria.wynik === 0));
  }
});
test("podobne tytuły i odmiany zachowują ranking", () => {
  const pierwszy = matcher.rankingKategorii(katalog, { tytul: "Rozliczanie projektów unijnych SL2021" });
  const drugi = matcher.rankingKategorii(katalog, { tytul: "Rozliczanie projektów unijnych SL2021. Certyfikowane szkolenie online 2027" });
  asercje.deepEqual(drugi, pierwszy);
  asercje.equal(matcher.rankingKategorii(katalog, { tytul: "Kontrola projektach unijnych" })[0].nazwa, "Fundusze europejskie");
});
test("tytuł ma pierwszeństwo nad opisem i nie powstają kategorie spoza katalogu", () => {
  const ranking = matcher.rankingKategorii(katalog, { tytul: "Prawo budowlane", opis: "VAT CIT KPO FEnIKS SL2021" });
  asercje.equal(ranking[0].nazwa, "Prawo budowlane");
  asercje.equal(matcher.rankingKategorii([{ nazwa: "Nowa nazwa Eventis" }], { tytul: "KPO" })[0].wynik, 0);
});
test("wykluczenie ogranicza pozorne dopasowanie finansów", () => {
  asercje.equal(matcher.rankingKategorii(katalog, { tytul: "Perspektywa finansowa" }).find(kategoria => kategoria.nazwa === "Finanse i księgowość").wynik, 0);
});
test("samo prawo ani inwestycje nie sugerują prawa budowlanego", () => {
  for (const tytul of ["Prawo zamówień publicznych", "Inwestycje z KPO i FEnIKS"]) {
    asercje.equal(matcher.rankingKategorii(katalog, { tytul }).find(kategoria => kategoria.nazwa === "Prawo budowlane").wynik, 0);
  }
});

function formularzTestowy(typ = "PREMIUM") {
  return `<form id="eventForm"><input name="event[title]" value="Projekty unijne SL2021"><select name="event[type]"><option>PRIME</option><option ${typ === "PREMIUM" ? "selected" : ""}>PREMIUM</option></select>
    <fieldset><legend>Kategorie wydarzenia</legend><p>Maks. 2 kategorie dla PRIME, maks. 4 dla PREMIUM.</p>
    ${nazwy.map((nazwa, indeks) => `<label><input type="checkbox" id="dynamiczny-${indeks}" name="event[categories][]" value="${100 + indeks}">${nazwa}</label>`).join("")}</fieldset></form>`;
}

test("kontroler w prawdziwym DOM przeglądarki bez Tampermonkey", async podtesty => {
  const przegladarka = await przegladarkaChromium.launch({ channel: process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge", headless: true });
  podtesty.after(() => przegladarka.close());
  async function przygotuj(html = formularzTestowy()) {
    const strona = await przegladarka.newPage();
    // Wszystko działa na about:blank, bez sieci i bez rozszerzeń.
    await strona.route("**/*", trasa => trasa.abort());
    await strona.setContent(`${html}<aside id="esync-root"><div id="esync-kategorie"></div></aside>`);
    for (const nazwa of ["kategorie-eventis", "kontroler-kategorii-eventis"]) await strona.addScriptTag({ path: sciezki.resolve(__dirname, `../shared/${nazwa}.js`) });
    await strona.evaluate(() => {
      window.kontrolerTestowy = KontrolerKategoriiEventis.utworzKontrolerKategorii(document, () => ({ tytul: document.querySelector('[name="event[title]"]')?.value || "" }));
      kontrolerTestowy.podlacz(document.querySelector("#esync-kategorie"));
    });
    return strona;
  }
  await podtesty.test("kliknięcie i ponowne kliknięcie zmienia prawdziwe pole oraz uruchamia input/change", async () => {
    const strona = await przygotuj();
    asercje.equal(await strona.locator('input[type="checkbox"]:checked').count(), 0);
    await strona.evaluate(() => { window.zdarzeniaTestowe = []; for (const nazwa of ["input", "change"]) document.querySelector("#dynamiczny-0").addEventListener(nazwa, zdarzenie => zdarzeniaTestowe.push(zdarzenie.type)); });
    await strona.locator('[data-kategoria="0"]').click();
    asercje.equal(await strona.locator("#dynamiczny-0").isChecked(), true);
    asercje.equal(await strona.locator('[data-kategoria="0"]').getAttribute("aria-pressed"), "true");
    await strona.locator('[data-kategoria="0"]').click();
    asercje.equal(await strona.locator("#dynamiczny-0").isChecked(), false);
    asercje.deepEqual(await strona.evaluate(() => zdarzeniaTestowe), ["input", "change", "input", "change"]);
    await strona.close();
  });
  await podtesty.test("ręczne zaznaczenie i odznaczenie synchronizuje chip", async () => {
    const strona = await przygotuj();
    await strona.locator("#dynamiczny-0").check();
    await strona.waitForFunction(() => document.querySelector('[data-kategoria="0"]').getAttribute("aria-pressed") === "true");
    await strona.locator("#dynamiczny-0").uncheck();
    await strona.waitForFunction(() => document.querySelector('[data-kategoria="0"]').getAttribute("aria-pressed") === "false");
    await strona.close();
  });
  for (const [typ, limit] of [["PRIME", 2], ["PREMIUM", 4]]) await podtesty.test(`${typ}: blokada kategorii ${limit + 1} i możliwość odznaczenia`, async () => {
    const strona = await przygotuj(formularzTestowy(typ));
    await strona.locator("[data-pozostale]").click();
    for (let indeks = 0; indeks < limit; indeks++) await strona.locator(`[data-kategoria="${indeks}"]`).click();
    await strona.locator(`[data-kategoria="${limit}"]`).click();
    asercje.equal(await strona.locator('input[type="checkbox"]:checked').count(), limit);
    asercje.match(await strona.locator('[role="status"]').innerText(), new RegExp(`limit ${limit}`));
    await strona.locator('[data-kategoria="0"]').click();
    await strona.locator(`[data-kategoria="${limit}"]`).click();
    asercje.equal(await strona.locator('input[type="checkbox"]:checked').count(), limit);
    await strona.close();
  });
  await podtesty.test("brak sekcji i dynamiczne pojawienie się oraz zastąpienie formularza", async () => {
    const strona = await przygotuj("");
    asercje.match(await strona.locator("#esync-kategorie").innerText(), /Nie znaleziono/);
    await strona.evaluate(html => document.body.insertAdjacentHTML("afterbegin", html), formularzTestowy());
    await strona.waitForSelector('[data-kategoria="0"]');
    await strona.evaluate(html => { document.querySelector("form").outerHTML = html.replace(/dynamiczny/g, "nowy"); }, formularzTestowy("PRIME"));
    await strona.locator('[data-kategoria="0"]').click();
    asercje.equal(await strona.locator("#nowy-0").isChecked(), true);
    await strona.close();
  });
  await podtesty.test("zmiana oferty aktualizuje limit, niejednoznaczny limit blokuje dodanie", async () => {
    const strona = await przygotuj();
    await strona.locator('[name="event[type]"]').selectOption({ label: "PRIME" });
    asercje.equal(await strona.evaluate(() => KontrolerKategoriiEventis.odczytajLimit(KontrolerKategoriiEventis.odczytajKategorie(document))), 2);
    await strona.locator('[name="event[type]"]').evaluate(pole => pole.remove());
    await strona.locator('[data-kategoria="0"]').click();
    asercje.equal(await strona.locator("#dynamiczny-0").isChecked(), false);
    asercje.match(await strona.locator('[role="status"]').innerText(), /Nie rozpoznano limitu/);
    await strona.close();
  });
  await podtesty.test("multiple select: prawdziwa opcja i synchroniczne change", async () => {
    const strona = await przygotuj('<form id="eventForm"><input name="event[title]" value="KPO"><fieldset><legend>Kategorie wydarzenia</legend><select multiple name="event[categories][]" data-max-selected="2"><option value="ue">Fundusze europejskie</option><option value="it">Cyberbezpieczeństwo</option></select></fieldset></form>');
    await strona.locator('[data-kategoria="0"]').click();
    asercje.deepEqual(await strona.locator("select").evaluate(pole => Array.from(pole.selectedOptions, opcja => opcja.value)), ["ue"]);
    await strona.locator("select").selectOption([]);
    await strona.waitForFunction(() => document.querySelector('[data-kategoria="0"]').getAttribute("aria-pressed") === "false");
    await strona.close();
  });
  await podtesty.test("nazwy i value pochodzą z DOM, oferta rozpoznawana mimo nieznanej nazwy pola", async () => {
    const strona = await przygotuj(formularzTestowy().replace('name="event[type]"', 'name="pole_123"'));
    const wynik = await strona.evaluate(() => {
      const katalog = KontrolerKategoriiEventis.odczytajKategorie(document);
      return { nazwa: katalog.kategorie[0].nazwa, wartosc: katalog.kategorie[0].wartosc,
        identyfikator: katalog.kategorie[0].identyfikator, limit: KontrolerKategoriiEventis.odczytajLimit(katalog) };
    });
    asercje.deepEqual(wynik, { nazwa: nazwy[0], wartosc: "100", identyfikator: "dynamiczny-0", limit: 4 });
    await strona.close();
  });
  await podtesty.test("ponowne renderowanie panelu zachowuje zwinięcie i wybory, układ formularza bez zmian", async () => {
    const strona = await przygotuj();
    const przed = await strona.locator("form").boundingBox();
    await strona.addStyleTag({ path: sciezki.resolve(__dirname, "../content/eventis.css") });
    await strona.locator('[data-kategoria="0"]').click();
    await strona.locator(".esync-kategorie summary").click();
    await strona.evaluate(() => { document.querySelector("#esync-kategorie").outerHTML = '<div id="esync-kategorie"></div>'; kontrolerTestowy.podlacz(document.querySelector("#esync-kategorie")); });
    asercje.equal(await strona.locator("details").getAttribute("open"), null);
    asercje.equal(await strona.locator("#dynamiczny-0").isChecked(), true);
    asercje.deepEqual(await strona.locator("form").boundingBox(), przed);
    await strona.close();
  });
  await podtesty.test("Eventis może odrzucić kliknięcie; panel nie udaje zaznaczenia", async () => {
    const strona = await przygotuj();
    await strona.locator("#dynamiczny-0").evaluate(pole => pole.addEventListener("click", zdarzenie => zdarzenie.preventDefault()));
    await strona.locator('[data-kategoria="0"]').click();
    asercje.equal(await strona.locator("#dynamiczny-0").isChecked(), false);
    asercje.equal(await strona.locator('[data-kategoria="0"]').getAttribute("aria-pressed"), "false");
    await strona.close();
  });
});

test("panel analizuje oryginalny rekord SEMPER przed tytułem formularza", () => {
  const kod = pliki.readFileSync(sciezki.resolve(__dirname, "../content/eventis.js"), "utf8");
  const od = kod.indexOf("function pobierzTekstDlaKategorii");
  const doIndeksu = kod.indexOf("function toast", od);
  const stan = { tytulSemperNowegoOgloszenia: "SL2021 oryginał", source: { title: "Inny tytuł", opisy: { cel: "Program SEMPER" } } };
  const pobierz = maszyna.runInNewContext(`${kod.slice(od, doIndeksu)}; pobierzTekstDlaKategorii`, { state: stan, getEventisTitle: () => "Ręczny tytuł" });
  asercje.equal(pobierz().tytul, "SL2021 oryginał");
  asercje.equal(pobierz().opis, "Program SEMPER");
  stan.tytulSemperNowegoOgloszenia = "";
  asercje.equal(pobierz().tytul, "Inny tytuł");
  stan.source = null;
  asercje.equal(pobierz().tytul, "Ręczny tytuł");
});

test("manifest ładuje własne moduły przed skryptem panelu", () => {
  const manifest = JSON.parse(pliki.readFileSync(sciezki.resolve(__dirname, "../manifest.json"), "utf8"));
  const skrypty = manifest.content_scripts.find(wpis => wpis.js.includes("content/eventis.js")).js;
  asercje.ok(skrypty.indexOf("shared/kategorie-eventis.js") < skrypty.indexOf("shared/kontroler-kategorii-eventis.js"));
  asercje.ok(skrypty.indexOf("shared/kontroler-kategorii-eventis.js") < skrypty.indexOf("content/eventis.js"));
});
