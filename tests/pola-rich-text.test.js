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
    closest() { return null; },
    dispatchEvent(zdarzenie) { this.zdarzenia.push(zdarzenie.type); },
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

function utworzWorker(dokument, ckeditor) {
  let obslugaWiadomosci = null;
  const chrome = {
    runtime: {
      onInstalled:{ addListener() {} },
      onMessage:{ addListener(obsluga) { obslugaWiadomosci = obsluga; } }
    },
    scripting: {
      async executeScript(konfiguracja) {
        return [{ result:await konfiguracja.func(...konfiguracja.args) }];
      }
    }
  };
  const kontekst = {
    chrome,
    document:dokument,
    window:{ CKEDITOR:ckeditor },
    Event:class { constructor(type) { this.type = type; } },
    EventisSyncConfig:{ DEFAULT_SETTINGS:{} },
    KlientMostuArkuszaEventis:{},
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
  const instancja = {
    setData(html, potwierdz) { wywolania.push(["setData",html]); potwierdz(); },
    updateElement() { wywolania.push(["updateElement"]); }
  };
  const wyslij = utworzWorker(utworzDokument([pole]),{instances:{plan:instancja}});

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[plan]",html:"<p>Program</p>"});

  assert.deepEqual(wywolania,[["setData","<p>Program</p>"],["updateElement"]]);
  assert.equal(wynik.ok,true);
  assert.equal(wynik.method,"ckeditor4");
  assert.equal(wynik.modelUpdated,true);
  assert.equal(wynik.sourceUpdated,true);
});

test("bezpośrednia instancja CKEditor aktualizuje model i element źródłowy", async () => {
  const wywolania = [];
  const pole = utworzElement({
    name:"event[information]",
    ckeditorInstance:{
      setData(html) { wywolania.push(["setData",html]); },
      updateSourceElement() { wywolania.push(["updateSourceElement"]); }
    }
  });
  const wyslij = utworzWorker(utworzDokument([pole]));

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[information]",html:"<p>Cel</p>"});

  assert.deepEqual(wywolania,[["setData","<p>Cel</p>"],["updateSourceElement"]]);
  assert.equal(wynik.ok,true);
  assert.equal(wynik.method,"ckeditor-instance");
  assert.equal(wynik.sourceUpdated,true);
});

test("zwykłe textarea otrzymuje wartość i zwraca sukces", async () => {
  const pole = utworzElement({name:"event[reason]"});
  const wyslij = utworzWorker(utworzDokument([pole]));

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[reason]",html:"<p>Korzyści</p>"});

  assert.equal(pole.value,"<p>Korzyści</p>");
  assert.deepEqual(pole.zdarzenia,["input","change"]);
  assert.equal(JSON.stringify(wynik),JSON.stringify({ok:true,method:"form-control",field:"event[reason]",modelUpdated:true,sourceUpdated:true}));
});

test("widoczny element CKEditor bez instancji nie jest traktowany jako sukces", async () => {
  const editable = utworzElement({});
  const obszar = utworzElement({querySelectorAll() { return [editable]; }});
  const pole = utworzElement({name:"event[forWho]",parentElement:obszar});
  const wyslij = utworzWorker(utworzDokument([pole]));

  const wynik = await wyslij({type:"SET_RICH_FIELD",name:"event[forWho]",html:"<p>Grupa</p>"});

  assert.equal(wynik.ok,false);
  assert.equal(wynik.code,"EDITOR_MODEL_UNAVAILABLE");
  assert.equal("innerHTML" in editable,false);
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
