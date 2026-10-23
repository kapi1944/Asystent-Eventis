"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const sciezki = require("node:path");
const {chromium:przegladarkaChromium} = require("playwright");
const kodFormularza = pliki.readFileSync(require.resolve("../content/eventis.js"),"utf8");
const kodListy = pliki.readFileSync(require.resolve("../content/lista-eventis.js"),"utf8");

function fragment(kod, poczatek, koniec) {
  const indeks = kod.indexOf(poczatek);
  asercje.ok(indeks >= 0,poczatek);
  const ostatni = kod.indexOf(koniec,indeks);
  asercje.ok(ostatni > indeks,koniec);
  return kod.slice(indeks,ostatni);
}

test("regresje kolejki i kolorów w rzeczywistym DOM, bez połączeń sieciowych",async podtesty => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  podtesty.after(() => przegladarka.close());

  async function przygotuj(tryb = "edit") {
    const strona = await przegladarka.newPage();
    await strona.route("**/*",trasa => trasa.abort());
    await strona.setContent('<form id="eventForm"><input name="event[title]" value="Prawo pracy w praktyce"><label for="firma">Firma</label><input id="firma" value="SEMPER"><h3>Termin i miejsce wydarzenia</h3><div id="terminy"></div><button type="button" id="dodaj">Dodaj termin</button></form><aside id="esync-root"></aside>');
    await strona.addStyleTag({path:sciezki.resolve(__dirname,"../content/eventis.css")});
    for (const nazwa of ["wyszukiwanie","terminy","arkusz","kolejka-eventis","operacje-eventis","lista-eventis","mapowania-wydarzen-eventis","otwieranie-wydarzen-eventis"]) {
      await strona.addScriptTag({path:sciezki.resolve(__dirname,`../shared/${nazwa}.js`)});
    }
    await strona.addScriptTag({content:`
      const MODE = ${JSON.stringify(tryb)};
      const PAGE_LOAD_ID = "strona-testowa";
      const REGIONS = {Warszawa:7,Kraków:6,Gdańsk:11};
      const NARZEDZIA_WYSZUKIWANIA = NarzedziaWyszukiwaniaEventis;
      const NARZEDZIA_TERMINOW = NarzedziaTerminowEventis;
      const NARZEDZIA_ARKUSZA = NarzedziaArkuszaEventis;
      const NARZEDZIA_KOLEJKI = NarzedziaKolejkiEventis;
      const NARZEDZIA_OPERACJI = NarzedziaOperacjiEventis;
      const NARZEDZIA_LISTY = NarzedziaListyEventis;
      const MAPOWANIA_WYDARZEN = MapowaniaWydarzenEventis;
      const NARZEDZIA_OTWIERANIA = OtwieranieWydarzenEventis;
      const $ = (selektor,korzen=document) => korzen.querySelector(selektor);
      const $$ = (selektor,korzen=document) => Array.from(korzen.querySelectorAll(selektor));
      const esc = wartosc => String(wartosc ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
      const normalize = NARZEDZIA_WYSZUKIWANIA.normalizujTytul;
      const titleSimilarity = NARZEDZIA_WYSZUKIWANIA.ocenZgodnoscTytulow;
      const existingKey = NARZEDZIA_TERMINOW.existingKey;
      const termKey = NARZEDZIA_TERMINOW.termKey;
      const durationDays = NARZEDZIA_TERMINOW.durationDays;
      const getEventisTitle = () => $('[name="event[title]"]').value;
      const wykryjOrganizatora = () => ({organizator:$('#firma').value});
      const komunikaty = [];
      const toast = tekst => komunikaty.push(tekst);
      const sleep = () => Promise.resolve();
      let trwaRozstrzyganieZapisu = false;
      const magazyn = {pendingOperations:{},eventisImportQueue:[],sheetOutbox:[]};
      const storageGet = async () => magazyn;
      const storageSet = async dane => Object.assign(magazyn,dane);
      const audit = async () => {};
      const state = {organization:"SEMPER",organizatorWydarzenia:"SEMPER",eventisId:MODE === "add" ? "new:test" : "123",eventisTitle:getEventisTitle(),
        tabId:17,settings:{},zapis:{saveState:"IDLE"},source:{url:"https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,123.html"},
        sourceTerms:[],eventisImportQueue:[],zapisaneTerminyEventis:[],przypisaneRecznieBiezacejKarty:[],mappingVerifiedThisSession:true};
      const chrome = {runtime:{sendMessage:async wiadomosc => {
        if (wiadomosc.type === "CLAIM_PENDING_OPERATION") return NARZEDZIA_OPERACJI.uzyskajClaimOperacji({pobierz:async()=>magazyn.pendingOperations,zapisz:async dane=>{magazyn.pendingOperations=dane;}},wiadomosc.operation);
        throw Error("Nieoczekiwana wiadomość: " + wiadomosc.type);
      }}};
      const zapiszElementyKolejki = async zmiany => {
        magazyn.eventisImportQueue = NARZEDZIA_KOLEJKI.scalElementyKolejki(magazyn.eventisImportQueue,zmiany);
        state.eventisImportQueue = magazyn.eventisImportQueue;
      };
      const setValue = (pole,wartosc) => { if(pole) pole.value=wartosc; };
      const findAddTermButton = () => $('#dodaj');
      const uzupelnijDaneWydarzenia = async () => {};
      ${fragment(kodFormularza,"  function getExistingTerms()","  function compareTerms()")}
      ${fragment(kodFormularza,"  function fillTerm(","  async function uzupelnijDaneWydarzenia")}
      ${fragment(kodFormularza,"  function przygotujTerminDoKolejki(","  function czyTrwaZapis()")}
      ${fragment(kodFormularza,"  function czyTrwaZapis()","  async function zwolnijOczekujacaOperacje")}
      ${fragment(kodFormularza,"  async function sprawdzBrakOczekujacejOperacji","  let obserwatorZapisu")}
      ${fragment(kodFormularza,"  async function zaktualizujBiezacaKolejke","  async function reconcileBiezacejKolejki")}
      ${fragment(kodFormularza,"  function dopasowaniaKolejkiDoBiezacegoTytulu","  function deconfirmedExistingMatches")}
      ${fragment(kodFormularza,"  function statusyBiezacejKarty","  async function renderOutboxStatus")}
      ${fragment(kodFormularza,"  function renderujPrzyciskKolejki","  function render()")}
      ${fragment(kodFormularza,"  function renderTerm(","  function przelaczRecznePotwierdzenie")}
      ${fragment(kodFormularza,"  function bindUI()","  function observeTitleChanges()")}
      ${fragment(kodFormularza,"  async function confirmPendingSaved","  async function oznaczNieudanyZapis")}
      ${fragment(kodListy,"  async function zweryfikujReczneOgloszenie","  async function zapiszRozstrzygniecie")}
      const stan = {organizacja:"SEMPER",kolejka:[],preflight:{wyniki:{}},skanowanie:{},rekordy:[],reczneAdresySemper:{}};
      const kluczRozstrzygniecia = wpis => wpis.organization + '|' + wpis.normalizedSourceTitle;
      const aktualneRozstrzygniecie = wpis => wpis;
      const liczbyTerminow = () => ({potwierdzone:1,odpotwierdzone:0});
      const potwierdzoneTerminyTytulu = () => [];
      ${fragment(kodListy,"  async function sprawdzTerminyWydarzenia","  async function uruchomPreflight").replace("location.origin",'"https://eventis.pl"')}
      ${fragment(kodListy,"  function renderujPreflight","  function renderujWyniki()")}
      function render() {
        $('#esync-root').innerHTML = renderujPrzyciskKolejki();
        odswiezSekcjeKolejkiFormularza();
        bindUI();
      }
      let liczbaFormularzy = 0;
      $('#dodaj').addEventListener('click',() => {
        const numer = ++liczbaFormularzy;
        const wiersz = document.createElement('div');
        wiersz.id = 'li_eventdate_' + numer;
        wiersz.innerHTML = '<select id="eventdate_is_online_'+numer+'"><option value=""></option><option value="1">Online</option></select>' +
          '<input id="eventdate_datestart_'+numer+'"><input id="eventdate_dateend_'+numer+'">' +
          '<select name="eventDate['+numer+'][is_guaranteed]"><option value="1">Tak</option></select>' +
          '<input name="eventDate['+numer+'][prices][0][taxRate]"><input name="eventDate['+numer+'][prices][0][price]">' +
          '<textarea name="eventDate['+numer+'][online_description]"></textarea>';
        $('#terminy').appendChild(wiersz);
      });
      function ustawKolejke(statusy = ['PENDING','PENDING','PENDING']) {
        state.sourceTerms = [5,12,19].map(dzien => ({start:'2026-11-'+dzien.toString().padStart(2,'0'),end:'2026-11-'+dzien.toString().padStart(2,'0'),city:'Online',price:1000,confirmedOnSemper:false,confirmedByQueue:true}));
        state.eventisImportQueue = state.sourceTerms.map((termin,indeks) => ({...termin,id:'q'+indeks,queueItemId:'q'+indeks,recordKey:'rekord'+indeks,organization:'SEMPER',title:getEventisTitle(),normalizedTitle:normalize(getEventisTitle()),status:statusy[indeks] || 'PENDING',recordStatus:'CONFIRMED',participants:6}));
        magazyn.eventisImportQueue = state.eventisImportQueue;
        render();
      }
      ustawKolejke();
    `});
    return strona;
  }

  await podtesty.test("normalne i podwójne kliknięcie: jeden import, brak MouseEvent i duplikatów",async () => {
    const strona = await przygotuj();
    await strona.locator("#esync-add-queue-terms").evaluate(przycisk => {przycisk.click();przycisk.click();});
    await strona.waitForFunction(() => state.status === "FORM_FILLED");
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),3);
    asercje.deepEqual(await strona.evaluate(() => magazyn.eventisImportQueue.map(wpis => wpis.status)),Array(3).fill("WAITING_FOR_SAVE"));
    asercje.equal(await strona.locator('[data-status-zapisu="DONE"]').count(),0);
    await strona.close();
  });

  await podtesty.test("automatyczna lista ID, zapis A pozostawia B i C oczekujące",async () => {
    const strona = await przygotuj();
    await strona.evaluate(() => wprowadzTerminyZKolejki(['q0']));
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    await strona.evaluate(async () => {state.zapis={saveState:'SUCCESS'};await confirmPendingSaved('AUTO_SUCCESS_MARKER');});
    asercje.deepEqual(await strona.evaluate(() => magazyn.eventisImportQueue.map(wpis => wpis.status)),['DONE','PENDING','PENDING']);
    asercje.equal(await strona.locator('[data-status-zapisu="DONE"]').count(),1);
    await strona.evaluate(() => wprowadzTerminyZKolejki(['q0']));
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    await strona.close();
  });

  await podtesty.test("kolejne importy event/add zachowują wcześniejsze wiersze formularza",async () => {
    const strona=await przygotuj('add');
    await strona.evaluate(async()=>{await wprowadzTerminyZKolejki(['q0']);await wprowadzTerminyZKolejki(['q1']);});
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),2);
    asercje.deepEqual(await strona.locator('[id^="eventdate_datestart_"]').evaluateAll(pola=>pola.map(pole=>pole.value)),['2026-11-05','2026-11-12']);
    asercje.deepEqual(await strona.evaluate(()=>state.pendingOperation.queueItemIds),['q0','q1']);
    await strona.close();
  });

  await podtesty.test("wypełnienie i stary komunikat nie potwierdzają zapisu; nieudany zapis można ponowić",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {await wprowadzTerminyZKolejki(['q0']);await confirmPendingSaved('AUTO_SUCCESS_MARKER');});
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'WAITING_FOR_SAVE');
    await strona.evaluate(async () => {
      const operacja=state.pendingOperation;
      await zapiszElementyKolejki(NARZEDZIA_KOLEJKI.rozliczElementyOperacji(magazyn.eventisImportQueue,operacja,'ERROR','Zapis nieudany'));
      delete magazyn.pendingOperations[operacja.operationScopeKey];state.pendingOperation=null;
      await ponowKolejke('q0');await wprowadzTerminyZKolejki(['q0']);
    });
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'WAITING_FOR_SAVE');
    await strona.close();
  });

  await podtesty.test("lista nad sekcją terminów pokazuje wszystkie siedem stanów i uczestników",async () => {
    const strona = await przygotuj();
    await strona.evaluate(() => {
      const element=state.eventisImportQueue[0];
      state.eventisImportQueue=['PENDING','WAITING_FOR_SAVE','DONE','COMPLETED_EXISTING','ERROR','NEEDS_ATTENTION','SKIPPED'].map((status,indeks)=>({...element,id:'stan'+indeks,status}));render();
    });
    asercje.equal(await strona.locator('#esync-terminy-formularza [data-element-kolejki]').count(),7);
    asercje.match(await strona.locator('#esync-terminy-formularza').innerText(),/6 osób/);
    asercje.equal(await strona.locator('#esync-terminy-formularza').evaluate(element=>element.nextElementSibling.textContent),'Termin i miejsce wydarzenia');
    await strona.close();
  });

  await podtesty.test("panel rozróżnia obecność w niezapisanym formularzu od istniejącego terminu Eventis",async () => {
    const strona=await przygotuj();
    await strona.evaluate(()=>{
      state.reczniePotwierdzoneTerminy=new Set();
      $('#esync-root').innerHTML=renderTerm(state.sourceTerms[0],'waiting');
    });
    const etykieta=strona.locator('.esync-porownanie-terminu .esync-badge').filter({hasText:'EVENTIS:'});
    asercje.equal(await etykieta.getAttribute('class'),'esync-badge yellow');
    asercje.match(await etykieta.innerText(),/zapis niepotwierdzony/);
    await strona.close();
  });

  await podtesty.test("przycisk: fiolet, zieleń, brak gotowych, ładowanie, hover i focus",async () => {
    const strona = await przygotuj();
    const przycisk=strona.locator('#esync-add-queue-terms');
    asercje.equal(await przycisk.evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(147, 51, 234)');
    await przycisk.hover();
    asercje.equal(await przycisk.evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(126, 34, 206)');
    await przycisk.focus();
    asercje.equal(await przycisk.evaluate(element=>getComputedStyle(element).outlineStyle),'solid');
    await strona.evaluate(()=>{state.sourceTerms.forEach(termin=>termin.confirmedOnSemper=true);render();});
    asercje.equal(await przycisk.getAttribute('class'),'esync-btn esync-przycisk-kolejki good');
    await strona.evaluate(()=>{state.trwaWprowadzanieKolejki=true;render();});
    asercje.equal(await przycisk.isDisabled(),true);
    asercje.equal(await przycisk.getAttribute('aria-busy'),'true');
    await strona.evaluate(()=>{state.trwaWprowadzanieKolejki=false;state.eventisImportQueue=[];render();});
    asercje.equal(await przycisk.isDisabled(),true);
    await strona.close();
  });

  await podtesty.test("niezależne statusy źródła i ogłoszenia, kolory DOM oraz błędy techniczne",async () => {
    const strona = await przygotuj();
    for (const organizacja of ['SEMPER','IIST']) {
      for (const [statusZrodla,statusOgloszenia,klasaZrodla,klasaOgloszenia] of [
        ['NOT_FOUND','AUTO_MATCH','blue','green'],['FOUND','NOT_FOUND','green','red'],
        ['NOT_FOUND','NOT_FOUND','blue','red'],['FOUND','AUTO_MATCH','green','green'],
        ['AMBIGUOUS','AMBIGUOUS','yellow','yellow'],['ERROR','UNKNOWN','gray','gray'],['UNKNOWN','UNKNOWN','gray','gray']
      ]) {
        await strona.evaluate(({organizacja,statusZrodla,statusOgloszenia})=>{
          stan.organizacja=organizacja;stan.preflight.wyniki={};
          const pozycja={organization:organizacja,sourceTitle:'Prawo pracy',normalizedSourceTitle:'prawo pracy',status:statusOgloszenia,selectedCandidate:statusOgloszenia==='AUTO_MATCH'?{eventId:'123',title:'Prawo pracy',url:'https://eventis.pl/event/edit/123'}:null};
          stan.preflight.wyniki[kluczRozstrzygniecia(pozycja)]={statusZrodla,status:'UNVERIFIED'};
          $('#esync-root').innerHTML=renderujPozycjeSzkolenia(pozycja,0);
        },{organizacja,statusZrodla,statusOgloszenia});
        const znaczniki = strona.locator('.esync-pozycja-szkolenia > .esync-row > .esync-badge');
        asercje.match(await znaczniki.nth(0).getAttribute('class'),new RegExp(klasaZrodla));
        asercje.match(await znaczniki.nth(1).getAttribute('class'),new RegExp(klasaOgloszenia));
        if(statusZrodla==='NOT_FOUND') asercje.match(await znaczniki.nth(0).innerText(),/nie znaleziono szkolenia/);
      }
    }
    await strona.close();
  });

  await podtesty.test("bez źródła: jawna akceptacja, uzupełnienie ceny i kontrolowane dodanie w event/add i event/edit",async () => {
    for(const tryb of ['add','edit']) {
      const strona=await przygotuj(tryb);
      await strona.evaluate(()=>{state.source=null;state.sourceTerms=[];state.mappingVerifiedThisSession=false;state.statusZrodla='NOT_FOUND';state.eventisImportQueue=state.eventisImportQueue.slice(0,1);magazyn.eventisImportQueue=state.eventisImportQueue;render();});
      asercje.equal(await strona.locator('#esync-add-queue-terms').isDisabled(),true);
      await strona.locator('#esync-terminy-formularza summary').click();
      await strona.locator('[data-pole-terminu="price"]').fill('1200');
      await strona.locator('[data-zatwierdz-dane]').click();
      asercje.equal(await strona.locator('#esync-add-queue-terms').isDisabled(),true);
      await strona.locator('[data-zgoda-terminu]').check();
      await strona.locator('[data-zatwierdz-dane]').click();
      await strona.locator('#esync-add-queue-terms').click();
      await strona.waitForFunction(()=>state.status==='FORM_FILLED');
      asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
      asercje.equal(await strona.locator('input[name$="[price]"]').inputValue(),'1200');
      asercje.equal(await strona.locator('[data-status-zapisu="WAITING_FOR_SAVE"]').count(),1);
      await strona.close();
    }
  });

  await podtesty.test("brak mieszania organizatorów, podobnych tytułów i konfliktu DECONFIRMED",async () => {
    const strona=await przygotuj();
    await strona.evaluate(()=>{
      state.eventisImportQueue.push({...state.eventisImportQueue[0],id:'obce',organization:'IIST'},
        {...state.eventisImportQueue[0],id:'inny',normalizedTitle:'prawo podatkowe'},
        {...state.eventisImportQueue[0],id:'cofniety',recordStatus:'DECONFIRMED'});render();
    });
    asercje.equal(await strona.locator('[data-element-kolejki="obce"]').count(),0);
    asercje.equal(await strona.locator('[data-element-kolejki="inny"]').count(),0);
    asercje.equal(await strona.evaluate(()=>gotoweDopasowaniaKolejki().some(wpis=>wpis.element.id==='q0')),false);
    await strona.evaluate(async()=>{$('#firma').value='IIST';await wprowadzTerminyZKolejki(['q1']);});
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),0);
    await strona.close();
  });

  await podtesty.test("ręczny URL sprawdza rzeczywisty tytuł, organizatora i przekierowanie",async () => {
    const strona=await przygotuj();
    const wyniki=await strona.evaluate(async()=>{
      const propozycja=NARZEDZIA_LISTY.wybierzRecznyUrlEventis({organization:'SEMPER',sourceTitle:getEventisTitle(),normalizedSourceTitle:normalize(getEventisTitle())},'https://eventis.pl/event/edit/123');
      const wyniki=[];
      for(const [firma,tytul,url] of [['SEMPER',getEventisTitle(),'https://eventis.pl/event/edit/123'],['IIST',getEventisTitle(),'https://eventis.pl/event/edit/123'],['SEMPER','Kadry i płace','https://eventis.pl/event/edit/123'],['SEMPER',getEventisTitle(),'https://eventis.pl/event/edit/999']]) {
        window.fetch=async()=>({ok:true,url,text:async()=>'<form id="eventForm"><input name="event[title]" value="'+tytul+'"><label for="firma">Firma</label><input id="firma" value="'+firma+'"></form>'});
        try {wyniki.push(!!(await zweryfikujReczneOgloszenie(propozycja)).selectedCandidate);} catch(_) {wyniki.push(false);}
      }
      return wyniki;
    });
    asercje.deepEqual(wyniki,[true,false,false,false]);
    await strona.close();
  });

  await podtesty.test("zakończony brak SEMPER i awaria HTTP nie blokują niezależnego sprawdzenia Eventis",async () => {
    const strona=await przygotuj();
    for(const awaria of [false,true]) {
      const wynik=await strona.evaluate(async awaria=>{
        stan.kolejka=state.eventisImportQueue;stan.mapowania={};stan.ustawienia={mappingWarningThreshold:.9};
        chrome.runtime.sendMessage=async()=>({ok:!awaria,text:'null'});
        let sprawdzonoEventis=false;
        window.fetch=async adres=>{sprawdzonoEventis=true;return {ok:true,url:adres,text:async()=>'<form id="eventForm"></form>'};};
        const pozycja={organization:'SEMPER',sourceTitle:getEventisTitle(),normalizedSourceTitle:normalize(getEventisTitle()),status:'AUTO_MATCH',selectedCandidate:{eventId:'123',url:'https://eventis.pl/event/edit/123'}};
        const wynik=await sprawdzTerminyWydarzenia(pozycja);
        stan.preflight.wyniki[kluczRozstrzygniecia(pozycja)]=wynik;
        $('#esync-root').innerHTML=renderujPozycjeSzkolenia(pozycja,0);
        return {statusZrodla:wynik.statusZrodla,sprawdzonoEventis};
      },awaria);
      asercje.equal(wynik.statusZrodla,awaria?'ERROR':'NOT_FOUND');
      asercje.equal(wynik.sprawdzonoEventis,true);
      asercje.match(await strona.locator('.esync-pozycja-szkolenia > .esync-row > .esync-badge').nth(1).innerText(),/EVENTIS: znaleziono/);
      asercje.equal(await strona.locator('.esync-pozycja-szkolenia > .esync-row > .esync-badge').nth(0).getAttribute('class'),`esync-badge ${awaria?'gray':'blue'}`);
    }
    await strona.close();
  });
});
