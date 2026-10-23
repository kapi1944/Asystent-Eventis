"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const narzedziaPol = require("../shared/pola-rich-text");

function utworzElement(dane = {}) {
  return {
    id:"",
    name:"",
    value:"",
    parentElement:null,
    ckeditorInstance:null,
    zdarzenia:[],
    wartosciPrzyZdarzeniach:[],
    closest() { return null; },
    dispatchEvent(zdarzenie) {
      this.zdarzenia.push(zdarzenie.type);
      this.wartosciPrzyZdarzeniach.push(this.value);
    },
    matches() { return false; },
    querySelectorAll() { return []; },
    ...dane
  };
}

function utworzDokument(pola = [], elementyPoId = {}) {
  return {
    querySelectorAll(selektor) {
      return selektor === "input,textarea,select" ? pola : [];
    },
    getElementById(id) {
      return elementyPoId[id] || null;
    }
  };
}

function utworzWorker(dokument, ckeditor, dodatkowyWidok = {}, wykonajSkrypt = null) {
  let obslugaWiadomosci = null;
  const chrome = {
    runtime: {
      onInstalled:{ addListener() {} },
      onMessage:{ addListener(obsluga) { obslugaWiadomosci = obsluga; } }
    },
    tabs:{onRemoved:{addListener() {}}},
    scripting: {
      async executeScript(konfiguracja) {
        if (konfiguracja.args.some(argument => argument === undefined || typeof argument === "function")) {
          throw new Error("Argument executeScript nie jest serializowalny.");
        }
        return [{ result:wykonajSkrypt ? await wykonajSkrypt(konfiguracja) : await konfiguracja.func(...konfiguracja.args) }];
      }
    }
  };
  const kontekst = {
    chrome,
    document:dokument,
    window:{ CKEDITOR:ckeditor, ...dodatkowyWidok },
    Event:class { constructor(type) { this.type = type; } },
    EventisSyncConfig:{ DEFAULT_SETTINGS:{} },
    KlientMostuArkuszaEventis:{},
    NarzedziaOpisowSemper:require("../shared/opisy-semper"),
    importScripts() {},
    console,
    setTimeout,
    clearTimeout
  };
  const kod = fs.readFileSync(path.join(__dirname,"..","background.js"),"utf8");
  vm.runInNewContext(kod,kontekst,{filename:"background.js"});
  return async (wiadomosc) => new Promise(rozwiaz => {
    obslugaWiadomosci(wiadomosc,{tab:{id:1}},rozwiaz);
  });
}

test("CKEditor 4 używa setData i updateElement, a wynik potwierdza aktualizację", async () => {
  const pole = utworzElement({id:"plan",name:"event[plan]"});
  const wywolania = [];
  let tresc = "";
  const instancja = {
    setData(html, potwierdz) { tresc = html; wywolania.push(["setData",html]); potwierdz(); },
    getData() { return tresc; },
    updateElement() { pole.value = tresc; wywolania.push(["updateElement"]); }
  };
  const wyslij = utworzWorker(utworzDokument([pole]),{instances:{plan:instancja}});

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[plan]",html:"<p>Program</p>"});

  assert.deepEqual(wywolania,[["setData","<p>Program</p>"],["updateElement"],
    ["setData","<p>Program </p>"],["updateElement"],["setData","<p>Program</p>"],["updateElement"]]);
  assert.equal(pole.value,"<p>Program</p>");
  assert.deepEqual(pole.zdarzenia,["input","change","keyup","blur","focusout","input","change","keyup","blur","focusout"]);
  assert.equal(wynik.ok,true);
  assert.equal(wynik.method,"ckeditor4");
  assert.equal(wynik.modelUpdated,true);
  assert.equal(wynik.sourceUpdated,true);
});

test("bezpośrednia instancja CKEditor aktualizuje model i element źródłowy", async () => {
  const wywolania = [];
  let tresc = "";
  const pole = utworzElement({
    name:"event[information]",
    ckeditorInstance:{
      setData(html) { tresc = html; wywolania.push(["setData",html]); },
      getData() { return tresc; },
      updateSourceElement() { pole.value = tresc; wywolania.push(["updateSourceElement"]); }
    }
  });
  const wyslij = utworzWorker(utworzDokument([pole]));

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[information]",html:"<p>Cel</p>"});

  assert.deepEqual(wywolania,[["setData","<p>Cel</p>"],
    ["setData","<p>Cel </p>"],["setData","<p>Cel</p>"]]);
  assert.equal(pole.value,"<p>Cel</p>");
  assert.equal(wynik.ok,true);
  assert.equal(wynik.method,"ckeditor-instance");
  assert.equal(wynik.sourceUpdated,true);
});

