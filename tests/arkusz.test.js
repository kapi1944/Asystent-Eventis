"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const narzedzia = require("../shared/arkusz");

test("ujednolicony rekord arkusza zachowuje metadane wiersza i wartości źródłowe", () => {
  const rekord = narzedzia.utworzRekordArkusza({
    status:"CONFIRMED",
    title:"Prawo pracy",
    start:"2026-09-28",
    end:"2026-09-29",
    city:"Warszawa",
    participants:8,
    sheetName:"Wrzesień",
    rowNumber:12,
    rowFingerprint:"abc",
    semperValue:"K",
    iistValue:"",
    rawValues:["Prawo pracy"],
    rawText:"wiersz"
  });
  assert.equal(rekord.normalizedTitle,"prawo pracy");
  assert.equal(rekord.sheetName,"Wrzesień");
  assert.equal(rekord.rowNumber,12);
  assert.equal(rekord.rowFingerprint,"abc");
  assert.deepEqual(rekord.rawValues,["Prawo pracy"]);
});

test("manualny parser rozpoznaje POTWIERDZONE SZKOLENIE i dane ONLINE", () => {
  const rekord = narzedzia.parseManualRecordLine(
    'POTWIERDZONE SZKOLENIE "Prawo zamówień publicznych" 2026.09.28 do 2026.09.29 SZKOLENIE ONLINE 12 osób'
  );
  assert.equal(rekord.status,"CONFIRMED");
  assert.equal(rekord.title,"Prawo zamówień publicznych");
  assert.equal(rekord.normalizedTitle,"prawo zamowien publicznych");
  assert.equal(rekord.start,"2026-09-28");
  assert.equal(rekord.end,"2026-09-29");
  assert.equal(rekord.city,"Online");
  assert.equal(rekord.participants,12);
});

test("manualny parser rozpoznaje ODPOTWIERDZONE, miasto i skrócony zakres", () => {
  const rekord = narzedzia.parseManualRecordLine(
    'ODPOTWIERDZONE "Prawo pracy" 28-29.09.2026 Warszawa 8 osób'
  );
  assert.equal(rekord.status,"DECONFIRMED");
  assert.equal(rekord.title,"Prawo pracy");
  assert.equal(rekord.start,"2026-09-28");
  assert.equal(rekord.end,"2026-09-29");
  assert.equal(rekord.city,"Warszawa");
  assert.equal(rekord.participants,8);
});

test("manualne wklejenie pomija linie bez obsługiwanego statusu", () => {
  const rekordy = narzedzia.parseManualPaste([
    "Nagłówek arkusza",
    'POTWIERDZONE SZKOLENIE "VAT" 2026-09-28 ONLINE',
    'ODPOTWIERDZONE "Kadry" 2026-10-01 Kraków'
  ].join("\n"));
  assert.equal(rekordy.length,2);
});

test("recordKey nie zależy od numeru wiersza", () => {
  const dane = {
    status:"CONFIRMED",
    title:"Prawo pracy",
    normalizedTitle:"prawo pracy",
    start:"2026-09-28",
    end:"2026-09-29",
    city:"Warszawa"
  };
  const pierwszy = narzedzia.recordKey({...dane,rowNumber:10});
  const drugi = narzedzia.recordKey({...dane,rowNumber:25});
  assert.equal(pierwszy,drugi);
  assert.equal(pierwszy,"CONFIRMED|prawo pracy|2026-09-28|2026-09-29|warszawa");
});

test("recordKey zmienia się po zmianie danych semantycznych", () => {
  const dane = {
    status:"CONFIRMED",
    title:"Prawo pracy",
    start:"2026-09-28",
    end:"2026-09-29",
    city:"Warszawa"
  };
  const bazowy = narzedzia.recordKey(dane);
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,status:"DECONFIRMED"}));
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,title:"Prawo podatkowe"}));
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,start:"2026-10-01"}));
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,city:"Kraków"}));
});

test("dopasowanie manualne pozostaje oparte na podobieństwie tytułu", () => {
  const rekord = narzedzia.parseManualRecordLine(
    'POTWIERDZONE SZKOLENIE "Prawo zamówień publicznych" 2026-09-28 ONLINE'
  );
  const dopasowane = narzedzia.matchManualRecordsToCurrent([rekord],"Prawo zamówień publicznych");
  assert.equal(dopasowane.length,1);
  assert.ok(dopasowane[0].similarity>=.58);
});
