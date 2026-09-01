"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const kolejka = require("../shared/kolejka-eventis");
const arkusz = require("../shared/arkusz");

const rekord = {status:"CONFIRMED",title:"Prawo pracy",normalizedTitle:"prawo pracy",start:"2026-09-28",end:"2026-09-29",city:"Warszawa",participants:8,rawText:"źródło"};

test("kolejka przyjmuje potwierdzone i odpotwierdzone rekordy oraz pomija duplikaty semantyczne", () => {
  const pierwszy = kolejka.przygotujElementyKolejki([rekord,{...rekord}],[],{organization:"SEMPER",now:"2026-08-25T10:00:00.000Z"});
  assert.equal(pierwszy.items.length,1);
  assert.equal(pierwszy.duplicates,1);
  assert.equal(pierwszy.items[0].source,"MANUAL_PASTE");
  assert.equal(pierwszy.items[0].status,"PENDING");
  assert.equal(pierwszy.items[0].organization,"SEMPER");
  assert.equal(pierwszy.items[0].price,undefined);
  const odpotwierdzony = kolejka.przygotujElementyKolejki([{...rekord,status:"DECONFIRMED"}],pierwszy.items,{organization:"SEMPER"});
  assert.equal(odpotwierdzony.items.length,1);
  assert.equal(odpotwierdzony.items[0].recordStatus,"DECONFIRMED");
});