test("zwykłe textarea otrzymuje wartość i zwraca sukces", async () => {
  const pole = utworzElement({name:"event[reason]"});
  const wyslij = utworzWorker(utworzDokument([pole]));

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[reason]",html:"<p>Korzyści</p>"});

  assert.equal(pole.value,"<p>Korzyści</p>");
  assert.deepEqual(pole.zdarzenia,["input","change","keyup","blur","focusout","input","change","keyup","blur","focusout"]);
  assert.deepEqual(pole.wartosciPrzyZdarzeniach,[...Array(5).fill("<p>Korzyści</p> "),...Array(5).fill("<p>Korzyści</p>")]);
  assert.equal(JSON.stringify(wynik),JSON.stringify({ok:true,method:"form-control",field:"event[reason]",modelUpdated:true,sourceUpdated:true}));
});

test("widoczny element CKEditor bez instancji nie jest traktowany jako sukces", async () => {
  const editable = utworzElement({matches(selektor) { return selektor === ".ck-editor__editable" || selektor === '[contenteditable="true"]'; }});
  const obszar = utworzElement({querySelectorAll() { return [editable]; }});
  const pole = utworzElement({name:"event[forWho]",parentElement:obszar});
  const wyslij = utworzWorker(utworzDokument([pole]));

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[forWho]",html:"<p>Grupa</p>"});

  assert.equal(wynik.ok,false);
  assert.equal(wynik.code,"EDITOR_MODEL_UNAVAILABLE");
  assert.equal("innerHTML" in editable,false);
});

test("wyszukiwanie instancji pozostaje przy edytorze danego pola zamiast sąsiedniego opisu", async () => {
  const lokalny = utworzElement({matches(selektor) { return selektor === ".ck-editor__editable"; }});
  let zmienionoSasiada = false;
  const sasiedni = utworzElement({ckeditorInstance:{setData() { zmienionoSasiada = true; }}});
  const pole = utworzElement({name:"event[plan]",
    parentElement:utworzElement({querySelectorAll() { return [lokalny]; }}),
    closest() { return utworzElement({querySelectorAll() { return [lokalny,sasiedni]; }}); }
  });
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>Program</p>"});
  assert.equal(wynik.ok,false);
  assert.equal(wynik.code,"EDITOR_MODEL_UNAVAILABLE");
  assert.equal(zmienionoSasiada,false);
});

test("textarea używa natywnego settera, a touch powtarzany nie dokłada spacji", async () => {
  const pole = utworzElement({name:"event[reason]",tagName:"TEXTAREA"});
  let tresc = "";
  let liczbaUstawien = 0;
  Object.defineProperty(pole,"value",{get() { return tresc; },set() { throw new Error("Setter kontrolowanego komponentu"); }});
  const prototyp = {};
  Object.defineProperty(prototyp,"value",{set(wartosc) { tresc = wartosc; liczbaUstawien++; }});
  const wyslij = utworzWorker(utworzDokument([pole]),null,{HTMLTextAreaElement:{prototype:prototyp}});
  for (let licznik = 0; licznik < 3; licznik++) {
    const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"ABC"});
    assert.equal(wynik.ok,true);
    assert.equal(pole.value,"ABC");
  }
  assert.equal(liczbaUstawien,9);
  assert.equal(pole.wartosciPrzyZdarzeniach.filter(wartosc => wartosc === "ABC ").length,15);
});

test("puste textarea nie otrzymuje chwilowej spacji ani nie przechodzi walidacji wymaganej treści", async () => {
  for (const html of ["","   "]) {
    const pole = utworzElement({name:"event[plan]"});
    const wyslij = utworzWorker(utworzDokument([pole]));
    const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html});
    assert.equal(wynik.ok,true);
    assert.equal(pole.value,html);
    assert.ok(pole.wartosciPrzyZdarzeniach.every(wartosc => wartosc === html));
    assert.equal(pole.value.trim().length,0);
  }
});

