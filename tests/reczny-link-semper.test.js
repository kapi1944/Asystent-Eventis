"use strict";
const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const wyszukiwanie = require("../shared/wyszukiwanie");
const lista = require("../shared/lista-eventis");
const terminy = require("../shared/terminy");
const kod = pliki.readFileSync(require.resolve("../content/lista-eventis.js"),"utf8");

test("ręczny link SEMPER omija wyszukiwarkę, ale weryfikuje tytuł strony",async () => {
  const tytul = "Kodeks Postępowania Administracyjnego w praktyce";
  const adres = "https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,325.html";
  const klucz = wyszukiwanie.normalizujTytul(tytul);
  const fragment = kod.slice(kod.indexOf("  async function sprawdzTerminyWydarzenia"),kod.indexOf("  async function uruchomPreflight"));
  for (const zgodny of [true,false]) {
    const pobrane = [];
    const sprawdz = maszyna.runInNewContext(`${fragment};sprawdzTerminyWydarzenia`,{
      NARZEDZIA_LISTY:lista,NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,
      NARZEDZIA_TERMINOW:{...terminy,odczytajTerminySemper:()=>[]},
      stan:{organizacja:"SEMPER",mapowania:{},kolejka:[],reczneAdresySemper:{[`SEMPER|${klucz}`]:adres},ustawienia:{mappingWarningThreshold:.9}},
      potwierdzoneTerminyTytulu:()=>[],
      chrome:{runtime:{sendMessage:async wiadomosc=>{
        pobrane.push(wiadomosc.payload.url);
        asercje.equal(wiadomosc.payload.url,adres);
        return {ok:true,finalUrl:adres,text:zgodny ? tytul : "Zarządzanie gospodarką odpadami"};
      }}},
      DOMParser:class {parseFromString(tekst) {return {querySelector:()=>({textContent:tekst})};}}
    });
    const pozycja = {sourceTitle:tytul,normalizedSourceTitle:klucz};
    if (zgodny) asercje.equal((await sprawdz(pozycja)).queueContext.sourceUrl,adres);
    else { const wynik = await sprawdz(pozycja); asercje.equal(wynik.statusZrodla,"AMBIGUOUS"); asercje.match(wynik.bladZrodla,/tytuł strony SEMPER wymaga weryfikacji/i); }
    asercje.deepEqual(pobrane,[adres]);
  }
});

test("końcówka w praktyce nie jest inną lokalizacją dla zgodnego tytułu szkolenia online",async()=>{
  const tytul = "Zarządzanie Ryzykiem w Administracji Publicznej - Kompendium najskuteczniejszych metod w praktyce.";
  const adres = "https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,319.html";
  const fragment = kod.slice(kod.indexOf("  async function sprawdzTerminyWydarzenia"),kod.indexOf("  async function uruchomPreflight"));
  for (const dopisek of [" Certyfikowane szkolenie online"," Szkolenie online"]) {
    const tytulListy = tytul + dopisek;
    const klucz = wyszukiwanie.normalizujTytul(tytulListy);
    const sprawdz = maszyna.runInNewContext(`${fragment};sprawdzTerminyWydarzenia`,{
      NARZEDZIA_LISTY:lista,NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,
      NARZEDZIA_TERMINOW:{...terminy,odczytajTerminySemper:()=>[]},
      stan:{organizacja:"SEMPER",mapowania:{},kolejka:[],reczneAdresySemper:{[`SEMPER|${klucz}`]:adres},ustawienia:{mappingWarningThreshold:.9}},
      potwierdzoneTerminyTytulu:()=>[],
      chrome:{runtime:{sendMessage:async()=>({ok:true,finalUrl:adres,text:tytul})}},
      DOMParser:class {parseFromString(tekst) {return {querySelector:()=>({textContent:tekst})};}}
    });
    asercje.equal((await sprawdz({sourceTitle:tytulListy,normalizedSourceTitle:klucz})).queueContext.sourceUrl,adres);
  }
});

test("wariant online nie przyjmuje strony innej miejscowości bez zgodnego terminu online",async()=>{
  const tytul = "Zarządzanie Ryzykiem w Administracji Publicznej - Kompendium najskuteczniejszych metod";
  const adres = "https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,319.html";
  const klucz = wyszukiwanie.normalizujTytul(tytul + " online");
  const fragment = kod.slice(kod.indexOf("  async function sprawdzTerminyWydarzenia"),kod.indexOf("  async function uruchomPreflight"));
  const sprawdz = maszyna.runInNewContext(`${fragment};sprawdzTerminyWydarzenia`,{
    NARZEDZIA_LISTY:lista,NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,
    NARZEDZIA_TERMINOW:{...terminy,odczytajTerminySemper:()=>[]},
    stan:{organizacja:"SEMPER",mapowania:{},kolejka:[],reczneAdresySemper:{[`SEMPER|${klucz}`]:adres},ustawienia:{mappingWarningThreshold:.9}},
    potwierdzoneTerminyTytulu:()=>[],
    chrome:{runtime:{sendMessage:async()=>({ok:true,finalUrl:adres,text:tytul + " w Gdańsku."})}},
    DOMParser:class {parseFromString(tekst) {return {querySelector:()=>({textContent:tekst})};}}
  });
  asercje.equal((await sprawdz({sourceTitle:tytul + " online",normalizedSourceTitle:klucz})).statusZrodla,"AMBIGUOUS");
});

test("ostrzeżenie o weryfikacji źródła nie jest oznaczane jako błąd krytyczny",()=>{
  const fragment = kod.slice(kod.indexOf("  function wygladPozycji"),kod.indexOf("  function renderujPozycjeSzkolenia"));
  const wyglad = maszyna.runInNewContext(`${fragment};wygladPozycji`,{
    NARZEDZIA_KOLEJKI:require("../shared/kolejka-eventis"),
    stan:{organizacja:"SEMPER",skanowanie:{},kolejka:[],preflight:{wyniki:{szkolenie:{status:"NEEDS_ATTENTION",statusZrodla:"AMBIGUOUS"}}}},
    kluczRozstrzygniecia:()=>"szkolenie"
  });
  asercje.equal(wyglad({}).klasa,"wymaga-uzupelnienia");
});
