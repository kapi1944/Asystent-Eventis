"use strict";
const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const sciezki = require("node:path");
const {chromium:przegladarkaChromium} = require("playwright");

test("MV3: natywne API, przycisk z gestem, nawigacja, karty, obce domeny i zamknięcie",async podtest => {
  const profil = pliki.mkdtempSync(sciezki.join(require("node:os").tmpdir(),"eventis-panel-mv3-"));
  const rozszerzenie = sciezki.resolve(__dirname,"..");
  const kanal = process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge";
  const kontekst = await przegladarkaChromium.launchPersistentContext(profil,{
    channel:kanal,headless:true,ignoreDefaultArgs:["--disable-extensions"],
    args:kanal === "chrome" ? ["--enable-unsafe-extension-debugging"]
      : [`--disable-extensions-except=${rozszerzenie}`,`--load-extension=${rozszerzenie}`]
  });
  podtest.diagnostic("Przeglądarka: " + kanal + " " + kontekst.browser().version());
  podtest.after(async () => {
    await kontekst.close();
    const katalogTymczasowy = sciezki.resolve(require("node:os").tmpdir()) + sciezki.sep;
    if (sciezki.resolve(profil).startsWith(katalogTymczasowy) && sciezki.basename(profil).startsWith("eventis-panel-mv3-")) pliki.rmSync(profil,{recursive:true,force:true});
  });
  if (kanal === "chrome") {
    const sesja = await kontekst.browser().newBrowserCDPSession();
    await sesja.send("Extensions.loadUnpacked",{path:rozszerzenie});
    await sesja.detach();
  }
  await kontekst.route("https://**/*",trasa => trasa.fulfill({contentType:"text/html; charset=utf-8",body:'<!doctype html><html><meta charset="utf-8"><body><h1>Test panelu Eventis</h1><a href="/szkolenia/drugie">Następne ogłoszenie</a></body></html>'}));
  let pracownik = kontekst.serviceWorkers()[0] || await kontekst.waitForEvent("serviceworker",{timeout:10000});
  const bledy = [];
  kontekst.on("weberror",blad => bledy.push(blad.error().message));
  const karta = await kontekst.newPage();
  await karta.goto("https://eventis.pl/szkolenia/pierwsze");
  const identyfikator = await pracownik.evaluate(async () => (await chrome.tabs.query({url:"https://eventis.pl/szkolenia/pierwsze"}))[0].id);
  const poczekaj = async (sprawdz,argument) => {
    for (let proba=0;proba<100;proba++) {
      if (await pracownik.evaluate(sprawdz,argument)) return;
      await new Promise(rozwiaz=>setTimeout(rozwiaz,50));
    }
    asercje.fail("Nie osiągnięto oczekiwanego stanu panelu: " + String(sprawdz));
  };
  await poczekaj(async identyfikator => (await chrome.sidePanel.getOptions({tabId:identyfikator})).enabled,identyfikator);
  asercje.equal(await pracownik.evaluate(identyfikator=>chrome.action.isEnabled(identyfikator),identyfikator),true);
  await karta.locator("#esync-tryb-panelu").waitFor({state:"visible"});
  asercje.equal(await karta.locator("#esync-root").isHidden(),true);
  // Prawdziwy klik content scriptu, bez bezpośredniego open() w pracowniku.
  await karta.locator("#esync-tryb-panelu").click();
  await poczekaj(identyfikator=>kontrolerPanelu.stan(identyfikator)==="OPEN",identyfikator);
  asercje.equal(await pracownik.evaluate(async () => (await chrome.storage.local.get("eventisTrybPanelu")).eventisTrybPanelu),"boczny");
  await karta.locator("#esync-tryb-panelu").waitFor({state:"hidden"});
  const opcjePrzed = await pracownik.evaluate(identyfikator=>chrome.sidePanel.getOptions({tabId:identyfikator}),identyfikator);
  await karta.getByText("Następne ogłoszenie",{exact:true}).click();
  await karta.reload();
  asercje.deepEqual(await pracownik.evaluate(identyfikator=>chrome.sidePanel.getOptions({tabId:identyfikator}),identyfikator),opcjePrzed);

  const druga = await kontekst.newPage();
  await druga.goto("https://eventis.pl/szkolenia/inne");
  const drugiId = await pracownik.evaluate(async () => (await chrome.tabs.query({url:"https://eventis.pl/szkolenia/inne"}))[0].id);
  await poczekaj(async identyfikator=>(await chrome.sidePanel.getOptions({tabId:identyfikator})).enabled,drugiId);
  const drugiPanel = await pracownik.evaluate(identyfikator=>chrome.sidePanel.getOptions({tabId:identyfikator}),drugiId);
  asercje.notEqual(drugiPanel.path,opcjePrzed.path);
  await druga.locator("#esync-tryb-panelu").click();
  await poczekaj(identyfikator=>kontrolerPanelu.stan(identyfikator)==="OPEN",drugiId);

  const obca = await kontekst.newPage();
  for (const adres of ["https://google.com/","https://www.szkolenia-semper.pl/","https://szkoleniaiist.com.pl/"]) {
    await obca.goto(adres);
    await poczekaj(async () => {
      const [karta] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
      return (await chrome.sidePanel.getOptions({tabId:karta.id})).enabled === false && !await chrome.action.isEnabled(karta.id);
    });
    asercje.equal(await obca.locator("#esync-root,#esync-tryb-panelu").count(),0);
  }
  await karta.bringToFront();
  await poczekaj(async identyfikator=>(await chrome.sidePanel.getOptions({tabId:identyfikator})).enabled,identyfikator);
  await poczekaj(identyfikator=>kontrolerPanelu.stan(identyfikator)==="OPEN",identyfikator);

  const nowaStrona = kontekst.waitForEvent("page");
  const drugieOkno = await pracownik.evaluate(async () => {
    const okno = await chrome.windows.create({url:"about:blank",focused:true});
    return {identyfikator:okno.id,karta:okno.tabs[0].id};
  });
  await (await nowaStrona).goto("https://eventis.pl/szkolenia/drugie-okno");
  await poczekaj(async identyfikator=>(await chrome.sidePanel.getOptions({tabId:identyfikator})).enabled,drugieOkno.karta);
  asercje.equal(await pracownik.evaluate(async ({identyfikator,karta}) => {
    const [aktywna] = await chrome.tabs.query({active:true,windowId:identyfikator});
    return aktywna.id === karta && (await chrome.sidePanel.getOptions({tabId:karta})).path === `sidepanel.html?karta=${karta}`;
  },drugieOkno),true);
  asercje.deepEqual(await pracownik.evaluate(identyfikator=>chrome.sidePanel.getOptions({tabId:identyfikator}),identyfikator),opcjePrzed);
  await pracownik.evaluate(identyfikator=>chrome.windows.remove(identyfikator),drugieOkno.identyfikator);
  await karta.bringToFront();
  const sesjaPracownika = await kontekst.newCDPSession(karta);
  const wersje = [];
  sesjaPracownika.on("ServiceWorker.workerVersionUpdated",dane => wersje.push(...dane.versions));
  await sesjaPracownika.send("ServiceWorker.enable");
  for (let proba=0;proba<100 && !wersje.some(wersja=>wersja.scriptURL===pracownik.url());proba++) await new Promise(rozwiaz=>setTimeout(rozwiaz,20));
  const wersjaPracownika = wersje.findLast(wersja=>wersja.scriptURL===pracownik.url() && wersja.runningStatus === "running");
  asercje.ok(wersjaPracownika,"CDP udostępnia wersję service workera rozszerzenia");
  const adresPracownika = pracownik.url();
  await pracownik.evaluate(()=>{ globalThis.znacznikPrzedRestartem = true; });
  await sesjaPracownika.send("ServiceWorker.stopWorker",{versionId:wersjaPracownika.versionId});
  await karta.reload();
  let zrestartowano = false;
  for (let proba=0;proba<100;proba++) {
    const kandydat = kontekst.serviceWorkers().find(pracownik=>pracownik.url() === adresPracownika);
    if (kandydat && await kandydat.evaluate(()=>globalThis.znacznikPrzedRestartem !== true).catch(()=>false)) {
      pracownik = kandydat;
      zrestartowano = true;
      break;
    }
    await new Promise(rozwiaz=>setTimeout(rozwiaz,50));
  }
  asercje.ok(zrestartowano,"Restart workera usuwa jego poprzednią pamięć operacyjną: " + JSON.stringify(wersje));
  await sesjaPracownika.detach();
  await poczekaj(identyfikator=>kontrolerPanelu.stan(identyfikator)==="OPEN",identyfikator);
  asercje.deepEqual(await pracownik.evaluate(identyfikator=>chrome.sidePanel.getOptions({tabId:identyfikator}),identyfikator),opcjePrzed);
  asercje.equal(await pracownik.evaluate(async ()=>(await chrome.storage.local.get("eventisTrybPanelu")).eventisTrybPanelu),"boczny");
  for (let proba=0;proba<4;proba++) {
    await druga.bringToFront();
    await karta.bringToFront();
  }
  await poczekaj(identyfikator=>kontrolerPanelu.stan(identyfikator)==="OPEN",identyfikator);
  // Wspólny cykl zamknięcia API i przycisku Chrome; nie udajemy kliknięcia w chrome:// UI.
  const moznaZamknac = await pracownik.evaluate(()=>typeof chrome.sidePanel.close === "function");
  if (moznaZamknac) {
    await pracownik.evaluate(identyfikator=>chrome.sidePanel.close({tabId:identyfikator}),identyfikator);
    await poczekaj(identyfikator=>kontrolerPanelu.stan(identyfikator)==="CLOSED",identyfikator);
    await karta.locator("#esync-tryb-panelu").waitFor({state:"visible"});
    await karta.reload();
    await karta.locator("#esync-tryb-panelu").waitFor({state:"visible"});
    asercje.equal(await pracownik.evaluate(identyfikator=>kontrolerPanelu.stan(identyfikator),identyfikator),"CLOSED");
  } else podtest.diagnostic("Brak sidePanel.close w tej wersji przeglądarki — zamknięcie sprawdzają testy jednostkowe.");
  await karta.goto("https://google.com/");
  await poczekaj(async identyfikator=>(await chrome.sidePanel.getOptions({tabId:identyfikator})).enabled === false,identyfikator);
  await karta.goto("https://eventis.pl/szkolenia/powrot");
  await karta.locator("#esync-tryb-panelu").waitFor({state:"visible"});
  asercje.equal(await pracownik.evaluate(async () => (await chrome.sidePanel.getOptions({})).enabled),false);
  asercje.deepEqual(bledy,[]);
});
