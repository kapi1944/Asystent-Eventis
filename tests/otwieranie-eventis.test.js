"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const narzedzia = require("../shared/otwieranie-wydarzen-eventis");

function pozycja(numer, organizacja = "SEMPER") {
  return {
    sourceTitle:`Tytuł ${numer}`,
    normalizedSourceTitle:`tytul ${numer}`,
    organization:organizacja,
    status:"READY",
    selectedCandidate:{eventId:String(numer),url:`https://eventis.pl/event/edit/${numer}`}
  };
}

test("jedna rozstrzygnięta grupa tworzy plan jednej karty", () => {
  const plan = narzedzia.utworzPlanOtwierania([pozycja(1)]);
  assert.equal(plan.doOtwarcia.length,1);
  assert.equal(plan.konflikty.length,0);
});

test("dziesięć grup tworzy najwyżej dziesięć kart", () => {
  const plan = narzedzia.utworzPlanOtwierania(Array.from({length:10},(_, indeks) => pozycja(indeks + 1)));
  assert.equal(plan.doOtwarcia.length,10);
});

test("nierozstrzygnięte i pominięte pozycje nie tworzą kart", () => {
  const plan = narzedzia.utworzPlanOtwierania([
    {...pozycja(1),status:"AMBIGUOUS"},
    {...pozycja(2),status:"NOT_FOUND"},
    {...pozycja(3),status:"SKIPPED"}
  ]);
  assert.equal(plan.doOtwarcia.length,0);
});

test("już otwarta karta nie jest planowana drugi raz", () => {
  const plan = narzedzia.utworzPlanOtwierania([pozycja(1)],["https://eventis.pl/event/edit/1"]);
  assert.equal(plan.juzOtwarte.length,1);
  assert.equal(plan.doOtwarcia.length,0);
});

test("dwa mapowania jednego wydarzenia zgłaszają konflikt i nie dublują karty", () => {
  const druga = {...pozycja(2),sourceTitle:"Drugi tytuł",selectedCandidate:{eventId:"1",url:"https://eventis.pl/event/edit/1"}};
  const plan = narzedzia.utworzPlanOtwierania([pozycja(1),druga]);
  assert.equal(plan.doOtwarcia.length,1);
  assert.equal(plan.konflikty.length,1);
});

test("sesja zachowuje kontekst SEMPER lub IIST po serializacji storage", () => {
  const sesja = narzedzia.utworzSesjeOtwarcia("sesja-1","IIST",[pozycja(1,"IIST")],"2026-09-01T10:00:00.000Z");
  const odtworzona = JSON.parse(JSON.stringify(sesja));
  assert.equal(odtworzona.organization,"IIST");
  assert.equal(odtworzona.tasks[0].organization,"IIST");
  assert.equal(odtworzona.tasks[0].eventId,"1");
  assert.equal(odtworzona.tasks[0].taskId,"1");
  assert.equal(odtworzona.tasks[0].status,"PENDING");
});

test("karta zgodna z zadaniem sesji i cache otrzymuje VERIFIED", () => {
  const sesja = narzedzia.utworzSesjeOtwarcia("sesja-1","SEMPER",[pozycja(1)]);
  const mapowanie = {organization:"SEMPER",eventId:"1",eventUrl:"https://eventis.pl/event/edit/1",eventTitle:"Tytuł wydarzenia"};
  const wynik = narzedzia.zweryfikujOtwartaKarte(sesja,{sessionId:"sesja-1",taskId:"1",organization:"SEMPER",eventUrl:"https://eventis.pl/event/edit/1?esyncSession=sesja-1&esyncTask=1",eventTitle:"Tytuł wydarzenia"},mapowanie);
  assert.equal(wynik.status,"VERIFIED");
  assert.equal(wynik.invalidMapping,false);
});

test("inna karta lub organizacja daje INVALID bez unieważniania cache", () => {
  const sesja = narzedzia.utworzSesjeOtwarcia("sesja-1","SEMPER",[pozycja(1)]);
  const mapowanie = {organization:"SEMPER",eventId:"1",eventUrl:"https://eventis.pl/event/edit/1",eventTitle:"Tytuł wydarzenia"};
  const wynik = narzedzia.zweryfikujOtwartaKarte(sesja,{sessionId:"sesja-1",taskId:"1",organization:"IIST",eventUrl:"https://eventis.pl/event/edit/2",eventTitle:"Tytuł wydarzenia"},mapowanie);
  assert.equal(wynik.status,"INVALID");
  assert.equal(wynik.invalidMapping,false);
});

test("tytuł strony niezgodny z cache daje MISMATCH i wskazuje cache do unieważnienia", () => {
  const sesja = narzedzia.utworzSesjeOtwarcia("sesja-1","SEMPER",[pozycja(1)]);
  const mapowanie = {organization:"SEMPER",eventId:"1",eventUrl:"https://eventis.pl/event/edit/1",eventTitle:"Prawo pracy"};
  const wynik = narzedzia.zweryfikujOtwartaKarte(sesja,{sessionId:"sesja-1",taskId:"1",organization:"SEMPER",eventUrl:"https://eventis.pl/event/edit/1",eventTitle:"Prawo podatkowe"},mapowanie);
  assert.equal(wynik.status,"MISMATCH");
  assert.equal(wynik.invalidMapping,true);
  const zapisana = narzedzia.zapiszWynikWeryfikacjiSesji(sesja,wynik,"2026-09-01T12:00:00.000Z");
  assert.equal(zapisana.tasks[0].status,"MISMATCH");
  assert.equal(zapisana.tasks[0].actualEventTitle,"Prawo podatkowe");
});
