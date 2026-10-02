"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const terminy = require("../shared/terminy");
const otwieranie = require("../shared/otwieranie-wydarzen-eventis");
const kolejka = require("../shared/kolejka-eventis");
const wyszukiwanie = require("../shared/wyszukiwanie");
const TYTUL_PRZYKLADU = "Ochrona powietrza w aspekcie organizacyjnym i prawnym z uwzględnieniem raportowania do KOBIZE. 2-dniowe szkolenie warsztatowe. Certyfikowane szkolenie online";
const termin = {start:"2026-10-05",end:"2026-10-06",city:"Online",price:1490,confirmed:false};
const element = {...termin,id:"kolejka-1",title:TYTUL_PRZYKLADU,normalizedTitle:wyszukiwanie.normalizujTytul(TYTUL_PRZYKLADU),organization:"SEMPER",city:"ONLINE",recordStatus:"CONFIRMED",status:"PENDING",participants:6};

function odczytajFunkcje(plik, poczatek, koniec, kontekst) {
  const kod = fs.readFileSync(require.resolve(plik),"utf8");
  return vm.runInNewContext(`${kod.slice(kod.indexOf(poczatek),kod.indexOf(koniec,kod.indexOf(poczatek)))}; ${poczatek.match(/function (\w+)/)[1]}`,kontekst);
}

test("natywny zapis bez zmian zachowuje przypisanie kolejki przed przeładowaniem", () => {
  const magazyn = {};
  const stan = {eventisId:"123",eventisTitle:"Inny wariant tytułu Eventis",zapis:{saveState:"IDLE"},weryfikacjaOtwartejKarty:{status:"VERIFIED",task:{normalizedSourceTitle:element.normalizedTitle}}};
  let obserwacje = 0;
  const rozpocznij = odczytajFunkcje("../content/eventis.js","function rozpocznijOczekiwanieNaZapis","async function zapiszFormularzZPanelu",{
    state:stan,normalize:wyszukiwanie.normalizujTytul,PAGE_LOAD_ID:"strona-1",location:{pathname:"/event/edit/123",search:""},
    KLUCZ_OCZEKUJACEGO_ZAPISU:"zapis",sessionStorage:{setItem:(klucz,wartosc)=>{magazyn[klucz]=wartosc;}},
    NARZEDZIA_OPERACJI:require("../shared/operacje-eventis"),diagnostykaZapisu:()=>{},rozpocznijObserwacjeZapisu:()=>{obserwacje++;}
  });
  let obsluga;
  const obserwuj = odczytajFunkcje("../content/eventis.js","function obserwujRecznyZapisFormularza","async function zapiszFormularzZPanelu",{
    $:()=>({addEventListener:(typ,obsluz)=>{assert.equal(typ,"submit");obsluga=obsluz;}}),rozpocznijOczekiwanieNaZapis:rozpocznij
  });
  obserwuj();
  obsluga();
  const zapis = JSON.parse(magazyn.zapis);
  assert.equal(zapis.normalizedSourceTitle,element.normalizedTitle);
  assert.equal(zapis.expectedOperation,"FORM_SAVE");
  assert.equal(stan.zapis.saveState,"WAITING_FOR_EVENTIS");
  obsluga();
  assert.equal(obserwacje,1);
  stan.zapis = {saveState:"IDLE"};
  stan.weryfikacjaOtwartejKarty.status = "MISMATCH";
  obsluga();
  assert.equal(JSON.parse(magazyn.zapis).normalizedSourceTitle,wyszukiwanie.normalizujTytul(stan.eventisTitle));
});

