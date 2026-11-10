"use strict";
const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const {chromium:przegladarkaChromium} = require("playwright");

function utworzWorker({obslugiwany = true,bladOtwarcia = false,zdarzeniaNatywne = true,zapis = {},opcjePanelu = []} = {}) {
  let obsluga;
  const przekazane = [];
  const otwarcia = [];
  const zdarzenia = {};
  const karta = {id:17,windowId:1,url:"https://eventis.pl/company"};
  const okno = {id:1,focused:true};
  const zapytania = [];
  const chrome = {
    runtime:{getURL:sciezka=>`chrome-extension://test/${sciezka}`,onConnect:{addListener:funkcja=>zdarzenia.polaczenie=funkcja},onInstalled:{addListener(){}},onMessage:{addListener(funkcja){obsluga=funkcja;}}},
    storage:{local:{get:async klucz=>klucz === "eventisTrybPanelu" ? {eventisTrybPanelu:zapis.eventisTrybPanelu || "boczny"} : {},remove:async()=>{},set:async dane=>Object.assign(zapis,dane)}},
    action:{enable:async identyfikator=>zdarzenia.akcja={identyfikator,dostepna:true},disable:async identyfikator=>zdarzenia.akcja={identyfikator,dostepna:false},onClicked:{addListener:funkcja=>zdarzenia.klikniecie=funkcja}},
    tabs:{onRemoved:{addListener:funkcja=>{const poprzednia=zdarzenia.usuniecie;zdarzenia.usuniecie=(...argumenty)=>{poprzednia?.(...argumenty);funkcja(...argumenty);};}},onUpdated:{addListener:funkcja=>{const poprzednia=zdarzenia.aktualizacja;zdarzenia.aktualizacja=(...argumenty)=>{poprzednia?.(...argumenty);funkcja(...argumenty);};}},onActivated:{addListener:funkcja=>{const poprzednia=zdarzenia.aktywacja;zdarzenia.aktywacja=(...argumenty)=>{poprzednia?.(...argumenty);funkcja(...argumenty);};}},get:async()=>({...karta}),query:async opcje=>{zapytania.push(opcje);return [{...karta}];},sendMessage:async (id,wiadomosc)=>{if(wiadomosc.type!=="ODSWIEZ_AKTYWNOSC_PANELU") przekazane.push({id,wiadomosc});return {ok:true,html:"widok"};}},
    windows:{getLastFocused:async()=>okno,onFocusChanged:{addListener:funkcja=>zdarzenia.fokus=funkcja}},
    sidePanel:obslugiwany ? {onOpened:zdarzeniaNatywne ? {addListener:funkcja=>zdarzenia.otwarcie=funkcja} : undefined,onClosed:zdarzeniaNatywne ? {addListener:funkcja=>zdarzenia.zamkniecie=funkcja} : undefined,getOptions:async ({tabId:identyfikator})=>opcjePanelu.findLast(opcje=>opcje.tabId===identyfikator),setOptions:async opcje=>opcjePanelu.push(opcje),open:async opcje=>{otwarcia.push(opcje);if(bladOtwarcia) throw Error("Brak gestu użytkownika");}} : undefined
  };
  maszyna.runInNewContext(pliki.readFileSync(require.resolve("../background.js"),"utf8"),{
    chrome,URL,importScripts(){},EventisSyncConfig:{DEFAULT_SETTINGS:{}},KlientMostuArkuszaEventis:{},console
  });
  return {chrome,zapis,przekazane,otwarcia,opcjePanelu,zdarzenia,karta,okno,zapytania,wyslij:(wiadomosc,nadawca={url:chrome.runtime.getURL("sidepanel.html")})=>new Promise(rozwiaz=>obsluga(wiadomosc,nadawca,rozwiaz))};
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
    ["http://eventis.pl/",false],
    ["https://eventis.pl@obcy.pl/",false],
    ["https://obcyeventis.pl/",false],
    ["https://www.szkolenia-semper.pl/",false],
    ["https://szkoleniaiist.com.pl/",false],
    ["niepoprawny adres",false],
    ["https://eventis.pl",true],
    ["https://eventis.pl/",true],
    ["https://eventis.pl/szkolenia",true],
    ["https://eventis.pl/company/settings",true],
    ["https://eventis.pl/event/edit/123",true],
    ["https://www.eventis.pl/event/add",true]
  ]) {
    worker.karta.url=adres;
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

test("natywny panel pobiera kartę własnego okna",async () => {
  const worker = utworzWorker();
  const wynik = await worker.wyslij({type:"PRZEKAZ_DO_PANELU",identyfikatorOkna:42,wiadomosc:{type:"POBIERZ_WIDOK_PANELU"}});
  asercje.equal(wynik.ok,true);
  asercje.ok(worker.zapytania.some(zapytanie=>zapytanie.windowId === 42 && zapytanie.active === true));
});

test("powtarzane zdarzenia i restart workera zachowują konfigurację i nie otwierają panelu",async () => {
  const zapis = {eventisTrybPanelu:"plywajacy",settings:{operatorInitial:"K"}};
  const worker = utworzWorker({zapis});
  await new Promise(setImmediate);
  const liczba = worker.opcjePanelu.length;
  for (let proba=0;proba<8;proba++) {
    worker.zdarzenia.aktywacja({tabId:17});
    worker.zdarzenia.aktualizacja(17,{status:"complete"},worker.karta);
    worker.zdarzenia.fokus(1);
  }
  await new Promise(setImmediate);
  asercje.equal(worker.opcjePanelu.length,liczba);
  const ponowny = utworzWorker({zapis,opcjePanelu:worker.opcjePanelu});
  await new Promise(setImmediate);
  asercje.equal(ponowny.opcjePanelu.length,liczba);
  asercje.equal(ponowny.zapis.eventisTrybPanelu,"plywajacy");
  asercje.equal(ponowny.otwarcia.length,0);
  asercje.equal((await ponowny.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:ponowny.karta})).stan,"CLOSED");
});

