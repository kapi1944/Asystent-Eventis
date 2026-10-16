"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const sciezki = require("node:path");
const {chromium:przegladarkaChromium} = require("playwright");
const wyszukiwanie = require("../shared/wyszukiwanie");
const kod = pliki.readFileSync(require.resolve("../content/lista-eventis.js"),"utf8");
const tytulEventis = "Zamówienia publiczne do 170 000 zł oraz tryb podstawowy w Prawie zamówień publicznych - 2-dniowe warsztaty praktyczne.";
const tytulZrodla = `${tytulEventis} Certyfikowane szkolenie online`;

test("zapytania zachowują dosłowną treść i krótki fragment ze zgłoszenia",() => {
  const zapytania = wyszukiwanie.generujZapytaniaEventis(tytulZrodla);
  asercje.equal(zapytania[0],tytulEventis);
  asercje.ok(zapytania.includes("Zamówienia publiczne do 170 000 zł oraz tryb"));
  asercje.ok(zapytania.includes(tytulZrodla));
  const tytulBdo = "Rejestr BDO i gospodarka odpadami dla początkujących - 1-dniowe warsztaty szkoleniowe. Kompendium cennej wiedzy i praktycznych wskazówek. Certyfikowane szkolenie online";
  asercje.ok(wyszukiwanie.generujZapytaniaEventis(tytulBdo).includes("Rejestr BDO i gospodarka odpadami dla początkujących"));
});

test("automatyczne wyszukiwanie czeka na opóźnioną tabelę i ignoruje zmiany panelu",async podtest => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  podtest.after(() => przegladarka.close());
  const strona = await przegladarka.newPage();
  await strona.route("**/*",trasa => trasa.abort());
  await strona.setContent('<input type="search" placeholder="Szukaj..."><table><tbody></tbody></table><aside id="esync-root"></aside>');
  for (const nazwa of ["wyszukiwanie","terminy","lista-eventis"]) {
    await strona.addScriptTag({path:sciezki.resolve(__dirname,`../shared/${nazwa}.js`)});
  }
  const odczyt = kod.slice(kod.indexOf("  function dodajKandydata"),kod.indexOf("  function pobierzAdresyPaginacji"));
  const filtrowanie = kod.slice(kod.indexOf("  function znajdzPoleWyszukiwaniaOgloszen"),kod.indexOf("  async function pobierzWszystkieOgloszeniaZListy"));
  await strona.addScriptTag({content:`
    const NARZEDZIA_WYSZUKIWANIA = NarzedziaWyszukiwaniaEventis;
    const NARZEDZIA_LISTY = NarzedziaListyEventis;
    const NARZEDZIA_TERMINOW = NarzedziaTerminowEventis;
    const stan = {organizacja:"SEMPER"};
    const $$ = (selektor,korzen=document) => Array.from(korzen.querySelectorAll(selektor));
    ${odczyt}
    ${filtrowanie.replaceAll("location.href",'"https://eventis.pl/company"')}
  `});
  const wynik = await strona.evaluate(async ({tytulEventis,tytulZrodla}) => {
    const pole = document.querySelector("input");
    pole.value = "pierwotny filtr";
    let licznik;
    pole.addEventListener("input",() => {
      clearTimeout(licznik);
      setTimeout(() => document.querySelector("#esync-root").textContent = pole.value,50);
      licznik = setTimeout(() => {
        const tabela = document.querySelector("tbody");
        tabela.innerHTML = "";
        if (!tytulEventis.includes(pole.value)) return;
        tabela.innerHTML = '<tr><td></td><td><select><option>Online – 19–20.10.2026</option></select></td><td><a href="/event/edit/98463">Edytuj</a></td></tr>';
        tabela.querySelector("td").textContent = tytulEventis;
      },1100);
    });
    const wynik = await pobierzOgloszeniaPrzezPoleWyszukiwania([tytulZrodla]);
    const dopasowanie = NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul:tytulZrodla},wynik.ogloszenia,"SEMPER");
    return {wynik,dopasowanie,filtr:pole.value};
  },{tytulEventis,tytulZrodla});
  asercje.equal(wynik.wynik.liczbaZapytan,1);
  asercje.equal(wynik.dopasowanie.status,"AUTO_MATCH");
  asercje.equal(wynik.dopasowanie.selectedCandidate.eventId,"98463");
  asercje.equal(wynik.wynik.ogloszenia[0].terminy[0].start,"2026-10-19");
  asercje.equal(wynik.filtr,"pierwotny filtr");
});