test("potwierdzony zapis kończy również istniejące terminy tej samej karty", async () => {
  for (const zOperacja of [false,true]) {
    let zapisane = [];
    const operacja = zOperacja ? {operationId:"operacja-1",organization:"SEMPER",queueItemIds:["nowy"],skipSheetOutbox:true,eventisIdAtStart:"123"} : null;
    const rekordy = [
      {...element,id:"nowy",status:zOperacja ? "WAITING_FOR_SAVE" : "PENDING",operationId:zOperacja ? "operacja-1" : null},
      {...element,id:"istniejacy",status:"COMPLETED_EXISTING"},
      {...element,id:"inne-szkolenie",normalizedTitle:"inne szkolenie"},
      {...element,id:"inna-organizacja",organization:"IIST"}
    ];
    const stan = {organization:"SEMPER",eventisId:"123",eventisTitle:"Wariant tytułu Eventis po przekierowaniu",pendingOperation:operacja,zapis:{pendingSave:{normalizedSourceTitle:element.normalizedTitle}}};
    const potwierdz = odczytajFunkcje("../content/eventis.js","async function confirmPendingSaved","async function oznaczNieudanyZapis",{
      state:stan,NARZEDZIA_KOLEJKI:kolejka,normalize:wyszukiwanie.normalizujTytul,
      storageGet:async()=>({eventisImportQueue:rekordy,pendingOperations:zOperacja ? {operacja} : {},sheetOutbox:[]}),
      storageSet:async()=>{},zapiszElementyKolejki:async zmiany=>{zapisane=zmiany;},audit:async()=>{},render:()=>{},toast:()=>{},
      kluczStorageOperacji:()=>"operacja",identyfikatorOperacji:wpis=>wpis?.operationId,
      eventisIdPoczatkowyOperacji:wpis=>wpis.eventisIdAtStart,getEventisTitle:()=>stan.eventisTitle,terminyOperacji:()=>[]
    });
    await potwierdz("AUTO_SUCCESS_MARKER");
    assert.deepEqual(Array.from(zapisane,wpis=>[wpis.id,wpis.status]),[["nowy","DONE"],["istniejacy","DONE"]]);
    assert.equal(stan.status,"SAVED");
    assert.equal(rekordy[2].status,"PENDING");
    assert.equal(rekordy[3].status,"PENDING");
  }
});

test("lista odświeża widoczne szkolenia po zapisie w innej karcie", async () => {
  let obslugaZmiany;
  let odtworzenia = 0;
  const stan = {};
  const inicjalizuj = odczytajFunkcje("../content/lista-eventis.js","async function inicjalizuj","  inicjalizuj().catch",{
    stan,chrome:{storage:{onChanged:{addListener:obsluga=>{obslugaZmiany=obsluga;}},local:{get:async()=>({eventisImportQueue:[],eventisQueueSchemaVersion:2})}},runtime:{sendMessage:async()=>({})}},
    NARZEDZIA_KOLEJKI:kolejka,KONFIGURACJA:{DEFAULT_SETTINGS:{}},MAPOWANIA_WYDARZEN:{KLUCZ_STORAGE_MAPOWAN:"mapowania",normalizujMagazynMapowan:()=>({})},
    wykryjOrganizacje:()=>"SEMPER",pobierzOgloszeniaZDokumentu:()=>[],
    odtworzAnalizeTrwalejKolejki:()=>{odtworzenia++;stan.widoczne=stan.kolejka.filter(wpis=>wpis.status!=="DONE");},
    odswiezPlanOtwarcia:async()=>{},renderuj:()=>{},console
  });
  await inicjalizuj();
  obslugaZmiany({eventisImportQueue:{newValue:[{...element,status:"DONE"}]}},"local");
  assert.equal(stan.widoczne.length,0);
  assert.equal(odtworzenia,2);
  obslugaZmiany({eventisImportQueue:{newValue:[element]}},"sync");
  assert.equal(stan.widoczne.length,0);
});