test("pierwsza inicjalizacja zapisuje wyłącznie domyślną preferencję boczną",async () => {
  const zapis = {settings:{operatorInitial:"Z"},mappings:{wydarzenie:"123"}};
  const worker = utworzWorker({zapis});
  worker.chrome.storage.local.get=async()=>zapis;
  await new Promise(setImmediate);
  asercje.equal(zapis.eventisTrybPanelu,"boczny");
  asercje.deepEqual(zapis.settings,{operatorInitial:"Z"});
  asercje.deepEqual(zapis.mappings,{wydarzenie:"123"});
  asercje.equal(worker.otwarcia.length,0);
});

test("zdarzenia Chrome oraz cykl portu zmieniają widoczność, nigdy preferencję",async () => {
  const worker = utworzWorker({zapis:{eventisTrybPanelu:"boczny"}});
  await new Promise(setImmediate);
  const stan = async () => (await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:worker.karta})).stan;
  worker.zdarzenia.otwarcie({tabId:17,windowId:1});
  asercje.equal(await stan(),"OPEN");
  worker.zdarzenia.zamkniecie({tabId:17,windowId:1});
  asercje.equal(await stan(),"CLOSED");
  let wiadomosc,rozlacz;
  worker.zdarzenia.polaczenie({name:"panel-boczny",sender:{url:worker.chrome.runtime.getURL("sidepanel.html?karta=17")},postMessage(){},
    onMessage:{addListener:obsluga=>wiadomosc=obsluga},onDisconnect:{addListener:obsluga=>rozlacz=obsluga}});
  wiadomosc({identyfikatorKarty:17,widoczny:true});
  asercje.equal(await stan(),"OPEN");
  rozlacz();
  asercje.equal(await stan(),"CLOSED");
  asercje.equal(worker.zapis.eventisTrybPanelu,"boczny");
  asercje.equal(worker.przekazane.some(wpis=>wpis.wiadomosc.type==="ZAMKNIETO_PANEL_BOCZNY"),false);
  asercje.equal(worker.otwarcia.length,0);
});

