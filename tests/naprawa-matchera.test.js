"use strict";
const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const maszyna = require("node:vm");
const wyszukiwanie = require("../shared/wyszukiwanie");
const lista = require("../shared/lista-eventis");
const mapowania = require("../shared/mapowania-wydarzen-eventis");
const poczatek = "Kierownik składowiska odpadów oraz Kierownik spalarni i współspalarni";
const tytulEventis = `${poczatek}. Szkolenie przygotowujące do państwowego egzaminu w zakresie gospodarowania odpadami.`;
const tytulZrodla = `${poczatek}. 2-dniowe szkolenie przygotowujące do państwowego egzaminu w zakresie gospodarowania odpadami [próbny egzamin]. Certyfikowane szkolenie online`;
const ogloszenie = {eventisId:"89180",url:"https://eventis.pl/event/edit/89180",tytuly:[tytulEventis]};

test("struktura zachowuje źródło, długość, formułę i dopiski",() => {
  const wynik = wyszukiwanie.rozlozTytul(tytulZrodla);
  asercje.equal(wynik.oryginalnyTytul,tytulZrodla);
  asercje.equal(wynik.liczbaDni,2);
  asercje.equal(wynik.formula,"ONLINE");
  asercje.ok(wynik.kwalifikatory.includes("próbny egzamin"));
  asercje.ok(!/2-dniowe|online|próbny/.test(wynik.rdzenTytulu));
  for (const [okres,dni] of [["jednodniowe",1],["dwudniowy",2],["trzydniowego",3],["1-dniowe",1],["3 dniowych",3]]) asercje.equal(wyszukiwanie.rozlozTytul(`${okres} ${poczatek}`).liczbaDni,dni);
});

test("rzeczywista pętla wyszukiwania odnajduje 89180 przez fallback i przywraca filtr",async () => {
  const kod = pliki.readFileSync(require.resolve("../content/lista-eventis.js"),"utf8");
  const fragment = kod.slice(kod.indexOf("  async function pobierzOgloszeniaPrzezPoleWyszukiwania"),kod.indexOf("  async function pobierzWszystkieOgloszeniaZListy"));
  const pole = {value:"wcześniejszy filtr"};
  const zapytania = [];
  const funkcja = maszyna.runInNewContext(`${fragment};pobierzOgloszeniaPrzezPoleWyszukiwania`,{
    NARZEDZIA_WYSZUKIWANIA:wyszukiwanie,NARZEDZIA_LISTY:lista,stan:{organizacja:"SEMPER"},
    document:{},location:{href:"https://eventis.pl/company"},console:{debug(){}},
    znajdzPoleWyszukiwaniaOgloszen:()=>pole,
    zastosujFiltrWyszukiwania:async (pole,tekst)=>{pole.value=tekst;zapytania.push(tekst);},
    pobierzOgloszeniaZDokumentu:()=>pole.value === poczatek ? [ogloszenie,ogloszenie] : []
  });
  const wynik = await funkcja([tytulZrodla]);
  asercje.equal(wynik.ogloszenia.length,1);
  asercje.equal(wynik.ogloszenia[0].eventisId,"89180");
  asercje.ok(zapytania.includes(poczatek));
  asercje.ok(wynik.liczbaZapytan <= 4);
  asercje.equal(pole.value,"wcześniejszy filtr");
  asercje.equal(lista.rozwiazGrupeTytulu({tytul:tytulZrodla},wynik.ogloszenia,"SEMPER").status,"AUTO_MATCH");
});

test("brak długości i jednostronne online nie blokują; jawne konflikty blokują",() => {
  for (const [zrodlo,cel,konflikt] of [[tytulZrodla,tytulEventis,false],[tytulEventis,tytulZrodla,false],[`2-dniowe ${poczatek}`,`3-dniowe ${poczatek}`,true],[`3-dniowe ${poczatek}`,`2-dniowe ${poczatek}`,true],[`2-dniowe ${poczatek}`,`2-dniowe ${poczatek}`,false],[`${poczatek} online`,`${poczatek} stacjonarne`,true]]) {
    asercje.equal(wyszukiwanie.czyKonfliktStruktury(zrodlo,cel),konflikt);
    const wynik = lista.rozwiazGrupeTytulu({tytul:zrodlo},[{...ogloszenie,tytuly:[cel]}],"SEMPER");
    asercje.equal(wynik.status === "AUTO_MATCH",!konflikt);
  }
});