test("preflight weryfikuje pełny tytuł SEMPER mimo skróconych podpowiedzi i odrzuca niejednoznaczność", async () => {
  const tytul = "Kontrola i audyt inwestycji budowlanych w praktyce. Kompendium obowiązujących procedur -2 dniowe warsztaty szkoleniowe";
  const skrocony = "Kontrola i audyt inwestycji budowlanych w praktyce";
  assert.ok(wyszukiwanie.ocenZgodnoscTytulow(tytul,skrocony) < .90);
  assert.ok(wyszukiwanie.ocenZgodnoscTytulow(tytul,skrocony) > 0);
  for (const niejednoznaczny of [false,true]) {
    const pobraneStrony = [];
    const adresy = [123,456].map(numer => `https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,${numer}.html`);
    const sprawdz = odczytajFunkcje("../content/lista-eventis.js","async function sprawdzTerminyWydarzenia","async function uruchomPreflight",{
      NARZEDZIA_LISTY:require("../shared/lista-eventis"),NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,NARZEDZIA_TERMINOW:terminy,
      stan:{organizacja:"SEMPER",mapowania:{},kolejka:[],ustawienia:{mappingWarningThreshold:.90,mappingBlockThreshold:.70}},
      potwierdzoneTerminyTytulu:()=>[],URLSearchParams,console,
      chrome:{runtime:{sendMessage:async wiadomosc => {
        const dane = wiadomosc.payload;
        if (dane.url.includes("/__ajax/")) assert.equal(dane.headers["X-Requested-With"],"XMLHttpRequest");
        if (dane.url.endsWith("_ajax_szukaj.php")) return {ok:true,text:niejednoznaczny ? "null" : JSON.stringify({url:adresy[1]})};
        if (dane.url.endsWith("_ajax_szukaj_auto.php")) return {ok:true,text:adresy.map(adres => `<a href="${adres}">${skrocony}</a>`).join("")};
        pobraneStrony.push(dane.url);
        return {ok:true,finalUrl:dane.url,text:dane.url === adresy[0] || niejednoznaczny ? tytul : "Inne szkolenie dotyczące księgowości"};
      }}},
      DOMParser:class {parseFromString(tekst) {return {querySelector:()=>({textContent:tekst}),querySelectorAll:()=>[]};}}
    });
    const rozstrzygniecie = {sourceTitle:tytul,normalizedSourceTitle:wyszukiwanie.normalizujTytul(tytul)};
    if (niejednoznaczny) {
      await assert.rejects(sprawdz(rozstrzygniecie),/nie znaleziono jednoznacznej/);
    } else {
      const wynik = await sprawdz(rozstrzygniecie);
      assert.equal(wynik.queueContext.sourceUrl,adresy[0]);
      assert.equal(new Set(pobraneStrony).size,2);
      assert.equal(pobraneStrony.length,2);
    }
  }
});

test("lista odnajduje energetykę SEMPER przez AJAX i tytuł strony bez h1", async () => {
  const tytul = "Energetyka w samorządach 2026 - jak planować, finansować i realizować inwestycje z KPO i FEnIKS. 1-dniowe warsztaty szkoleniowe.";
  const tytulListy = `${tytul} Certyfikowane szkolenie online`;
  const adres = "https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,796.html";
  const sprawdz = odczytajFunkcje("../content/lista-eventis.js","async function sprawdzTerminyWydarzenia","async function uruchomPreflight",{
    NARZEDZIA_LISTY:require("../shared/lista-eventis"),NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,NARZEDZIA_TERMINOW:terminy,
    stan:{organizacja:"SEMPER",mapowania:{},kolejka:[],ustawienia:{mappingWarningThreshold:.90}},
    potwierdzoneTerminyTytulu:()=>[],URLSearchParams,console,
    chrome:{runtime:{sendMessage:async wiadomosc => {
      const dane = wiadomosc.payload;
      if (dane.url.includes("/__ajax/")) {
        if (dane.headers["X-Requested-With"] !== "XMLHttpRequest") return {ok:true,text:"null"};
        assert.equal(dane.method,"POST");
        assert.equal(new URLSearchParams(dane.body).get("opc"),"szukaj");
        return {ok:true,text:JSON.stringify({url:adres})};
      }
      return {ok:true,finalUrl:adres,text:tytul};
    }}},
    DOMParser:class {parseFromString(tekst) {return {querySelector:selektor=>selektor === "title" ? {textContent:tekst} : null,querySelectorAll:()=>[]};}}
  });
  const wynik = await sprawdz({sourceTitle:tytulListy,normalizedSourceTitle:wyszukiwanie.normalizujTytul(tytulListy)});
  assert.equal(wynik.queueContext.sourceUrl,adres);
});