function utworzEdytowalny() {
  let html = "";
  let spacja = null;
  const blok = {appendChild(wezel) { spacja = wezel; }};
  const edytowalny = utworzElement({
    matches(selektor) { return selektor === '[contenteditable="true"]'; },
    querySelectorAll(selektor) { return selektor === "p,li,blockquote,td,th" ? [blok] : []; },
    ownerDocument:{createTextNode(tresc) { return {textContent:tresc,remove() { spacja = null; }}; }}
  });
  Object.defineProperties(edytowalny,{
    innerHTML:{get() { return spacja ? html.replace(/((?:<\/[^>]+>\s*)*)$/," $1") : html; },set(wartosc) { html = wartosc; spacja = null; }},
    textContent:{get() { return html.replace(/<[^>]*>/g,"").replace(/&nbsp;/g," "); }}
  });
  return {edytowalny,blok};
}

test("contenteditable zachowuje identyczny HTML, bloki i źródło po wielokrotnym touch", async () => {
  const {edytowalny,blok} = utworzEdytowalny();
  const obszar = utworzElement({querySelectorAll() { return [edytowalny]; }});
  const pole = utworzElement({name:"event[information]",parentElement:obszar});
  const wyslij = utworzWorker(utworzDokument([pole]));
  const html = "<p><strong>Cel</strong></p><ul><li>Pierwszy</li><li>Drugi</li></ul>";
  for (let licznik = 0; licznik < 2; licznik++) {
    const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html});
    assert.equal(wynik.ok,true);
    assert.equal(wynik.method,"contenteditable");
    assert.equal(edytowalny.innerHTML,html);
    assert.equal(pole.value,html);
    assert.equal(edytowalny.querySelectorAll("p,li,blockquote,td,th")[0],blok);
  }
  assert.deepEqual(edytowalny.zdarzenia,Array(2).fill(["input","change","keyup","blur","focusout","input","change","keyup","blur","focusout"]).flat());
  assert.ok(pole.wartosciPrzyZdarzeniach.includes("<p><strong>Cel</strong></p><ul><li>Pierwszy</li><li>Drugi </li></ul>"));
});

test("CKEditor 5 synchronizuje model i źródło oraz emituje InputEvent na właściwym edytorze", async () => {
  const html = "<p>Cel</p><ol><li><strong>Program</strong></li></ol>";
  const pole = utworzElement({name:"event[plan]"});
  const zdarzenia = [];
  const edytowalny = utworzElement({dispatchEvent(zdarzenie) { zdarzenia.push([zdarzenie.type,zdarzenie.inputType,zdarzenie.key]); }});
  let tresc = "";
  const wartosciModelu = [];
  pole.ckeditorInstance = {
    async setData(wartosc) { await Promise.resolve(); tresc = wartosc; wartosciModelu.push(wartosc); },
    getData() { return tresc; },
    updateSourceElement() { pole.value = tresc; },
    ui:{getEditableElement() { return edytowalny; }}
  };
  class ZdarzenieEdycji { constructor(typ, dane) { this.type = typ; Object.assign(this,dane); } }
  const wyslij = utworzWorker(utworzDokument([pole]),null,{InputEvent:ZdarzenieEdycji,KeyboardEvent:ZdarzenieEdycji});
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html});
  assert.equal(wynik.ok,true);
  assert.deepEqual(wartosciModelu,[html,"<p>Cel</p><ol><li><strong>Program </strong></li></ol>",html]);
  assert.equal(tresc,html);
  assert.equal(pole.value,html);
  assert.deepEqual(zdarzenia.filter(([typ]) => typ === "input"),[["input","insertText",undefined],["input","deleteContentBackward",undefined]]);
  assert.deepEqual(zdarzenia.filter(([typ]) => typ === "keyup"),[["keyup",undefined," "],["keyup",undefined,"Backspace"]]);
});

