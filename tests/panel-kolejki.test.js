'use strict';
const test = require('node:test');
const asercje = require('node:assert/strict');
const pliki = require('node:fs');
const maszyna = require('node:vm');
const lista = require('../shared/lista-eventis');
const mapowania = require('../shared/mapowania-wydarzen-eventis');
const otwieranie = require('../shared/otwieranie-wydarzen-eventis');
const kod = pliki.readFileSync(require.resolve('../content/lista-eventis.js'),'utf8');
function funkcja(poczatek, koniec, kontekst) {
  return maszyna.runInNewContext(kod.slice(kod.indexOf(poczatek),kod.indexOf(koniec,kod.indexOf(poczatek))) + ';' + poczatek.match(/function (\w+)/)[1],kontekst);
}
function odtworz() {
  const magazyn = mapowania.zapiszMapowanie(null,{organization:'SEMPER',sourceTitle:'Zarządzanie projektami',normalizedTitle:'zarzadzanie projektami',eventId:'123',eventUrl:'https://eventis.pl/event/edit/123',eventTitle:'Zarządzanie projektami',resolutionSource:'manual'});
  return mapowania.resolverZMapowania(mapowania.pobierzBezpieczneMapowanie(JSON.parse(JSON.stringify(magazyn)),'SEMPER','zarzadzanie projektami','Zarządzanie projektami'));
}
async function kliknij(pozycja, wynik) {
  let wyslane;
  const poczatek = kod.indexOf('      const klucz = przycisk.dataset.preflightOpen;');
  const koniec = kod.indexOf('    })));',poczatek);
  const stan = {organizacja:'SEMPER',rozstrzygniecia:[pozycja],preflight:{wyniki:wynik ? {klucz:wynik} : {}}};
  await maszyna.runInNewContext('(async () => {' + kod.slice(poczatek,koniec) + '})()',{
    stan,przycisk:{dataset:{preflightOpen:'klucz'}},aktualneRozstrzygniecie:wpis=>wpis,kluczRozstrzygniecia:()=> 'klucz',
    chrome:{runtime:{sendMessage:async wiadomosc=>{wyslane=wiadomosc;return {ok:true};}}},
    NARZEDZIA_LISTY:lista,finalnyPlanOtwarcia:()=>lista.utworzPlanOtwarcia([pozycja]),
    odswiezPlanOtwarcia:async()=>{},renderuj:()=>{},pokazKomunikat:tekst=>{throw Error(tekst);}
  });
  return wyslane;
}
test('odtworzone przypisanie i ponowne załadowanie panelu pozwalają otworzyć URL bez preflightu',async()=>{
  for (let proba=0;proba<2;proba++) {
    const pozycja=odtworz();
    const wiadomosc=await kliknij(pozycja);
    asercje.equal(wiadomosc.type,'OTWORZ_EVENTIS_RECZNIE');
    asercje.equal(wiadomosc.url,'https://eventis.pl/event/edit/123');
    asercje.equal(wiadomosc.eventId,'123');
  }
});
test('zweryfikowany rekord zachowuje ścieżkę uzupełniania i kontekst kolejki',async()=>{
  const wynik={eventId:'123',status:'MISSING_TERMS',queueContext:{sourceUrl:'https://www.szkolenia-semper.pl/'}};
  const wiadomosc=await kliknij(odtworz(),wynik);
  asercje.equal(wiadomosc.type,'OPEN_EVENTIS_PLAN');
  asercje.equal(wiadomosc.plan[0].queueContext,wynik.queueContext);
  asercje.equal(otwieranie.utworzPlanOtwierania(wiadomosc.plan).doOtwarcia[0].eventUrl,'https://eventis.pl/event/edit/123');
});
test('ponowna weryfikacja nie usuwa ręcznego przypisania',async()=>{
  const pozycja=odtworz();
  const stan={rozstrzygniecia:[pozycja],decyzje:{klucz:pozycja},ogloszenia:[],skanowanie:{trwa:false,liczbaZapytan:0},preflight:{pokolenie:0,wyniki:{}}};
  await funkcja('async function uruchomPreflight','async function ustawDecyzjeKompletnych',{
    odswiezDopasowaniaZListy:()=>new Set(),
    NARZEDZIA_LISTY:lista,pobierzOgloszeniaPrzezPoleWyszukiwania:async()=>({ogloszenia:[],liczbaZapytan:0}),
    stan,aktualneRozstrzygniecie:()=>stan.decyzje.klucz,kluczRozstrzygniecia:()=> 'klucz',
    sprawdzTerminyWydarzenia:async()=>({status:'NEEDS_ATTENTION'}),renderuj:()=>{},odswiezPlanOtwarcia:async()=>{}
  })(new Set(['klucz']));
  asercje.equal(stan.decyzje.klucz,pozycja);
  asercje.equal(stan.rozstrzygniecia[0],pozycja);
});
test('render zachowuje scroll kontenera i pozycję karty mimo zmiany wysokości nad nią',()=>{
  const kontener={scrollTop:480,getBoundingClientRect:()=>({top:100})};
  let przesuniecie=0;
  const szczegoly={open:true};
  const karta={dataset:{kluczKarty:'klucz'},getBoundingClientRect:()=>({top:80+przesuniecie,bottom:300+przesuniecie})};
  const kontekst={$:()=>kontener,$$:(selektor)=>selektor==='details'?[szczegoly]:[karta]};
  const widok=funkcja('function zapamietajWidok','function przywrocWidok',kontekst)({});
  kontener.scrollTop=0; szczegoly.open=false; przesuniecie=60;
  funkcja('function przywrocWidok','function renderuj()',kontekst)({},widok);
  asercje.equal(kontener.scrollTop,540);
  asercje.equal(szczegoly.open,true);
});
test('akcje serwisowe są poza details na każdej karcie i zmiana uruchamia dotychczasowy wybór',()=>{
  const fragment=kod.slice(kod.indexOf('  function renderujPozycjeSzkolenia'),kod.indexOf('  function renderujWyniki'));
  asercje.match(fragment,/\$\{renderujPreflight\(aktualna\)\}<div[^]*data-preflight-retry[^]*Sprawdź ponownie[^]*data-zmien-mapowanie[^]*Zmień przypisane/);
  asercje.doesNotMatch(kod,/Zmień przypisane wydarzenie/);
  asercje.match(kod,/status:"AMBIGUOUS",selectedCandidate:null,reason:"CHANGE_MAPPING"/);
  asercje.match(kod,/\["NOT_FOUND","AMBIGUOUS"\]\.includes\(pozycja.status\)/);
});

