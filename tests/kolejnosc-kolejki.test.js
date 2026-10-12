"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const arkusz = require("../shared/arkusz");
const kolejka = require("../shared/kolejka-eventis");
const lista = require("../shared/lista-eventis");
const otwieranie = require("../shared/otwieranie-wydarzen-eventis");

const tytuly = ["Studium wykonalności projektów", "Rozliczanie dotacji unijnych", "Zarządzanie ryzykiem finansowym", "Prawo energetyczne przedsiębiorstw"];

function rekordy() {
  return arkusz.parseManualPaste(tytuly.map(tytul=>`POTWIERDZONE SZKOLENIE "${tytul}" 2026-10-12 ONLINE 5 osób`).join("\n"));
}

function rozstrzygniecia() {
  const elementy = kolejka.przygotujElementyKolejki(rekordy(),[],{organization:"SEMPER"}).items;
  const ogloszenia = [0,2,2,3].map((indeks,numer)=>({eventisId:String(numer+1),url:`https://eventis.pl/event/edit/${numer+1}`,tytuly:[tytuly[indeks]]}));
  return lista.dopasujKolejkeDoOgloszen(elementy,ogloszenia,"SEMPER").rozstrzygniecia;
}

function sprawdzKolejnosc(pozycje) {
  asercje.deepEqual(Array.from(pozycje,pozycja=>pozycja.sourceTitle),tytuly);
  asercje.deepEqual(Array.from(pozycje,pozycja=>pozycja.indeksWejsciowy),[0,1,2,3]);
}

function odczytajFunkcje(poczatek,koniec,kontekst) {
  const kod = pliki.readFileSync(require.resolve("../content/lista-eventis.js"),"utf8");
  return maszyna.runInNewContext(`${kod.slice(kod.indexOf(poczatek),kod.indexOf(koniec,kod.indexOf(poczatek)))}; ${poczatek.match(/function (\w+)/)[1]}`,kontekst);
}

test("parser nadaje stały indeks, kolejka zachowuje go w storage i po filtrowaniu",()=>{
  const dane = rekordy();
  dane[1].error = "Błędny rekord";
  const elementy = kolejka.przygotujElementyKolejki(dane,[],{organization:"SEMPER"}).items;
  asercje.deepEqual(JSON.parse(JSON.stringify(elementy)).map(element=>element.indeksWejsciowy),[0,2,3]);
});

test("różne statusy dopasowania pozostają w kolejności wejścia",()=>{
  const pozycje = rozstrzygniecia();
  sprawdzKolejnosc(pozycje);
  asercje.deepEqual(pozycje.map(pozycja=>pozycja.status),["AUTO_MATCH","NOT_FOUND","AMBIGUOUS","AUTO_MATCH"]);
});

test("równoległe odpowiedzi B D C A nie zmieniają kolejności żadnego renderu",async()=>{
  const stan = {rozstrzygniecia:rozstrzygniecia(),preflight:{pokolenie:0,wyniki:{}}};
  const zakonczone = [];
  let liczbaRenderow = 0;
  const uruchom = odczytajFunkcje("async function uruchomPreflight","async function ustawDecyzjeKompletnych",{
    odswiezDopasowaniaZListy:()=>new Set(),
    stan,aktualneRozstrzygniecie:pozycja=>pozycja,kluczRozstrzygniecia:pozycja=>pozycja.normalizedSourceTitle,
    sprawdzTerminyWydarzenia:pozycja=>new Promise(rozwiaz=>setTimeout(()=>{
      zakonczone.push(pozycja.indeksWejsciowy);rozwiaz({status:"NEEDS_ATTENTION"});
    },[400,50,300,100][pozycja.indeksWejsciowy])),
    renderuj:()=>{liczbaRenderow++;sprawdzKolejnosc(stan.rozstrzygniecia);},odswiezPlanOtwarcia:async()=>{}
  });
  await uruchom();
  asercje.deepEqual(zakonczone,[1,3,2,0]);
  asercje.equal(liczbaRenderow,6);
});

test("ponowne wyszukiwanie B zachowuje miejsce i indeks",()=>{
  const pozycje = rozstrzygniecia();
  const poprzednia = pozycje[1];
  pozycje[1] = {...poprzednia,...lista.rozwiazGrupeTytulu({tytul:poprzednia.sourceTitle},[],"SEMPER")};
  sprawdzKolejnosc(pozycje);
});

test("ręczny URL dla C zachowuje miejsce i indeks",()=>{
  const pozycje = rozstrzygniecia();
  pozycje[2] = lista.wybierzRecznyUrlEventis(pozycje[2],"https://eventis.pl/event/edit/99");
  sprawdzKolejnosc(pozycje);
});

test("nowe ogłoszenie B i wybór kandydata C zachowują kolejność panelu i kart",()=>{
  const pozycje = rozstrzygniecia();
  pozycje[1] = lista.utworzNoweOgloszenieRozstrzygniecia(pozycje[1]);
  pozycje[2] = lista.wybierzKandydataRozstrzygniecia(pozycje[2],"2");
  sprawdzKolejnosc(pozycje);
  const plan = otwieranie.utworzPlanOtwierania(lista.utworzPlanOtwarcia(pozycje).pozycje);
  sprawdzKolejnosc(plan.doOtwarcia);
  asercje.equal(plan.doOtwarcia[1].typ,"CREATE_NEW");
});

test("pominięcie B zachowuje kolejność względną pozostałych kart",()=>{
  const pozycje = rozstrzygniecia();
  pozycje[1] = lista.pominRozstrzygniecie(pozycje[1]);
  pozycje[2] = lista.wybierzKandydataRozstrzygniecia(pozycje[2],"2");
  sprawdzKolejnosc(pozycje);
  asercje.deepEqual(otwieranie.utworzPlanOtwierania(lista.utworzPlanOtwarcia(pozycje).pozycje).doOtwarcia.map(pozycja=>pozycja.indeksWejsciowy),[0,2,3]);
});

test("wcześniej zapisane rekordy są odczytywane w kolejności bieżącego wklejenia",()=>{
  const dane = rekordy();
  const elementy = kolejka.przygotujElementyKolejki(dane,[],{organization:"SEMPER"}).items.reverse();
  const wybierz = odczytajFunkcje("function elementyDotyczaceRekordow","function odtworzAnalizeTrwalejKolejki",{
    stan:{organizacja:"SEMPER"},NARZEDZIA_ARKUSZA:arkusz
  });
  const wynik = wybierz(elementy,dane);
  asercje.deepEqual(Array.from(wynik,element=>element.title),tytuly);
  asercje.deepEqual(Array.from(wynik,element=>element.indeksWejsciowy),[0,1,2,3]);
});