test("bez zdarzeń nowszych niż Chrome 120 port odtwarza widoczność po restarcie",async () => {
  const worker = utworzWorker({zdarzeniaNatywne:false,zapis:{eventisTrybPanelu:"boczny"}});
  let wiadomosc;
  worker.zdarzenia.polaczenie({name:"panel-boczny",sender:{url:worker.chrome.runtime.getURL("sidepanel.html?karta=17")},postMessage(){},
    onMessage:{addListener:obsluga=>wiadomosc=obsluga},onDisconnect:{addListener(){}}});
  wiadomosc({identyfikatorKarty:17,widoczny:true});
  asercje.equal((await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:worker.karta})).stan,"OPEN");
  wiadomosc({identyfikatorKarty:17,widoczny:false});
  asercje.equal((await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:worker.karta})).stan,"CLOSED");
  asercje.equal(worker.zapis.eventisTrybPanelu,"boczny");
  asercje.equal(worker.otwarcia.length,0);
});

test("zmiana karty podczas pobierania odrzuca spóźnioną odpowiedź",async () => {
  const worker = utworzWorker();
  await new Promise(setImmediate);
  let dokoncz;
  worker.chrome.tabs.sendMessage=async (identyfikator,wiadomosc)=>wiadomosc.type === "POBIERZ_WIDOK_PANELU" ? new Promise(odpowiedz=>dokoncz=odpowiedz) : {ok:true};
  const wynik = worker.wyslij({type:"PRZEKAZ_DO_PANELU",identyfikatorOkna:1,wiadomosc:{type:"POBIERZ_WIDOK_PANELU"}});
  await new Promise(setImmediate);
  worker.karta.id=18;
  worker.zdarzenia.aktywacja({tabId:18});
  dokoncz({ok:true,html:"Poprzednie ogłoszenie"});
  asercje.equal((await wynik).ok,false);
});

test("brak identyfikatora akcji i panel przypisany innej karcie są odrzucane",async () => {
  const worker = utworzWorker();
  const wynik = await worker.wyslij({type:"PRZEKAZ_DO_PANELU",wiadomosc:{type:"AKCJA_PANELU"}});
  asercje.equal(wynik.ok,false);
  const innaKarta = await worker.wyslij({type:"PRZEKAZ_DO_PANELU",wiadomosc:{type:"POBIERZ_WIDOK_PANELU"}},
    {url:worker.chrome.runtime.getURL("sidepanel.html?karta=18")});
  asercje.equal(innaKarta.ok,false);
  asercje.equal(worker.przekazane.length,0);
});

test("wyścig konfiguracji i usunięcie karty nie przywracają nieaktualnych opcji",async () => {
  const worker = utworzWorker();
  await new Promise(setImmediate);
  const odczyt = worker.chrome.sidePanel.getOptions;
  let dokoncz;
  worker.chrome.sidePanel.getOptions=()=>new Promise(odpowiedz=>dokoncz=odpowiedz);
  worker.karta.url="https://google.com/";
  worker.zdarzenia.aktualizacja(17,{url:worker.karta.url},worker.karta);
  await new Promise(setImmediate);
  worker.karta.url="https://eventis.pl/event/edit/2";
  worker.zdarzenia.aktualizacja(17,{url:worker.karta.url},worker.karta);
  worker.chrome.sidePanel.getOptions=odczyt;
  dokoncz({enabled:true,path:"sidepanel.html?karta=17"});
  await new Promise(setImmediate);
  asercje.equal(worker.opcjePanelu.at(-1).enabled,true);
  worker.chrome.sidePanel.getOptions=()=>new Promise(odpowiedz=>dokoncz=odpowiedz);
  worker.karta.url="https://google.com/";
  worker.zdarzenia.aktualizacja(17,{url:worker.karta.url},worker.karta);
  await new Promise(setImmediate);
  worker.zdarzenia.usuniecie(17);
  dokoncz({enabled:true});
  await new Promise(setImmediate);
  asercje.equal(worker.opcjePanelu.at(-1).enabled,true);
});

