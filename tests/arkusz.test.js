"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const narzedzia = require("../shared/arkusz");
const kolejka = require("../shared/kolejka-eventis");

test("ujednolicony rekord arkusza zachowuje metadane wiersza i wartości źródłowe", () => {
  const rekord = narzedzia.utworzRekordArkusza({
    status:"CONFIRMED",
    title:"Prawo pracy",
    start:"2026-09-28",
    end:"2026-09-29",
    city:"Warszawa",
    participants:8,
    sheetName:"Wrzesień",
    rowNumber:12,
    rowFingerprint:"abc",
    semperValue:"K",
    iistValue:"",
    rawValues:["Prawo pracy"],
    rawText:"wiersz"
  });
  assert.equal(rekord.normalizedTitle,"prawo pracy");
  assert.equal(rekord.sheetName,"Wrzesień");
  assert.equal(rekord.rowNumber,12);
  assert.equal(rekord.rowFingerprint,"abc");
  assert.deepEqual(rekord.rawValues,["Prawo pracy"]);
});

test("manualny parser rozpoznaje POTWIERDZONE SZKOLENIE i dane ONLINE", () => {
  const rekord = narzedzia.parseManualRecordLine(
    'POTWIERDZONE SZKOLENIE "Prawo zamówień publicznych" 2026.09.28 do 2026.09.29 SZKOLENIE ONLINE 12 osób'
  );
  assert.equal(rekord.status,"CONFIRMED");
  assert.equal(rekord.title,"Prawo zamówień publicznych");
  assert.equal(rekord.normalizedTitle,"prawo zamowien publicznych");
  assert.equal(rekord.start,"2026-09-28");
  assert.equal(rekord.end,"2026-09-29");
  assert.equal(rekord.city,"Online");
  assert.equal(rekord.participants,12);
});

test("manualny parser rozpoznaje ODPOTWIERDZONE, miasto i skrócony zakres", () => {
  const rekord = narzedzia.parseManualRecordLine(
    'ODPOTWIERDZONE "Prawo pracy" 28-29.09.2026 Warszawa 8 osób'
  );
  assert.equal(rekord.status,"DECONFIRMED");
  assert.equal(rekord.title,"Prawo pracy");
  assert.equal(rekord.start,"2026-09-28");
  assert.equal(rekord.end,"2026-09-29");
  assert.equal(rekord.city,"Warszawa");
  assert.equal(rekord.participants,8);
});

test("manualne wklejenie pomija linie bez obsługiwanego statusu", () => {
  const rekordy = narzedzia.parseManualPaste([
    "Nagłówek arkusza",
    'POTWIERDZONE SZKOLENIE "VAT" 2026-09-28 ONLINE',
    'ODPOTWIERDZONE "Kadry" 2026-10-01 Kraków'
  ].join("\n"));
  assert.equal(rekordy.length,2);
});

test("recordKey nie zależy od numeru wiersza", () => {
  const dane = {
    status:"CONFIRMED",
    title:"Prawo pracy",
    normalizedTitle:"prawo pracy",
    start:"2026-09-28",
    end:"2026-09-29",
    city:"Warszawa"
  };
  const pierwszy = narzedzia.recordKey({...dane,rowNumber:10});
  const drugi = narzedzia.recordKey({...dane,rowNumber:25});
  assert.equal(pierwszy,drugi);
  assert.equal(pierwszy,"CONFIRMED|prawo pracy|2026-09-28|2026-09-29|warszawa");
});

test("recordKey zmienia się po zmianie danych semantycznych", () => {
  const dane = {
    status:"CONFIRMED",
    title:"Prawo pracy",
    start:"2026-09-28",
    end:"2026-09-29",
    city:"Warszawa"
  };
  const bazowy = narzedzia.recordKey(dane);
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,status:"DECONFIRMED"}));
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,title:"Prawo podatkowe"}));
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,start:"2026-10-01"}));
  assert.notEqual(bazowy,narzedzia.recordKey({...dane,city:"Kraków"}));
});

test("dopasowanie manualne pozostaje oparte na podobieństwie tytułu", () => {
  const rekord = narzedzia.parseManualRecordLine(
    'POTWIERDZONE SZKOLENIE "Prawo zamówień publicznych" 2026-09-28 ONLINE'
  );
  const dopasowane = narzedzia.matchManualRecordsToCurrent([rekord],"Prawo zamówień publicznych");
  assert.equal(dopasowane.length,1);
  assert.ok(dopasowane[0].similarity>=.58);
});