test("1: kolejka potwierdza konkretny termin bez nadpisania SEMPER", () => {
  const wynik = terminy.scalPotwierdzeniaKolejki([termin],[element]);
  assert.equal(wynik.terms[0].confirmedByQueue,true);
  assert.equal(wynik.terms[0].confirmedOnSemper,false);
  assert.equal(wynik.terms[0].confirmed,false);
  assert.equal(wynik.terms[0].effectiveConfirmed,true);
  assert.equal(wynik.terms[0].confirmationSource,"queue");
  const porownanie = terminy.porownajPotwierdzoneTerminy(wynik.terms,[]);
  assert.equal(porownanie.effectiveConfirmedTerms.length,1);
  assert.equal(porownanie.matchingEventisTerms.length,0);
  assert.equal(porownanie.missingConfirmedTerms.length,1);
});

test("2: SEMPER i kolejka dają jeden termin bez duplikatu", () => {
  const wynik = terminy.scalPotwierdzeniaKolejki([termin,{...termin,confirmed:true}],[element,{...element,id:"kolejka-2",participants:9}]);
  assert.equal(wynik.effectiveConfirmedTerms.length,1);
  assert.equal(wynik.terms[0].confirmedOnSemper,true);
  assert.equal(wynik.terms[0].confirmedByQueue,true);
});

test("3: ONLINE, Online i Szkolenie online mają wspólną tożsamość bez ceny", () => {
  for (const miasto of ["ONLINE","Online","Szkolenie online"]) {
    const wynik = terminy.scalPotwierdzeniaKolejki([termin],[{...element,city:miasto,price:0,start:"05.10.2026",end:"06.10.2026"}]);
    assert.equal(wynik.terms[0].confirmedByQueue,true);
    assert.equal(kolejka.dopasujElementKolejkiDoTerminow({...element,city:miasto},[termin]).length,1);
  }
});

test("4: ONLINE nie pasuje do stacjonarnego terminu w Warszawie", () => {
  const wynik = terminy.scalPotwierdzeniaKolejki([{...termin,city:"Warszawa"}],[element]);
  assert.equal(wynik.terms[0].confirmedByQueue,false);
  assert.equal(wynik.status,"NEEDS_ATTENTION");
});

test("5: preflight /company odczytuje SEMPER także bez wydarzenia Eventis", async () => {
  const zapytania = [];
  const wiersz = {textContent:"2026-10-05 do 2026-10-06 Online 1490 zł",children:[{textContent:"2026-10-05 do 2026-10-06"},{textContent:"Online"},{textContent:"2 dni"},{textContent:"1490 zł"}],querySelector:()=>null};
  const sprawdz = odczytajFunkcje("../content/lista-eventis.js","async function sprawdzTerminyWydarzenia","async function uruchomPreflight",{
    NARZEDZIA_LISTY:require("../shared/lista-eventis"),NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,NARZEDZIA_TERMINOW:terminy,
    stan:{organizacja:"SEMPER",mapowania:{},kolejka:[element],ustawienia:{mappingWarningThreshold:0.8}},
    potwierdzoneTerminyTytulu:()=>[],URLSearchParams,console,
    chrome:{runtime:{sendMessage:async wiadomosc => {
      zapytania.push(wiadomosc.payload);
      return wiadomosc.payload.method === "POST"
        ? {ok:true,text:JSON.stringify({url:"https://www.szkolenia-semper.pl/component/trainings/details/ochrona-powietrza,123,html"})}
        : {ok:true,finalUrl:wiadomosc.payload.url,text:"strona"};
    }}},
    DOMParser:class {parseFromString() {return {querySelector:()=>({textContent:element.title}),querySelectorAll:()=>[wiersz]};}}
  });
  const wynik = await sprawdz({sourceTitle:element.title,normalizedSourceTitle:element.normalizedTitle});
  assert.equal(zapytania.length,2);
  assert.equal(wynik.reconciliation.terms[0].confirmedByQueue,true);
  assert.equal(wynik.missingConfirmedTerms.length,1);
  assert.equal(wynik.queueContext.targetEventisId,"");
});

