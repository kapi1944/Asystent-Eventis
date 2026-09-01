"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const operacje = require("../shared/operacje-eventis");
const kolejka = require("../shared/kolejka-eventis");

function plan(operationId, operationScopeKey, organization = "SEMPER") {
  return { operationId, operationScopeKey, organization, status:"CLAIMED", queueItemIds:[] };
}

function magazynPamięci(poczatkowyStan = {}) {
  let stan = { ...poczatkowyStan };
  return {
    async pobierz() { return { ...stan }; },
    async zapisz(nowyStan) { stan = { ...nowyStan }; },
    stan() { return { ...stan }; }
  };
}

test("dwa równoczesne claimy mają dokładnie jednego właściciela", async () => {
  let stan = {};
  let liczbaOdczytowPoczatkowych = 0;
  let odblokujOdczyty;
  const bariera = new Promise(rozwiaz => { odblokujOdczyty = rozwiaz; });
  const magazyn = {
    async pobierz() {
      if (liczbaOdczytowPoczatkowych++ < 2) {
        if (liczbaOdczytowPoczatkowych === 2) odblokujOdczyty();
        await bariera;
        return {};
      }
      return { ...stan };
    },
    async zapisz(nowyStan) { stan = { ...nowyStan }; }
  };
  const pierwsza = plan("operacja-A","SEMPER|event:123");
  const druga = plan("operacja-B","SEMPER|event:123");

  const [wynikA,wynikB] = await Promise.all([
    operacje.uzyskajClaimOperacji(magazyn,pierwsza),
    operacje.uzyskajClaimOperacji(magazyn,druga)
  ]);

  assert.equal([wynikA,wynikB].filter(wynik=>wynik.ok).length,1);
  assert.equal(stan["SEMPER|event:123"].operationId,"operacja-B");
});

test("przegrywający claim nie wykonuje mutacji DOM", async () => {
  const scope = "SEMPER|event:123";
  const magazyn = magazynPamięci({[scope]:plan("właściciel",scope)});
  let liczbaMutacjiDom = 0;

  const wynik = await operacje.wykonajPoUzyskaniuClaimu(
    () => operacje.uzyskajClaimOperacji(magazyn,plan("przegrany",scope)),
    async () => { liczbaMutacjiDom++; }
  );

  assert.equal(wynik.ok,false);
  assert.equal(liczbaMutacjiDom,0);
});

test("zwycięzca claimu wykonuje mutację formularza dokładnie raz", async () => {
  const scope = "SEMPER|event:123";
  const magazyn = magazynPamięci();
  let liczbaMutacjiDom = 0;

  const wynik = await operacje.wykonajPoUzyskaniuClaimu(
    () => operacje.uzyskajClaimOperacji(magazyn,plan("zwycięzca",scope)),
    async () => { liczbaMutacjiDom++; return "dodano"; }
  );

  assert.equal(wynik.ok,true);
  assert.equal(wynik.wynik,"dodano");
  assert.equal(liczbaMutacjiDom,1);
});

test("dwa różne ogłoszenia mają niezależne claimy", async () => {
  const magazyn = magazynPamięci();
  const pierwsza = await operacje.uzyskajClaimOperacji(magazyn,plan("A","SEMPER|event:123"));
  const druga = await operacje.uzyskajClaimOperacji(magazyn,plan("B","SEMPER|event:456"));

  assert.equal(pierwsza.ok,true);
  assert.equal(druga.ok,true);
});

test("nowe formularze są rozróżniane tokenem dokumentu, a nie tytułem", () => {
  const pierwszy = operacje.kluczClaimuOperacji("SEMPER","add","new:tytuł","dokument-A");
  const drugi = operacje.kluczClaimuOperacji("SEMPER","add","new:tytuł","dokument-B");

  assert.equal(pierwszy,"SEMPER|add:dokument-A");
  assert.equal(drugi,"SEMPER|add:dokument-B");
  assert.notEqual(pierwszy,drugi);
});

test("SEMPER i IIST nie współdzielą ownership", async () => {
  const magazyn = magazynPamięci();
  const semper = await operacje.uzyskajClaimOperacji(magazyn,plan("A","SEMPER|event:123","SEMPER"));
  const iist = await operacje.uzyskajClaimOperacji(magazyn,plan("B","IIST|event:123","IIST"));

  assert.equal(semper.ok,true);
  assert.equal(iist.ok,true);
});

test("WAITING_FOR_SAVE otrzymuje operationId właściciela", () => {
  const operacja = {operationId:"operacja-1",organization:"SEMPER",queueItemIds:["kolejka-1"]};
  const wynik = kolejka.oznaczElementyOczekujaceOperacji([
    {id:"kolejka-1",organization:"SEMPER",status:"PENDING"},
    {id:"kolejka-2",organization:"SEMPER",status:"PENDING"}
  ],operacja);

  assert.equal(wynik[0].status,"WAITING_FOR_SAVE");
  assert.equal(wynik[0].operationId,"operacja-1");
  assert.equal(wynik[1].status,"PENDING");
});

test("przegrany claim nie tworzy rekordu WAITING_FOR_SAVE", async () => {
  const scope = "SEMPER|event:123";
  const magazyn = magazynPamięci({[scope]:plan("właściciel",scope)});
  const operacja = {...plan("przegrany",scope),queueItemIds:["kolejka-1"]};
  let wynikKolejki = [{id:"kolejka-1",organization:"SEMPER",status:"PENDING"}];

  const wynik = await operacje.wykonajPoUzyskaniuClaimu(
    () => operacje.uzyskajClaimOperacji(magazyn,operacja),
    async operacjaWlasciciela => { wynikKolejki = kolejka.oznaczElementyOczekujaceOperacji(wynikKolejki,operacjaWlasciciela); }
  );

  assert.equal(wynik.ok,false);
  assert.equal(wynikKolejki[0].status,"PENDING");
  assert.equal(wynikKolejki[0].operationId,undefined);
});

test("nowa operacja nie rozlicza starego WAITING_FOR_SAVE bez ownership", () => {
  const operacja = {operationId:"nowa",organization:"SEMPER",queueItemIds:["kolejka-1"]};
  const wynik = kolejka.rozliczElementyOperacji(
    [{id:"kolejka-1",organization:"SEMPER",status:"WAITING_FOR_SAVE"}],
    operacja,
    "DONE"
  );

  assert.equal(wynik[0].status,"WAITING_FOR_SAVE");
});

test("wysłanie formularza ma osobny stan przed potwierdzeniem zapisu", () => {
  const operacja = {operationId:"operacja-1",status:"WAITING_FOR_SAVE"};
  const wyslana = operacje.oznaczWyslanieZapisu(operacja,"2026-09-01T14:00:00.000Z");
  assert.equal(wyslana.status,"SAVE_SUBMITTED");
  assert.equal(wyslana.saveRequestedAt,"2026-09-01T14:00:00.000Z");
  assert.equal(operacje.oznaczWyslanieZapisu({...operacja,status:"CLAIMED"}),null);
});