test("zweryfikowane zadanie otrzymuje tylko własną grupę i organizację", () => {
  const elementy = [
    {id:"wlasny-potwierdzony",organization:"SEMPER",normalizedTitle:"prawo pracy",recordStatus:"CONFIRMED",status:"PENDING"},
    {id:"wlasny-odpotwierdzony",organization:"SEMPER",normalizedTitle:"prawo pracy",recordStatus:"DECONFIRMED",status:"ERROR"},
    {id:"obcy-tytul",organization:"SEMPER",normalizedTitle:"prawo podatkowe",recordStatus:"CONFIRMED",status:"PENDING"},
    {id:"obca-organizacja",organization:"IIST",normalizedTitle:"prawo pracy",recordStatus:"CONFIRMED",status:"PENDING"}
  ];
  const zadanie = {status:"VERIFIED",normalizedSourceTitle:"prawo pracy",queueItemIds:elementy.map(element => element.id)};
  assert.deepEqual(kolejka.przypiszElementyDoZadania(elementy,zadanie,"SEMPER").map(element => element.id),["wlasny-potwierdzony","wlasny-odpotwierdzony"]);
  assert.deepEqual(kolejka.przypiszElementyDoZadania(elementy,{...zadanie,status:"MISMATCH"},"SEMPER"),[]);
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

test("rozliczenie pending operation zmienia tylko powiązane elementy właściwej organizacji", () => {
  const elementy = [
    {id:"wspolny",organization:"SEMPER",status:"WAITING_FOR_SAVE"},
    {id:"wspolny",organization:"IIST",status:"WAITING_FOR_SAVE"},
    {id:"inny",organization:"SEMPER",status:"PENDING"}
  ];
  const operacja = {organization:"SEMPER",queueItemIds:["wspolny"]};
  const wynik = kolejka.rozliczElementyOperacji(elementy,operacja,"ERROR","Nieudany zapis");
  assert.equal(wynik[0].status,"ERROR");
  assert.equal(wynik[0].errorMessage,"Nieudany zapis");
  assert.equal(wynik[1].status,"WAITING_FOR_SAVE");
  assert.equal(wynik[2].status,"PENDING");
});

test("pending operation z event/add jest odnajdywana po przejściu do liczbowego event/edit", () => {
  const operacja = {id:"nowa",organization:"SEMPER",eventisId:"new:prawo pracy",eventisTitle:"Prawo pracy"};
  const operacje = {"SEMPER|new:prawo pracy":operacja};
  assert.equal(kolejka.znajdzOperacjeDlaStrony(operacje,"SEMPER","123","Prawo pracy"),operacja);
  assert.equal(kolejka.znajdzOperacjeDlaStrony(operacje,"IIST","123","Prawo pracy"),null);
});

test("pending operation z event/add nie jest wybierana przy niejednoznacznym tytule", () => {
  const operacje = {
    "SEMPER|new:1":{id:"pierwsza",organization:"SEMPER",eventisId:"new:1",eventisTitle:"Prawo pracy"},
    "SEMPER|new:2":{id:"druga",organization:"SEMPER",eventisId:"new:2",eventisTitle:"Prawo pracy"}
  };
  assert.equal(kolejka.znajdzOperacjeDlaStrony(operacje,"SEMPER","123","Prawo pracy"),null);
});

test("terminy już istniejące i duplikaty wejścia nie są ponownie wprowadzane", () => {
  const istniejacy = {start:"2026-10-01",city:"Warszawa"};
  const nowy = {start:"2026-10-02",city:"Online"};
  const wynik = kolejka.rozdzielTerminyDoWprowadzenia([istniejacy,nowy,{...nowy}],[istniejacy]);
  assert.deepEqual(wynik.doWprowadzenia,[nowy]);
  assert.deepEqual(wynik.pominiete,[istniejacy,{...nowy}]);
});

test("błąd jednego terminu nie blokuje wypełnienia następnego", () => {
  const terminy = [{start:"2026-10-01"},{start:"2026-10-02"},{start:"2026-10-03"}];
  const wypelnione = [];
  const wynik = kolejka.wypelnijTerminyOsobno(terminy,["formularz-1","formularz-2","formularz-3"],(formularz,termin) => {
    if (termin.start === "2026-10-02") throw new Error("Błąd drugiego terminu");
    wypelnione.push(formularz);
  });
  assert.deepEqual(wypelnione,["formularz-1","formularz-3"]);
  assert.deepEqual(wynik.dodane,[terminy[0],terminy[2]]);
  assert.equal(wynik.bledy[0].komunikat,"Błąd drugiego terminu");
});

test("cztery terminy przechodzą zbiorczo przez PENDING, WAITING_FOR_SAVE i DONE", () => {
  const tytul = "TEST KOLEJKA ZBIORCZA";
  const analiza = arkusz.analizujListeTerminow([
    "2026-09-28 do 2026-09-29 | ONLINE",
    "2026-10-01 do 2026-10-02 | ONLINE",
    "2026-10-15 | Warszawa",
    "2026-11-05 do 2026-11-06 | Gdańsk"
  ].join("\n"),{title:tytul});
  const przygotowane = kolejka.przygotujElementyKolejki(analiza.records,[],{organization:"SEMPER"});
  const elementySemper = przygotowane.items.map((element,indeks) => ({...element,id:`semper-${indeks + 1}`}));
  const obcyTytul = {...elementySemper[0],id:"obcy-tytul",title:"Inne szkolenie",normalizedTitle:"inne szkolenie",recordKey:"obcy-klucz"};
  const elementIist = {...elementySemper[0],id:"iist-1",organization:"IIST"};
  const terminyZrodlowe = analiza.records.map(rekord => ({
    sourceStart:rekord.start,
    sourceEnd:rekord.end,
    start:rekord.start,
    end:rekord.end,
    city:rekord.city,
    price:1200
  }));
  const dopasowania = elementySemper.map(element => ({
    element,
    terminy:kolejka.dopasujElementKolejkiDoTerminow(element,terminyZrodlowe)
  }));
  const rozdzielone = kolejka.rozdzielDopasowaniaKolejki(dopasowania);
  const powiazanie = kolejka.powiazDodaneTerminy(rozdzielone.jednoznaczne,terminyZrodlowe);
  const operacja = {
    operationId:"operacja-zbiorcza",
    operationScopeKey:"SEMPER|add:dokument-1",
    organization:"SEMPER",
    eventisIdAtStart:null,
    eventisTitleAtStart:tytul,
    queueItemIds:powiazanie.queueItemIds,
    status:"WAITING_FOR_SAVE"
  };

  assert.equal(przygotowane.items.length,4);
  assert.deepEqual(elementySemper.map(element => element.status),["PENDING","PENDING","PENDING","PENDING"]);
  assert.equal(rozdzielone.jednoznaczne.length,4);
  assert.deepEqual(powiazanie.queueItemIds,["semper-1","semper-2","semper-3","semper-4"]);
  assert.equal(powiazanie.terms.length,4);

  const oczekujace = kolejka.oznaczElementyOczekujaceOperacji([...elementySemper,obcyTytul,elementIist],operacja);
  assert.deepEqual(oczekujace.slice(0,4).map(element => element.status),["WAITING_FOR_SAVE","WAITING_FOR_SAVE","WAITING_FOR_SAVE","WAITING_FOR_SAVE"]);
  assert.equal(oczekujace[4].status,"PENDING");
  assert.equal(oczekujace[5].status,"PENDING");

  const operacje = {[operacja.operationScopeKey]:operacja};
  const poReloadzie = kolejka.znajdzOperacjeDlaStrony(operacje,"SEMPER","987",tytul);
  assert.equal(poReloadzie,operacja);
  assert.deepEqual(oczekujace.slice(0,4).map(element => element.status),["WAITING_FOR_SAVE","WAITING_FOR_SAVE","WAITING_FOR_SAVE","WAITING_FOR_SAVE"]);

  const zakonczone = kolejka.rozliczElementyOperacji(oczekujace,poReloadzie,"DONE");
  assert.deepEqual(zakonczone.slice(0,4).map(element => element.status),["DONE","DONE","DONE","DONE"]);
  assert.equal(zakonczone[4].status,"PENDING");
  assert.equal(zakonczone[5].status,"PENDING");
});

test("ponowne wklejenie aktywnej listy daje zero nowych i cztery duplikaty", () => {
  const analiza = arkusz.analizujListeTerminow([
    "2026-09-28 do 2026-09-29 | ONLINE",
    "2026-10-01 do 2026-10-02 | ONLINE",
    "2026-10-15 | Warszawa",
    "2026-11-05 do 2026-11-06 | Gdańsk"
  ].join("\n"),{title:"TEST KOLEJKA ZBIORCZA"});
  const pierwszyImport = kolejka.przygotujElementyKolejki(analiza.records,[],{organization:"SEMPER"});
  const drugiImport = kolejka.przygotujElementyKolejki(analiza.records,pierwszyImport.items,{organization:"SEMPER"});

  assert.equal(drugiImport.items.length,0);
  assert.equal(drugiImport.duplicates,4);
});

test("aktualna operacja event/add z wieloma queueItemIds jest odnajdywana po event/edit", () => {
  const operacja = {
    operationId:"operacja-nowego-ogloszenia",
    operationScopeKey:"SEMPER|add:dokument-2",
    organization:"SEMPER",
    eventisIdAtStart:null,
    eventisTitleAtStart:"Prawo budowlane",
    queueItemIds:["q1","q2","q3"]
  };
  const operacje = {[operacja.operationScopeKey]:operacja};

  assert.equal(kolejka.znajdzOperacjeDlaStrony(operacje,"SEMPER","321","Prawo budowlane"),operacja);
  assert.equal(kolejka.znajdzOperacjeDlaStrony(operacje,"IIST","321","Prawo budowlane"),null);
  assert.equal(operacja.queueItemIds.length,3);
});

test("ERROR można przywrócić do PENDING bez zmiany tożsamości rekordu", () => {
  const element = {id:"blad-1",organization:"SEMPER",status:"ERROR",errorMessage:"Błąd zapisu"};
  const ponowiony = {...kolejka.zmienStatusElementu(element,"PENDING"),operationId:null};

  assert.equal(ponowiony.id,"blad-1");
  assert.equal(ponowiony.status,"PENDING");
  assert.equal(ponowiony.errorMessage,"");
});
