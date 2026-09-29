"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const narzedzia = require("../shared/terminy");

test("parser dat rozpoznaje pojedynczy dzień i zakres", () => {
  assert.deepEqual(narzedzia.dateRangeFromText("Termin 2026-09-28"),{start:"2026-09-28",end:"2026-09-28"});
  assert.deepEqual(narzedzia.dateRangeFromText("od: 2026-09-28 do: 2026-09-29"),{start:"2026-09-28",end:"2026-09-29"});
  assert.equal(narzedzia.durationDays("2026-09-28","2026-09-29"),2);
});

test("parser dat rozpoznaje formaty z kropkami i skrócony zakres dni", () => {
  assert.deepEqual(narzedzia.dateRangeFromText("2026.09.28 do 2026.09.29"),{start:"2026-09-28",end:"2026-09-29"});
  assert.deepEqual(narzedzia.dateRangeFromText("28-29.09.2026"),{start:"2026-09-28",end:"2026-09-29"});
  assert.deepEqual(narzedzia.dateRangeFromText("28.09.2026"),{start:"2026-09-28",end:"2026-09-28"});
});

test("lokalizacja rozpoznaje ONLINE i obsługiwane miasto", () => {
  assert.equal(narzedzia.cityFromText("Termin ONLINE"),"Online");
  assert.equal(narzedzia.cityFromText("Termin stacjonarny w Krakowie"),"Kraków");
});

test("tekst potwierdzony i niepotwierdzony są rozróżniane", () => {
  assert.equal(narzedzia.isConfirmedText("Termin gwarantowany"),true);
  assert.equal(narzedzia.isConfirmedText("Termin planowany"),false);
});

test("deduplikacja zachowuje potwierdzoną wersję terminu", () => {
  const terminy = narzedzia.dedupeTerms([
    {start:"2026-09-28",end:"2026-09-29",city:"Online",confirmed:false},
    {start:"2026-09-28",end:"2026-09-29",city:"Online",confirmed:true}
  ]);
  assert.equal(terminy.length,1);
  assert.equal(terminy[0].confirmed,true);
});

test("reguła czterodniowa zachowuje daty źródłowe i obniża cenę stacjonarną", () => {
  const termin = narzedzia.zastosujReguleCzterodniowegoTerminu("2026-09-28","2026-10-01","Warszawa",3000);
  assert.deepEqual(termin,{
    sourceStart:"2026-09-28",
    sourceEnd:"2026-10-01",
    start:"2026-09-29",
    end:"2026-10-01",
    city:"Warszawa",
    price:2700,
    durationDays:3
  });

  const online = narzedzia.zastosujReguleCzterodniowegoTerminu("2026-09-28","2026-10-01","Online",3000);
  assert.equal(online.price,3000);
});

test("zwykły termin otrzymuje zgodne daty źródłowe", () => {
  const termin = narzedzia.zastosujReguleCzterodniowegoTerminu("2026-09-28","2026-09-29","Poznań",2000);
  assert.equal(termin.sourceStart,termin.start);
  assert.equal(termin.sourceEnd,termin.end);
});

test("stary termin bez sourceStart i sourceEnd pozostaje zgodny", () => {
  const staryTermin = {start:"2026-09-28",end:"2026-09-29",city:"Online",confirmed:true};
  assert.equal(narzedzia.termKey(staryTermin),"2026-09-28|2026-09-29|online");
  assert.equal(narzedzia.existingKey(staryTermin),"2026-09-28|2026-09-29|online");
  assert.deepEqual(narzedzia.dedupeTerms([staryTermin]),[staryTermin]);
});

test("preflight: trzy zgodne potwierdzone terminy są kompletne", () => {
  const zrodlo = [1,5,10].map(dzien => ({start:`2026-10-${String(dzien).padStart(2,"0")}`,end:`2026-10-${String(dzien).padStart(2,"0")}`,city:"Online",confirmed:true}));
  const wynik = narzedzia.porownajPotwierdzoneTerminy(zrodlo,[...zrodlo]);
  assert.equal(wynik.status,"COMPLETE");
  assert.equal(wynik.matchingEventisTerms.length,3);
  assert.equal(wynik.missingConfirmedTerms.length,0);
});

test("preflight: brak jednego z czterech terminów wymaga uzupełnienia", () => {
  const zrodlo = [1,5,10,20].map(dzien => ({start:`2026-10-${String(dzien).padStart(2,"0")}`,end:`2026-10-${String(dzien).padStart(2,"0")}`,city:"Warszawa",confirmed:true}));
  const wynik = narzedzia.porownajPotwierdzoneTerminy(zrodlo,zrodlo.slice(0,3));
  assert.equal(wynik.status,"MISSING_TERMS");
  assert.equal(wynik.missingConfirmedTerms.length,1);
});

