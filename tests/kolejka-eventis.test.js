"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const kolejka = require("../shared/kolejka-eventis");

const rekord = {status:"CONFIRMED",title:"Prawo pracy",normalizedTitle:"prawo pracy",start:"2026-09-28",end:"2026-09-29",city:"Warszawa",participants:8,rawText:"źródło"};

test("kolejka przyjmuje tylko potwierdzone rekordy i pomija duplikaty semantyczne", () => {
  const pierwszy = kolejka.przygotujElementyKolejki([rekord,{...rekord}],[],{organization:"SEMPER",now:"2026-08-25T10:00:00.000Z"});
  assert.equal(pierwszy.items.length,1);
  assert.equal(pierwszy.duplicates,1);
  assert.equal(pierwszy.items[0].source,"MANUAL_PASTE");
  assert.equal(pierwszy.items[0].status,"PENDING");
  assert.equal(pierwszy.items[0].organization,"SEMPER");
  assert.equal(pierwszy.items[0].price,undefined);
});

test("SEMPER i IIST mają niezależne klucze oraz rekordy kolejki", () => {
  const semper = kolejka.przygotujElementyKolejki([rekord],[],{organization:"SEMPER"}).items[0];
  const iist = kolejka.przygotujElementyKolejki([rekord],[semper],{organization:"IIST"});
  assert.equal(iist.items.length,1);
  assert.equal(iist.duplicates,0);
  assert.notEqual(kolejka.kluczKolejki(semper.organization,semper.recordKey),kolejka.kluczKolejki(iist.items[0].organization,iist.items[0].recordKey));
});

test("filtrowanie organizacji nie zwraca rekordów drugiego profilu", () => {
  const elementy = ["s1","s2"].map(id => ({id,organization:"SEMPER"})).concat(["i1","i2"].map(id => ({id,organization:"IIST"})));
  assert.deepEqual(kolejka.filtrujKolejkeOrganizacji(elementy,"SEMPER").map(element => element.id),["s1","s2"]);
});

test("DONE nie blokuje ponownego importu tego samego rekordu", () => {
  const pierwszy = kolejka.przygotujElementyKolejki([rekord],[],{organization:"SEMPER"}).items[0];
  const zakonczony = {...pierwszy,status:"DONE"};
  const ponowny = kolejka.przygotujElementyKolejki([rekord],[zakonczony],{organization:"SEMPER"});
  assert.equal(ponowny.items.length,1);
  assert.equal(ponowny.duplicates,0);
});

test("aktywne PENDING, WAITING_FOR_SAVE i ERROR blokują ponowny import tego samego rekordu", () => {
  const pierwszy = kolejka.przygotujElementyKolejki([rekord],[],{organization:"SEMPER"}).items[0];
  for (const status of ["PENDING","WAITING_FOR_SAVE","ERROR"]) {
    const ponowny = kolejka.przygotujElementyKolejki([rekord],[{...pierwszy,status}],{organization:"SEMPER"});
    assert.equal(ponowny.items.length,0);
    assert.equal(ponowny.duplicates,1);
  }
});

test("nierozwiązany element nie usuwa poprawnych dopasowań z przetwarzania", () => {
  const poprawne = Array.from({length:4},(_,indeks) => ({element:{id:`ok-${indeks}`},terminy:[{start:`2026-10-0${indeks+1}`,city:"Warszawa"}]}));
  const bledny = {element:{id:"blad"},terminy:[]};
  const wynik = kolejka.rozdzielDopasowaniaKolejki([...poprawne,bledny]);
  assert.equal(wynik.jednoznaczne.length,4);
  assert.deepEqual(wynik.nierozwiazane.map(dopasowanie => dopasowanie.element.id),["blad"]);
});

test("tylko jeden queue item reprezentuje ten sam sourceTerm", () => {
  const termin = {start:"2026-10-01",end:"2026-10-02",city:"Online"};
  const wynik = kolejka.rozdzielDopasowaniaKolejki([
    {element:{id:"A"},terminy:[termin]},
    {element:{id:"B"},terminy:[{...termin}]}
  ]);
  assert.deepEqual(wynik.jednoznaczne.map(dopasowanie => dopasowanie.element.id),["A"]);
  assert.deepEqual(wynik.duplikatyTerminow.map(dopasowanie => dopasowanie.element.id),["B"]);
});

test("WAITING_FOR_SAVE i pending operation dotyczą wyłącznie faktycznie dodanych terminów", () => {
  const dopasowania = [1,2,3].map(indeks => ({
    element:{id:`element-${indeks}`},
    terminy:[{start:`2026-11-0${indeks}`,end:`2026-11-0${indeks}`,city:"Kraków"}]
  }));
  const dodane = [dopasowania[0].terminy[0],dopasowania[2].terminy[0]];
  const wynik = kolejka.powiazDodaneTerminy(dopasowania,dodane);
  assert.deepEqual(wynik.queueItemIds,["element-1","element-3"]);
  assert.deepEqual(wynik.terms,dodane);
  assert.equal(wynik.queueItemIds.includes("element-2"),false);
});

test("dopasowanie kolejki najpierw używa sourceStart/sourceEnd", () => {
  const element = {start:"2026-09-28",end:"2026-09-29",city:"ONLINE"};
  const termin = {sourceStart:"2026-09-28",sourceEnd:"2026-09-29",start:"2026-09-29",end:"2026-09-29",city:"Online",price:1200};
  assert.equal(kolejka.dopasujElementKolejkiDoTerminow(element,[termin]).length,1);
});