test("parser rozpoznaje pełną tabelę Markdown bez dzielenia escapowanych pipe", () => {
  const tekst = [
    '| \\| POTWIERDZONE SZKOLENIE \\| "Służebność przesyłu i podziały nieruchomości w praktyce - Kompendium obowiązujących przepisów - 2-dniowe warsztaty szkoleniowe", 2026-09-28 do 2026-09-29, ONLINE, 6 osób |',
    '| --- |',
    '| \\| ODPOTWIERDZONE \\| "Specjalista ds. realizacji procesu inwestycyjnego zgodnie z prawem budowlanym - 3-dniowe warsztaty praktyczne. Możliwość indywidualnych konsultacji. Certyfikowane szkolenie online", 2026-08-24 do 2026-08-26, ONLINE, 2 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Kierownik składowiska odpadów oraz Kierownik spalarni i współspalarni. 2-dniowe szkolenie przygotowujące do państwowego egzaminu w zakresie gospodarowania odpadami \\|próbny egzamin\\|", 2026-09-21 do 2026-09-22, Warszawa, 4 osoby (w tym 2 BUR) |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "MOBBING I PRZECIWDZIAŁANIE MOBBINGOWI (aspekty psychologiczne, społeczne, prawne) – 2-DNIOWE WARSZTATY PRAKTYCZNE. Certyfikowane szkolenie online", 2026-09-21 do 2026-09-22, ONLINE, 2 osoby (w tym 1 BUR) |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Obsługa Klienta Trudnego - profesjonalne warsztaty i ćwiczenia radzenia sobie w kłopotliwych sytuacjach występujących w praktyce urzędniczej. Certyfikowane szkolenie online", 2026-10-14 do 2026-10-14, ONLINE, 3 osoby z BUR |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Zarządzanie Zespołem w Administracji Publicznej - Inspirujące warsztaty praktyczne i efektywny plan zmiany osobistej. Certyfikowane szkolenie online", 2026-09-21 do 2026-09-22, ONLINE, 3 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Specjalista ds. realizacji procesu inwestycyjnego zgodnie z prawem budowlanym - 3-dniowe warsztaty praktyczne. Możliwość indywidualnych konsultacji. Certyfikowane szkolenie online", 2026-09-21 do 2026-09-23, ONLINE, 2 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Utrzymanie i przeglądy techniczne budynków po 2026 r. - nowe obowiązki, dokumentacja i wpisy w c-KOB dla zapewnienia bezpieczeństwa obiektów. 1-dniowe warsztaty szkoleniowe. Certyfikowane szkolenie online", 2026-10-12 do 2026-10-12, ONLINE, 2 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Zamówienia publiczne w praktyce - 2-dniowe szkolenie warsztatowe z uwzględnieniem aktualnych przepisów Prawa zamówień publicznych oraz bieżącego orzecznictwa", 2026-11-02 do 2026-11-03, Warszawa, 6 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Specjalista ds. Zamówień Publicznych - 3-dniowe certyfikowane warsztaty praktyczne z uwzględnieniem aktualnych przepisów PZP", 2026-09-28 do 2026-09-30, Wrocław, 4 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Instrukcja Kancelaryjna - Kompendium wiedzy - 1-dniowe inspirujące warsztaty praktyczne. Certyfikowane szkolenie online", 2026-08-31 do 2026-08-31, ONLINE, 3 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Egzekucja sądowa vs. egzekucja administracyjna - analiza obu procedur, w tym zasady ich stosowania, przepisy, różnice, wady i zalety. 2-dniowe szkolenie warsztatowe", 2026-09-17 do 2026-09-18, Warszawa, 4 osób |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Czas pracy kierowców w praktyce - zasady rozliczania, ewidencja i podstawy obsługi programu 4Trans. 1-dniowe szkolenie warsztatowe. Certyfikowane szkolenie online", 2026-10-09 do 2026-10-09, ONLINE, 8 osób<br><br>Chciałbym móc wklejać również... |'
  ].join("\n");
  const analiza = narzedzia.analizujReczneWklejenie(tekst);
  assert.equal(analiza.records.length,13);
  assert.equal(analiza.records.filter(rekord=>rekord.status==="CONFIRMED").length,12);
  assert.equal(analiza.records.filter(rekord=>rekord.status==="DECONFIRMED").length,1);
  assert.equal(analiza.errors.length,0);
  assert.match(analiza.records[0].title,/Służebność przesyłu/);
  assert.equal(analiza.records[0].start,"2026-09-28");
  assert.equal(analiza.records[0].end,"2026-09-29");
  assert.equal(analiza.records[0].city,"Online");
  assert.equal(analiza.records[0].participants,6);
  assert.equal(analiza.records[1].start,"2026-08-24");
  assert.equal(analiza.records[1].end,"2026-08-26");
  assert.equal(analiza.records[1].city,"Online");
  assert.equal(analiza.records[1].participants,2);
  assert.match(analiza.records[2].title,/\|próbny egzamin\|/);
  assert.equal(analiza.records[2].participants,4);
  assert.equal(analiza.records[4].participants,3);
  assert.doesNotMatch(analiza.records[4].title,/BUR/);
  assert.match(analiza.records[12].title,/Certyfikowane szkolenie online$/);
  assert.doesNotMatch(analiza.records[12].title,/Chciałbym móc/);
});

