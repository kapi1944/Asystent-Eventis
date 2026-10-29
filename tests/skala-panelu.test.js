"use strict";
const test=require('node:test');
const asercje=require('node:assert/strict');
const {chromium:przegladarki}=require('playwright');
test('skala: zakres, krok, reset, pamięć trybów i rzeczywisty układ DOM',async () => {
 const przegladarka=await przegladarki.launch({channel:'msedge',headless:true});
 try {
 const strona=await przegladarka.newPage({viewport:{width:1000,height:800}});
 await strona.route('**/*',trasa=>trasa.abort());
 await strona.setContent('<form id="eventForm"><input id="natywne" value="Bez zmian"></form><aside id="esync-root"><div class="esync-head"><div class="esync-head-text">Asystent Eventis</div><div class="esync-head-actions"></div></div><div class="esync-body"><details open><summary>Kolejka</summary><input id="szkic" value="1234"><div style="height:1800px">Terminy</div></details></div></aside>');
 await strona.addStyleTag({path:'content/eventis.css'});
 await strona.evaluate(()=>{
  window.magazyn={settings:{operatorInitial:'Z',skalePanelu:{plywajacy:100,boczny:80}}};
  window.chrome={runtime:{id:'test',onMessage:{addListener:obsluga=>window.odbierz=obsluga},sendMessage:async()=>({obslugiwany:true,aktywny:true})},storage:{local:{get:async()=>structuredClone(window.magazyn),set:async dane=>{Object.assign(window.magazyn,dane);window.zmien({settings:{newValue:dane.settings}},'local');}},onChanged:{addListener:obsluga=>window.zmien=obsluga}}};
 });
 await strona.addScriptTag({path:'shared/host-panelu.js'});
 const wartosc=()=>strona.locator('[data-skala="100"]').textContent();
 const kliknij=async (przycisk,oczekiwana)=>{
  await strona.locator('[data-skala="'+przycisk+'"]').click();
  await strona.waitForFunction(oczekiwana=>document.querySelector('[data-skala="100"]').textContent==='🔍 '+oczekiwana+'%' && !document.querySelector('[data-skala="100"]').disabled,oczekiwana);
 };
 await strona.waitForSelector('#esync-skala');
 const rozmiarNatywny=await strona.locator('#natywne').boundingBox();
 for(let skala=95;skala>=60;skala-=5) await kliknij('-5',skala);
 asercje.equal(await strona.locator('[data-skala="-5"]').isDisabled(),true);
 for(let skala=65;skala<=140;skala+=5) await kliknij('5',skala);
 asercje.equal(await strona.locator('[data-skala="5"]').isDisabled(),true);
 asercje.equal(await strona.evaluate(()=>window.magazyn.settings.operatorInitial),'Z');
 asercje.deepEqual(await strona.locator('#natywne').boundingBox(),rozmiarNatywny);
 asercje.equal(await strona.locator('#szkic').inputValue(),'1234');
 asercje.equal(await strona.locator('details').getAttribute('open'),'');
 await kliknij('100',100);
 await strona.locator('[data-skala="100"]').focus();
 await strona.keyboard.press('Enter');
 await strona.waitForFunction(()=>!document.querySelector('[data-skala="100"]').disabled);
 asercje.equal(await wartosc(),'🔍 100%');
 for(const skala of [60,80,100,120,140]) {
  await strona.evaluate(skala=>{window.magazyn.settings.skalePanelu.plywajacy=skala;window.zmien({settings:{newValue:window.magazyn.settings}},'local');},skala);
  asercje.equal(await strona.locator('#esync-root').evaluate(element=>Number(getComputedStyle(element).zoom)),skala/100);
  await strona.locator('.esync-body').evaluate(element=>{element.scrollTop=500;});
  asercje.ok(await strona.locator('.esync-body').evaluate(element=>element.scrollTop)>0);
 }
 const widok=await strona.evaluate(()=>new Promise(odpowiedz=>window.odbierz({type:'POBIERZ_WIDOK_PANELU'},{id:'test'},odpowiedz)));
 asercje.equal(widok.skala,80);
 const panel=await przegladarka.newPage({viewport:{width:280,height:700}});
 await panel.route('**/*',trasa=>trasa.abort());
 await panel.setContent('<nav><button id="plywajacy">Panel</button><span id="komunikat"></span></nav><aside id="esync-root"></aside>');
 for(const plik of ['content/eventis.css','sidepanel.css']) await panel.addStyleTag({path:plik});
 await panel.evaluate(widok=>{window.widok=widok;window.chrome={runtime:{sendMessage:async()=>window.widok,connect:()=>({onDisconnect:{addListener(){}},postMessage(){}})}};window.setInterval=funkcja=>{window.odswiez=funkcja;};},widok);
 await panel.addScriptTag({path:'sidepanel.js'});
 await panel.waitForSelector('#esync-skala');
 for(const skala of [60,80,100,120,140]) {
  await panel.evaluate(async skala=>{window.widok.skala=skala;await window.odswiez();},skala);
  asercje.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,JSON.stringify(await panel.evaluate(()=>({skala:getComputedStyle(document.querySelector("#esync-root")).zoom,szerokosc:document.querySelector("#esync-root").getBoundingClientRect().width,scroll:document.documentElement.scrollWidth}))))
  const szerokosc=await panel.locator('#esync-root').evaluate(element=>element.getBoundingClientRect().width);
  asercje.ok(Math.abs(szerokosc-280)<2);
 }
 await strona.evaluate(()=>window.odbierz({type:'ZAMKNIETO_PANEL_BOCZNY'},{id:'test'},()=>{}));
 asercje.equal(await wartosc(),'🔍 140%');
 // Ponowne utworzenie panelu używa ustawień zapisanych w magazynie.
 await strona.locator('#esync-root').evaluate(element=>{element.innerHTML='<div class="esync-head"></div><div class="esync-body">Nowe ogłoszenie</div>';});
 await strona.waitForSelector('#esync-skala');
 asercje.equal(await wartosc(),'🔍 140%');
 await panel.close();
 } finally {await przegladarka.close();}
});