async function otworzNowaKarte() {
  const magazyn = {};
  const karty = [];
  const pozycja = {sourceTitle:element.title,normalizedSourceTitle:element.normalizedTitle,organization:"SEMPER",status:"CREATE_NEW",selectedCandidate:{url:"https://eventis.pl/event/add",matchType:"CREATE_NEW"},queueItemIds:[element.id],queueContext:{canonicalTitle:element.normalizedTitle,queueTerms:[element],sourceUrl:"https://www.szkolenia-semper.pl/component/trainings/details/ochrona-powietrza,123,html",confirmationSource:"queue"}};
  const otworz = odczytajFunkcje("../background.js","async function otworzPlanEventis","async function fetchText",{
    przygotujPlanOtwieraniaEventis:async pozycje => otwieranie.utworzPlanOtwierania(pozycje),
    identyfikatorSesjiOtwarcia:()=>"sesja-1",OTWIERANIE_WYDARZEN:otwieranie,URL,
    chrome:{storage:{local:{get:async()=>magazyn,set:async dane=>Object.assign(magazyn,JSON.parse(JSON.stringify(dane)))}},tabs:{create:async karta=>karty.push(karta)}}
  });
  await otworz([pozycja],"SEMPER");
  return {magazyn,karta:karty[0]};
}

function odtworzKarte(magazyn,karta) {
  const parametry = new URL(karta.url).searchParams;
  const sesja = magazyn.eventisOpeningSessions[parametry.get("esyncSession")];
  const wynik = otwieranie.zweryfikujOtwartaKarte(sesja,{sessionId:parametry.get("esyncSession"),taskId:parametry.get("esyncTask"),organization:"SEMPER",eventUrl:karta.url,eventTitle:element.title},null);
  assert.equal(wynik.status,"VERIFIED");
  const przypisane = kolejka.przypiszElementyDoZadania(wynik.task.queueContext.queueTerms,{...wynik.task,status:wynik.status},"SEMPER");
  return terminy.scalPotwierdzeniaKolejki([termin],przypisane);
}

test("6: nowa karta dostaje parametry sesji i potwierdzenie kolejki", async () => {
  const {magazyn,karta} = await otworzNowaKarte();
  assert.equal(odtworzKarte(magazyn,karta).effectiveConfirmedTerms.length,1);
  assert.equal(magazyn.eventisOpeningSessions["sesja-1"].tasks[0].queueContext.confirmationSource,"queue");
});

test("7: reload odtwarza potwierdzenie z trwałej sesji", async () => {
  const {magazyn,karta} = await otworzNowaKarte();
  const odtworzonyMagazyn = JSON.parse(JSON.stringify(magazyn));
  assert.equal(odtworzKarte(odtworzonyMagazyn,karta).terms[0].confirmedByQueue,true);
});

test("8: brak terminu SEMPER wymaga uwagi i nie tworzy fikcyjnego terminu", () => {
  const wynik = terminy.scalPotwierdzeniaKolejki([],[element]);
  assert.equal(wynik.status,"NEEDS_ATTENTION");
  assert.equal(wynik.unmatchedQueueTerms[0].id,element.id);
  assert.equal(wynik.effectiveConfirmedTerms.length,0);
});