test("CKEditor 5 wpisuje spację i usuwa ją w modelu bez ponownego ustawiania opisu", async () => {
  const pole = utworzElement({name:"event[hours]"});
  const czynnosci = [];
  let tresc = "";
  const akapit = {childCount:1,getChild() { return {is() { return false; }}; },is(typ) { return typ === "element"; }};
  const korzen = {childCount:1,getChild() { return akapit; }};
  const pozycja = {getShiftedBy(przesuniecie) { return {przesuniecie}; }};
  const pisarz = {
    createPositionAt(element, miejsce) {
      assert.equal(element,akapit);
      assert.equal(miejsce,"end");
      return pozycja;
    },
    insertText(znak, miejsce) {
      assert.equal(znak," ");
      assert.equal(miejsce,pozycja);
      tresc = "<p>2 dni </p>";
      czynnosci.push("spacja");
    },
    remove(zakres) {
      assert.equal(zakres.poczatek,pozycja);
      assert.equal(zakres.koniec.przesuniecie,1);
      tresc = "<p>2 dni</p>";
      czynnosci.push("usunięcie");
    }
  };
  const edytowalny = utworzElement({focus() { czynnosci.push("focus"); },blur() { czynnosci.push("blur"); }});
  pole.ckeditorInstance = {
    setData(html) { tresc = html; czynnosci.push("setData"); },
    getData() { return tresc; },
    updateSourceElement() { pole.value = tresc; },
    ui:{getEditableElement() { return edytowalny; }},
    model:{
      document:{getRoot() { return korzen; }},
      change(zmien) { zmien(pisarz); },
      createRange(poczatek, koniec) { return {poczatek,koniec}; }
    }
  };
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>2 dni</p>"});
  assert.equal(wynik.ok,true);
  assert.deepEqual(czynnosci,["setData","focus","spacja","usunięcie","blur"]);
  assert.equal(pole.value,"<p>2 dni</p>");
  assert.deepEqual(pole.wartosciPrzyZdarzeniach,[...Array(5).fill("<p>2 dni </p>"),...Array(5).fill("<p>2 dni</p>")]);
});

test("CKEditor synchronizuje ukryte pole, gdy updateSourceElement aktualizuje osobny div", async () => {
  const pole = utworzElement({name:"event[plan]"});
  let tresc = "";
  pole.ckeditorInstance = {setData(html) { tresc = html; },getData() { return tresc; },updateSourceElement() {}};
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>Program</p>"});
  assert.equal(wynik.ok,true);
  assert.equal(tresc,"<p>Program</p>");
  assert.equal(pole.value,"<p>Program</p>");
});

test("CKEditor nie potwierdza pustego widoku mimo treści w modelu i polu formularza", async () => {
  let tresc = "";
  const edytowalny = utworzElement({textContent:""});
  const pole = utworzElement({name:"event[plan]",ckeditorInstance:{
    setData(html) { tresc = html; },getData() { return tresc; },
    ui:{getEditableElement() { return edytowalny; }}
  }});
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>Program</p>"});
  assert.equal(pole.value,"<p>Program</p>");
  assert.equal(wynik.ok,false);
  assert.match(wynik.message,/Widok edytora pozostał pusty/);
});

test("rzeczywisty DOM: synchronizacja formularza zachowuje węzły widoku CKEditora", async podtest => {
  const {chromium:przegladarkaChromium} = require("playwright");
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  podtest.after(() => przegladarka.close());
  const strona = await przegladarka.newPage();
  await strona.route("**/*",trasa => trasa.abort());
  await strona.setContent('<form><input type="hidden" id="plan_post" name="event[plan]"><div id="plan" class="ck-editor__editable" contenteditable="true"><p></p></div></form>');
  await strona.evaluate(() => {
    const edytowalny = document.getElementById("plan");
    const akapit = edytowalny.firstElementChild;
    let tresc = "";
    edytowalny.ckeditorInstance = {
      setData(html) { tresc = html; akapit.textContent = html.replace(/<[^>]*>/g,""); },
      getData() { return tresc; },
      updateSourceElement() { edytowalny.innerHTML = tresc; },
      ui:{getEditableElement() { return edytowalny; }}
    };
    window.akapitEdytora = akapit;
  });
  const wyslij = utworzWorker(null,null,{},konfiguracja => strona.evaluate(
    ({funkcja,argumenty}) => (0,eval)(`(${funkcja})`)(...argumenty),
    {funkcja:konfiguracja.func.toString(),argumenty:konfiguracja.args}
  ));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[plan]",html:"<p>Program</p>"});
  assert.equal(wynik.ok,true,JSON.stringify(wynik));
  assert.equal(await strona.locator("#plan").innerText(),"Program");
  assert.equal(await strona.evaluate(() => document.getElementById("plan").firstElementChild === window.akapitEdytora),true);
  assert.deepEqual(await strona.evaluate(() => Array.from(new FormData(document.querySelector("form")))),
    [["event[plan]","<p>Program</p>"]]);
});

