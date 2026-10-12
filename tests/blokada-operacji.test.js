"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const kolejka = require("../shared/kolejka-eventis");
const kod = pliki.readFileSync(require.resolve("../content/eventis.js"),"utf8");

function przygotuj(operacja,opcje = {}) {
  const stan = {organization:"SEMPER",eventisId:"123",eventisTitle:"Szkolenie",tabId:1,
    source:{url:"https://zrodlo/szkolenie"},pendingOperation:operacja,zapis:{saveState:opcje.zapis || "IDLE"}};
  const dane = {pendingOperations:operacja ? {klucz:operacja} : {},eventisImportQueue:opcje.kolejka || []};
  const kontekst = {state:stan,PAGE_LOAD_ID:"strona",trwaRozstrzyganieZapisu:false,
    NARZEDZIA_KOLEJKI:kolejka,storageGet:async()=>dane,storageSet:async zmiany=>Object.assign(dane,zmiany),
    zapiszElementyKolejki:async zmiany=>{dane.eventisImportQueue=kolejka.scalElementyKolejki(dane.eventisImportQueue,zmiany);},
    kluczStorageOperacji:()=>"klucz",render:()=>{},toast:()=>{},zakonczObserwacjeZapisu:()=>{},
    sessionStorage:{removeItem:()=>{}},KLUCZ_OCZEKUJACEGO_ZAPISU:"zapis",KLUCZ_ZAMKNIECIA_PO_ZAPISIE:"zamkniecie"};
  const fragment = kod.slice(kod.indexOf("  function czyTrwaZapis()"),kod.indexOf("  let obserwatorZapisu"));
  const funkcje = maszyna.runInNewContext(`${fragment};({sprawdzBrakOczekujacejOperacji,zwolnijOczekujacaOperacje})`,kontekst);
  return {stan,dane,...funkcje};
}

function utworzOperacje(zmiany = {}) {
  return {operationId:"operacja",organization:"SEMPER",eventisIdAtStart:"123",tabId:1,
    createdPageLoadId:"strona",sourceUrl:"https://zrodlo/szkolenie",status:"WAITING_FOR_SAVE",skipSheetOutbox:false,...zmiany};
}

test("kolejne uzupełnienie tego samego formularza i źródła nie jest blokowane",async()=>{
  asercje.equal(await przygotuj(utworzOperacje()).sprawdzBrakOczekujacejOperacji(),true);
  asercje.equal(await przygotuj(utworzOperacje({skipSheetOutbox:true})).sprawdzBrakOczekujacejOperacji(true),true);
  for (const zmiany of [{sourceUrl:"inne"},{createdPageLoadId:"poprzednia"},{status:"SAVE_SUBMITTED"},{skipSheetOutbox:true}]) {
    asercje.equal(await przygotuj(utworzOperacje(zmiany)).sprawdzBrakOczekujacejOperacji(),false);
  }
});

test("nieaktualny stan panelu nie blokuje po usunięciu operacji z magazynu",async()=>{
  const scenariusz = przygotuj(utworzOperacje());
  scenariusz.dane.pendingOperations={};
  asercje.equal(await scenariusz.sprawdzBrakOczekujacejOperacji(),true);
  asercje.equal(scenariusz.stan.pendingOperation,null);
});

test("zwolnienie blokady kieruje tylko jej pozycje do sprawdzenia, bez potwierdzania zapisu",async()=>{
  const element = {id:"A",organization:"SEMPER",recordKey:"A",status:"WAITING_FOR_SAVE",operationId:"operacja"};
  const scenariusz = przygotuj(utworzOperacje({queueItemIds:["A"]}),{kolejka:[element,{...element,id:"B",recordKey:"B",operationId:"inna"}]});
  asercje.equal(await scenariusz.zwolnijOczekujacaOperacje(),true);
  asercje.deepEqual(scenariusz.dane.pendingOperations,{});
  asercje.equal(scenariusz.dane.eventisImportQueue[0].status,"NEEDS_ATTENTION");
  asercje.equal(scenariusz.dane.eventisImportQueue[1].status,"WAITING_FOR_SAVE");
  asercje.equal(scenariusz.stan.pendingOperation,null);
});

test("aktywny zapis i wypełnianie zachowują blokadę",async()=>{
  for (const zapis of ["PREPARING_SAVE","SUBMITTING","WAITING_FOR_EVENTIS"]) {
    const scenariusz = przygotuj(utworzOperacje(),{zapis});
    asercje.equal(await scenariusz.zwolnijOczekujacaOperacje(),false);
    asercje.equal(await scenariusz.sprawdzBrakOczekujacejOperacji(),false);
    asercje.ok(scenariusz.dane.pendingOperations.klucz);
  }
  asercje.equal(await przygotuj(utworzOperacje({status:"CLAIMED"})).zwolnijOczekujacaOperacje(),false);
});