test("9: odpotwierdzenie nie promuje i zgłasza konflikt bez usuwania SEMPER", () => {
  const odpotwierdzony = {...element,recordStatus:"DECONFIRMED"};
  assert.equal(terminy.scalPotwierdzeniaKolejki([termin],[odpotwierdzony]).terms[0].confirmedByQueue,false);
  const wynik = terminy.scalPotwierdzeniaKolejki([{...termin,confirmed:true}],[odpotwierdzony,element]);
  assert.equal(wynik.terms[0].confirmedByQueue,false);
  assert.equal(wynik.terms[0].confirmedOnSemper,true);
  assert.equal(wynik.status,"NEEDS_ATTENTION");
});

test("10: ręczne potwierdzenie spoza kolejki nadal działa i można je cofnąć", () => {
  const reczne = new Set([terminy.termKey(termin)]);
  const wynik = terminy.scalPotwierdzeniaKolejki([termin],[],reczne);
  assert.equal(wynik.terms[0].confirmedManually,true);
  assert.equal(wynik.effectiveConfirmedTerms.length,1);
  assert.equal(terminy.scalPotwierdzeniaKolejki(wynik.terms,[],new Set()).effectiveConfirmedTerms.length,0);
});

test("pominięta kolejka nie potwierdza, a czterodniowy zakres korzysta z dat źródłowych", () => {
  assert.equal(terminy.scalPotwierdzeniaKolejki([termin],[{...element,status:"SKIPPED"}]).effectiveConfirmedTerms.length,0);
  const czterodniowy = {...terminy.zastosujReguleCzterodniowegoTerminu("2026-10-05","2026-10-08","Online",1490),confirmed:false};
  assert.equal(terminy.scalPotwierdzeniaKolejki([czterodniowy],[{...element,end:"2026-10-08"}]).terms[0].confirmedByQueue,true);
});

test("content/eventis.js odtwarza nową sesję i automatycznie porównuje termin po każdym reloadzie", async () => {
  const {magazyn,karta} = await otworzNowaKarte();
  for (let proba = 0; proba < 2; proba++) {
    const stan = {organization:"SEMPER",eventisTitle:element.title,eventisImportQueue:[element],sourceTerms:[termin],settings:{},reczniePotwierdzoneTerminy:new Set()};
    const zweryfikuj = odczytajFunkcje("../content/eventis.js","async function zweryfikujKarteSesjiOtwarcia","function renderujWeryfikacjeOtwartejKarty",{
      state:stan,location:{search:new URL(karta.url).search,href:karta.url},URLSearchParams,
      storageGet:async()=>JSON.parse(JSON.stringify(magazyn)),storageSet:async dane=>Object.assign(magazyn,dane),
      MAPOWANIA_WYDARZEN:require("../shared/mapowania-wydarzen-eventis"),NARZEDZIA_OTWIERANIA:otwieranie,NARZEDZIA_KOLEJKI:kolejka,
      getEventisTitle:()=>element.title,audit:async()=>{}
    });
    await zweryfikuj();
    const porownaj = odczytajFunkcje("../content/eventis.js","function compareTerms","function odciskFormularza",{
      state:stan,getExistingTerms:()=>[],NARZEDZIA_TERMINOW:terminy,normalize:wyszukiwanie.normalizujTytul,
      dopasowaniaKolejkiDoBiezacegoTytulu:()=>stan.przypisaneElementyKolejki.map(wpis=>({element:wpis})),
      czyTerminPotwierdzony:wpis=>wpis.effectiveConfirmed,sessionStorage:{getItem:()=>null}
    });
    porownaj();
    assert.equal(stan.sourceTerms[0].confirmationSource,"queue");
    assert.equal(stan.missingTerms.length,1);
    assert.equal(stan.diagnostykaTerminow.queueMatchedSemperCount,1);
    assert.equal(stan.diagnostykaTerminow.eventisMatchingCount,0);
  }
});

