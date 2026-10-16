"use strict";
const test = require("node:test");
const asercje = require("node:assert/strict");
const {chromium:przegladarkaChromium} = require("playwright");

test("panel zachowuje przewinięcie i najpierw wygasza, a potem zwija usuniętą kartę",async () => {
  const przegladarka = await przegladarkaChromium.launch({channel:"msedge",headless:true});
  try {
    const strona = await przegladarka.newPage({viewport:{width:400,height:650}});
    await strona.setContent('<nav><button id="plywajacy">Panel</button><span id="komunikat"></span></nav><aside id="esync-root"></aside>');
    await strona.addStyleTag({path:"content/eventis.css"});
    await strona.addStyleTag({path:"content/akcja-panelu.css"});
    await strona.addStyleTag({path:"sidepanel.css"});
    await strona.evaluate(() => {
      const karta = indeks => `<div data-klucz-karty="${indeks}" class="esync-pozycja-szkolenia" style="height:160px"><button data-queue-remove="${indeks}">Usuń</button></div>`;
      const karty = Array.from({length:12},(_,indeks)=>karta(indeks));
      window.widok = {ok:true,html:`<div class="esync-head">Kolejka</div><div class="esync-body"><div class="esync-card">${karty.join("")}</div></div>`,wersja:1,identyfikatorKarty:17,wartosci:Array.from({length:12},()=>({}))};
      window.odswiezPanel = null;
      window.setInterval = funkcja => { window.odswiezPanel = funkcja; };
      window.chrome = {runtime:{sendMessage:async()=>window.widok}};
    });
    await strona.addScriptTag({path:"sidepanel.js"});
    await strona.waitForSelector('[data-klucz-karty="3"]');
    await strona.evaluate(async () => {
      document.querySelector(".esync-body").scrollTop = 450;
      const widok = document.createElement("div");
      widok.innerHTML = window.widok.html;
      widok.querySelector('[data-klucz-karty="3"]').remove();
      window.widok = {...window.widok,html:widok.innerHTML,wersja:2,wartosci:Array.from({length:11},()=>({}))};
      await window.odswiezPanel();
    });
    asercje.equal(await strona.locator(".esync-body").evaluate(element=>element.scrollTop),450);
    await strona.locator('[data-klucz-karty="3"]').evaluate(element => { const animacja = element.getAnimations()[0]; animacja.pause(); animacja.currentTime = 90; });
    const wygaszanie = await strona.locator('[data-klucz-karty="3"]').evaluate(element=>({wysokosc:element.getBoundingClientRect().height,przezroczystosc:Number(getComputedStyle(element).opacity)}));
    asercje.equal(wygaszanie.wysokosc,160);
    asercje.ok(wygaszanie.przezroczystosc<1);
    await strona.locator('[data-klucz-karty="3"]').evaluate(element => element.getAnimations()[0].finish());
    await strona.waitForFunction(() => document.querySelector('[data-klucz-karty="3"]').getAnimations().length === 2);
    await strona.locator('[data-klucz-karty="3"]').evaluate(element => { const animacja = element.getAnimations()[1]; animacja.pause(); animacja.currentTime = 120; });
    const zwijanie = await strona.locator('[data-klucz-karty="3"]').evaluate(element=>({wysokosc:element.getBoundingClientRect().height,przezroczystosc:Number(getComputedStyle(element).opacity)}));
    asercje.equal(zwijanie.przezroczystosc,0);
    asercje.ok(zwijanie.wysokosc<160);
    await strona.locator('[data-klucz-karty="3"]').evaluate(element => element.getAnimations()[1].finish());
    await strona.waitForSelector('[data-klucz-karty="3"]',{state:"detached"});
    asercje.equal(await strona.locator(".esync-body").evaluate(element=>element.scrollTop),450);
  } finally { await przegladarka.close(); }
});