test("CKEditor nie potwierdza aktualizacji, jeżeli model odrzucił całą treść", async () => {
  const pole = utworzElement({name:"event[plan]",ckeditorInstance:{
    setData() {},getData() { return ""; },updateSourceElement() {}
  }});
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>Program</p>"});
  assert.equal(wynik.ok,false);
  assert.equal(wynik.code,"EDITOR_UPDATE_FAILED");
  assert.equal(pole.value,"");
});

test("rzeczywisty DOM: osobny div CKEditora i pola _post trafiają do danych formularza", async podtest => {
  const {chromium:przegladarkaChromium} = require("playwright");
  const przegladarka = await przegladarkaChromium.launch({channel:process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge",headless:true});
  podtest.after(() => przegladarka.close());
  const strona = await przegladarka.newPage();
  await strona.route("**/*",trasa => trasa.abort());
  const pola = [["hours","eventHours"],["information","information"],["reason","reason"],
    ["forWho","forWho"],["plan","plan"],["participants","participants"]];
  await strona.setContent(`<form>${pola.map(([nazwa,identyfikator]) =>
    `<section><input type="hidden" name="event[${nazwa}]" id="${identyfikator}_post">
      <div id="${identyfikator}"></div><div class="ck-editor__editable" contenteditable="true"></div></section>`).join("")}</form>`);
  await strona.evaluate(pola => {
    for (const [,identyfikator] of pola) {
      const zrodlo = document.getElementById(identyfikator);
      const edytowalny = zrodlo.nextElementSibling;
      // API aktualizuje źródłowy div, a osobne pole formularza pozostaje poza instancją.
      zrodlo.ckeditorInstance = {
        setData(html) { edytowalny.innerHTML = html; },
        getData() { return edytowalny.innerHTML; },
        updateSourceElement() { zrodlo.innerHTML = edytowalny.innerHTML; },
        ui:{getEditableElement() { return edytowalny; }}
      };
    }
  },pola);
  const wyslij = utworzWorker(null,null,{},konfiguracja => strona.evaluate(
    ({funkcja,argumenty}) => (0,eval)(`(${funkcja})`)(...argumenty),
    {funkcja:konfiguracja.func.toString(),argumenty:konfiguracja.args}
  ));
  for (const [nazwa] of pola) {
    const wynik = await wyslij({type:"SET_RICH_FIELD",name:`event[${nazwa}]`,html:`<p>Treść ${nazwa}</p>`});
    assert.equal(wynik.ok,true,JSON.stringify(wynik));
    assert.equal(wynik.method,"ckeditor-instance");
  }
  assert.deepEqual(await strona.evaluate(() => Array.from(new FormData(document.querySelector("form")))),
    pola.map(([nazwa]) => [`event[${nazwa}]`,`<p>Treść ${nazwa}</p>`]));

  // Edycja zachowuje tekst nawet wtedy, gdy jest wyłącznie w modelu lub ukrytym polu.
  for (const miejsce of ["model","pole"]) {
    await strona.evaluate(miejsce => {
      const zrodlo = document.getElementById("plan");
      zrodlo.innerHTML = "";
      zrodlo.ckeditorInstance.setData(miejsce === "model" ? "<p>Własny program</p>" : "");
      document.getElementById("plan_post").value = miejsce === "pole" ? "<p>Własny program</p>" : "";
    },miejsce);
    const przed = await strona.locator("form").innerHTML();
    const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[plan]",html:"<p>Program SEMPER</p>",tylkoPuste:true});
    assert.equal(wynik.pominieto,true);
    assert.equal(await strona.locator("form").innerHTML(),przed);
  }
  await strona.evaluate(() => {
    document.getElementById("plan").ckeditorInstance.setData("<p>&nbsp;<br></p>");
    document.getElementById("plan_post").value = "<p>&nbsp;<br></p>";
  });
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[plan]",html:"<p>Program SEMPER</p>",tylkoPuste:true});
  assert.equal(wynik.ok,true);
  assert.equal(wynik.pominieto,undefined);
  assert.equal(await strona.locator("#plan_post").inputValue(),"<p>Program SEMPER</p>");
  await narzedziaPol.uzupelnijPolaOpisowe({programHtml:"<p>Aktualny program SEMPER</p>"},
    [{klucz:"programHtml",pole:"event[plan]"}],
    (pole,html,opcje) => wyslij({type:"SET_RICH_FIELD",name:pole,html,...opcje}));
  assert.equal(await strona.locator("#plan_post").inputValue(),"<p>Aktualny program SEMPER</p>");
  assert.equal(await strona.locator("#plan + .ck-editor__editable").innerHTML(),"<p>Aktualny program SEMPER</p>");
});

test("pusty HTML edytora nie otrzymuje spacji", async () => {
  const pole = utworzElement({name:"event[plan]"});
  let tresc = "";
  const wywolania = [];
  pole.ckeditorInstance = {
    setData(html) { tresc = html; wywolania.push(html); },
    getData() { return tresc; },updateSourceElement() { pole.value = tresc; }
  };
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p><br></p>"});
  assert.equal(wynik.ok,true);
  assert.deepEqual(wywolania,["<p><br></p>"]);
  assert.equal(pole.value,"<p><br></p>");
});

test("zwykłe pole nie uruchamia procedury edycji opisów", async () => {
  const pole = utworzElement({name:"event[title]"});
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"1 dzień"});
  assert.equal(wynik.ok,true);
  assert.deepEqual(pole.zdarzenia,["input","change"]);
  assert.deepEqual(pole.wartosciPrzyZdarzeniach,["1 dzień","1 dzień"]);
});

