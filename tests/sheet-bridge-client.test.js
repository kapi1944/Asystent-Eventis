"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const klient = require("../background/sheet-bridge-client");

function odpowiedzHttp(tresc, status=200) {
  return {
    ok:status >= 200 && status < 300,
    status,
    async text() {
      return typeof tresc === "string" ? tresc : JSON.stringify(tresc);
    }
  };
}

function konfiguracja(nadpisania={}) {
  return {
    action:"health",
    requestId:"zadanie-1",
    sheetBridgeEnabled:true,
    sheetBridgeUrl:"https://script.google.com/macros/s/test/exec",
    sheetBridgeKey:"tajny-klucz",
    sheetName:"",
    timeoutMs:100,
    ...nadpisania
  };
}

test("walidacja przyjmuje poprawną odpowiedź Bridge", () => {
  const odpowiedz = {
    ok:true,
    code:"HEALTH_OK",
    requestId:"zadanie-1",
    bridgeVersion:"1",
    data:{spreadsheetAccessible:true}
  };
  assert.equal(klient.walidujOdpowiedzMostu(odpowiedz,"zadanie-1"),odpowiedz);
});

test("walidacja odrzuca błędny requestId i wersję protokołu", () => {
  assert.throws(
    ()=>klient.walidujOdpowiedzMostu({
      ok:true,
      code:"HEALTH_OK",
      requestId:"inne-zadanie",
      bridgeVersion:"1",
      data:{}
    },"zadanie-1"),
    blad=>blad.kodMostu === "REQUEST_ID_MISMATCH"
  );
  assert.throws(
    ()=>klient.walidujOdpowiedzMostu({
      ok:true,
      code:"HEALTH_OK",
      requestId:"zadanie-1",
      bridgeVersion:"2",
      data:{}
    },"zadanie-1"),
    blad=>blad.kodMostu === "BRIDGE_VERSION_UNSUPPORTED"
  );
});

test("parser readRows normalizuje rekordy i wymaga fingerprintu SHA-256 hex", () => {
  const odcisk = "ab".repeat(32);
  const dane = klient.parsujWierszeOdczytu({
    sheetName:"Wrzesień",
    headerRowNumber:3,
    rows:[{
      rowNumber:12,
      rawValues:["POTWIERDZONE SZKOLENIE",null,8],
      semperValue:null,
      iistValue:"K",
      rowFingerprint:odcisk.toUpperCase()
    }]
  });
  assert.equal(dane.sheetName,"Wrzesień");
  assert.equal(dane.headerRowNumber,3);
  assert.deepEqual(dane.rows[0],{
    sheetName:"Wrzesień",
    rowNumber:12,
    rawValues:["POTWIERDZONE SZKOLENIE","","8"],
    semperValue:"",
    iistValue:"K",
    rowFingerprint:odcisk
  });
  assert.throws(
    ()=>klient.parsujWierszeOdczytu({
      sheetName:"Wrzesień",
      rows:[{rowNumber:12,rawValues:[],rowFingerprint:"niepoprawny"}]
    }),
    blad=>blad.kodMostu === "INVALID_READ_ROWS"
  );
});

test("brak konfiguracji kończy się stabilnym błędem bez requestu", async () => {
  let liczbaWywolan = 0;
  const pobierz = async () => {
    liczbaWywolan++;
    return odpowiedzHttp({});
  };
  const wylaczony = await klient.wykonajZadanieMostu(
    konfiguracja({sheetBridgeEnabled:false}),
    {pobierz}
  );
  assert.equal(wylaczony.code,"CONFIG_DISABLED");

  const bezAdresu = await klient.wykonajZadanieMostu(
    konfiguracja({sheetBridgeUrl:""}),
    {pobierz}
  );
  assert.equal(bezAdresu.code,"CONFIG_URL_MISSING");

  const bezKlucza = await klient.wykonajZadanieMostu(
    konfiguracja({sheetBridgeKey:""}),
    {pobierz}
  );
  assert.equal(bezKlucza.code,"CONFIG_KEY_MISSING");

  const niedozwolonyHost = await klient.wykonajZadanieMostu(
    konfiguracja({sheetBridgeUrl:"https://example.com/bridge"}),
    {pobierz}
  );
  assert.equal(niedozwolonyHost.code,"CONFIG_URL_NOT_ALLOWED");
  assert.equal(liczbaWywolan,0);
});

