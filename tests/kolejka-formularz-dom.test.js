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

  async function przygotuj(tryb = "edit", opcje = {}) {
    const strona = await przegladarka.newPage();
    await strona.route("**/*",trasa => trasa.abort());
    await strona.setContent(pliki.readFileSync(sciezki.resolve(__dirname,'fixtures/eventis-natywne-dodawanie.html'),'utf8'));
    await strona.addStyleTag({path:sciezki.resolve(__dirname,"../content/eventis.css")});
    for (const nazwa of ["wyszukiwanie","terminy","arkusz","kolejka-eventis","operacje-eventis","lista-eventis","mapowania-wydarzen-eventis","otwieranie-wydarzen-eventis"]) {
      await strona.addScriptTag({path:sciezki.resolve(__dirname,`../shared/${nazwa}.js`)});
    }
    await strona.addScriptTag({content:`
      const MODE = ${JSON.stringify(tryb)};
      const PAGE_LOAD_ID = "strona-testowa";
      const VERSION = "test";
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
        sourceTerms:[],missingTerms:[],eventisImportQueue:[],zapisaneTerminyEventis:[],przypisaneRecznieBiezacejKarty:[],mappingVerifiedThisSession:true};
      const chrome = {runtime:{sendMessage:async wiadomosc => {
        if (wiadomosc.type === "CLAIM_PENDING_OPERATION") return NARZEDZIA_OPERACJI.uzyskajClaimOperacji({pobierz:async()=>magazyn.pendingOperations,zapisz:async dane=>{magazyn.pendingOperations=dane;}},wiadomosc.operation);
        throw Error("Nieoczekiwana wiadomość: " + wiadomosc.type);
      }}};
      const zapiszElementyKolejki = async zmiany => {
        magazyn.eventisImportQueue = NARZEDZIA_KOLEJKI.scalElementyKolejki(magazyn.eventisImportQueue,zmiany);
        state.eventisImportQueue = magazyn.eventisImportQueue;
      };
      ${fragment(kodFormularza,"  function setValue(","  async function zweryfikujKarteSesjiOtwarcia")}
      const uzupelnijDaneWydarzenia = async () => {};
      ${fragment(kodFormularza,"  function getExistingTerms()","  function compareTerms()")}
      ${fragment(kodFormularza,"  function pobierzPolaTerminu(","  async function uzupelnijDaneWydarzenia")}
      ${fragment(kodFormularza,"  function przygotujTerminDoKolejki(","  function czyTrwaZapis()")}
      ${fragment(kodFormularza,"  function czyTrwaZapis()","  async function zwolnijOczekujacaOperacje")}
      ${fragment(kodFormularza,"  async function sprawdzBrakOczekujacejOperacji","  let obserwatorZapisu")}
      ${fragment(kodFormularza,"  async function zaktualizujBiezacaKolejke","  async function reconcileBiezacejKolejki")}
      ${fragment(kodFormularza,"  function dopasowaniaKolejkiDoBiezacegoTytulu","  function deconfirmedExistingMatches")}
      ${fragment(kodFormularza,"  function statusyBiezacejKarty","  async function renderOutboxStatus")}
      ${fragment(kodFormularza,"  function renderujPrzyciskKolejki","  function bindUI()")}
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
      const czyTerminPotwierdzony = termin => termin.effectiveConfirmed ?? termin.confirmedOnSemper ?? termin.confirmed;
      const renderujWeryfikacjeOtwartejKarty = () => '';
      const renderujAkcjeZrodla = () => '<div id="zrodlo-testowe" class="esync-card">Źródło szkolenia</div>';
      const renderMappingCard = () => '';
      const renderTermsCard = () => '';
      const renderPendingCard = () => '';
      const renderujBiezaceOgloszenie = () => '';
      ${fragment(kodFormularza,"  async function onAddMissing()","  async function switchOrganization")}
      const compareTerms = () => {state.missingTerms=state.sourceTerms.filter(termin => !getExistingTerms().some(wpis => existingKey(wpis) === existingKey(termin)));};
      const queueExistingTerms = () => {};
      const renderOutboxStatus = () => {};
      const wykonajAkcjePanelu = () => {};
      let liczbaFormularzy = 0;
      let opoznienieFormularza = 0;
      let opoznieniePol = 0;
      let brakFormularza = false;
      let liczbaKlikniec = 0;
      function dodajNatywnyFormularz() {
        const numer = ++liczbaFormularzy;
        const wiersz = document.createElement('li');
        wiersz.id = 'li_eventdate_' + numer;
        const pola = '<select id="eventdate_is_online_'+numer+'"><option value=""></option><option value="1">Online</option></select>' +
          '<input id="eventdate_datestart_'+numer+'"><input id="eventdate_dateend_'+numer+'">' +
          '<select name="eventDate['+numer+'][is_guaranteed]"><option value="1">Tak</option></select>' +
          '<input name="eventDate['+numer+'][prices][0][taxRate]"><input name="eventDate['+numer+'][prices][0][price]">' +
          '<textarea name="eventDate['+numer+'][online_description]"></textarea>' +
          '<input name="eventDate['+numer+'][prices][0][price_name]">' +
          '<input name="eventDate['+numer+'][info]"><input name="eventDate['+numer+'][city]">' +
          '<select name="eventDate['+numer+'][region_id]"><option value=""></option><option value="7">Mazowieckie</option><option value="6">Małopolskie</option></select>' +
          '<select id="price_contains_materials_type_select_'+numer+'_0"><option value="1">Online</option><option value="2">Druk</option></select>' +
          [1,2,3,4,5].map(wartosc => '<input type="checkbox" class="event_price_contains" value="'+wartosc+'">').join('');
        $('#terminy').appendChild(wiersz);
        if (opoznieniePol) setTimeout(() => {wiersz.innerHTML=pola;},opoznieniePol);
        else wiersz.innerHTML=pola;
        return wiersz;
      }
      $('#dodaj').addEventListener('click',() => {
        liczbaKlikniec++;
        if (brakFormularza) return;
        if (opoznienieFormularza) setTimeout(dodajNatywnyFormularz,opoznienieFormularza);
        else dodajNatywnyFormularz();
      });
      function ustawKolejke(statusy = ['PENDING','PENDING','PENDING']) {
        state.sourceTerms = [5,12,19].map(dzien => ({start:'2026-11-'+dzien.toString().padStart(2,'0'),end:'2026-11-'+dzien.toString().padStart(2,'0'),city:'Online',price:1000,confirmedOnSemper:false,confirmedByQueue:true}));
        state.eventisImportQueue = state.sourceTerms.map((termin,indeks) => ({...termin,id:'q'+indeks,queueItemId:'q'+indeks,recordKey:'rekord'+indeks,organization:'SEMPER',title:getEventisTitle(),normalizedTitle:normalize(getEventisTitle()),status:statusy[indeks] || 'PENDING',recordStatus:'CONFIRMED',participants:6}));
        magazyn.eventisImportQueue = state.eventisImportQueue;
        render();
      }
      ustawKolejke();
    `});
    if (opcje.rozpoznaj !== false) {
      await strona.evaluate(() => rozpoznajNatywneDodawanie());
      await strona.locator('#dodaj').click();
      await strona.waitForFunction(() => !state.trwaRozpoznawanieNatywne);
      asercje.equal(await strona.evaluate(() => findAddTermButton()?.id),'dodaj');
      await strona.evaluate(() => {$('#terminy').replaceChildren();liczbaFormularzy=0;liczbaKlikniec=0;render();});
    }
    return strona;
  }


  // Formularz testowy modeluje zdarzenia i przebudowę DOM; nie potwierdza kontraktu serwera Eventis.
  for (const tryb of ['add','edit']) {
    for (const wariant of ['brak','obecne','inne opcje','przebudowa']) {
      await podtesty.test(tryb + ': materiały ' + wariant + ' nie blokują terminów i zachowują wartości',async () => {
        const strona = await przygotuj(tryb);
        const wynik = await strona.evaluate(async wariant => {
          opoznienieFormularza=20;
          const pierwotneDodawanie=dodajNatywnyFormularz;
          dodajNatywnyFormularz=() => {
            const wiersz=pierwotneDodawanie();
            const przygotuj=() => {
              const materialy=wiersz.querySelector('select[id^="price_contains_materials"]');
              if(wariant==='brak') materialy.remove();
              else if(wariant==='obecne') {materialy.value='2';}
              else {materialy.innerHTML='<option value="9" selected>Wybór ręczny</option>';}
              wiersz.querySelectorAll('.event_price_contains').forEach(pole => {pole.checked=pole.value==='5';});
              if(wariant==='przebudowa') {
                wiersz.querySelector('textarea').remove();
                wiersz.addEventListener('change',zdarzenie => {
                  if(!zdarzenie.target.id.startsWith('eventdate_is_online_')) return;
                  wiersz.querySelectorAll('input[name$="[price]"],input[id^="eventdate_date"]').forEach(pole=>pole.remove());
                  setTimeout(() => {
                    wiersz.insertAdjacentHTML('beforeend','<textarea name="eventDate['+liczbaFormularzy+'][online_description]"></textarea><input name="eventDate['+liczbaFormularzy+'][prices][0][price]"><input id="eventdate_datestart_'+liczbaFormularzy+'"><input id="eventdate_dateend_'+liczbaFormularzy+'">');
                  },25);
                });
              }
            };
            przygotuj();
            return wiersz;
          };
          const terminy=[{start:'2026-11-04',end:'2026-11-06',city:'Online',price:1590},{start:'2026-11-07',end:'2026-11-08',city:'Kraków',price:1690}];
          const wynik=await addSelectedTerms(terminy);
          return {bledy:wynik.bledy,liczba:wynik.dodane.length,pola:$$('[id^="li_eventdate_"]').map(wiersz=>{
            const pola=pobierzPolaTerminu(wiersz);
            return [pola.poczatek.value,pola.koniec.value,pola.tryb.value,pola.miasto.value,pola.cena.value,wiersz.querySelector('select[id^="price_contains_materials"]')?.value || null,$$('.event_price_contains:checked',wiersz).map(pole=>pole.value)];
          })};
        },wariant);
        asercje.deepEqual(wynik.bledy,[]);
        asercje.equal(wynik.liczba,2);
        const materialy=wariant==='brak'?null:wariant==='obecne'?'2':'9';
        asercje.deepEqual(wynik.pola,[['2026-11-04','2026-11-06','1','','1590',materialy,['5']],['2026-11-07','2026-11-08','','Kraków','1690',materialy,['5']]]);
        await strona.close();
      });
    }
  }

  await podtesty.test("bez rozpoznanego przycisku: zero kliknięć przypadkowych odnośników i brak DONE",async () => {
    const strona = await przygotuj('edit',{rozpoznaj:false});
    await strona.evaluate(async () => {
      $('#dodaj').remove();
      window.obceKlikniecia=0;
      $('#niebieski-plus').addEventListener('click',() => window.obceKlikniecia++);
      $('#obcy-termin').addEventListener('click',() => window.obceKlikniecia++);
      await wprowadzTerminyZKolejki(['q0']);
    });
    asercje.equal(await strona.evaluate(() => window.obceKlikniecia),0);
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),0);
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'ERROR');
    asercje.match(await strona.evaluate(() => magazyn.eventisImportQueue[0].errorMessage),/Rozpoznaj natywne dodawanie/);
    asercje.equal(await strona.evaluate(() => state.pendingOperation),null);
    await strona.close();
  });

  await podtesty.test("rozpoznanie przyjmuje dopiero ręczne kliknięcie tworzące kompletny natywny formularz",async () => {
    const strona = await przygotuj('edit',{rozpoznaj:false});
    await strona.locator('#esync-kolejka-ogloszenia > summary').click();
    await strona.locator('#esync-rozpoznaj-dodawanie').click();
    asercje.equal(await strona.evaluate(() => findAddTermButton()),null);
    await strona.locator('#dodaj').click();
    await strona.waitForFunction(() => !state.trwaRozpoznawanieNatywne);
    asercje.equal(await strona.evaluate(() => findAddTermButton()?.id),'dodaj');
    await strona.evaluate(() => wprowadzTerminyZKolejki(['q0']));
    asercje.equal(await strona.evaluate(() => liczbaKlikniec),1);
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'WAITING_FOR_SAVE');
    await strona.close();
  });

  await podtesty.test("asynchroniczny wiersz i osobno doładowane pola są gotowe przed wypełnieniem",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {opoznienieFormularza=1100;opoznieniePol=150;await wprowadzTerminyZKolejki(['q0','q1']);});
    asercje.deepEqual(await strona.locator('[id^="eventdate_datestart_"]').evaluateAll(pola => pola.map(pole => pole.value)),['2026-11-05','2026-11-12']);
    asercje.deepEqual(await strona.evaluate(() => magazyn.eventisImportQueue.map(wpis => wpis.status)),['WAITING_FOR_SAVE','WAITING_FOR_SAVE','PENDING']);
    await strona.close();
  });

  await podtesty.test("brak nowego formularza kończy się błędem; ponowienie zachowuje tylko faktycznie dodane terminy",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {brakFormularza=true;await wprowadzTerminyZKolejki(['q0']);});
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'ERROR');
    asercje.match(await strona.evaluate(() => magazyn.eventisImportQueue[0].errorMessage),/nie utworzył nowego formularza/);
    asercje.equal(await strona.evaluate(() => state.pendingOperation),null);
    await strona.evaluate(async () => {brakFormularza=false;await ponowKolejke('q0');await wprowadzTerminyZKolejki(['q0']);});
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'WAITING_FOR_SAVE');
    await strona.close();
  });

  await podtesty.test("obserwator kończy się po sukcesie, przekroczeniu czasu, anulowaniu i zmianie kontekstu",async () => {
    const strona = await przygotuj();
    const wyniki = await strona.evaluate(async () => {
      const OryginalnyObserwator = window.MutationObserver;
      let aktywneObserwatory=0;
      window.MutationObserver=class extends OryginalnyObserwator {
        observe(...argumenty) {aktywneObserwatory++;super.observe(...argumenty);}
        disconnect() {aktywneObserwatory--;super.disconnect();}
      };
      const wyniki=[];
      for (const rodzaj of ['sukces','timeout','anulowanie','kontekst','niekompletny']) {
        const kontroler = new AbortController();
        const identyfikatory = new Set($$('[id^="li_eventdate_"]').map(wiersz => wiersz.id));
        try {
          await oczekujNaNatywnyFormularz(identyfikatory,state.sourceTerms[0],() => {
            if (rodzaj==='sukces') dodajNatywnyFormularz();
            if (rodzaj==='anulowanie') kontroler.abort();
            if (rodzaj==='niekompletny') {const wiersz=dodajNatywnyFormularz();wiersz.querySelector('textarea').remove();}
          },{sygnal:kontroler.signal,czas:35,czyAktualny:()=>rodzaj!=='kontekst'});
          wyniki.push({rodzaj,blad:'',aktywneObserwatory});
        } catch (blad) {wyniki.push({rodzaj,blad:blad.message,aktywneObserwatory});}
      }
      window.MutationObserver=OryginalnyObserwator;
      return wyniki;
    });
    asercje.deepEqual(wyniki.map(wynik => wynik.aktywneObserwatory),[0,0,0,0,0]);
    asercje.equal(wyniki[0].blad,'');
    asercje.match(wyniki[1].blad,/nie utworzył/);
    asercje.match(wyniki[2].blad,/Anulowano/);
    asercje.match(wyniki[3].blad,/Kontekst/);
    asercje.match(wyniki[4].blad,/opisOnline/);
    await strona.close();
  });

  await podtesty.test("błędne ceny i daty nie tworzą formularza, a brakujące pola nie są pobierane spoza wiersza",async () => {
    const strona = await przygotuj();
    const wyniki = await strona.evaluate(async () => {
      const wyniki=[];
      for (const cena of [null,'',' ',NaN,-1,'abc']) {
        const wynik=await addSelectedTerms([{...state.sourceTerms[0],price:cena}]);
        wyniki.push([wynik.dodane.length,wynik.bledy.length]);
      }
      const wynikDaty=await addSelectedTerms([{...state.sourceTerms[0],start:'2026-02-31'}]);
      const wiersz=dodajNatywnyFormularz();
      document.body.appendChild(wiersz.querySelector('[id^="eventdate_datestart_"]'));
      let blad='';
      try {fillTerm(wiersz,state.sourceTerms[0]);} catch (wyjatek) {blad=wyjatek.message;}
      return {wyniki,klikniecia:liczbaKlikniec,blad,bladDaty:wynikDaty.bledy.length,koniec:wiersz.querySelector('[id^="eventdate_dateend_"]').value};
    });
    asercje.deepEqual(wyniki.wyniki,Array.from({length:6},()=>[0,1]));
    asercje.equal(wyniki.klikniecia,0);
    asercje.equal(wyniki.bladDaty,1);
    asercje.equal(wyniki.koniec,'');
    asercje.match(wyniki.blad,/wymaganych pól/);
    await strona.close();
  });

  await podtesty.test("odrzucenie wartości przez Eventis przywraca pusty formularz i nie kończy kolejki",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {
      const wiersz=dodajNatywnyFormularz();
      natywneDodawanie.puste.set(wiersz,odciskPolTerminu(wiersz));
      const cena=wiersz.querySelector('input[name$="[price]"]');
      Object.defineProperty(cena,'value',{get:()=>'',set:()=>{},configurable:true});
      await wprowadzTerminyZKolejki(['q0']);
    });
    asercje.equal(await strona.locator('[id^="eventdate_datestart_"]').inputValue(),'');
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'ERROR');
    await strona.close();
  });

  await podtesty.test("termin zapisany jest rozliczany osobno, a import nie zmienia wcześniejszych wartości",async () => {
    const strona = await przygotuj();
    const przed = await strona.evaluate(() => {
      const wiersz=dodajNatywnyFormularz();fillTerm(wiersz,state.sourceTerms[0]);
      state.zapisaneTerminyEventis=getExistingTerms();return odciskPolTerminu(wiersz);
    });
    await strona.evaluate(() => wprowadzTerminyZKolejki());
    asercje.deepEqual(await strona.evaluate(() => magazyn.eventisImportQueue.map(wpis => wpis.status)),['COMPLETED_EXISTING','WAITING_FOR_SAVE','WAITING_FOR_SAVE']);
    asercje.equal(await strona.evaluate(() => odciskPolTerminu($('#li_eventdate_1'))),przed);
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),3);
    await strona.close();
  });

  await podtesty.test("termin niezapisanego formularza jest wiązany z operacją bez nowego kliknięcia i bez DONE",async () => {
    const strona = await przygotuj();
    await strona.evaluate(() => {
      fillTerm(dodajNatywnyFormularz(),state.sourceTerms[0]);
      state.eventisImportQueue=state.eventisImportQueue.slice(0,1);magazyn.eventisImportQueue=state.eventisImportQueue;render();
    });
    asercje.equal(await strona.locator('#esync-add-queue-terms').isDisabled(),false);
    await strona.locator('#esync-add-queue-terms').click();
    await strona.waitForFunction(() => state.status==='FORM_FILLED');
    asercje.equal(await strona.evaluate(() => liczbaKlikniec),0);
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'WAITING_FOR_SAVE');
    await strona.close();
  });

  await podtesty.test("przycisk pozwala rozliczyć jedyny już zapisany termin bez rozpoznawania i nowego wiersza",async () => {
    const strona=await przygotuj('edit',{rozpoznaj:false});
    await strona.evaluate(() => {
      fillTerm(dodajNatywnyFormularz(),state.sourceTerms[0]);state.zapisaneTerminyEventis=getExistingTerms();
      state.eventisImportQueue=state.eventisImportQueue.slice(0,1);magazyn.eventisImportQueue=state.eventisImportQueue;render();
    });
    asercje.equal(await strona.locator('#esync-add-queue-terms').isDisabled(),false);
    await strona.locator('#esync-add-queue-terms').click();
    await strona.waitForFunction(() => magazyn.eventisImportQueue[0].status==='COMPLETED_EXISTING');
    asercje.equal(await strona.evaluate(() => liczbaKlikniec),0);
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    await strona.close();
  });

  await podtesty.test("niekompletny niezapisany termin wymaga uwagi i nie jest oznaczany jako gotowy do zapisu",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {
      const wiersz=dodajNatywnyFormularz();fillTerm(wiersz,state.sourceTerms[0]);
      wiersz.querySelector('input[name$="[price]"]').value='';
      await wprowadzTerminyZKolejki(['q0']);
    });
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'NEEDS_ATTENTION');
    asercje.equal(await strona.evaluate(() => state.pendingOperation),null);
    await strona.close();
  });

  await podtesty.test("jawna akceptacja danych kolejki umożliwia import pomimo nieprawidłowej ceny źródła",async () => {
    const strona = await przygotuj();
    await strona.evaluate(() => {state.sourceTerms[0].price='abc';render();});
    await strona.locator('#esync-kolejka-ogloszenia > summary').click();
    await strona.locator('.esync-dane-terminu summary').click();
    await strona.locator('[data-pole-terminu="price"]').fill('1250');
    await strona.locator('[data-zgoda-terminu]').check();
    await strona.locator('[data-zatwierdz-dane]').click();
    await strona.evaluate(() => wprowadzTerminyZKolejki(['q0']));
    asercje.equal(await strona.locator('input[name$="[price]"]').inputValue(),'1250');
    asercje.equal(await strona.evaluate(() => magazyn.eventisImportQueue[0].status),'WAITING_FOR_SAVE');
    asercje.equal(await strona.evaluate(() => state.pendingOperation.expectedTerms[0].confirmedOnSemper),false);
    await strona.close();
  });

  await podtesty.test("oczekiwanie obejmuje również opcje kontrolek doładowane po utworzeniu wiersza",async () => {
    const strona = await przygotuj();
    const wynik=await strona.evaluate(async () => {
      const poczatkoweId=new Set();
      const wiersz=await oczekujNaNatywnyFormularz(poczatkoweId,state.sourceTerms[0],() => {
        const nowy=dodajNatywnyFormularz();
        const tryb=nowy.querySelector('[id^="eventdate_is_online_"]');
        tryb.replaceChildren();
        setTimeout(() => tryb.innerHTML='<option value="1">Online</option>',100);
      });
      return brakujacePolaTerminu(wiersz,state.sourceTerms[0]);
    });
    asercje.deepEqual(wynik,[]);
    await strona.close();
  });

  await podtesty.test("zapis jednego z kilku terminów operacji nie kończy pozostałych rekordów",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {
      await wprowadzTerminyZKolejki(['q0','q1']);$('#li_eventdate_2').remove();
      state.zapis={saveState:'SUCCESS'};await confirmPendingSaved('AUTO_SUCCESS_MARKER');
    });
    asercje.deepEqual(await strona.evaluate(() => magazyn.eventisImportQueue.map(wpis => wpis.status)),['DONE','NEEDS_ATTENTION','PENDING']);
    await strona.close();
  });

  await podtesty.test("potwierdzenie kolejki i potwierdzenie źródłowe zachowują osobne akcje oraz metadane",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {compareTerms();await onAddMissing();});
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),0);
    await strona.evaluate(async () => {state.sourceTerms[0].confirmedOnSemper=true;await wprowadzTerminyZKolejki(['q0']);});
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),1);
    asercje.equal(await strona.evaluate(() => state.pendingOperation.pochodzenie),'queue');
    asercje.equal(await strona.evaluate(() => state.pendingOperation.expectedTerms[0].confirmedOnSemper),true);
    await strona.close();
  });

  await podtesty.test("podwójny import źródła i kliknięcie kolejki nie uruchamiają równoległego dodawania",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {
      state.sourceTerms.forEach(termin => termin.confirmedOnSemper=true);
      opoznienieFormularza=50;
      await Promise.all([onAddMissing(),onAddMissing(),wprowadzTerminyZKolejki()]);
    });
    asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),3);
    asercje.equal(await strona.evaluate(() => liczbaKlikniec),3);
    asercje.equal(await strona.evaluate(() => state.pendingOperation.pochodzenie),'source');
    asercje.deepEqual(await strona.evaluate(() => magazyn.eventisImportQueue.map(wpis => wpis.status)),['PENDING','PENDING','PENDING']);
    await strona.close();
  });

  await podtesty.test("IIST, wielodniowy ONLINE i stacjonarny wariant pozostają niezależne",async () => {
    const strona = await przygotuj();
    await strona.evaluate(async () => {
      $('#firma').value='IIST';state.organization='IIST';state.organizatorWydarzenia='IIST';
      state.sourceTerms=[{...state.sourceTerms[0],end:'2026-11-07'}, {...state.sourceTerms[0],end:'2026-11-07',city:'Warszawa'}];
      state.eventisImportQueue=state.sourceTerms.map((termin,indeks)=>({...state.eventisImportQueue[0],...termin,id:'iist'+indeks,recordKey:'rekord-iist'+indeks,signature:'iist'+indeks,organization:'IIST'}));
      magazyn.eventisImportQueue=state.eventisImportQueue;
      await wprowadzTerminyZKolejki();
    });
    asercje.deepEqual(await strona.evaluate(() => getExistingTerms().map(termin => [termin.start,termin.end,termin.city])),[['2026-11-05','2026-11-07','Online'],['2026-11-05','2026-11-07','Warszawa']]);
    asercje.equal(await strona.locator('#esync-kolejka-ogloszenia [data-element-kolejki]').count(),2);
    asercje.equal(await strona.locator('select[name$="[region_id]"]').nth(1).inputValue(),'7');
    asercje.equal(await strona.locator('input[name$="[price_name]"]').nth(1).inputValue(),'szkolenie stacjonarne');
    await strona.close();
  });

  await podtesty.test("odświeżenie panelu zachowuje rozwinięcie, cenę i zgodę użytkownika",async () => {
    const strona = await przygotuj();
    await strona.evaluate(() => {state.sourceTerms=[];render();});
    await strona.locator('#esync-kolejka-ogloszenia > summary').click();
    await strona.locator('.esync-dane-terminu summary').first().click();
    await strona.locator('[data-pole-terminu="price"]').first().fill('1234.50');
    await strona.locator('[data-zgoda-terminu]').first().check();
    await strona.evaluate(() => render());
    asercje.equal(await strona.locator('[data-pole-terminu="price"]').first().inputValue(),'1234.50');
    asercje.equal(await strona.locator('[data-zgoda-terminu]').first().isChecked(),true);
    asercje.equal(await strona.locator('.esync-dane-terminu').first().getAttribute('open'),'');
    await strona.close();
  });

  await podtesty.test("ten sam DOM kolejki otwiera się przed źródłem w panelu pływającym i bocznym",async () => {
    const strona = await przygotuj();
    await strona.evaluate(() => {
      window.odbierzPanel=null;
      chrome.runtime.id='test';
      chrome.runtime.onMessage={addListener:obsluga => {window.odbierzPanel=obsluga;}};
      chrome.storage={onChanged:{addListener() {}}};
      chrome.runtime.sendMessage=async () => ({obslugiwany:true});
    });
    await strona.addScriptTag({path:sciezki.resolve(__dirname,'../shared/host-panelu.js')});
    const widok=await strona.evaluate(() => new Promise(odpowiedz => window.odbierzPanel({type:'POBIERZ_WIDOK_PANELU'},{id:'test'},odpowiedz)));
    asercje.equal(widok.ok,true);
    asercje.equal(await strona.locator('#esync-root').isHidden(),true);
    const panel=await przegladarka.newPage({viewport:{width:360,height:800}});
    await panel.route('**/*',trasa => trasa.abort());
    await panel.setContent('<nav><button id="plywajacy">Panel</button><span id="komunikat"></span></nav><aside id="esync-root"></aside>');
    await panel.addStyleTag({path:sciezki.resolve(__dirname,'../content/eventis.css')});
    await panel.addStyleTag({path:sciezki.resolve(__dirname,'../sidepanel.css')});
    await panel.evaluate(widok => {
      window.chrome={runtime:{sendMessage:async () => ({...widok,identyfikatorKarty:17})}};
      window.setInterval=()=>0;
    },widok);
    await panel.addScriptTag({path:sciezki.resolve(__dirname,'../sidepanel.js')});
    await panel.waitForSelector('#esync-kolejka-ogloszenia');
    asercje.equal(await panel.locator('#esync-root .esync-body > :first-child').getAttribute('id'),'esync-kolejka-ogloszenia');
    asercje.equal(await panel.locator('#esync-kolejka-ogloszenia').count(),1);
    asercje.equal(await panel.locator('#esync-kolejka-ogloszenia').evaluate(element => element.nextElementSibling.id),'zrodlo-testowe');
    asercje.equal(await panel.locator('#esync-kolejka-ogloszenia').evaluate(element => element.getBoundingClientRect().width <= 360),true);
    await panel.close();
    await strona.close();
  });

  await podtesty.test("licznik gotowych jest zgodny z przyciskiem także dla ERROR i NEEDS_ATTENTION",async () => {
    const strona=await przygotuj();
    for (const status of ['PENDING','ERROR','NEEDS_ATTENTION']) {
      await strona.evaluate(status=>{state.eventisImportQueue=state.eventisImportQueue.slice(0,1);state.eventisImportQueue[0].status=status;render();},status);
      const gotowe=status==='PENDING'?1:0;
      asercje.match(await strona.locator('#esync-kolejka-ogloszenia > summary').innerText(),new RegExp('Do dodania: '+gotowe));
      asercje.match(await strona.locator('#esync-add-queue-terms').innerText(),new RegExp('\\('+gotowe+'\\)'));
      asercje.equal(await strona.locator('#esync-add-queue-terms').isDisabled(),!gotowe);
    }
    await strona.evaluate(()=>{state.eventisImportQueue[0].status='PENDING';state.sourceTerms[0].price=null;render();});
    asercje.equal(await strona.locator('#esync-add-queue-terms').isDisabled(),true);
    asercje.match(await strona.locator('#esync-kolejka-ogloszenia').textContent(),/Brak poprawnej ceny/);
    await strona.close();
  });

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

  await podtesty.test("kolejka na górze panelu pokazuje siedem stanów i usuwa tylko dawną sekcję asystenta",async () => {
    const strona = await przygotuj();
    await strona.evaluate(() => {
      const element=state.eventisImportQueue[0];
      $('#eventForm').insertAdjacentHTML('afterbegin','<section id="esync-terminy-formularza" class="esync-card">Stara kolejka</section>');
      state.eventisImportQueue=['PENDING','WAITING_FOR_SAVE','DONE','COMPLETED_EXISTING','ERROR','NEEDS_ATTENTION','SKIPPED'].map((status,indeks)=>({...element,id:'stan'+indeks,status}));render();
    });
    asercje.equal(await strona.locator('#esync-terminy-formularza').count(),0);
    asercje.equal(await strona.locator('#esync-root .esync-body > :first-child').getAttribute('id'),'esync-kolejka-ogloszenia');
    asercje.equal(await strona.locator('#esync-kolejka-ogloszenia [data-element-kolejki]').count(),7);
    await strona.locator('#esync-kolejka-ogloszenia > summary').click();
    asercje.match(await strona.locator('#esync-kolejka-ogloszenia').innerText(),/6 osób/);
    asercje.equal(await strona.locator('#eventForm h3').innerText(),'Termin i miejsce wydarzenia');
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
    await strona.keyboard.press('Tab');
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
      await strona.locator('#esync-kolejka-ogloszenia > summary').click();
      await strona.locator('.esync-dane-terminu summary').click();
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