test("czas trwania powiadamia walidację delegowaną przez focusout po synchronizacji źródła", async () => {
  let tresc = "";
  const sprawdzoneWartosci = [];
  const edytowalny = utworzElement({dispatchEvent(zdarzenie) {
    if (zdarzenie.type === "focusout" && zdarzenie.bubbles) sprawdzoneWartosci.push(pole.value);
  }});
  const pole = utworzElement({name:"event[hours]",ckeditorInstance:{
    setData(html) { tresc = html; },getData() { return tresc; },
    updateSourceElement() { pole.value = tresc; },
    ui:{getEditableElement() { return edytowalny; }}
  }});
  class Zdarzenie { constructor(typ, dane) { this.type = typ; Object.assign(this,dane); } }
  const wyslij = utworzWorker(utworzDokument([pole]),null,{Event:Zdarzenie});
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>2 dni</p>"});
  assert.equal(wynik.ok,true);
  assert.deepEqual(sprawdzoneWartosci,["<p>2 dni </p>","<p>2 dni</p>"]);
  assert.equal(pole.value,"<p>2 dni</p>");
});

test("CKEditor 4 korzysta z updateSourceElement i zdarzenia change własnego API", async () => {
  const pole = utworzElement({id:"plan",name:"event[plan]"});
  const edytowalny = utworzElement();
  let tresc = "";
  const zmianyModelu = [];
  const instancja = {
    setData(html, potwierdz) { tresc = html; setTimeout(potwierdz,0); },
    getData() { return tresc; },
    updateSourceElement() { pole.value = tresc; },
    updateElement() { throw new Error("Nie powinno być użyte przy updateSourceElement"); },
    editable() { return {$:edytowalny}; },
    fire(typ) { zmianyModelu.push([typ,tresc,pole.value]); }
  };
  const wyslij = utworzWorker(utworzDokument([pole]),{instances:{plan:instancja}});
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>Program</p>"});
  assert.equal(wynik.ok,true);
  assert.deepEqual(zmianyModelu,[["change","<p>Program </p>","<p>Program </p>"],["change","<p>Program</p>","<p>Program</p>"]]);
  assert.deepEqual(edytowalny.zdarzenia,pole.zdarzenia);
  assert.equal(pole.value,"<p>Program</p>");
});

test("awaria powiadomienia po dodaniu spacji przywraca dokładną treść modelu i źródła", async () => {
  const pole = utworzElement({name:"event[plan]"});
  let tresc = "";
  pole.ckeditorInstance = {
    setData(html) { tresc = html; },getData() { return tresc; },
    updateSourceElement() { pole.value = tresc; },
    fire() { if (tresc === "<p>Program </p>") throw new Error("Awaria zdarzenia"); }
  };
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>Program</p>"});
  assert.equal(wynik.ok,false);
  assert.equal(tresc,"<p>Program</p>");
  assert.equal(pole.value,"<p>Program</p>");
});

test("brak pola zwraca kontrolowany błąd zamiast sukcesu", async () => {
  const wyslij = utworzWorker(utworzDokument());

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[plan]",html:"<p>Program</p>"});

  assert.equal(JSON.stringify(wynik),JSON.stringify({ok:false,code:"FIELD_NOT_FOUND",field:"event[plan]",message:"Nie znaleziono pola „event[plan]”."}));
});

