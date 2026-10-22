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
  asercje.equal(zapytania[0],"Zamówienia publiczne do 170 000 zł oraz tryb");
  asercje.ok(zapytania.includes(tytulEventis));
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

test("preflight sam wyszukuje terminy i ponawia odczyt mimo znanego tytułu",async podtesty => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  podtesty.after(() => przegladarka.close());
  const strona = await przegladarka.newPage();
  await strona.route("**/*",trasa => trasa.abort());
  await strona.setContent('<div class="list-filter"><input type="search" placeholder="Szukaj..."></div><table><tbody></tbody></table><aside id="esync-root"></aside>');
  for (const nazwa of ["wyszukiwanie","terminy","lista-eventis"]) {
    await strona.addScriptTag({path:sciezki.resolve(__dirname,`../shared/${nazwa}.js`)});
  }
  const fragment = (poczatek,koniec) => kod.slice(kod.indexOf(poczatek),kod.indexOf(koniec,kod.indexOf(poczatek)));
  await strona.addScriptTag({content:`
    const NARZEDZIA_WYSZUKIWANIA = NarzedziaWyszukiwaniaEventis;
    const NARZEDZIA_LISTY = NarzedziaListyEventis;
    const NARZEDZIA_TERMINOW = NarzedziaTerminowEventis;
    const NARZEDZIA_ARKUSZA = {recordKey:rekord=>rekord.normalizedTitle};
    const $$ = (selektor,korzen=document) => Array.from(korzen.querySelectorAll(selektor));
    const stan = {organizacja:"IIST",ogloszenia:[],rozstrzygniecia:[],decyzje:{},rekordy:[],mapowania:{},
      ustawienia:{},preflight:{trwa:false,pokolenie:0,wyniki:{}},skanowanie:{trwa:false,liczbaZapytan:0}};
    const kluczRozstrzygniecia = pozycja => pozycja.normalizedSourceTitle;
    const aktualneRozstrzygniecie = pozycja => stan.decyzje[kluczRozstrzygniecia(pozycja)] || pozycja;
    const renderuj = () => document.querySelector("#esync-root").textContent = String(stan.preflight.sprawdzone);
    const odswiezPlanOtwarcia = async () => {};
    const potwierdzoneTerminyTytulu = () => [{start:"2026-11-19",end:"2026-11-20",city:"Online",confirmed:true}];
    const chrome = {storage:{local:{get:async()=>({eventisImportQueue:[]})}}};
    window.fetch = async adres => ({ok:true,url:adres,text:async()=>'<form id="eventForm"></form>'});
    ${fragment("  function dodajKandydata","  function pobierzAdresyPaginacji").replaceAll("location.href",'"https://eventis.pl/company"')}
    ${fragment("  function odswiezDopasowaniaZListy","  async function pobierzDokumentListy")}
    ${fragment("  function znajdzPoleWyszukiwaniaOgloszen","  async function pobierzWszystkieOgloszeniaZListy").replaceAll("location.href",'"https://eventis.pl/company"')}
    ${fragment("  async function sprawdzTerminyWydarzenia","  async function ustawDecyzjeKompletnych").replace("location.origin",'"https://eventis.pl"')}
    const tytuly = ["Administrowanie budynkami użyteczności publicznej w praktyce - 2-dniowe warsztaty szkoleniowe.",
      "Gospodarka Magazynowa i Zarządzanie Zapasami w praktyce - 2-dniowe warsztaty kompetencyjne."];
    const zapytania = [];
    let zakres = "19–20.11.2026";
    document.querySelector("input").addEventListener("input",zdarzenie => {
      const fraza = zdarzenie.target.value;
      zapytania.push(fraza);
      document.querySelector("tbody").innerHTML = tytuly.flatMap((tytul,indeks) => tytul.includes(fraza)
        ? ['<tr><td>'+tytul+'</td><td><select><option>Online – '+zakres+'</option></select></td><td><a href="/event/edit/'+(123+indeks)+'">Edytuj</a></td></tr>'] : []).join("");
    });
  `});

  await podtesty.test("kolejka z przypisaniem bez terminów i nierozpoznanym tytułem robi się zielona bez ręcznego wpisywania",async () => {
    const wynik = await strona.evaluate(async () => {
      document.querySelector("input").value = "pierwotny filtr";
      stan.ogloszenia = [{eventisId:"123",url:"https://eventis.pl/event/edit/123",tytuly:[tytuly[0]],terminy:[]}];
      stan.rozstrzygniecia = tytuly.map(tytul => NARZEDZIA_LISTY.rozwiazGrupeTytulu({tytul},stan.ogloszenia,"IIST"));
      stan.rozstrzygniecia[0].status = "KNOWN_MAPPING";
      await Promise.all([uruchomPreflight(),uruchomPreflight()]);
      return {wyniki:Object.values(stan.preflight.wyniki),zapytania,filtr:document.querySelector("input").value};
    });
    asercje.deepEqual(wynik.wyniki.map(wpis=>wpis.status),["COMPLETE","COMPLETE"]);
    asercje.deepEqual(wynik.wyniki.map(wpis=>wpis.eventId),["123","124"]);
    asercje.equal(wynik.zapytania.length,3);
    asercje.equal(wynik.filtr,"pierwotny filtr");
  });

  await podtesty.test("Sprawdź ponownie odświeża znane terminy i wykrywa zmianę daty",async () => {
    const wynik = await strona.evaluate(async () => {
      zakres = "18–19.11.2026";
      const klucz = kluczRozstrzygniecia(stan.rozstrzygniecia[0]);
      const przed = zapytania.length;
      const poczatek = performance.now();
      await uruchomPreflight(new Set([klucz]));
      return {wynik:stan.preflight.wyniki[klucz],liczbaZapytan:zapytania.length-przed,czas:performance.now()-poczatek};
    });
    asercje.equal(wynik.wynik.status,"COUNT_MATCH_BUT_DIFFERENT");
    asercje.equal(wynik.wynik.missingConfirmedTerms.length,1);
    asercje.equal(wynik.liczbaZapytan,2);
    asercje.ok(wynik.czas < 1000,`Odczyt tabeli poza kontenerem wyszukiwarki trwał ${wynik.czas} ms`);
  });
});