test("podobny tytuł z innym tematem i ogólne słowa nie wystarczają",() => {
  asercje.ok(wyszukiwanie.ocenTytulEventis("Kierownik składowiska odpadów niebezpiecznych","Kierownik składowiska odpadów komunalnych") < lista.PROG_DOPASOWANIA);
  asercje.ok(wyszukiwanie.ocenTytulEventis(tytulZrodla,"Szkolenie prawo warsztaty online") < lista.PROG_SUGESTII);
});

test("krótszy alias tego samego ID nie omija konfliktu 2/3 dni",() => {
  const wynik = lista.rozwiazGrupeTytulu({tytul:`2-dniowe ${poczatek}`},[{...ogloszenie,tytuly:[poczatek,`3-dniowe ${poczatek}`]}],"SEMPER");
  asercje.notEqual(wynik.status,"AUTO_MATCH");
});

test("bieżąca strona odczytuje rzeczywisty tytuł i nie przypisuje niezgodnego rekordu",() => {
  const kandydat = lista.pobierzBiezaceOgloszenie({querySelector:()=>({value:tytulEventis})},ogloszenie.url);
  asercje.equal(kandydat.eventisId,"89180");
  asercje.equal(lista.rozwiazGrupeTytulu({tytul:tytulZrodla},[kandydat],"SEMPER").status,"AUTO_MATCH");
  asercje.equal(lista.rozwiazGrupeTytulu({tytul:"Kadry i płace dla pracowników urzędów"},[kandydat],"SEMPER").selectedCandidate,null);
  asercje.equal(lista.pobierzBiezaceOgloszenie({querySelector:()=>null},ogloszenie.url),null);
  asercje.equal(lista.pobierzBiezaceOgloszenie({querySelector:()=>({value:tytulEventis})},"https://obcy.pl/event/edit/89180"),null);
});

test("pamięć ręcznego ID przeżywa zmianę dopisków, lecz odrzuca inny temat i 3 dni",() => {
  const magazyn = mapowania.zapiszMapowanie(null,{organization:"SEMPER",sourceTitle:tytulZrodla,eventTitle:tytulEventis,eventId:"89180",eventUrl:ogloszenie.url});
  asercje.equal(mapowania.pobierzBezpieczneMapowanie(magazyn,"SEMPER",tytulEventis,tytulEventis).eventId,"89180");
  asercje.equal(mapowania.pobierzBezpieczneMapowanie(magazyn,"SEMPER",tytulZrodla,"Prawo pracy"),null);
  asercje.equal(mapowania.pobierzBezpieczneMapowanie(magazyn,"SEMPER",tytulZrodla,tytulZrodla.replace("2-dniowe","3-dniowe")),null);
  asercje.equal(mapowania.pobierzBezpieczneMapowanie(mapowania.usunMapowanie(magazyn,"SEMPER",tytulEventis),"SEMPER",tytulZrodla,tytulZrodla),null);
});

test("przycisk bieżącego ogłoszenia zapisuje ID i przypisuje grupę do otwartej karty",async () => {
  const kod = pliki.readFileSync(require.resolve("../content/eventis.js"),"utf8");
  const obsluga = kod.slice(kod.indexOf("  function bindUI() {"),kod.indexOf('    $("#esync-collapse")?.addEventListener')) + "};bindUI();";
  let kliknij;
  let zapis;
  const korzen = {};
  const dokument = {};
  const stan = {organization:"SEMPER",przypisaneRecznieBiezacejKarty:[]};
  const grupa = {klucz:wyszukiwanie.normalizujTytul(tytulZrodla),tytul:tytulZrodla,elementy:[{id:"rekord-1"}]};
  const przycisk = {dataset:{biezaceOgloszenie:grupa.klucz},addEventListener:(typ,akcja)=>kliknij=akcja};
  maszyna.runInNewContext(obsluga,{
    $:selektor=>selektor === "#esync-root" ? korzen : null,
    $$:(selektor,rodzic)=>{asercje.equal(rodzic,korzen);return selektor === "[data-biezace-ogloszenie]" ? [przycisk] : [];},
    document:dokument,state:stan,location:{href:ogloszenie.url},NARZEDZIA_LISTY:lista,MAPOWANIA_WYDARZEN:mapowania,
    kandydaciBiezacegoOgloszenia:()=>[grupa],getEventisTitle:()=>tytulEventis,storageGet:async()=>({}),
    chrome:{storage:{local:{set:async dane=>zapis=dane}}},toast(){},render(){}
  });
  await kliknij();
  asercje.equal(mapowania.pobierzBezpieczneMapowanie(zapis[mapowania.KLUCZ_STORAGE_MAPOWAN],"SEMPER",tytulZrodla,tytulZrodla).eventId,"89180");
  asercje.deepEqual(Array.from(stan.przypisaneRecznieBiezacejKarty),["rekord-1"]);
});