test("host przywraca preferencję boczną, pokazuje przycisk i respektuje zamknięcie oraz wybór pływającego",async () => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  try {
    const strona = await przegladarka.newPage();
    await strona.setContent('<aside id="esync-root"><div class="esync-head"><div class="esync-head-actions"></div></div><textarea id="tekst"></textarea><button id="akcja">Analizuj</button></aside>');
    await strona.addStyleTag({path:"content/eventis.css"});
    await strona.evaluate(() => {
      window.wiadomosci=[];
      window.zmienTryb=null;
      window.obsluga=null;
      window.klikniecia=0;
      document.querySelector("#akcja").addEventListener("click",()=>window.klikniecia++);
      window.chrome={runtime:{id:"test",onMessage:{addListener:funkcja=>window.obsluga=funkcja},sendMessage:async()=>({obslugiwany:true,aktywny:true})},storage:{local:{get:async()=>({eventisTrybPanelu:"boczny"})},onChanged:{addListener:funkcja=>window.zmienTryb=funkcja}}};
    });
    await strona.addScriptTag({path:"shared/host-panelu.js"});
    await strona.waitForFunction(()=>document.querySelector("#esync-tryb-panelu"));
    asercje.equal(await strona.locator("#esync-root").isVisible(),false);
    asercje.equal(await strona.locator("#esync-tryb-panelu").isVisible(),true);
    await strona.evaluate(()=>window.zmienTryb({eventisTrybPanelu:{newValue:"boczny"}},"local"));
    asercje.equal(await strona.locator("#esync-root").isVisible(),false);
    const wynik = await strona.evaluate(() => {
      let widok;
      window.obsluga({type:"POBIERZ_WIDOK_PANELU"},{id:"test"},wynik=>widok=wynik);
      const elementy=Array.from(document.querySelectorAll('#esync-root button,#esync-root input,#esync-root textarea,#esync-root select,#esync-root details,#esync-root a'));
      let wynik;
      window.obsluga({type:"AKCJA_PANELU",kontekst:widok.kontekst,wersja:widok.wersja,indeks:elementy.indexOf(document.querySelector("#akcja")),zdarzenie:"click",wartosci:widok.wartosci.map((wpis,indeks)=>({...wpis,wartosc:elementy[indeks].id === "tekst" ? "rekord kolejki" : wpis.wartosc}))},{id:"test"},odpowiedz=>wynik=odpowiedz);
      let odrzucony;
      window.obsluga({type:"AKCJA_PANELU",kontekst:widok.kontekst,wersja:-1,indeks:0,zdarzenie:"click"},{id:"test"},odpowiedz=>odrzucony=odpowiedz);
      let staryDokument;
      window.obsluga({type:"AKCJA_PANELU",kontekst:"poprzedni dokument",wersja:widok.wersja,indeks:0,zdarzenie:"click"},{id:"test"},odpowiedz=>staryDokument=odpowiedz);
      return {wynik,odrzucony,staryDokument,klikniecia:window.klikniecia,tekst:document.querySelector("#tekst").value};
    });
    asercje.equal(wynik.wynik.ok,true);
    asercje.equal(wynik.odrzucony.ok,false);
    asercje.equal(wynik.staryDokument.ok,false);
    asercje.equal(wynik.klikniecia,1);
    asercje.equal(wynik.tekst,"rekord kolejki");
    asercje.equal(await strona.locator("#esync-root").isVisible(),false);
    await strona.evaluate(()=>window.obsluga({type:"ZAMKNIETO_PANEL_BOCZNY"},{id:"test"},()=>{}));
    asercje.equal(await strona.locator("#esync-root").isVisible(),false);
    asercje.equal(await strona.locator("#esync-tryb-panelu").isVisible(),true);
    await strona.evaluate(()=>window.obsluga({type:"WYBIERZ_PANEL_PLYWAJACY"},{id:"test"},()=>{}));
    asercje.equal(await strona.locator("#esync-root").isVisible(),true);
    await strona.evaluate(()=>{
      window.chrome.runtime.sendMessage=async()=>({obslugiwany:false,aktywny:true});
      document.querySelector("#esync-root").hidden=false;
    });
    await strona.addScriptTag({path:"shared/host-panelu.js"});
    await strona.waitForTimeout(20);
    asercje.equal(await strona.locator("#esync-root").isVisible(),true);
    await strona.evaluate(()=>document.querySelector("#esync-root").remove());
    await strona.addScriptTag({path:"shared/host-panelu.js"});
    asercje.equal(await strona.locator("#esync-root").isVisible(),true);
    asercje.match(await strona.locator("#esync-root").innerText(),/Przejdź do listy ogłoszeń/);
    await strona.locator("#esync-collapse").click();
    asercje.equal(await strona.locator("#esync-root .esync-body").isVisible(),false);
    await strona.evaluate(()=>document.body.appendChild(document.createElement("p")));
    asercje.equal(await strona.locator("#esync-root .esync-body").isVisible(),false);
    await strona.locator("#esync-collapse").click();
    asercje.equal(await strona.locator("#esync-root .esync-body").isVisible(),true);
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

test("aktywność wymaga aktywnej karty w oknie z fokusem",async () => {
  const worker = utworzWorker();
  asercje.equal((await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:worker.karta})).aktywny,true);
  asercje.equal((await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:{id:18}})).aktywny,false);
  worker.okno.focused=false;
  asercje.equal((await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:worker.karta})).aktywny,false);
  worker.okno.focused=true;
  asercje.equal((await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:worker.karta})).aktywny,true);
  worker.karta.url="https://gmail.com/";
  asercje.equal((await worker.wyslij({type:"CZY_AKTYWNY_KONTEKST_PANELU"},{tab:worker.karta})).aktywny,false);
});