test("preflight: równe liczby z inną datą nie oznaczają kompletności", () => {
  const zrodlo = [1,5,10].map(dzien => ({start:`2026-10-${String(dzien).padStart(2,"0")}`,end:`2026-10-${String(dzien).padStart(2,"0")}`,city:"Online",confirmed:true}));
  const eventis = [...zrodlo.slice(0,2),{...zrodlo[2],start:"2026-10-20",end:"2026-10-20"}];
  const wynik = narzedzia.porownajPotwierdzoneTerminy(zrodlo,eventis);
  assert.equal(wynik.status,"COUNT_MATCH_BUT_DIFFERENT");
  assert.equal(wynik.matchingEventisTerms.length,2);
  assert.equal(wynik.missingConfirmedTerms.length,1);
  assert.equal(wynik.extraEventisTerms.length,1);
});

test("preflight: historyczne terminy Eventis nie zaburzają kompletności", () => {
  const zrodlo = [1,5].map(dzien => ({start:`2026-10-${String(dzien).padStart(2,"0")}`,end:`2026-10-${String(dzien).padStart(2,"0")}`,city:"Online",confirmed:true}));
  const wynik = narzedzia.porownajPotwierdzoneTerminy(zrodlo,[...zrodlo,{start:"2020-01-01",end:"2020-01-01",city:"Online"}]);
  assert.equal(wynik.status,"COMPLETE");
  assert.equal(wynik.matchingEventisTerms.length,2);
  assert.equal(wynik.extraEventisTerms.length,1);
});

test("preflight: data końcowa i lokalizacja uczestniczą w porównaniu", () => {
  const zrodlo = [{start:"2026-10-01",end:"2026-10-02",city:"Online",confirmed:true}];
  assert.equal(narzedzia.porownajPotwierdzoneTerminy(zrodlo,[{start:"2026-10-01",end:"2026-10-03",city:"Online"}]).status,"COUNT_MATCH_BUT_DIFFERENT");
  assert.equal(narzedzia.porownajPotwierdzoneTerminy(zrodlo,[{start:"2026-10-01",end:"2026-10-02",city:"Warszawa"}]).status,"COUNT_MATCH_BUT_DIFFERENT");
});

test("preflight bez potwierdzonych terminów pozostaje niezweryfikowany", () => {
  assert.equal(narzedzia.porownajPotwierdzoneTerminy([],[]).status,"UNVERIFIED");
});

test("błąd pobrania Eventis nie pozwala uznać szkolenia za kompletne", () => {
  const wynik = narzedzia.ustalWynikPreflightu([{start:"2026-10-01",end:"2026-10-01",city:"Online",confirmed:true}],null,"HTTP 503");
  assert.equal(wynik.status,"UNVERIFIED");
  assert.equal(wynik.error,"HTTP 503");
});

test("wspólny odczyt formularza Eventis rozpoznaje datę końcową i ONLINE", () => {
  const pola = new Map([
    ['input[name="eventDate[7][date_start]"]',{value:"2026-11-18"}],
    ['input[name="eventDate[7][date_end]"]',{value:"2026-11-19"}],
    ['input[name="eventDate[7][city]"]',{value:"Warszawa"}],
    ['select[name="eventDate[7][is_online]"]',{value:"1"}]
  ]);
  const wiersz = {id:"li_eventdate_7",querySelector:selektor => pola.get(selektor) || null};
  const dokument = {querySelectorAll:() => [wiersz]};
  const [termin] = narzedzia.odczytajTerminyEventis(dokument);
  assert.deepEqual({start:termin.start,end:termin.end,city:termin.city},{start:"2026-11-18",end:"2026-11-19",city:"Online"});
});

test("odczyt formularza Eventis normalizuje polski format zakresu ONLINE", () => {
  const pola = new Map([
    ['input[name="eventDate[8][date_start]"]',{value:"14.10.2026"}],
    ['input[name="eventDate[8][date_end]"]',{value:"16.10.2026"}],
    ['input[name="eventDate[8][city]"]',{value:""}],
    ['select[name="eventDate[8][is_online]"]',{value:"1"}]
  ]);
  const wiersz = {id:"li_eventdate_8",querySelector:selektor => pola.get(selektor) || null};
  const [termin] = narzedzia.odczytajTerminyEventis({querySelectorAll:() => [wiersz]});
  assert.deepEqual({start:termin.start,end:termin.end,city:termin.city},{start:"2026-10-14",end:"2026-10-16",city:"Online"});
});

test("wspólny odczyt SEMPER zachowuje wyłącznie potwierdzenie z oznaczenia", () => {
  const komorki = ["2026-11-18 do 2026-11-19","ONLINE","","1200 zł"].map(textContent => ({textContent}));
  const wiersz = {textContent:"2026-11-18 do 2026-11-19 ONLINE 1200 zł",children:komorki,querySelector:selektor => selektor === ".gw" ? {} : null};
  const dokument = {querySelectorAll:() => [wiersz]};
  const [termin] = narzedzia.odczytajTerminySemper(dokument);
  assert.deepEqual({start:termin.start,end:termin.end,city:termin.city,confirmed:termin.confirmed},
    {start:"2026-11-18",end:"2026-11-19",city:"Online",confirmed:true});
});