test("błędny rekord tabeli nie blokuje poprawnego rekordu", () => {
  const analiza = narzedzia.analizujReczneWklejenie([
    '| \\| POTWIERDZONE SZKOLENIE \\| "Prawo pracy", 2026-09-28 do 2026-09-29, Warszawa, 4 osoby |',
    '| \\| POTWIERDZONE SZKOLENIE \\| "Rekord bez daty i lokalizacji", 4 osoby |'
  ].join("\n"));
  assert.equal(analiza.records.length,2);
  assert.equal(analiza.errors.length,1);
  assert.equal(analiza.records[0].error,undefined);
  assert.equal(analiza.records[0].start,"2026-09-28");
  assert.equal(analiza.records[1].error,"Nie rozpoznano daty");
});

test("parser odrzuca pusty tytuł i nieprawidłową datę bez blokowania poprawnego rekordu", () => {
  const analiza = narzedzia.analizujReczneWklejenie([
    'POTWIERDZONE SZKOLENIE "Prawo pracy" 2026-09-28 Warszawa',
    'POTWIERDZONE SZKOLENIE "" 2026-09-29 ONLINE',
    'POTWIERDZONE SZKOLENIE "VAT" 2026-99-99 ONLINE'
  ].join("\n"));
  assert.equal(analiza.records.length,3);
  assert.equal(analiza.errors.length,2);
  assert.equal(analiza.records[0].error,undefined);
  assert.equal(analiza.records[1].error,"Nie rozpoznano tytułu");
  assert.equal(analiza.records[2].error,"Nieprawidłowy zakres dat");
});

test("lista terminów rozpoznaje zakres dat i ONLINE", () => {
  const analiza = narzedzia.analizujListeTerminow(
    "2026-09-28 do 2026-09-29 | ONLINE",
    {title:"Prawo budowlane w praktyce"}
  );
  assert.equal(analiza.errors.length,0);
  assert.equal(analiza.records.length,1);
  assert.equal(analiza.records[0].start,"2026-09-28");
  assert.equal(analiza.records[0].end,"2026-09-29");
  assert.equal(analiza.records[0].city,"Online");
  assert.equal(analiza.records[0].status,"CONFIRMED");
  assert.equal(analiza.records[0].title,"Prawo budowlane w praktyce");
  assert.equal(analiza.records[0].normalizedTitle,"prawo budowlane w praktyce");
});

test("lista terminów ustawia tę samą datę końcową dla jednego dnia", () => {
  const analiza = narzedzia.analizujListeTerminow("2026-09-28 | ONLINE",{title:"Prawo pracy"});
  assert.equal(analiza.errors.length,0);
  assert.equal(analiza.records[0].start,analiza.records[0].end);
});

test("lista terminów zachowuje dowolną lokalizację stacjonarną", () => {
  const analiza = narzedzia.analizujListeTerminow(
    "2026-10-01 do 2026-10-02 | Warszawa",
    {title:"Prawo pracy"}
  );
  assert.equal(analiza.errors.length,0);
  assert.equal(analiza.records[0].city,"Warszawa");
});

test("lista terminów obsługuje wiele wierszy, separatory i warianty zakresu", () => {
  const analiza = narzedzia.analizujListeTerminow([
    "2026-09-28 do 2026-09-29 | ONLINE",
    "2026-10-01 - 2026-10-02, Warszawa",
    "2026-10-15; ONLINE",
    "2026-11-05 – 2026-11-06 | Gdańsk"
  ].join("\n"),{title:"Prawo budowlane w praktyce"});
  assert.equal(analiza.records.length,4);
  assert.equal(analiza.errors.length,0);
  assert.deepEqual(analiza.records.map(rekord => rekord.city),["Online","Warszawa","Online","Gdańsk"]);
});