test("panel renderuje fioletowe potwierdzenie kolejki bez konieczności ręcznego kliknięcia", () => {
  const stan = {reczniePotwierdzoneTerminy:new Set()};
  const renderuj = odczytajFunkcje("../content/eventis.js","function renderTerm","function przelaczRecznePotwierdzenie",{
    state:stan,termKey:terminy.termKey,esc:String,durationDays:terminy.durationDays
  });
  const wynik = renderuj(terminy.scalPotwierdzeniaKolejki([termin],[element]).terms[0],"missing");
  assert.match(wynik,/esync-badge purple/);
  assert.match(wynik,/POTW\. Z KOLEJKI/);
  assert.doesNotMatch(wynik,/POTWIERDŹ TERMIN/);
  assert.doesNotMatch(renderuj({...termin,confirmed:true,confirmedOnSemper:true,confirmedByQueue:true},"exists"),/esync-badge purple/);
});

test("przycisk ręcznego potwierdzenia nadal przełącza rzeczywisty stan panelu", () => {
  const stan = {sourceTerms:[termin],reczniePotwierdzoneTerminy:new Set()};
  const przelacz = odczytajFunkcje("../content/eventis.js","function przelaczRecznePotwierdzenie","function renderMappingCard",{
    state:stan,termKey:terminy.termKey,render:()=>{},compareTerms:()=>{stan.sourceTerms=terminy.scalPotwierdzeniaKolejki(stan.sourceTerms,[],stan.reczniePotwierdzoneTerminy).terms;}
  });
  przelacz(terminy.termKey(termin));
  assert.equal(stan.sourceTerms[0].confirmedManually,true);
  przelacz(terminy.termKey(termin));
  assert.equal(stan.sourceTerms[0].effectiveConfirmed,false);
});

test("/company wyróżnia konkretny dopasowany termin na fioletowo", () => {
  const klucz = `SEMPER|${element.normalizedTitle}`;
  const renderuj = odczytajFunkcje("../content/lista-eventis.js","function renderujTerminyPozycji","function wygladPozycji",{
    stan:{organizacja:"SEMPER",kolejka:[element],preflight:{wyniki:{[klucz]:{reconciliation:terminy.scalPotwierdzeniaKolejki([termin],[element])}}}},
    kluczRozstrzygniecia:()=>klucz,NARZEDZIA_KOLEJKI:kolejka,esc:String
  });
  const wynik = renderuj({normalizedSourceTitle:element.normalizedTitle});
  assert.match(wynik,/esync-badge purple/);
  assert.match(wynik,/2026-10-05 → 2026-10-06/);
});


test("porównanie aktualizuje ten sam obiekt zamiast kopiować termin do list wyników", () => {
  const kanoniczny = terminy.scalPotwierdzeniaKolejki([termin],[element]).terms[0];
  const brak = terminy.porownajPotwierdzoneTerminy([kanoniczny],[]);
  assert.equal(brak.missingConfirmedTerms[0],kanoniczny);
  assert.equal(kanoniczny.missingOnEventis,true);
  const obecny = terminy.porownajPotwierdzoneTerminy([kanoniczny],[termin]);
  assert.equal(obecny.matchingEventisTerms[0],kanoniczny);
  assert.equal(kanoniczny.existsOnEventis,true);
  assert.equal(kanoniczny.missingOnEventis,false);
});

test("lista szkoleń pokazuje jeden wiersz dla kilku rekordów tego samego terminu", () => {
  const klucz = `SEMPER|${element.normalizedTitle}`;
  const scalenie = terminy.scalPotwierdzeniaKolejki([termin],[element]);
  terminy.porownajPotwierdzoneTerminy(scalenie.terms,[]);
  const renderuj = odczytajFunkcje("../content/lista-eventis.js","function renderujTerminyPozycji","function wygladPozycji",{
    stan:{organizacja:"SEMPER",kolejka:[element,{...element,id:"drugi"}],preflight:{wyniki:{[klucz]:{reconciliation:scalenie}}}},
    kluczRozstrzygniecia:()=>klucz,NARZEDZIA_KOLEJKI:kolejka,esc:String
  });
  const wynik = renderuj({normalizedSourceTitle:element.normalizedTitle});
  assert.equal((wynik.match(/2026-10-05/g)||[]).length,1);
  assert.match(wynik,/Brakuje w Eventis/);
});
