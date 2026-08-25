"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const kolejka = require("../shared/kolejka-eventis");

test("kolejka przyjmuje tylko potwierdzone rekordy i pomija duplikaty semantyczne", () => {
  const rekord = {status:"CONFIRMED",title:"Prawo pracy",normalizedTitle:"prawo pracy",start:"2026-09-28",end:"2026-09-29",city:"Warszawa",participants:8,rawText:"źródło"};
  const pierwszy = kolejka.przygotujElementyKolejki([rekord,{...rekord}],[],{now:"2026-08-25T10:00:00.000Z"});
  assert.equal(pierwszy.items.length,1);
  assert.equal(pierwszy.duplicates,1);
  assert.equal(pierwszy.items[0].source,"MANUAL_PASTE");
  assert.equal(pierwszy.items[0].status,"PENDING");
  assert.equal(pierwszy.items[0].price,undefined);
});

test("dopasowanie kolejki najpierw używa sourceStart/sourceEnd", () => {
  const element = {start:"2026-09-28",end:"2026-09-29",city:"ONLINE"};
  const termin = {sourceStart:"2026-09-28",sourceEnd:"2026-09-29",start:"2026-09-29",end:"2026-09-29",city:"Online",price:1200};
  assert.equal(kolejka.dopasujElementKolejkiDoTerminow(element,[termin]).length,1);
});