test("wyjątek podczas aktualizacji edytora zwraca kontrolowany błąd", async () => {
  const pole = utworzElement({
    name:"event[plan]",
    ckeditorInstance:{ setData() { throw new Error("awaria modelu"); } }
  });
  const wyslij = utworzWorker(utworzDokument([pole]));

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[plan]",html:"<p>Program</p>"});

  assert.equal(wynik.ok,false);
  assert.equal(wynik.code,"EDITOR_UPDATE_FAILED");
  assert.match(wynik.message,/awaria modelu/);
});

test("błąd pola event[plan] przerywa import opisów i nie zwraca pełnego sukcesu", async () => {
  const mapowanie = [
    {klucz:"celHtml",pole:"event[information]"},
    {klucz:"korzysciHtml",pole:"event[reason]"},
    {klucz:"grupaHtml",pole:"event[forWho]"},
    {klucz:"programHtml",pole:"event[plan]"}
  ];
  const ustawionePola = [];

  await assert.rejects(
    narzedziaPol.uzupelnijPolaOpisowe({
      grupaHtml:"<p>Grupa</p>",
      celHtml:"<p>Cel</p>",
      korzysciHtml:"<p>Korzyści</p>",
      programHtml:"<p>Program</p>"
    },mapowanie,async pole => {
      ustawionePola.push(pole);
      if (pole === "event[plan]") throw new Error("Edytor Eventis nie potwierdził aktualizacji danych.");
    })
  );
  assert.deepEqual(ustawionePola,["event[information]","event[reason]","event[forWho]","event[plan]"]);
});

test("import zastępuje wszystkie dotychczasowe opisy, zachowując pola bez treści źródłowej", async () => {
  const mapowanie = require("../shared/opisy-semper").MAPOWANIE_POL_OPISOWYCH;
  const pola = mapowanie.map(({pole}) => utworzElement({name:pole,value:"Dotychczasowa treść"}));
  const wyslij = utworzWorker(utworzDokument(pola));
  const ustaw = (pole,html,opcje) => wyslij({type:"SET_RICH_FIELD",name:pole,html,...opcje});
  const wynik = await narzedziaPol.uzupelnijPolaOpisowe(
    {programHtml:"<p>Program</p>",celHtml:"<p>Cel</p>",grupaHtml:"<p>Grupa</p>",korzysciHtml:"<p>Korzyści</p>"},
    mapowanie,ustaw);
  assert.deepEqual(pola.map(pole => pole.value),["<p>Cel</p>","<p>Korzyści</p>","<p>Grupa</p>","<p>Program</p>"]);
  assert.deepEqual(wynik,{ok:true,pominieto:false,ustawionePola:mapowanie.map(({pole}) => pole)});
  await narzedziaPol.uzupelnijPolaOpisowe({celHtml:"",programHtml:"<p>Nowszy program</p>"},mapowanie,ustaw);
  assert.deepEqual(pola.map(pole => pole.value),["<p>Cel</p>","<p>Korzyści</p>","<p>Grupa</p>","<p>Nowszy program</p>"]);
});

test("dodawanie i edycja przekazują czas trwania i cztery opisy do właściwych pól", async () => {
  const kod = fs.readFileSync(require.resolve("../content/eventis.js"),"utf8");
  const fragment = kod.slice(kod.indexOf("  async function uzupelnijDaneWydarzenia"),kod.indexOf("  function przygotujTerminDoKolejki"));
  for (const tryb of ["add","edit"]) {
    const wywolania = [];
    const tytul = {name:"event[title]"};
    const uzupelnij = vm.runInNewContext(`${fragment};uzupelnijDaneWydarzenia`,{
      MODE:tryb,$:selektor => selektor === '[name="event[hours]"]' ? {name:"event[hours]"} : selektor.includes("#title") ? tytul : null,
      NARZEDZIA_POL_RICH_TEXT:narzedziaPol,NARZEDZIA_OPISOW_SEMPER:require("../shared/opisy-semper"),
      durationDays:() => 2,setValue:(pole,tresc) => { pole.value = tresc; },
      ustawPoleRichText:async (pole,html,opcje) => { wywolania.push([pole,html,opcje.tylkoPuste]); },
      wybierzWygladPodstawowy:async () => {},uzupelnijWymaganeFormyZajec:async () => {},uzupelnijIZweryfikujZyciorys:async () => {}
    });
    await uzupelnij({title:"Szkolenie",opisy:{celHtml:"Cel",korzysciHtml:"Korzyści",grupaHtml:"Grupa",programHtml:"Program"}},[{}]);
    assert.deepEqual(wywolania,[
      ["event[hours]","<p>2 dni</p>",tryb === "edit"],
      ["event[information]","Cel",false],
      ["event[reason]","Korzyści",false],
      ["event[forWho]","Grupa",false],
      ["event[plan]","Program",false]
    ]);
    assert.equal(tytul.value,tryb === "add" ? "Szkolenie" : undefined);
  }
});