test("ukrycie i przywrócenie hosta zachowuje formularz, kolejkę i zwinięcie",async () => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  try {
    const strona = await przegladarka.newPage();
    await strona.setContent('<aside id="esync-root" class="esync-collapsed"><div class="esync-head"></div><div class="esync-body"><details open><summary>Kolejka</summary><textarea>termin</textarea></details></div></aside>');
    await strona.addStyleTag({path:"content/eventis.css"});
    await strona.evaluate(() => {
      window.aktywny=true;
      window.chrome={runtime:{id:"test",onMessage:{addListener:funkcja=>window.obsluga=funkcja},sendMessage:async()=>({aktywny:window.aktywny,obslugiwany:true})},storage:{local:{get:async()=>({eventisTrybPanelu:"plywajacy"})},onChanged:{addListener(){}}}};
    });
    await strona.addScriptTag({path:"shared/host-panelu.js"});
    await strona.waitForFunction(()=>!document.querySelector('#esync-root').hidden);
    await strona.evaluate(()=>{window.aktywny=false;window.obsluga({type:"ODSWIEZ_AKTYWNOSC_PANELU"},{id:"test"},()=>{});});
    await strona.waitForFunction(()=>document.querySelector('#esync-root').hidden);
    await strona.evaluate(()=>{window.aktywny=true;window.obsluga({type:"ODSWIEZ_AKTYWNOSC_PANELU"},{id:"test"},()=>{});});
    await strona.waitForFunction(()=>!document.querySelector('#esync-root').hidden);
    asercje.equal(await strona.locator('textarea').inputValue(),"termin");
    asercje.equal(await strona.locator('details').evaluate(element=>element.open),true);
    asercje.equal(await strona.locator('#esync-root').evaluate(element=>element.classList.contains('esync-collapsed')),true);
    await strona.evaluate(()=>window.dispatchEvent(new Event('blur')));
    asercje.equal(await strona.locator('#esync-root').evaluate(element=>element.hidden),false);
    await strona.evaluate(()=>{
      window.odpowiedzi=[];
      window.chrome.runtime.sendMessage=()=>new Promise(odpowiedz=>window.odpowiedzi.push(odpowiedz));
      window.obsluga({type:'ODSWIEZ_AKTYWNOSC_PANELU'},{id:'test'},()=>{});
      window.obsluga({type:'ODSWIEZ_AKTYWNOSC_PANELU'},{id:'test'},()=>{});
      window.odpowiedzi[1]({aktywny:true});
      window.odpowiedzi[0]({aktywny:false});
    });
    await strona.waitForTimeout(20);
    asercje.equal(await strona.locator('#esync-root').evaluate(element=>element.hidden),false);
  } finally { await przegladarka.close(); }
});

