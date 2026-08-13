"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const narzedzia = require("../content/wyszukiwanie");

const TYTUL_REGRESYJNY = "Zamówienia publiczne do 170 000 zł oraz tryb podstawowy w Prawie zamówień publicznych - 2-dniowe warsztaty praktyczne";

function wczytajFixture(nazwa) {
  return fs.readFileSync(path.join(__dirname,"fixtures",nazwa),"utf8");
}

test("normalizacja obsługuje polskie znaki, cudzysłowy, myślniki i końcówki", () => {
  assert.equal(narzedzia.normalizujTytul("  „ŁÓDŹ” —   PRAWO  "),"lodz prawo");
  assert.equal(narzedzia.normalizujTytul("Certyfikowane szkolenie online: VAT"),"vat");
  assert.equal(narzedzia.usunKoncowkeMarketingowa("Prawo pracy - 2-dniowe warsztaty praktyczne"),"Prawo pracy");
});

test("generator tworzy kilka długich i unikalnych wariantów", () => {
  const warianty = narzedzia.generujWariantyZapytania(TYTUL_REGRESYJNY);
  assert.ok(warianty.length >= 3 && warianty.length <= 5);
  assert.equal(new Set(warianty.map(narzedzia.normalizujTytul)).size,warianty.length);
  assert.ok(warianty.some(wariant => !/warsztaty praktyczne/i.test(wariant)));
  assert.ok(warianty.every(wariant => narzedzia.istotneSlowa(wariant).length >= 2));
});

test("scoring wysoko ocenia zgodny tytuł i nie zawyża dwóch wspólnych słów", () => {
  const zgodny = "Zamówienia publiczne do 170 000 zł oraz tryb podstawowy w Prawie zamówień publicznych";
  const ogolny = "Zamówienia publiczne w sektorze medycznym – szkolenie online";
  assert.ok(narzedzia.ocenZgodnoscTytulow(TYTUL_REGRESYJNY,zgodny) > 0.9);
  assert.ok(narzedzia.ocenZgodnoscTytulow(TYTUL_REGRESYJNY,ogolny) < 0.6);
  assert.ok(narzedzia.ocenZgodnoscTytulow("Limit 130 000 zł w zamówieniach publicznych","Limit 170 000 zł w zamówieniach publicznych") < 0.8);
});

test("rozpoznawanie URL SEMPER przyjmuje details i odrzuca menu", () => {
  assert.equal(narzedzia.czySzczegolySemper("https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,123.html"),true);
  assert.equal(narzedzia.czySzczegolySemper("https://szkolenia-semper.pl/component/trainings/details/prawo,123,html"),true);
  assert.equal(narzedzia.czySzczegolySemper("https://www.szkolenia-semper.pl/szkolenia"),false);
  assert.equal(narzedzia.czySzczegolySemper("http://www.szkolenia-semper.pl/component/trainings/details/szkolenie,123.html"),false);
});

test("rozpoznawanie URL IIST odrzuca listę, kategorię i formularz", () => {
  assert.equal(narzedzia.czySzczegolyIist("https://szkoleniaiist.com.pl/zamowienia-publiczne,98464.html"),true);
  assert.equal(narzedzia.czySzczegolyIist("https://szkoleniaiist.com.pl/szkolenia.php"),false);
  assert.equal(narzedzia.czySzczegolyIist("https://szkoleniaiist.com.pl/kategoria/zamowienia,12.html"),false);
  assert.equal(narzedzia.czySzczegolyIist("https://szkoleniaiist.com.pl/formularz-zgloszenia,98464.html"),false);
});

test("parser SEMPER obsługuje relative, absolute, data-url, duplikaty i HTML", () => {
  const wyniki = narzedzia.linkiZWyszukiwarkiSemper(wczytajFixture("semper-autocomplete.html"),TYTUL_REGRESYJNY);
  assert.ok(wyniki.length >= 1);
  assert.ok(wyniki.some(wynik => wynik.url.endsWith("zamowienia-publiczne,123,html")));
  const zakodowany = Buffer.from("https://www.szkolenia-semper.pl/component/trainings/details/prawo-zamowien,456,html").toString("base64");
  const wynikDataUrl = narzedzia.linkiZWyszukiwarkiSemper(`<a href="#" data-url="${zakodowany}">Prawo zamówień publicznych — tryb podstawowy</a>`,TYTUL_REGRESYJNY);
  assert.equal(wynikDataUrl[0]?.url.endsWith("prawo-zamowien,456,html"),true);
});

test("parser SEMPER dekoduje JSON string i direct JSON URL", () => {
  const wyniki = narzedzia.linkiZWyszukiwarkiSemper(wczytajFixture("semper-autocomplete.json"),TYTUL_REGRESYJNY);
  assert.equal(wyniki.length,2);
  assert.equal(narzedzia.urlZJsonSemper('{"url":"/component/trainings/details/szkolenie,123.html"}').endsWith("szkolenie,123.html"),true);
  assert.equal(narzedzia.urlZJsonSemper('{"url":"/szkolenia"}'),"");
});

test("parser wyników IIST normalizuje URL, deduplikuje i odrzuca linki techniczne", () => {
  const wyniki = narzedzia.linkiZWyszukiwarkiIist(wczytajFixture("iist-results.html"),TYTUL_REGRESYJNY,"https://szkoleniaiist.com.pl/szkolenia.php");
  assert.equal(wyniki.length,2);
  assert.ok(wyniki[0].url.startsWith("https://szkoleniaiist.com.pl/"));
  assert.ok(wyniki.every(wynik => !wynik.url.includes("formularz-zgloszenia")));
});