test("obie ścieżki importu uzupełniają opisy przed potwierdzeniem operacji i obsługują błąd edytora", async () => {
  const kod = fs.readFileSync(require.resolve("../content/eventis.js"),"utf8");
  const termin = {start:"2026-11-02",end:"2026-11-03",city:"Online",price:1200};
  for (const [poczatek,koniec] of [["wprowadzTerminyZKolejki","unikalneTerminy"],["onAddMissing","switchOrganization"]]) {
    const fragment = kod.slice(kod.indexOf(`  async function ${poczatek}`),kod.indexOf(`  ${koniec === "unikalneTerminy" ? "function" : "async function"} ${koniec}`));
    for (const awaria of [false,true]) {
      const czynnosci = [];
      const stan = {organization:"SEMPER",eventisTitle:"Szkolenie",zapisaneTerminyEventis:[],mappingVerifiedThisSession:true,source:{opisy:{}},sourceTerms:[termin],missingTerms:[termin]};
      const uruchom = vm.runInNewContext(`${fragment};${poczatek}`,{
        state:stan,NARZEDZIA_KOLEJKI:require("../shared/kolejka-eventis"),NARZEDZIA_OPERACJI:require("../shared/operacje-eventis"),
        normalize:tekst=>tekst,getEventisTitle:()=>"Szkolenie",wykryjOrganizatora:()=>({organizator:"SEMPER"}),sprawdzBrakOczekujacejOperacji:async () => true,odswiezKolejke:async () => {},compareTerms() {},
        dopasowaniaKolejkiDoBiezacegoTytulu:() => [{element:{id:"1",recordStatus:"CONFIRMED"},terminy:[termin]}],
        getExistingTerms:() => [],existingKey:wartosc => wartosc.start,unikalneTerminy:terminy => terminy,
        utworzPlanOperacji:() => ({}),uzyskajClaimOperacji:async operacja => ({ok:true,operacja}),
        addSelectedTerms:async () => { czynnosci.push("terminy"); return {dodane:[termin],bledy:[]}; },
        uzupelnijDaneWydarzenia:async (zrodlo,terminy) => {
          assert.equal(zrodlo,stan.source);
          assert.deepEqual(Array.from(terminy),[termin]);
          czynnosci.push("opisy");
          if (awaria) throw new Error("Błąd edytora");
        },
        potwierdzOperacjeOczekujaca:async () => { czynnosci.push("potwierdzenie"); },
        zwolnijNiepotwierdzonyClaim:async () => {},audit:async () => {},render() {},toast() {}
      });
      await uruchom();
      assert.deepEqual(czynnosci,awaria && poczatek !== "wprowadzTerminyZKolejki" ? ["terminy","opisy"] : ["terminy","opisy","potwierdzenie"]);
      assert.equal(stan.status,awaria ? "ERROR" : "FORM_FILLED");
      if (awaria) assert.equal(stan.lastError,"Błąd edytora");
    }
  }
});

test("brak terminów uruchamia zapis i zamyka kartę dopiero po komunikacie sukcesu", () => {
  const kod = fs.readFileSync(path.join(__dirname,"..","content","eventis.js"),"utf8");
  assert.match(kod,/data-action="\$\{zamknijKarte\?'save-close':'save'\}"/);
  assert.match(kod,/zapiszFormularzZPanelu\(true\)/);
  assert.match(kod,/if \(nowyStan\.saveState === "SUCCESS"\)/);
  assert.match(kod,/await chrome\.runtime\.sendMessage\(\{type:"CLOSE_TAB"\}\)/);
  assert.doesNotMatch(kod,/dataset\.action === "close"/);
});
