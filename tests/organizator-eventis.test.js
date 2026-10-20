const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { rozpoznajOrganizatora } = require("../shared/organizator-eventis");
const kodAsystenta = fs.readFileSync(require.resolve("../content/eventis.js"),"utf8");

test("rozpoznaje nazwę firmy SEMPER niezależnie od wielkości liter i formatowania", () => {
  assert.equal(rozpoznajOrganizatora("SEMPER"), "SEMPER");
  assert.equal(rozpoznajOrganizatora("Centrum Organizacji Szkoleń i Konferencji SEMPER"), "SEMPER");
  assert.equal(rozpoznajOrganizatora("  centrum   organizacji szkoleń i konferencji semper. "), "SEMPER");
});

test("rozpoznaje IIST po jednoznacznym skrócie w nazwie firmy", () => {
  assert.equal(rozpoznajOrganizatora("IIST"), "IIST");
  assert.equal(rozpoznajOrganizatora("Organizator IIST"), "IIST");
});

test("nie zgaduje organizatora po częściowym dopasowaniu ani sprzecznych nazwach", () => {
  assert.equal(rozpoznajOrganizatora("Firma szkoleniowa"), "UNKNOWN");
  assert.equal(rozpoznajOrganizatora("Semperium"), "UNKNOWN");
  assert.equal(rozpoznajOrganizatora("SEMPER IIST"), "UNKNOWN");
  assert.equal(rozpoznajOrganizatora(""), "UNKNOWN");
});

function utworzWykrywaniePolaFirmy(etykiety, pola = []) {
  const formularz = {
    contains:element => pola.includes(element),
    querySelectorAll:selektor => selektor === 'label' ? etykiety : pola
  };
  const dokument = {
    getElementById:identyfikator => pola.find(pole => pole.id === identyfikator) || null
  };
  const pobierz = selektor => selektor === "form#eventForm" || selektor === "form" ? formularz : null;
  const pobierzWiele = (selektor, rodzic) => rodzic === formularz
    ? (selektor === "label" ? etykiety : pola)
    : [];
  const poczatek = kodAsystenta.indexOf("  function odczytajWartoscPola(");
  const koniec = kodAsystenta.indexOf("  async function zastosujOrganizatora(",poczatek);
  const fragment = kodAsystenta.slice(poczatek,koniec);
  return vm.runInNewContext(`${fragment};({znajdzPoleFirmy,wykryjOrganizatora})`,{
    $:pobierz,$$:pobierzWiele,document:dokument,location:{pathname:"/event/edit/123",search:""},
    cleanLine:tekst=>String(tekst||"").replace(/\s+/g," ").trim(),
    NARZEDZIA_ORGANIZATORA:{rozpoznajOrganizatora}
  });
}

test("odczytuje organizatora z wartości rzeczywistego pola Firma formularza Eventis", () => {
  const pole = {
    tagName:"INPUT",value:"Centrum Organizacji Szkoleń i Konferencji SEMPER",id:"event-company",
    getAttribute:() => ""
  };
  const etykieta = {
    textContent:"Firma:",htmlFor:"event-company",control:pole,
    querySelector:() => null,parentElement:{querySelector:() => pole}
  };
  const wykrywanie = utworzWykrywaniePolaFirmy([etykieta],[pole]);
  assert.deepEqual({...wykrywanie.wykryjOrganizatora()},{organization:"SEMPER",status:"SEMPER",value:pole.value});
});

test("odczytuje zaznaczoną nazwę firmy z pola select i nie używa poprzedniego źródła przy braku pola", () => {
  const opcja = {label:"IIST",textContent:"IIST",value:"firma-27"};
  const pole = {tagName:"SELECT",selectedOptions:[opcja],value:opcja.value,id:"firma",getAttribute:() => ""};
  const etykieta = {textContent:"Firma",htmlFor:"firma",control:pole,querySelector:() => null};
  const wykrywanie = utworzWykrywaniePolaFirmy([etykieta],[pole]);
  assert.equal(wykrywanie.wykryjOrganizatora().organization,"IIST");
  assert.equal(utworzWykrywaniePolaFirmy([],[]).wykryjOrganizatora().status,"LOADING");
});

test("nieznana firma w formularzu pozostaje UNKNOWN", () => {
  const pole = {tagName:"INPUT",value:"Akademia Nowych Kompetencji",id:"firma",getAttribute:() => ""};
  const etykieta = {textContent:"Firma",htmlFor:"firma",control:pole,querySelector:() => null};
  assert.equal(utworzWykrywaniePolaFirmy([etykieta],[pole]).wykryjOrganizatora().status,"UNKNOWN");
});
