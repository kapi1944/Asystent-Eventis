"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const narzedzia = require("../shared/lista-eventis");
const mapowania = require("../shared/mapowania-wydarzen-eventis");

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

function ogloszenie(eventisId, tytul, organizacja) {
  return {eventisId:String(eventisId),url:`https://eventis.pl/event/edit/${eventisId}`,tytuly:[tytul],...(organizacja ? {organization:organizacja} : {})};
}

function rozwiaz(tytul, ogloszenia, organizacja = "SEMPER") {
  return narzedzia.rozwiazGrupeTytulu({tytul},ogloszenia,organizacja);
}

test("resolver wybiera jeden exact match i zwraca pełny kandydat", () => {
  const wynik = rozwiaz("Prawo pracy",[ogloszenie(101,"Prawo pracy")]);
  assert.equal(wynik.status,"AUTO_MATCH");
  assert.equal(wynik.reason,"EXACT_MATCH");
  assert.deepEqual(wynik.selectedCandidate,{eventId:"101",url:"https://eventis.pl/event/edit/101",title:"Prawo pracy",normalizedTitle:"prawo pracy",score:1,matchType:"EXACT"});
});

test("resolver oznacza dwa różne exact matche jako niejednoznaczne", () => {
  const wynik = rozwiaz("Prawo pracy",[ogloszenie(101,"Prawo pracy"),ogloszenie(102,"Prawo pracy")]);
  assert.equal(wynik.status,"AMBIGUOUS");
  assert.equal(wynik.selectedCandidate,null);
  assert.equal(wynik.reason,"MULTIPLE_EXACT_MATCHES");
});

test("resolver automatycznie wybiera mocny fuzzy match z wyraźną przewagą", () => {
  const wynik = rozwiaz("Prawo pracy w praktyce dla specjalistów HR",[
    ogloszenie(101,"Prawo pracy w praktyce dla specjalistów HR - szkolenie online"),
    ogloszenie(102,"Prawo pracy w przedsiębiorstwie")
  ]);
  assert.equal(wynik.status,"AUTO_MATCH");
  assert.equal(wynik.selectedCandidate.eventId,"101");
  assert.equal(wynik.selectedCandidate.matchType,"FUZZY");
  assert.ok(wynik.selectedCandidate.score >= narzedzia.PROG_DOPASOWANIA);
});

test("resolver nie wybiera arbitralnie podobnych fuzzy matchy", () => {
  const wynik = rozwiaz("Prawo pracy w praktyce dla specjalistów HR",[
    ogloszenie(101,"Prawo pracy w praktyce dla specjalistów HR i kadry kierowniczej"),
    ogloszenie(102,"Prawo pracy w praktyce dla specjalistów HR oraz kadry")
  ]);
  assert.equal(wynik.status,"AMBIGUOUS");
  assert.equal(wynik.reason,"FUZZY_MATCHES_TOO_CLOSE");
  assert.equal(wynik.selectedCandidate,null);
});

test("resolver zwraca NOT_FOUND bez wystarczająco dobrego wyniku", () => {
  const wynik = rozwiaz("Podatek VAT dla księgowych",[ogloszenie(101,"Prawo pracy w przedsiębiorstwie")]);
  assert.equal(wynik.status,"NOT_FOUND");
  assert.equal(wynik.selectedCandidate,null);
});

test("krótki tytuł Szkolenie A działa przez exact match", () => {
  const wynik = rozwiaz("Szkolenie A",[ogloszenie(101,"Szkolenie A")]);
  assert.equal(wynik.status,"AUTO_MATCH");
  assert.equal(wynik.selectedCandidate.normalizedTitle,"szkolenie a");
});

test("krótki tytuł Kurs VAT działa przez exact match", () => {
  const wynik = rozwiaz("Kurs VAT",[ogloszenie(101,"Kurs VAT")]);
  assert.equal(wynik.status,"AUTO_MATCH");
});

test("podobieństwo pojedynczego słowa nie powoduje automatycznego przypisania", () => {
  const wynik = rozwiaz("Prawo zamówień publicznych dla samorządów",[
    ogloszenie(101,"Prawo zamówień publicznych w ochronie zdrowia"),
    ogloszenie(102,"Prawo pracy dla samorządów")
  ]);
  assert.notEqual(wynik.status,"AUTO_MATCH");
});

