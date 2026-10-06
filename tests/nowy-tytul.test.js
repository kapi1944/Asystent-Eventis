"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const otwieranie = require("../shared/otwieranie-wydarzen-eventis");

function odczytajFunkcje(plik, poczatek, koniec, kontekst) {
  const kod = pliki.readFileSync(require.resolve(plik),"utf8");
  return maszyna.runInNewContext(`${kod.slice(kod.indexOf(poczatek),kod.indexOf(koniec,kod.indexOf(poczatek)))}; ${poczatek.match(/function (\w+)/)[1]}`,kontekst);
}

function nowaPozycja(tytul, indeks) {
  return {sourceTitle:tytul,normalizedSourceTitle:`tytul-${indeks}`,organization:"SEMPER",status:"CREATE_NEW",
    queueItemIds:[`rekord-${indeks}`],selectedCandidate:{url:"https://eventis.pl/event/add",matchType:"CREATE_NEW"}};
}

async function otworz(pozycje) {
  const magazyn = {};
  const karty = [];
  const funkcja = odczytajFunkcje("../background.js","async function otworzPlanEventis","async function usunOsieroconeTytuly",{
    przygotujPlanOtwieraniaEventis:async dane => otwieranie.utworzPlanOtwierania(dane),
    identyfikatorSesjiOtwarcia:()=>"sesja",OTWIERANIE_WYDARZEN:otwieranie,URL,Date,console,
    wykonajClaimSeryjnie:async (_,akcja)=>akcja(),usunOsieroconeTytuly:async()=>{},setTimeout:akcja=>akcja(),
    chrome:{storage:{local:{get:async()=>magazyn,set:async dane=>Object.assign(magazyn,dane)}},
      tabs:{create:async dane=>{const karta={...dane,id:karty.length+1};karty.push(karta);return karta;}}}
  });
  const wynik = await funkcja(pozycje,"SEMPER");
  asercje.equal(wynik.opened,pozycje.length);
  for (const karta of karty) {
    const url = new URL(karta.url);
    const wpis = magazyn[`nowyTytul:${karta.id}`];
    if (url.pathname === "/event/add") {
      const pozycja = pozycje.find(element=>otwieranie.kluczNowegoOgloszenia(element)===url.searchParams.get("esyncTask"));
      asercje.equal(wpis.tytul,pozycja.sourceTitle);
      asercje.deepEqual(Array.from(wpis.identyfikatoryKolejki),pozycja.queueItemIds);
    } else asercje.equal(wpis,undefined);
  }
}

test("pojedyncze nowe ogłoszenie zachowuje pełny tytuł SEMPER",async()=>otworz([nowaPozycja("Prawo pracy. Certyfikowane szkolenie online",1)]));
test("seryjne nowe ogłoszenia otrzymują osobne wpisy według ID kart",async()=>otworz([1,2,3].map(indeks=>nowaPozycja(`Szkolenie ${indeks}`,indeks))));
test("dwa podobne tytuły nie są zamieniane",async()=>otworz([nowaPozycja("SL2021 warsztaty 2026",1),nowaPozycja("SL2021 warsztaty 2027",2)]));
test("istniejące wydarzenia nie otrzymują tytułu nowego formularza",async()=>otworz([
  {status:"READY",selectedCandidate:{eventId:"1",url:"https://eventis.pl/event/edit/1"}},
  nowaPozycja("Nowe szkolenie",2),
  {status:"READY",selectedCandidate:{eventId:"3",url:"https://eventis.pl/event/edit/3"}}
]));

async function uzupelnij(pobierzPole) {
  let proby = 0;
  const wiadomosci = [];
  const ostrzezenia = [];
  const funkcja = odczytajFunkcje("../content/eventis.js","async function uzupelnijTytulNowegoOgloszenia","async function init",{
    MODE:"add",URLSearchParams,location:{search:"?esyncSession=sesja"},
    chrome:{runtime:{sendMessage:async wiadomosc=>{wiadomosci.push(wiadomosc.type);return {wpis:{tytul:"Pełny tytuł. Certyfikowane szkolenie online"}};}}},
    $:()=>pobierzPole(proby++),sleep:async()=>{},setValue:(pole,tytul)=>{pole.value=tytul;},
    console:{warn:(...dane)=>ostrzezenia.push(dane)}
  });
  await funkcja();
  asercje.deepEqual(wiadomosci,["POBIERZ_NOWY_TYTUL","USUN_NOWY_TYTUL"]);
  return {proby,ostrzezenia};
}

test("opóźnione pole otrzymuje oryginalny tytuł",async()=>{
  const pole = {value:""};
  await uzupelnij(proba=>proba<3?null:pole);
  asercje.equal(pole.value,"Pełny tytuł. Certyfikowane szkolenie online");
});
test("brak pola kończy oczekiwanie bez błędu i usuwa wpis",async()=>{
  const wynik = await uzupelnij(()=>null);
  asercje.equal(wynik.proby,100);
  asercje.equal(wynik.ostrzezenia.length,1);
});
test("późniejsza próba nie nadpisuje ręcznie wpisanego tytułu",async()=>{
  const pole = {value:"Tytuł użytkownika"};
  await uzupelnij(proba=>proba<3?null:pole);
  asercje.equal(pole.value,"Tytuł użytkownika");
});

test("sprzątanie usuwa zamknięte i przeterminowane karty, zachowuje aktywną",async()=>{
  const teraz = Date.now();
  const magazyn = {"nowyTytul:1":{utworzono:teraz},"nowyTytul:2":{utworzono:teraz-120001},"nowyTytul:3":{utworzono:teraz},settings:{}};
  const funkcja = odczytajFunkcje("../background.js","async function usunOsieroconeTytuly","chrome.tabs.onRemoved",{
    Date,Number,console:{warn:()=>{}},chrome:{storage:{local:{get:async()=>magazyn,remove:async klucz=>{delete magazyn[klucz];}}},
      tabs:{get:async identyfikator=>{if(identyfikator===1)throw new Error("Zamknięta karta");}}}
  });
  await funkcja();
  asercje.deepEqual(Object.keys(magazyn),["nowyTytul:3","settings"]);
});

test("blokada wstrzymuje odczyt aż zakończy się zapis tytułu karty",async()=>{
  const funkcja = odczytajFunkcje("../background.js","async function wykonajClaimSeryjnie","async function usunOsieroconeOperacje",{kolejkiClaimowOperacji:new Map()});
  const kroki = [];
  let zakoncz;
  const oczekiwanie = new Promise(rozwiaz=>{zakoncz=rozwiaz;});
  const zapis = funkcja("noweTytuly",async()=>{await oczekiwanie;kroki.push("zapis");});
  const odczyt = funkcja("noweTytuly",async()=>{kroki.push("odczyt");});
  zakoncz();
  await Promise.all([zapis,odczyt]);
  asercje.deepEqual(kroki,["zapis","odczyt"]);
});
