"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const narzedzia = require("../shared/lista-eventis");

function element(id, tytul, organizacja = "SEMPER") {
  return {
    id,
    organization:organizacja,
    status:"PENDING",
    title:tytul,
    normalizedTitle:"",
    start:"2026-09-21",
    end:"2026-09-22",
    city:"Online"
  };
}

test("identyfikator Eventis jest odczytywany wyłącznie z bezpiecznego adresu edycji", () => {
  assert.equal(narzedzia.pobierzIdEventisZUrl("https://eventis.pl/event/edit/123"),"123");
  assert.equal(narzedzia.pobierzIdEventisZUrl("https://firma.eventis.pl/event/edit?id=456"),"456");
  assert.equal(narzedzia.pobierzIdEventisZUrl("https://evil.example/event/edit/123"),"");
  assert.equal(narzedzia.pobierzIdEventisZUrl("https://eventis.pl/event/add"),"");
});

test("kilka terminów tego samego szkolenia tworzy jedno dopasowanie karty", () => {
  const tytul = "Mobbing i przeciwdziałanie mobbingowi - 2-dniowe warsztaty praktyczne";
  const wynik = narzedzia.dopasujKolejkeDoOgloszen([
    element("q1",tytul),
    {...element("q2",tytul),start:"2026-10-20",end:"2026-10-21"}
  ],[{
    eventisId:"101",
    url:"https://eventis.pl/event/edit/101",
    tytuly:["Mobbing i przeciwdziałanie mobbingowi - 2-dniowe warsztaty praktyczne. Certyfikowane szkolenie online"]
  }],"SEMPER");
  assert.equal(wynik.dopasowane.length,1);
  assert.deepEqual(wynik.dopasowane[0].elementy.map(pozycja => pozycja.id),["q1","q2"]);
  assert.equal(wynik.nierozpoznane.length,0);
});

test("niejednoznaczne dopasowanie nie uruchamia żadnej karty", () => {
  const wynik = narzedzia.dopasujKolejkeDoOgloszen([
    element("q1","Prawo zamówień publicznych w praktyce")
  ],[
    {eventisId:"201",url:"https://eventis.pl/event/edit/201",tytuly:["Prawo zamówień publicznych w praktyce"]},
    {eventisId:"202",url:"https://eventis.pl/event/edit/202",tytuly:["Prawo zamówień publicznych w praktyce"]}
  ],"SEMPER");
  assert.equal(wynik.dopasowane.length,0);
  assert.equal(wynik.nierozpoznane.length,1);
  assert.equal(wynik.nierozpoznane[0].powod,"AMBIGUOUS");
});

test("kolejki SEMPER i IIST są dopasowywane niezależnie", () => {
  const ogloszenia = [{eventisId:"301",url:"https://eventis.pl/event/edit/301",tytuly:["Instrukcja kancelaryjna - kompendium wiedzy"]}];
  const wynik = narzedzia.dopasujKolejkeDoOgloszen([
    element("semper","Instrukcja kancelaryjna - kompendium wiedzy","SEMPER"),
    element("iist","Instrukcja kancelaryjna - kompendium wiedzy","IIST")
  ],ogloszenia,"IIST");
  assert.equal(wynik.dopasowane.length,1);
  assert.deepEqual(wynik.dopasowane[0].elementy.map(pozycja => pozycja.id),["iist"]);
});

test("automatyzacja wymaga aktywnego i wcześniej zweryfikowanego mapowania", () => {
  const bazowe = {status:"ACTIVE",sourceUrl:"https://szkolenia-semper.pl/szkolenie",confidence:.95,lastVerifiedAt:"2026-08-25T10:00:00.000Z"};
  assert.equal(narzedzia.czyMapowanieGotoweDoAutomatyzacji(bazowe,.9),true);
  assert.equal(narzedzia.czyMapowanieGotoweDoAutomatyzacji({...bazowe,lastVerifiedAt:null},.9),false);
  assert.equal(narzedzia.czyMapowanieGotoweDoAutomatyzacji({...bazowe,confidence:.89},.9),false);
  assert.equal(narzedzia.czyMapowanieGotoweDoAutomatyzacji({...bazowe,status:"REVIEW_REQUIRED"},.9),false);
});

test("seria zachowuje identyfikatory kolejki i wygasa po dwóch godzinach", () => {
  const utworzono = "2026-08-25T10:00:00.000Z";
  const seria = narzedzia.utworzSerieAutomatyczna([{
    tytul:"Prawo pracy",
    elementy:[element("q1","Prawo pracy"),element("q2","Prawo pracy")],
    ogloszenie:{eventisId:"401",url:"https://eventis.pl/event/edit/401"}
  }],"SEMPER",{utworzono,identyfikatorSerii:"seria-1"});
  const serie = {[seria.identyfikatorSerii]:seria};
  const aktywne = narzedzia.znajdzAktywneZadanie(serie,"SEMPER","401",new Date("2026-08-25T11:59:59.000Z").getTime());
  assert.deepEqual(aktywne.zadanie.identyfikatoryKolejki,["q1","q2"]);
  assert.equal(narzedzia.znajdzAktywneZadanie(serie,"SEMPER","401",new Date("2026-08-25T12:00:00.000Z").getTime()),null);
});