test("resolver zachowuje kontekst organizacji SEMPER i IIST", () => {
  const ogloszenia = [
    ogloszenie(101,"Instrukcja kancelaryjna", "SEMPER"),
    ogloszenie(102,"Instrukcja kancelaryjna", "IIST")
  ];
  const semper = rozwiaz("Instrukcja kancelaryjna",ogloszenia,"SEMPER");
  const iist = rozwiaz("Instrukcja kancelaryjna",ogloszenia,"IIST");
  assert.equal(semper.selectedCandidate.eventId,"101");
  assert.equal(iist.selectedCandidate.eventId,"102");
  assert.equal(iist.organization,"IIST");
});

test("kolejność kandydatów resolvera jest deterministyczna", () => {
  const ogloszenia = [
    ogloszenie(103,"Prawo pracy w praktyce dla specjalistów HR oraz kadry"),
    ogloszenie(101,"Prawo pracy w praktyce dla specjalistów HR - szkolenie online"),
    ogloszenie(102,"Prawo pracy w przedsiębiorstwie")
  ];
  const pierwszy = rozwiaz("Prawo pracy w praktyce dla specjalistów HR",ogloszenia);
  const drugi = rozwiaz("Prawo pracy w praktyce dla specjalistów HR",[...ogloszenia].reverse());
  assert.deepEqual(pierwszy.candidates,drugi.candidates);
});

test("AUTO_MATCH trafia do planu bez ręcznego wyboru", () => {
  const resolver = {...rozwiaz("Prawo pracy",[ogloszenie(101,"Prawo pracy")]),queueItemIds:["q1","q2"]};
  const plan = narzedzia.utworzPlanOtwarcia([resolver]);
  assert.equal(plan.gotoweDoOtwarcia,1);
  assert.equal(plan.nierozstrzygniete,0);
  assert.equal(plan.pozycje[0].selectedCandidate.eventId,"101");
  assert.deepEqual(plan.pozycje[0].queueItemIds,["q1","q2"]);
});

test("AMBIGUOUS wymaga jednego wyboru i zastępuje poprzedni wybór", () => {
  const resolver = rozwiaz("RODO",[ogloszenie(101,"RODO"),ogloszenie(102,"RODO")]);
  const pierwszy = narzedzia.wybierzKandydataRozstrzygniecia(resolver,"101");
  const drugi = narzedzia.wybierzKandydataRozstrzygniecia(pierwszy,"102");
  const planPrzed = narzedzia.utworzPlanOtwarcia([resolver]);
  const planPo = narzedzia.utworzPlanOtwarcia([drugi]);
  assert.equal(planPrzed.nierozstrzygniete,1);
  assert.equal(planPo.gotoweDoOtwarcia,1);
  assert.equal(planPo.pozycje.length,1);
  assert.equal(planPo.pozycje[0].selectedCandidate.eventId,"102");
});

test("NOT_FOUND nie otrzymuje automatycznego wydarzenia", () => {
  const resolver = rozwiaz("Nieznane szkolenie",[ogloszenie(101,"Prawo pracy")]);
  const plan = narzedzia.utworzPlanOtwarcia([resolver]);
  assert.equal(resolver.status,"NOT_FOUND");
  assert.equal(plan.gotoweDoOtwarcia,0);
  assert.equal(plan.nierozstrzygniete,1);
});

test("pominięcie działa dla pojedynczego tytułu", () => {
  const pierwszy = rozwiaz("Nieznane A",[]);
  const drugi = rozwiaz("Nieznane B",[]);
  const plan = narzedzia.utworzPlanOtwarcia([narzedzia.pominRozstrzygniecie(pierwszy),drugi]);
  assert.equal(plan.pozycje[0].sourceTitle,"Nieznane A");
  assert.equal(plan.pozycje[0].status,"SKIPPED");
  assert.equal(plan.nierozstrzygniete,1);
});

test("ręczny URL dopuszcza tylko bezpieczny adres Eventis i wyciąga eventId", () => {
  const resolver = rozwiaz("Nieznane szkolenie",[]);
  const wybor = narzedzia.wybierzRecznyUrlEventis(resolver,"https://eventis.pl/event/edit/321");
  assert.equal(wybor.selectedCandidate.eventId,"321");
  assert.equal(wybor.selectedCandidate.matchType,"MANUAL_URL");
  assert.equal(narzedzia.wybierzRecznyUrlEventis(resolver,"https://evil.example/event/edit/321"),null);
});

test("widok listy ucieka od nieufnych tytułów przed wstawieniem do innerHTML", () => {
  const kod = fs.readFileSync(path.join(__dirname,"..","content","lista-eventis.js"),"utf8");
  assert.match(kod,/\$\{esc\(pozycja\.sourceTitle\)\}/);
  assert.match(kod,/\$\{esc\(kandydat\.title\)\}/);
});