test("klient wysyła POST JSON, klucz w body i śledzi redirect", async () => {
  let przechwyconyAdres = "";
  let przechwyconeOpcje = null;
  const wynik = await klient.wykonajZadanieMostu(
    konfiguracja(),
    {
      pobierz:async (adres, opcje)=>{
        przechwyconyAdres = adres;
        przechwyconeOpcje = opcje;
        return odpowiedzHttp({
          ok:true,
          code:"HEALTH_OK",
          requestId:"zadanie-1",
          bridgeVersion:"1",
          data:{spreadsheetAccessible:true,sheetCount:4}
        });
      }
    }
  );
  const zadanie = JSON.parse(przechwyconeOpcje.body);
  assert.equal(wynik.ok,true);
  assert.equal(przechwyconeOpcje.method,"POST");
  assert.equal(przechwyconeOpcje.redirect,"follow");
  assert.equal(przechwyconyAdres.includes("tajny-klucz"),false);
  assert.equal(zadanie.apiKey,"tajny-klucz");
  assert.deepEqual(zadanie.payload,{});
});

test("readRows wysyła wyłącznie skonfigurowaną nazwę karty", async () => {
  let wyslanyLadunek = null;
  const odcisk = "cd".repeat(32);
  const wynik = await klient.wykonajZadanieMostu(
    konfiguracja({action:"readRows",sheetName:"Październik"}),
    {
      pobierz:async (_adres, opcje)=>{
        wyslanyLadunek = JSON.parse(opcje.body).payload;
        return odpowiedzHttp({
          ok:true,
          code:"ROWS_READ",
          requestId:"zadanie-1",
          bridgeVersion:"1",
          data:{
            sheetName:"Październik",
            headerRowNumber:2,
            rows:[{
              sheetName:"Październik",
              rowNumber:7,
              rawValues:["ODPOTWIERDZONE"],
              semperValue:"",
              iistValue:"",
              rowFingerprint:odcisk
            }]
          }
        });
      }
    }
  );
  assert.deepEqual(wyslanyLadunek,{sheetName:"Październik"});
  assert.equal(wynik.data.rows.length,1);
});

test("błędy HTTP, JSON i Bridge mają stabilne kody", async () => {
  const bladHttp = await klient.wykonajZadanieMostu(
    konfiguracja(),
    {pobierz:async()=>odpowiedzHttp("",503)}
  );
  assert.equal(bladHttp.code,"HTTP_ERROR");
  assert.equal(bladHttp.data.httpStatus,503);

  const bladJson = await klient.wykonajZadanieMostu(
    konfiguracja(),
    {pobierz:async()=>odpowiedzHttp("<html>")}
  );
  assert.equal(bladJson.code,"INVALID_JSON");

  const bladBridge = await klient.wykonajZadanieMostu(
    konfiguracja(),
    {pobierz:async()=>odpowiedzHttp({
      ok:false,
      code:"AUTH_INVALID",
      requestId:"zadanie-1",
      bridgeVersion:"1",
      data:{message:"Nieprawidłowy klucz Bridge."}
    })}
  );
  assert.equal(bladBridge.code,"AUTH_INVALID");
});

test("timeout przerywa request i zwraca stabilny kod", async () => {
  const wynik = await klient.wykonajZadanieMostu(
    konfiguracja({timeoutMs:5}),
    {
      pobierz:(_adres, opcje)=>new Promise((_rozwiaz,odrzuc)=>{
        opcje.signal.addEventListener("abort",()=>{
          const blad = new Error("przerwano");
          blad.name = "AbortError";
          odrzuc(blad);
        },{once:true});
      })
    }
  );
  assert.equal(wynik.code,"TIMEOUT");
});
