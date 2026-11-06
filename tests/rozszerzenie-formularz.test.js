"use strict";

const test = require("node:test");
const asercje = require("node:assert/strict");
const pliki = require("node:fs");
const sciezki = require("node:path");
const {chromium:przegladarkaChromium} = require("playwright");
const kolejka = require("../shared/kolejka-eventis");
const wyszukiwanie = require("../shared/wyszukiwanie");

test("Manifest V3: persistent context, źródło → kolejka → dynamiczny formularz, bez zapisu i sieci produkcyjnej",async podtest => {
  const profil = pliki.mkdtempSync(sciezki.join(require("node:os").tmpdir(),"eventis-regresja-mv3-"));
  const rozszerzenie = sciezki.resolve(__dirname,"..");
  const kanal = process.env.EVENTIS_KATEGORIE_PRZEGLADARKA || "msedge";
  const kontekst = await przegladarkaChromium.launchPersistentContext(profil,{
    channel:kanal,headless:true,
    ignoreDefaultArgs:["--disable-extensions"],
    args:kanal === "chrome" ? ["--enable-unsafe-extension-debugging"]
      : [`--disable-extensions-except=${rozszerzenie}`,`--load-extension=${rozszerzenie}`]
  });
  if (kanal === "chrome") {
    const sesja = await kontekst.browser().newBrowserCDPSession();
    await sesja.send("Extensions.loadUnpacked",{path:rozszerzenie});
    await sesja.detach();
  }
  podtest.after(async () => {
    await kontekst.close();
    const katalogTymczasowy = sciezki.resolve(require("node:os").tmpdir()) + sciezki.sep;
    if (sciezki.resolve(profil).startsWith(katalogTymczasowy) && sciezki.basename(profil).startsWith("eventis-regresja-mv3-")) pliki.rmSync(profil,{recursive:true,force:true});
  });
  const pracownik = kontekst.serviceWorkers()[0] || await kontekst.waitForEvent("serviceworker",{timeout:10000});
  asercje.equal(await pracownik.evaluate(() => chrome.runtime.getManifest().manifest_version),3);
  await pracownik.evaluate(async () => {
    for (let proba=0;proba<100;proba++) {
      if ((await chrome.storage.local.get('eventisOpeningSessions')).eventisOpeningSessions) return;
      await new Promise(rozwiaz=>setTimeout(rozwiaz,10));
    }
    throw new Error('Nie zakończono inicjalizacji nowej instalacji rozszerzenia.');
  });
  const tytul = "Prawo pracy w praktyce";
  const adresZrodla = "https://www.szkolenia-semper.pl/component/trainings/details/szkolenie,123.html";
  const zrodlo = `<h1>${tytul}</h1><table>
    <tr><td>2026-11-16 do 2026-11-17</td><td>Online</td><td>2 dni</td><td>1590 zł/netto</td><td class="gw">Potwierdzony</td></tr>
    <tr><td>2026-11-16 do 2026-11-17</td><td>Kraków</td><td>2 dni</td><td>1690 zł/netto</td></tr></table>
    <h2 class="text_over scc3">Grupa docelowa</h2><p>Grupa testowa</p>
    <h2 class="text_over scc4">Cel szkolenia</h2><p>Cel testowy</p>
    <h2 class="text_over scc5">Korzyści</h2><p>Korzyści testowe</p>
    <h2 class="text_over scc8">Program</h2><p>Program testowy</p>`;
  const terminy = ["Online","Kraków"].map((city,indeks) => kolejka.utworzElementKolejki({status:"CONFIRMED",title:tytul,
    normalizedTitle:wyszukiwanie.normalizujTytul(tytul),start:"2026-11-16",end:"2026-11-17",city,participants:6},{organization:"SEMPER",id:"mv3-"+indeks}));
  await pracownik.evaluate(async ({adresZrodla,zrodlo,tytul,terminy}) => {
    // Wszystkie pobrania pracownika są lokalnymi odpowiedziami testowymi.
    globalThis.fetch = async adres => {
      if (adres !== adresZrodla) throw new Error("Zablokowano sieć testu MV3: " + adres);
      return {ok:true,status:200,url:adresZrodla,text:async () => zrodlo};
    };
    await chrome.storage.local.set({eventisImportQueue:terminy,eventisQueueSchemaVersion:2,mappings:{"SEMPER|123":{
      organization:"SEMPER",eventisEventId:"123",eventisTitle:tytul,sourceTitle:tytul,sourceUrl:adresZrodla,status:"ACTIVE",confidence:1
    }}});
  },{adresZrodla,zrodlo,tytul,terminy});
  let formularz = pliki.readFileSync(sciezki.join(__dirname,"fixtures/eventis-natywne-dodawanie.html"),"utf8")
    .replace('>Nowa data</button>','>Dodaj termin</button>');
  formularz += `<script>
    let numerWiersza=17;
    function dodajWiersz(numer,rekord='0') {
      const wiersz=document.createElement('li');wiersz.id='li_eventdate_'+numer;
      const nazwa=klucz=>'eventDate['+numer+']['+klucz+']';
      wiersz.innerHTML='<input type="hidden" name="'+nazwa('id')+'" value="'+rekord+'">'+
        '<input type="hidden" name="'+nazwa('action')+'" value="'+(rekord==='0'?'new':'update')+'">'+
        '<select name="'+nazwa('is_online')+'"><option value="">stacjonarne</option><option value="1">online</option></select>'+
        '<input name="'+nazwa('date_start')+'" value="2026-10-30"><input name="'+nazwa('date_end')+'" value="2026-10-30">'+
        '<select name="'+nazwa('is_guaranteed')+'"><option value="0">Zbieranie grupy</option><option value="1">Gwarantowany</option></select>'+
        '<input name="'+nazwa('prices][0][price')+'"><input name="'+nazwa('prices][0][taxRate')+'">'+
        '<input name="'+nazwa('prices][0][price_name')+'" value="Pakiet 1">'+
        '<select name="'+nazwa('prices][0][currency')+'"><option value="1">zł</option></select>'+
        '<textarea name="'+nazwa('online_description')+'"></textarea><input name="'+nazwa('info')+'"><input name="'+nazwa('city')+'">'+
        '<select name="'+nazwa('region_id')+'"><option value=""></option><option value="6">małopolskie</option></select>';
      wiersz.querySelector('select').addEventListener('change',()=>{
        const pola=Array.from(wiersz.querySelectorAll('input')).filter(p=>/\\[(date_start|date_end|price)\\]$/.test(p.name));
        pola.forEach(p=>p.remove());setTimeout(()=>pola.forEach(p=>wiersz.append(p.cloneNode(true))),25);
      });
      document.getElementById('terminy').prepend(wiersz);return wiersz;
    }
    dodajWiersz(7,'9001');dodajWiersz(0);
    document.getElementById('dodaj').onclick=()=>dodajWiersz(++numerWiersza);
  </script>`;
  formularz = formularz.replace('</form>',['information','reason','forWho','plan','hours'].map(nazwa=>`<textarea name="event[${nazwa}]"></textarea>`).join("")+'</form>');
  const probyZapisu = [];
  await kontekst.route("**/*",trasa => {
    if (trasa.request().method() !== "GET") probyZapisu.push(trasa.request().url());
    return trasa.request().url() === "https://eventis.pl/event/edit/123"
      ? trasa.fulfill({contentType:"text/html",body:formularz}) : trasa.abort();
  });
  const strona = await kontekst.newPage();
  const bledy = [];
  strona.on('pageerror',blad=>bledy.push(blad.message));
  strona.on('console',wpis=>{if(wpis.type()==='error')bledy.push(wpis.text());});
  await strona.goto("https://eventis.pl/event/edit/123");
  await strona.locator('#esync-add-queue-terms:not([disabled])').waitFor({timeout:15000}).catch(async blad=>{
    throw new Error(blad.message+' '+JSON.stringify({bledy,panel:await strona.locator('#esync-root').textContent()}));
  });

  const przelacznik = strona.getByRole("switch");
  for (const wybor of ["true","false"]) {
    await przelacznik.focus();
    asercje.equal(await przelacznik.evaluate(element => element === document.activeElement),true,"fokus przed zmianą źródła");
    await strona.keyboard.press("Space");
    await strona.waitForFunction(wybor => document.querySelector("#esync-org").getAttribute("aria-checked") === wybor,wybor);
    asercje.equal(await strona.evaluate(() => document.activeElement.id),"esync-org","fokus po zmianie źródła");
  }
  await strona.locator('#esync-add-queue-terms:not([disabled])').waitFor();
  const odczytajZapisany = () => strona.locator('#li_eventdate_7 input,#li_eventdate_7 select,#li_eventdate_7 textarea').evaluateAll(pola=>pola.map(pole=>[pole.name,pole.value,pole.checked]));
  const zapisanyPrzed = await odczytajZapisany();

  async function sprawdzWidok(widok) {
    const korzen = widok.locator("#esync-root");
    asercje.equal(await korzen.locator(".esync-znak").innerText(),"E");
    const naglowek = korzen.locator("#esync-kolejka-ogloszenia > summary");
    await widok.emulateMedia({reducedMotion:"reduce"});
    await naglowek.focus();
    const odczytajIkone = () => naglowek.evaluate(element => {
      const styl = getComputedStyle(element,"::after");
      return [styl.width,styl.height,styl.transformOrigin,styl.transitionDuration,styl.transform];
    });
    asercje.deepEqual(await odczytajIkone(),["20px","20px","10px 10px","0s","none"]);
    await widok.keyboard.press("Space");
    asercje.deepEqual(await odczytajIkone(),["20px","20px","10px 10px","0s","matrix(0, 1, -1, 0, 0, 0)"]);
    asercje.equal(await naglowek.evaluate(element => getComputedStyle(element).outlineStyle),"solid");
    for (const szerokosc of [320,360,390,768,1024,1366,1920]) {
      await widok.setViewportSize({width:szerokosc,height:800});
      asercje.ok(await korzen.evaluate(element => {
        const ramka = element.getBoundingClientRect();
        return ramka.left >= 0 && ramka.right <= innerWidth && ramka.bottom <= innerHeight;
      }),`Panel mieści się przy ${szerokosc} px`);
      asercje.ok(await korzen.locator(".esync-body").evaluate(element => element.scrollWidth <= element.clientWidth),`Brak poziomego przewijania przy ${szerokosc} px`);
      asercje.equal(await korzen.getByRole("button",{name:"Wprowadź terminy z kolejki (1)"}).isVisible(),true);
    }
    await naglowek.focus();
    await widok.keyboard.press("Enter");
    asercje.equal(await naglowek.evaluate(element => element.parentElement.open),false);
  }
  await sprawdzWidok(strona);

  const panel = await kontekst.newPage();
  await panel.setContent('<nav><button id="plywajacy">Panel pływający</button><span id="komunikat" role="status"></span></nav><aside id="esync-root"></aside>');
  for (const styl of ["content/eventis.css","content/akcja-panelu.css","content/porownanie-tytulow.css","sidepanel.css"]) {
    await panel.addStyleTag({path:sciezki.join(rozszerzenie,styl)});
  }
  await strona.bringToFront();
  await panel.exposeFunction("przekazDoKartyTestowej",wiadomosc => pracownik.evaluate(async wiadomosc => {
    const [karta] = await chrome.tabs.query({url:"https://eventis.pl/event/edit/123"});
    return {...await chrome.tabs.sendMessage(karta.id,wiadomosc),identyfikatorKarty:karta.id};
  },wiadomosc));
  await panel.evaluate(() => { window.chrome = {runtime:{sendMessage:({wiadomosc}) => window.przekazDoKartyTestowej(wiadomosc)}}; });
  await panel.addScriptTag({path:sciezki.join(rozszerzenie,"sidepanel.js")});
  await panel.locator('#esync-add-queue-terms:not([disabled])').waitFor();
  await sprawdzWidok(panel);
  await panel.locator("#esync-add-queue-terms").click();
  await panel.waitForFunction(() => document.querySelectorAll('[data-status-zapisu="WAITING_FOR_SAVE"]').length === 1);
  await panel.evaluate(() => window.przekazDoKartyTestowej({type:"ZAMKNIETO_PANEL_BOCZNY"}));
  await panel.close();

  await strona.waitForFunction(() => document.querySelector('[name="eventDate[0][prices][0][price]"]')?.value === '1690');
  await strona.waitForFunction(() => document.querySelectorAll('[data-status-zapisu="WAITING_FOR_SAVE"]').length === 1);
  asercje.deepEqual(await odczytajZapisany(),zapisanyPrzed);
  asercje.equal(await strona.locator('[id^="li_eventdate_"]').count(),2);
  asercje.equal(await strona.locator('[name="eventDate[0][date_start]"]').inputValue(),"2026-11-16");
  asercje.equal(await strona.locator('[name="eventDate[0][date_end]"]').inputValue(),"2026-11-17");
  asercje.equal(await strona.locator('[name="event[plan]"]').inputValue(),"<p>Program testowy</p>");
  const stan = await pracownik.evaluate(async () => chrome.storage.local.get(["eventisImportQueue","pendingOperations"]));
  asercje.deepEqual(stan.eventisImportQueue.map(element=>element.status),["PENDING","WAITING_FOR_SAVE"]);
  asercje.equal(Object.values(stan.pendingOperations)[0].status,"WAITING_FOR_SAVE");
  asercje.deepEqual(probyZapisu,[]);
});
