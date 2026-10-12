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

function utworzWorker(dokument, ckeditor, dodatkowyWidok = {}) {
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
        return [{ result:await konfiguracja.func(...konfiguracja.args) }];
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

  assert.deepEqual(wywolania,[["setData","<p>Cel</p>"],["updateSourceElement"],
    ["setData","<p>Cel </p>"],["updateSourceElement"],["setData","<p>Cel</p>"],["updateSourceElement"]]);
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

test("CKEditor nie zwraca sukcesu przy pustym backing field mimo treści w modelu", async () => {
  const pole = utworzElement({name:"event[plan]"});
  let tresc = "";
  pole.ckeditorInstance = {setData(html) { tresc = html; },getData() { return tresc; },updateSourceElement() {}};
  const wyslij = utworzWorker(utworzDokument([pole]));
  const wynik = await wyslij({type:"SET_RICH_FIELD",name:pole.name,html:"<p>Program</p>"});
  assert.equal(wynik.ok,false);
  assert.equal(wynik.code,"EDITOR_UPDATE_FAILED");
  assert.equal(tresc,"<p>Program</p>");
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
    narzedziaPol.uzupelnijPolaOpisoweJesliDodawanie("add",{
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

test("na /event/edit import opisów nie jest wykonywany", async () => {
  const wywolania = [];
  const wynik = await narzedziaPol.uzupelnijPolaOpisoweJesliDodawanie(
    "edit",
    {programHtml:"<p>Program</p>"},
    [{klucz:"programHtml",pole:"event[plan]"}],
    async pole => { wywolania.push(pole); }
  );

  assert.deepEqual(wywolania,[]);
  assert.deepEqual(wynik,{ok:true,pominieto:true,ustawionePola:[]});
  assert.match(fs.readFileSync(path.join(__dirname,"..","content","eventis.js"),"utf8"),/uzupelnijPolaOpisoweJesliDodawanie\(\s*MODE,/);
});

test("brak terminów uruchamia zapis i zamyka kartę dopiero po komunikacie sukcesu", () => {
  const kod = fs.readFileSync(path.join(__dirname,"..","content","eventis.js"),"utf8");
  assert.match(kod,/data-action="\$\{zamknijKarte\?'save-close':'save'\}"/);
  assert.match(kod,/zapiszFormularzZPanelu\(true\)/);
  assert.match(kod,/if \(nowyStan\.saveState === "SUCCESS"\)/);
  assert.match(kod,/await chrome\.runtime\.sendMessage\(\{type:"CLOSE_TAB"\}\)/);
  assert.doesNotMatch(kod,/dataset\.action === "close"/);
});
