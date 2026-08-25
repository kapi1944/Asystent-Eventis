"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const narzedzia = require("../shared/opisy-semper");

function sekcja(kod,tytul,tresc) {
  return `<b class="text_over ${kod}">${tytul}</b>${tresc}`;
}

test("parser przypisuje wszystkie sekcje SEMPER według markerów scc", () => {
  const wynik = narzedzia.parsujOpisySemper([
    '<div class="scc3 text_over">Grupa docelowa</div><p>Grupa A</p>',
    sekcja("scc4","Cel szkolenia","<p>Cel B</p>"),
    sekcja("scc5","Korzyści","<p>Korzyść C</p>"),
    sekcja("scc8","Program szkolenia","<p>Program D</p>")
  ].join(""));
  assert.match(wynik.grupaHtml,/Grupa A/);
  assert.match(wynik.celHtml,/Cel B/);
  assert.match(wynik.korzysciHtml,/Korzyść C/);
  assert.match(wynik.programHtml,/Program D/);
});

test("brak scc5 nie usuwa wyników pozostałych sekcji", () => {
  const wynik = narzedzia.parsujOpisySemper([
    sekcja("scc3","Grupa docelowa","<p>Grupa</p>"),
    sekcja("scc4","Cel szkolenia","<p>Cel</p>"),
    sekcja("scc8","Program szkolenia","<p>Program</p>")
  ].join(""));
  assert.equal(wynik.korzysciHtml,"");
  assert.match(wynik.grupaHtml,/Grupa/);
  assert.match(wynik.celHtml,/Cel/);
  assert.match(wynik.programHtml,/Program/);
});

test("sanityzacja usuwa bloki techniczne i marketingowe", () => {
  const wynik = narzedzia.parsujOpisySemper(sekcja("scc8","Program szkolenia",[
    "<p>Właściwy moduł</p>",
    "<p>Program szkolenia jest własnością intelektualną SEMPER i nie może być kopiowany.</p>",
    "<p>Program szkolenia stanowi prawnie chronioną własność intelektualną organizatora.</p>",
    "<p>Szkolenie realizowane w ramach programu partnerskiego.</p>",
    "<p>W przypadku szkolenia w formule on-line szczegóły techniczne przesyłamy e-mailem.</p>",
    "<p>Polityka rabatowa dostępna jest u organizatora.</p>"
  ].join("")));
  assert.match(wynik.programHtml,/Właściwy moduł/);
  assert.doesNotMatch(wynik.programHtml,/własno|partnersk|formule on-line|rabato/i);
});

test("sanityzacja zachowuje listy, numerację i podstawowe formatowanie", () => {
  const wynik = narzedzia.parsujOpisySemper(sekcja("scc8","Program szkolenia","<strong>Moduł I</strong><ol><li>Punkt pierwszy</li><li><em>Punkt drugi</em></li></ol>"));
  assert.match(wynik.programHtml,/<strong>Moduł I<\/strong>/);
  assert.match(wynik.programHtml,/<ol>/);
  assert.match(wynik.programHtml,/<li>Punkt pierwszy<\/li>/);
  assert.match(wynik.programHtml,/<em>Punkt drugi<\/em>/);
});

test("sanityzacja usuwa niebezpieczne elementy i wszystkie atrybuty", () => {
  const wynik = narzedzia.parsujOpisySemper(sekcja("scc4","Cel szkolenia",'<script>alert(1)</script><img src=x onerror=alert(1)><p id="cel" class="x" style="color:red" onclick="alert(1)">bezpieczny tekst</p><a href="javascript:alert(1)">link tekstowy</a>'));
  assert.doesNotMatch(wynik.celHtml,/<script|<img|onclick|onerror|style=|class=|id=/i);
  assert.match(wynik.celHtml,/<p>bezpieczny tekst<\/p>/);
  assert.match(wynik.celHtml,/link tekstowy/);
  assert.doesNotMatch(wynik.celHtml,/<a\b/i);
});

test("mapowanie opisów do pól Eventis jest zgodne z regułą biznesową", () => {
  assert.deepEqual(narzedzia.MAPOWANIE_POL_OPISOWYCH.map(({klucz,pole})=>[klucz,pole]),[
    ["celHtml","event[information]"],
    ["korzysciHtml","event[reason]"],
    ["grupaHtml","event[forWho]"],
    ["programHtml","event[plan]"]
  ]);
});