function daneMapowania(organizacja = "SEMPER", tytul = "Prawo pracy", eventId = "101") {
  return {organization:organizacja,normalizedTitle:tytul,sourceTitle:tytul,eventId,eventUrl:`https://eventis.pl/event/edit/${eventId}`,eventTitle:`Wydarzenie ${eventId}`,resolutionSource:"manual"};
}

test("ręczne mapowanie zapisuje się bez duplikatu dla tego samego klucza", () => {
  const pierwszy = mapowania.zapiszMapowanie(null,daneMapowania(),"2026-09-01T10:00:00.000Z");
  const drugi = mapowania.zapiszMapowanie(pierwszy,daneMapowania("SEMPER","Prawo pracy","102"),"2026-09-02T10:00:00.000Z");
  const wpisy = Object.values(drugi.entries);
  assert.equal(wpisy.length,1);
  assert.equal(wpisy[0].eventId,"102");
  assert.equal(wpisy[0].createdAt,"2026-09-01T10:00:00.000Z");
});

test("exact i fuzzy zachowują źródło rozstrzygnięcia", () => {
  const exact = mapowania.zapiszMapowanie(null,{...daneMapowania(),resolutionSource:"exact"});
  const fuzzy = mapowania.zapiszMapowanie(exact,{...daneMapowania("SEMPER","Inny tytuł","102"),resolutionSource:"fuzzy"});
  assert.equal(mapowania.pobierzMapowanie(exact,"SEMPER","Prawo pracy").resolutionSource,"exact");
  assert.equal(mapowania.pobierzMapowanie(fuzzy,"SEMPER","Inny tytuł").resolutionSource,"fuzzy");
});

test("SEMPER i IIST mają niezależne wpisy cache", () => {
  const magazyn = mapowania.zapiszMapowanie(mapowania.zapiszMapowanie(null,daneMapowania("SEMPER")),daneMapowania("IIST"));
  assert.equal(Object.keys(magazyn.entries).length,2);
  assert.equal(mapowania.pobierzMapowanie(magazyn,"SEMPER","Prawo pracy").organization,"SEMPER");
  assert.equal(mapowania.pobierzMapowanie(magazyn,"IIST","Prawo pracy").organization,"IIST");
});

test("kolejna seria korzysta z cache przed resolverem", () => {
  const magazyn = mapowania.zapiszMapowanie(null,daneMapowania());
  const wynik = narzedzia.dopasujKolejkeDoOgloszen([element("q1","Prawo pracy")],[],"SEMPER",{
    znajdzMapowanie:grupa => mapowania.resolverZMapowania(mapowania.pobierzMapowanie(magazyn,"SEMPER",grupa.klucz))
  });
  assert.equal(wynik.dopasowane[0].resolver.status,"KNOWN_MAPPING");
  assert.equal(wynik.dopasowane[0].ogloszenie.eventisId,"101");
});

test("update, invalidate i delete obsługują pojedyncze mapowanie", () => {
  const zapisane = mapowania.zapiszMapowanie(null,daneMapowania());
  const nieprawidlowe = mapowania.oznaczMapowanieNieprawidlowe(zapisane,"SEMPER","Prawo pracy","2026-09-03T10:00:00.000Z");
  assert.equal(mapowania.pobierzMapowanie(nieprawidlowe,"SEMPER","Prawo pracy"),null);
  assert.equal(Object.values(nieprawidlowe.entries)[0].status,"INVALID");
  const usuniete = mapowania.usunMapowanie(nieprawidlowe,"SEMPER","Prawo pracy");
  assert.equal(Object.keys(usuniete.entries).length,0);
});

test("zmiana tytułu nie nadpisuje innego rekordu cache", () => {
  const pierwszy = mapowania.zapiszMapowanie(null,daneMapowania("SEMPER","Prawo pracy","101"));
  const drugi = mapowania.zapiszMapowanie(pierwszy,daneMapowania("SEMPER","Prawo podatkowe","102"));
  assert.equal(mapowania.pobierzMapowanie(drugi,"SEMPER","Prawo pracy").eventId,"101");
  assert.equal(mapowania.pobierzMapowanie(drugi,"SEMPER","Prawo podatkowe").eventId,"102");
});

test("migracja pomija niepełne legacy wpisy bez blokowania poprawnych", () => {
  const magazyn = mapowania.normalizujMagazynMapowan([
    {organization:"SEMPER",normalizedTitle:"Brak URL",eventId:"1"},
    {...daneMapowania("IIST","Kurs VAT","333"),updatedAt:"2026-09-01T10:00:00.000Z"}
  ]);
  assert.equal(Object.keys(magazyn.entries).length,1);
  assert.equal(mapowania.pobierzMapowanie(magazyn,"IIST","Kurs VAT").eventId,"333");
});

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