test("błędny wiersz listy terminów nie blokuje poprawnego", () => {
  const analiza = narzedzia.analizujListeTerminow([
    "2026-09-28 do 2026-09-29 | ONLINE",
    "bzdura"
  ].join("\n"),{title:"Prawo pracy"});
  assert.equal(analiza.records.length,1);
  assert.equal(analiza.errors.length,1);
  assert.equal(analiza.errors[0].lineNumber,2);
});

test("lista terminów odrzuca odwrócony zakres dat", () => {
  const analiza = narzedzia.analizujListeTerminow(
    "2026-10-10 do 2026-10-01 | ONLINE",
    {title:"Prawo pracy"}
  );
  assert.equal(analiza.records.length,0);
  assert.equal(analiza.errors.length,1);
  assert.equal(analiza.errors[0].error,"Data zakończenia poprzedza datę rozpoczęcia");
});

test("lista terminów wymaga lokalizacji", () => {
  const bezWartosci = narzedzia.analizujListeTerminow("2026-10-10 |",{title:"Prawo pracy"});
  const bezSeparatora = narzedzia.analizujListeTerminow("2026-10-10",{title:"Prawo pracy"});
  assert.equal(bezWartosci.records.length,0);
  assert.equal(bezWartosci.errors[0].error,"Brak lokalizacji");
  assert.equal(bezSeparatora.records.length,0);
  assert.equal(bezSeparatora.errors[0].error,"Brak lokalizacji");
});

test("lista terminów normalizuje różną wielkość liter ONLINE", () => {
  for (const lokalizacja of ["ONLINE","Online","online"]) {
    const analiza = narzedzia.analizujListeTerminow(`2026-10-15 | ${lokalizacja}`,{title:"Prawo pracy"});
    assert.equal(analiza.errors.length,0);
    assert.equal(analiza.records[0].city,"Online");
  }
});

test("rekordy listy terminów pozostają rozróżnialne dla SEMPER i IIST", () => {
  const analiza = narzedzia.analizujListeTerminow("2026-10-15 | ONLINE",{title:"Prawo pracy"});
  const semper = kolejka.przygotujElementyKolejki(analiza.records,[],{organization:"SEMPER"}).items[0];
  const iist = kolejka.przygotujElementyKolejki(analiza.records,[],{organization:"IIST"}).items[0];
  assert.equal(semper.organization,"SEMPER");
  assert.equal(iist.organization,"IIST");
  assert.equal(semper.status,"PENDING");
  assert.ok(semper.id);
  assert.equal(semper.recordKey,iist.recordKey);
  assert.notEqual(kolejka.kluczKolejki(semper.organization,semper.recordKey),kolejka.kluczKolejki(iist.organization,iist.recordKey));
});

test("lista terminów odrzuca niepoprawne daty i brak tytułu", () => {
  const niepoprawneDaty = narzedzia.analizujListeTerminow([
    "2026-99-10 | ONLINE",
    "2026-10-10 do 2026-02-30 | Warszawa"
  ].join("\n"),{title:"Prawo pracy"});
  const bezTytulu = narzedzia.analizujListeTerminow("2026-10-15 | ONLINE",{title:" "});
  assert.equal(niepoprawneDaty.records.length,0);
  assert.equal(niepoprawneDaty.errors.length,2);
  assert.equal(niepoprawneDaty.errors[0].error,"Nieprawidłowa data rozpoczęcia");
  assert.equal(niepoprawneDaty.errors[1].error,"Nieprawidłowa data zakończenia");
  assert.equal(bezTytulu.records.length,0);
  assert.equal(bezTytulu.errors[0].error,"Brak tytułu szkolenia");
});

test("częściowe dopasowanie tytułu nie obejmuje innego szkolenia", () => {
  const szkolenieA = narzedzia.analizujListeTerminow([
    "2026-10-01 | ONLINE",
    "2026-10-02 | Warszawa"
  ].join("\n"),{title:"Szkolenie A"}).records;
  const szkolenieB = narzedzia.analizujListeTerminow("2026-10-03 | ONLINE",{title:"Szkolenie B"}).records;
  const dopasowane = narzedzia.matchManualRecordsToCurrent([...szkolenieA,...szkolenieB],"Szkolenie A");

  assert.equal(dopasowane.length,2);
  assert.ok(dopasowane.every(rekord => rekord.title === "Szkolenie A"));
});
