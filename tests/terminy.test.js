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
  assert.equal(narzedzia.existingKey(staryTermin),"2026-09-28|online");
  assert.deepEqual(narzedzia.dedupeTerms([staryTermin]),[staryTermin]);
});
