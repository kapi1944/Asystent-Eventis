"use strict";
const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const {chromium:przegladarkaChromium} = require("playwright");

function utworzWorker({obslugiwany = true,bladOtwarcia = false} = {}) {
  let obsluga;
  const zapis = {};
  const przekazane = [];
  const otwarcia = [];
  const opcjePanelu = [];
  const zdarzenia = {};
  const karta = {id:17,url:"https://eventis.pl/company"};
  const chrome = {
    runtime:{getURL:sciezka=>`chrome-extension://test/${sciezka}`,onInstalled:{addListener(){}},onMessage:{addListener(funkcja){obsluga=funkcja;}}},
    storage:{local:{set:async dane=>Object.assign(zapis,dane)}},
    action:{onClicked:{addListener:funkcja=>zdarzenia.klikniecie=funkcja}},
    tabs:{onRemoved:{addListener(){}},onUpdated:{addListener:funkcja=>zdarzenia.aktualizacja=funkcja},onActivated:{addListener:funkcja=>zdarzenia.aktywacja=funkcja},get:async()=>karta,query:async()=>[karta],sendMessage:async (id,wiadomosc)=>{przekazane.push({id,wiadomosc});return {ok:true,html:"widok"};}},
    sidePanel:obslugiwany ? {setOptions:async opcje=>opcjePanelu.push(opcje),open:async opcje=>{otwarcia.push(opcje);if(bladOtwarcia) throw Error("Brak gestu użytkownika");}} : undefined
  };
  maszyna.runInNewContext(pliki.readFileSync(require.resolve("../background.js"),"utf8"),{
    chrome,importScripts(){},EventisSyncConfig:{DEFAULT_SETTINGS:{}},KlientMostuArkuszaEventis:{},console
  });
  return {zapis,przekazane,otwarcia,opcjePanelu,zdarzenia,karta,wyslij:(wiadomosc,nadawca={url:chrome.runtime.getURL("sidepanel.html")})=>new Promise(rozwiaz=>obsluga(wiadomosc,nadawca,rozwiaz))};
}

test("otwarcie panelu zapisuje tryb dopiero po sukcesie i pozostawia fallback bez API",async () => {
  const worker = utworzWorker();
  asercje.equal((await worker.wyslij({type:"OTWORZ_PANEL_BOCZNY"},{tab:worker.karta})).ok,true);
  asercje.equal(worker.zapis.eventisTrybPanelu,"boczny");
  asercje.equal(worker.otwarcia[0].tabId,17);
  for (const opcje of [{obslugiwany:false},{bladOtwarcia:true}]) {
    const worker = utworzWorker(opcje);
    asercje.equal((await worker.wyslij({type:"OTWORZ_PANEL_BOCZNY"},{tab:worker.karta})).ok,false);
    asercje.equal(worker.zapis.eventisTrybPanelu,undefined);
  }
});

test("panel jest dostępny tylko na kartach Eventis, także po zmianie adresu i aktywnej karty",async () => {
  const worker = utworzWorker();
  await new Promise(setImmediate);
  asercje.equal(worker.opcjePanelu[0].enabled,false);
  asercje.equal(worker.opcjePanelu[0].tabId,undefined);
  asercje.equal(worker.opcjePanelu.at(-1).tabId,17);
  asercje.equal(worker.opcjePanelu.at(-1).enabled,true);
  for (const [adres,dostepny] of [
    ["https://crm-semper.pl/crm/",false],
    ["chrome://extensions/",false],
    ["https://eventis.pl.obcy.pl/company",false],
    ["https://eventis.pl/",false],
    ["https://eventis.pl/event/edit/123",true],
    ["https://www.eventis.pl/event/add",true]
  ]) {
    worker.zdarzenia.aktualizacja(17,{url:adres},worker.karta);
    await new Promise(setImmediate);
    asercje.equal(worker.opcjePanelu.at(-1).enabled,dostepny,adres);
  }
  worker.karta.url="https://obcy.pl/";
  worker.zdarzenia.aktywacja({tabId:17});
  await new Promise(setImmediate);
  asercje.equal(worker.opcjePanelu.at(-1).enabled,false);
  worker.zdarzenia.klikniecie(worker.karta);
  asercje.equal((await worker.wyslij({type:"OTWORZ_PANEL_BOCZNY"},{tab:worker.karta})).ok,false);
  asercje.equal(worker.otwarcia.length,0);
  worker.karta.url="https://eventis.pl/company/listevents";
  worker.zdarzenia.aktywacja({tabId:17});
  await new Promise(setImmediate);
  asercje.equal(worker.opcjePanelu.at(-1).enabled,true);
  asercje.equal(worker.zapis.eventisTrybPanelu,undefined);
});

