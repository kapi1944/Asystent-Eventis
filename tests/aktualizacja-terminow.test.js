"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const sciezki = require("node:path");
const {chromium:przegladarkaChromium} = require("playwright");
const kod = pliki.readFileSync(require.resolve("../content/lista-eventis.js"),"utf8");
const tytul = "Przechowywanie i archiwizacja dokumentów w organizacji według obowiązujących przepisów prawnych i standardów – 2-dniowe szkolenie praktyczne.";
const tytulZrodla = `${tytul} Certyfikowane szkolenie online`;

function fragment(poczatek, koniec) {
  return kod.slice(kod.indexOf(poczatek),kod.indexOf(koniec,kod.indexOf(poczatek)));
}

function wiersz(identyfikator = "97624", lokalizacja = "Online", zakres = "10–11.12.2026") {
  return `<tr><td><a href="/training/przechowywanie">${tytul}</a></td><td>${identyfikator}</td>
    <td>2025-09-11</td><td>PREMIUM</td><td>Aktywny</td><td><select>
    <option>${lokalizacja} – ${zakres}</option><option>Online – 1–2.10.2026</option>
    </select></td><td><a href="/event/edit/${identyfikator}">Edytuj wydarzenie</a></td></tr>`;
}

test("lista i odświeżenie terminów w rzeczywistym DOM bez sieci", async podtesty => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  podtesty.after(() => przegladarka.close());
  async function przygotuj(tresc = wiersz()) {
    const strona = await przegladarka.newPage();
    await strona.route("**/*",trasa => trasa.abort());
    await strona.setContent(`<table><tbody>${tresc}</tbody></table><aside id="esync-root"></aside>`);
    for (const nazwa of ["wyszukiwanie","terminy","lista-eventis"]) {
      await strona.addScriptTag({path:sciezki.resolve(__dirname,`../shared/${nazwa}.js`)});
    }
    await strona.addScriptTag({content:`
      const NARZEDZIA_WYSZUKIWANIA = NarzedziaWyszukiwaniaEventis;
      const NARZEDZIA_LISTY = NarzedziaListyEventis;
      const NARZEDZIA_TERMINOW = NarzedziaTerminowEventis;
      const $$ = (selektor,korzen=document) => Array.from(korzen.querySelectorAll(selektor));
      const stan = {ogloszenia:[],rozstrzygniecia:[],decyzje:{},organizacja:"IIST",mapowania:{},
        ustawienia:{},preflight:{trwa:false,wyniki:{}},skanowanie:{trwa:false}};
      const kluczRozstrzygniecia = pozycja => pozycja.organization + "|" + pozycja.normalizedSourceTitle;
      const aktualneRozstrzygniecie = pozycja => stan.decyzje[kluczRozstrzygniecia(pozycja)] || pozycja;
      ${fragment("  function dodajKandydata","  async function pobierzDokumentListy")}
      ${fragment("  async function sprawdzTerminyWydarzenia","  async function uruchomPreflight").replace("location.origin",'"https://eventis.pl"')}
      const potwierdzoneTerminyTytulu = () => [{start:"2026-12-10",end:"2026-12-11",city:"Online",confirmed:true}];
      window.fetch = async adres => ({ok:true,url:adres,text:async()=>'<form id="eventForm"></form>'});
      const sprawdzoneKlucze = [];
      async function uruchomPreflight(klucze) {
        for (const pozycja of stan.rozstrzygniecia.map(aktualneRozstrzygniecie)) {
          const klucz = kluczRozstrzygniecia(pozycja);
          if (!klucze.has(klucz)) continue;
          stan.preflight.wyniki[klucz] = await sprawdzTerminyWydarzenia(pozycja);
          sprawdzoneKlucze.push(klucz);
        }
      }
    `});
    await strona.evaluate(tytulZrodla => {
      stan.ogloszenia = pobierzOgloszeniaZDokumentu(document,"https://eventis.pl/company");
      const pozycja = NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul:tytulZrodla},[],"IIST");
      pozycja.indeksWejsciowy = 7;
      stan.rozstrzygniecia = [pozycja];
    },tytulZrodla);
    // Odczyt listy używa rzeczywistej bazy Eventis mimo testu na about:blank.
    await strona.addScriptTag({content:`
      const odczytajOgloszenia = pobierzOgloszeniaZDokumentu;
      pobierzOgloszeniaZDokumentu = () => odczytajOgloszenia(document,"https://eventis.pl/company");
    `});
    return strona;
  }

  await podtesty.test("wiersz ze zrzutu rozpoznaje tytuł, ID i wszystkie opcje terminów", async () => {
    const strona = await przygotuj();
    const wynik = await strona.evaluate(() => {
      odswiezDopasowaniaZListy();
      return {pozycja:stan.rozstrzygniecia[0],terminy:stan.ogloszenia[0].terminy};
    });
    asercje.equal(wynik.pozycja.selectedCandidate.eventId,"97624");
    asercje.equal(wynik.pozycja.indeksWejsciowy,7);
    asercje.deepEqual(wynik.terminy,[
      {start:"2026-10-01",end:"2026-10-02",city:"Online"},
      {start:"2026-12-10",end:"2026-12-11",city:"Online"}
    ]);
    await strona.close();
  });

  await podtesty.test("przerysowanie tabeli odnajduje wydarzenie i automatycznie usuwa brak terminu", async () => {
    const strona = await przygotuj("");
    await strona.evaluate(() => obserwujListeOgloszen());
    await strona.locator("tbody").evaluate((element,html) => { element.innerHTML = html; },wiersz());
    await strona.waitForFunction(() => sprawdzoneKlucze.length === 1);
    const wynik = await strona.evaluate(() => Object.values(stan.preflight.wyniki)[0]);
    asercje.equal(wynik.status,"COMPLETE");
    asercje.equal(wynik.missingConfirmedTerms.length,0);
    await strona.locator("#esync-root").evaluate(element => { element.innerHTML = "<div>Nowy render panelu</div>"; });
    await strona.waitForTimeout(400);
    asercje.equal(await strona.evaluate(() => sprawdzoneKlucze.length),1);
    await strona.close();
  });

  await podtesty.test("inne miasto lub daty nie są uznawane za istniejący termin online", async () => {
    for (const [lokalizacja,zakres] of [["Warszawa","10–11.12.2026"],["Online","9–10.12.2026"]]) {
      const strona = await przygotuj(wiersz("97624",lokalizacja,zakres));
      const wynik = await strona.evaluate(async () => {
        odswiezDopasowaniaZListy();
        return sprawdzTerminyWydarzenia(stan.rozstrzygniecia[0]);
      });
      asercje.equal(wynik.missingConfirmedTerms.length,1);
      await strona.close();
    }
  });
});