test('stary wynik innego wydarzenia nie uruchamia uzupełniania',async()=>{
  const wiadomosc=await kliknij(odtworz(),{eventId:'999',status:'MISSING_TERMS',queueContext:{}});
  asercje.equal(wiadomosc.type,'OTWORZ_EVENTIS_RECZNIE');
});
test('ręczne otwarcie sprawdza URL i ID oraz wywołuje chrome.tabs.create',async()=>{
  const tlo=pliki.readFileSync(require.resolve('../background.js'),'utf8');
  const poczatek=tlo.indexOf('      case "OTWORZ_EVENTIS_RECZNIE": {');
  const koniec=tlo.indexOf('      case "OPEN_EVENTIS_PLAN": {',poczatek);
  let otwarty;
  async function wykonaj(url,eventId) {
    return maszyna.runInNewContext('(async()=>{switch(message.type){'+tlo.slice(poczatek,koniec)+'}})()',{
      URL,message:{type:'OTWORZ_EVENTIS_RECZNIE',url,eventId},OTWIERANIE_WYDARZEN:otwieranie,
      chrome:{tabs:{create:async dane=>{otwarty=dane;}}},sendResponse:()=>{}
    });
  }
  await wykonaj('https://eventis.pl/event/edit/123?esyncSession=stara','123');
  asercje.equal(otwarty.url,'https://eventis.pl/event/edit/123');
  asercje.equal(otwarty.active,true);
  await asercje.rejects(wykonaj('https://eventis.pl/event/edit/123','999'));
  await asercje.rejects(wykonaj('https://przyklad.pl/event/edit/123','123'));
});