test("akcje panelu trafiają tylko do aktywnej karty Eventis; zmiana karty odrzuca stare akcje",async () => {
  const worker = utworzWorker();
  const akcja = {type:"PRZEKAZ_DO_PANELU",identyfikatorKarty:17,wiadomosc:{type:"AKCJA_PANELU",indeks:0}};
  asercje.equal((await worker.wyslij(akcja)).identyfikatorKarty,17);
  asercje.equal(worker.przekazane[0].id,17);
  asercje.equal(worker.przekazane[0].wiadomosc,akcja.wiadomosc);
  worker.karta.id=18;
  asercje.equal((await worker.wyslij(akcja)).ok,false);
  worker.karta.url="https://obcy.pl/company";
  asercje.equal((await worker.wyslij({type:"PRZEKAZ_DO_PANELU",wiadomosc:{type:"POBIERZ_WIDOK_PANELU"}})).ok,false);
  asercje.equal(worker.przekazane.length,1);
});

test("host ukrywa cały floating, odtwarza preferencję i przekazuje kliknięcie bez drugiej kolejki",async () => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  try {
    const strona = await przegladarka.newPage();
    await strona.setContent('<aside id="esync-root"><div class="esync-head-actions"></div><textarea id="tekst"></textarea><button id="akcja">Analizuj</button></aside>');
    await strona.addStyleTag({path:"content/eventis.css"});
    await strona.evaluate(() => {
      window.wiadomosci=[];
      window.zmienTryb=null;
      window.obsluga=null;
      window.klikniecia=0;
      document.querySelector("#akcja").addEventListener("click",()=>window.klikniecia++);
      window.chrome={runtime:{id:"test",onMessage:{addListener:funkcja=>window.obsluga=funkcja},sendMessage:async()=>({obslugiwany:true})},storage:{local:{get:async()=>({eventisTrybPanelu:"boczny"})},onChanged:{addListener:funkcja=>window.zmienTryb=funkcja}}};
    });
    await strona.addScriptTag({path:"shared/host-panelu.js"});
    await strona.waitForFunction(()=>document.querySelector("#esync-root").hidden);
    asercje.equal(await strona.locator("#esync-root").isVisible(),false);
    const wynik = await strona.evaluate(() => {
      let widok;
      window.obsluga({type:"POBIERZ_WIDOK_PANELU"},{id:"test"},wynik=>widok=wynik);
      const elementy=Array.from(document.querySelectorAll('#esync-root button,#esync-root input,#esync-root textarea,#esync-root select,#esync-root details,#esync-root a'));
      let wynik;
      window.obsluga({type:"AKCJA_PANELU",wersja:widok.wersja,indeks:elementy.indexOf(document.querySelector("#akcja")),zdarzenie:"click",wartosci:widok.wartosci.map((wpis,indeks)=>({...wpis,wartosc:elementy[indeks].id === "tekst" ? "rekord kolejki" : wpis.wartosc}))},{id:"test"},odpowiedz=>wynik=odpowiedz);
      let odrzucony;
      window.obsluga({type:"AKCJA_PANELU",wersja:-1,indeks:0,zdarzenie:"click"},{id:"test"},odpowiedz=>odrzucony=odpowiedz);
      return {wynik,odrzucony,klikniecia:window.klikniecia,tekst:document.querySelector("#tekst").value};
    });
    asercje.equal(wynik.wynik.ok,true);
    asercje.equal(wynik.odrzucony.ok,false);
    asercje.equal(wynik.klikniecia,1);
    asercje.equal(wynik.tekst,"rekord kolejki");
    await strona.evaluate(()=>window.zmienTryb({eventisTrybPanelu:{newValue:"plywajacy"}},"local"));
    asercje.equal(await strona.locator("#esync-root").isVisible(),true);
    await strona.evaluate(()=>{
      window.chrome.runtime.sendMessage=async()=>({obslugiwany:false});
      document.querySelector("#esync-root").hidden=false;
    });
    await strona.addScriptTag({path:"shared/host-panelu.js"});
    await strona.waitForTimeout(20);
    asercje.equal(await strona.locator("#esync-root").isVisible(),true);
    await strona.addStyleTag({path:"sidepanel.css"});
    await strona.evaluate(()=>{
      document.querySelector("#esync-root").innerHTML='<div class="esync-head"><div class="esync-head-text">Kolejka potwierdzonych terminów</div></div><div class="esync-body"><div class="esync-grid2"><input value="termin"><select><option>'+ 'długi tytuł '.repeat(30)+'</option></select></div><div class="esync-title">'+ 'Charakterystycznytytuł'.repeat(30)+'</div><button class="esync-btn">Otwórz i uzupełnij</button></div>';
    });
    for (const szerokosc of [280,350,450,700]) {
      await strona.setViewportSize({width:szerokosc,height:800});
      asercje.ok(await strona.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth));
    }
  } finally { await przegladarka.close(); }
});