test("potwierdzanie kolejnego uzupełnienia zachowuje wcześniejsze terminy, ale nie nieudane próby",async()=>{
  const fragment = kod.slice(kod.indexOf("  async function potwierdzOperacjeOczekujaca"),kod.indexOf("  function czyTrwaZapis"));
  for (const status of ["CLAIMED","WAITING_FOR_SAVE"]) {
    const poprzednia = utworzOperacje({status,expectedTerms:[{start:"2026-10-20"}],queueItemIds:["A"]});
    const dane = {pendingOperations:{klucz:poprzednia},eventisImportQueue:[]};
    const potwierdz = maszyna.runInNewContext(`${fragment};potwierdzOperacjeOczekujaca`,{
      state:{},NARZEDZIA_KOLEJKI:kolejka,storageGet:async()=>dane,storageSet:async zmiany=>Object.assign(dane,zmiany),
      zapiszElementyKolejki:async()=>{},kluczStorageOperacji:()=>"klucz",terminyOperacji:operacja=>operacja.expectedTerms,
      przygotujTerminDoKolejki:termin=>termin,unikalneTerminy:terminy=>[...new Map(terminy.map(termin=>[termin.start,termin])).values()]
    });
    const wynik = await potwierdz(poprzednia,[{start:"2026-10-21"}],["B"]);
    asercje.deepEqual(Array.from(wynik.expectedTerms,termin=>termin.start),status === "CLAIMED" ? ["2026-10-21"] : ["2026-10-20","2026-10-21"]);
    asercje.deepEqual(Array.from(wynik.queueItemIds),status === "CLAIMED" ? ["B"] : ["A","B"]);
  }
});

function przygotujZwolnienieZUstawien(operacja) {
  const kodTla = pliki.readFileSync(require.resolve("../background.js"),"utf8");
  const fragment = kodTla.slice(kodTla.indexOf("async function zwolnijBlokadeOperacji"),kodTla.indexOf("chrome.runtime.onInstalled"));
  const dane = {pendingOperations:{wybrana:operacja,inna:{operationId:"inna"}},eventisImportQueue:[
    {id:"A",organization:"SEMPER",status:"WAITING_FOR_SAVE",operationId:"operacja"},
    {id:"B",organization:"SEMPER",status:"WAITING_FOR_SAVE",operationId:"inna"}
  ]};
  const zwolnij = maszyna.runInNewContext(`${fragment};zwolnijBlokadeOperacji`,{
    NARZEDZIA_KOLEJKI:kolejka,NarzedziaOperacjiEventis:{CZAS_OCZEKIWANIA_ZAPISU:20000},
    wykonajClaimSeryjnie:async(klucz,akcja)=>akcja(),
    chrome:{storage:{local:{get:async()=>dane,set:async zmiany=>Object.assign(dane,zmiany)}}}
  });
  return {dane,zwolnij};
}

test("ustawienia zwalniają wybraną blokadę bez zmiany pozostałych operacji i potwierdzania terminów",async()=>{
  const scenariusz = przygotujZwolnienieZUstawien(utworzOperacje({queueItemIds:["A"]}));
  asercje.equal((await scenariusz.zwolnij("wybrana","operacja")).ok,true);
  asercje.equal(scenariusz.dane.pendingOperations.wybrana,undefined);
  asercje.equal(scenariusz.dane.pendingOperations.inna.operationId,"inna");
  asercje.equal(scenariusz.dane.eventisImportQueue[0].status,"NEEDS_ATTENTION");
  asercje.equal(scenariusz.dane.eventisImportQueue[1].status,"WAITING_FOR_SAVE");
});

test("ustawienia nie zwalniają operacji zmienionej po wyświetleniu listy",async()=>{
  const scenariusz = przygotujZwolnienieZUstawien(utworzOperacje());
  asercje.equal((await scenariusz.zwolnij("wybrana","poprzednia")).ok,false);
  asercje.ok(scenariusz.dane.pendingOperations.wybrana);
});

test("ustawienia chronią świeży zapis i wypełnianie, ale pozwalają zwolnić stare blokady",async()=>{
  for (const status of ["CLAIMED","SAVE_SUBMITTED"]) {
    for (const stara of [false,true]) {
      const czas = new Date(Date.now() - (stara ? 180000 : 1000)).toISOString();
      const scenariusz = przygotujZwolnienieZUstawien(utworzOperacje({status,createdAt:czas,saveRequestedAt:status === "SAVE_SUBMITTED" ? czas : undefined}));
      asercje.equal((await scenariusz.zwolnij("wybrana","operacja")).ok,stara);
      asercje.equal(!!scenariusz.dane.pendingOperations.wybrana,!stara);
    }
  }
});
