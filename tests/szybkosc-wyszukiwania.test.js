"use strict";
const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const lista = require("../shared/lista-eventis");
const wyszukiwanie = require("../shared/wyszukiwanie");
const kod = pliki.readFileSync(require.resolve("../content/lista-eventis.js"),"utf8");
const tytul = "Kierownik składowiska odpadów";
const ogloszenie = {eventisId:"123",url:"https://eventis.pl/event/edit/123",tytuly:[tytul]};

test("znaleziony tytuł nie uruchamia ponownego filtrowania Eventis",async () => {
  const fragment = kod.slice(kod.indexOf("  async function pobierzOgloszeniaPrzezPoleWyszukiwania"),kod.indexOf("  async function pobierzWszystkieOgloszeniaZListy"));
  const funkcja = maszyna.runInNewContext(`${fragment};pobierzOgloszeniaPrzezPoleWyszukiwania`,{
    NARZEDZIA_LISTY:lista,stan:{organizacja:"SEMPER"},
    znajdzPoleWyszukiwaniaOgloszen:()=>{throw new Error("Zbędne filtrowanie");}
  });
  const wynik = await funkcja([tytul],[ogloszenie]);
  asercje.equal(wynik.liczbaZapytan,0);
  asercje.equal(wynik.ogloszenia[0],ogloszenie);
});

test("powtórzone zapytania wykonują się raz i przywracają filtr",async () => {
  const fragment = kod.slice(kod.indexOf("  async function pobierzOgloszeniaPrzezPoleWyszukiwania"),kod.indexOf("  async function pobierzWszystkieOgloszeniaZListy"));
  const pole = {value:"pierwotny filtr"};
  const zapytania = [];
  const funkcja = maszyna.runInNewContext(`${fragment};pobierzOgloszeniaPrzezPoleWyszukiwania`,{
    NARZEDZIA_LISTY:lista,NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,stan:{organizacja:"SEMPER"},
    document:{},location:{href:"https://eventis.pl/company"},console:{debug(){}},
    znajdzPoleWyszukiwaniaOgloszen:()=>pole,
    zastosujFiltrWyszukiwania:async (pole,tekst)=>{pole.value=tekst;zapytania.push(tekst);},
    pobierzOgloszeniaZDokumentu:()=>[]
  });
  const wynik = await funkcja([tytul,tytul]);
  asercje.equal(wynik.liczbaZapytan,wyszukiwanie.generujZapytaniaEventis(tytul).length);
  asercje.equal(zapytania.length,wynik.liczbaZapytan+1);
  asercje.equal(pole.value,"pierwotny filtr");
});

test("paginacja pobiera trzy strony równolegle i kontynuuje po błędzie",async () => {
  const fragment = kod.slice(kod.indexOf("  async function pobierzWszystkieOgloszeniaZListy"),kod.indexOf("  function elementyDotyczaceRekordow"));
  let aktywne = 0;
  let maksimum = 0;
  const odwiedzone = [];
  const funkcja = maszyna.runInNewContext(`${fragment};pobierzWszystkieOgloszeniaZListy`,{
    NARZEDZIA_LISTY:lista,MAKSYMALNA_LICZBA_STRON:10,
    document:{},location:{href:"https://eventis.pl/company"},
    pobierzAdresyPaginacji:dokument=>dokument.strona ? (dokument.strona === "2" ? ["5"] : []) : ["2","3","4"],
    pobierzOgloszeniaZDokumentu:()=>[ogloszenie],
    pobierzDokumentListy:async adres=>{
      odwiedzone.push(adres);
      maksimum = Math.max(maksimum,++aktywne);
      await new Promise(rozwiaz=>setTimeout(rozwiaz,5));
      aktywne--;
      if (adres === "3") throw new Error("Błąd strony");
      return {dokument:{strona:adres},adres};
    },
    pobierzOgloszeniaPrzezPoleWyszukiwania:async (tytuly,znane)=>{
      asercje.equal(znane.length,1);
      return {ogloszenia:znane,liczbaZapytan:0};
    }
  });
  const wynik = await funkcja([tytul]);
  asercje.equal(maksimum,3);
  asercje.deepEqual(odwiedzone,["2","3","4","5"]);
  asercje.equal(wynik.liczbaStron,5);
  asercje.equal(wynik.blad,"Błąd strony");
});