test("panel usuwa kontekst także podczas edycji i ignoruje spóźniony widok",async () => {
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  try {
    const strona = await przegladarka.newPage();
    await strona.setContent('<nav><button id="plywajacy">Panel</button><span id="komunikat"></span></nav><aside id="esync-root"></aside>');
    await strona.evaluate(() => {
      window.przygotujWidok = identyfikator => ({ok:true,identyfikatorKarty:identyfikator,kontekst:`dokument-${identyfikator}`,wersja:1,
        html:`<input value="Ogłoszenie ${identyfikator}"><button>Wykonaj ${identyfikator}</button>`,wartosci:[{wartosc:`Ogłoszenie ${identyfikator}`},{}]});
      window.widok=window.przygotujWidok(17);
      window.akcje=[];
      window.chrome={runtime:{connect:()=>({onDisconnect:{addListener(){}},onMessage:{addListener:obsluga=>window.powiadom=obsluga},postMessage(){}}),sendMessage:async wiadomosc=>{
        if(wiadomosc.wiadomosc.type === "AKCJA_PANELU") {window.akcje.push(wiadomosc);return {ok:true};}
        if(window.opoznij) {window.opoznij=false;return new Promise(odpowiedz=>window.dokoncz=odpowiedz);}
        return window.widok;
      }}};
      window.setInterval=obsluga=>{window.odswiez=obsluga;};
    });
    await strona.addScriptTag({path:"sidepanel.js"});
    await strona.getByRole("button",{name:"Wykonaj 17",exact:true}).waitFor();
    await strona.locator("input").focus();
    await strona.evaluate(()=>{window.widok=window.przygotujWidok(18);window.powiadom({type:"ZMIANA_KONTEKSTU_PANELU"});});
    await strona.getByRole("button",{name:"Wykonaj 18",exact:true}).waitFor();
    asercje.equal(await strona.getByRole("button",{name:"Wykonaj 17",exact:true}).count(),0);
    await strona.evaluate(()=>{window.opoznij=true;window.odswiez();});
    await strona.waitForFunction(()=>typeof window.dokoncz === "function");
    await strona.evaluate(()=>{
      window.widok=window.przygotujWidok(19);
      window.powiadom({type:"ZMIANA_KONTEKSTU_PANELU"});
      window.dokoncz(window.przygotujWidok(18));
    });
    await strona.getByRole("button",{name:"Wykonaj 19",exact:true}).click();
    const [akcja] = await strona.evaluate(()=>window.akcje);
    asercje.equal(akcja.identyfikatorKarty,19);
    asercje.equal(akcja.wiadomosc.kontekst,"dokument-19");
    asercje.equal(await strona.getByRole("button",{name:"Wykonaj 18",exact:true}).count(),0);
  } finally { await przegladarka.close(); }
});
