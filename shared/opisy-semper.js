(function (globalny) {
  "use strict";

  const MAPOWANIE_POL_OPISOWYCH = Object.freeze([
    Object.freeze({ klucz:"celHtml", pole:"event[information]" }),
    Object.freeze({ klucz:"korzysciHtml", pole:"event[reason]" }),
    Object.freeze({ klucz:"grupaHtml", pole:"event[forWho]" }),
    Object.freeze({ klucz:"programHtml", pole:"event[plan]" })
  ]);

  const SEKCJE_SEMPER = Object.freeze({
    grupaHtml:"scc3",
    celHtml:"scc4",
    korzysciHtml:"scc5",
    programHtml:"scc8"
  });

  const DOZWOLONE_ZNACZNIKI = new Set([
    "p","br","ul","ol","li","strong","b","em","i","u",
    "h2","h3","h4","h5","h6","blockquote","table","thead","tbody","tr","th","td"
  ]);
  const ZABRONIONE_ZNACZNIKI = "script,style,img,svg,iframe,object,form,input,button";
  const BLOKI_TRESCI = "p,li,div,section,article,blockquote";
  const POCZATKI_NIEPOZADANYCH_TRESCI = [
    "program szkolenia jest wlasnoscia intelektualna semper",
    "program szkolenia stanowi prawnie chroniona wlasnosc intelektualna",
    "szkolenie realizowane w ramach programu partnerskiego",
    "w przypadku szkolenia w formule on-line",
    "w przypadku szkolenia w formule online",
    "polityka rabatowa"
  ];

  function normalizujTekst(wartosc) {
    return String(wartosc || "")
      .toLowerCase()
      .replace(/ł/g,"l")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g," ")
      .trim();
  }

  function czyNiepozadanaTresc(wartosc) {
    const tekst = normalizujTekst(wartosc).replace(/^[|\-–—•·\s]+|[|\-–—•·\s]+$/g,"");
    return !tekst || POCZATKI_NIEPOZADANYCH_TRESCI.some(poczatek=>tekst.startsWith(poczatek));
  }

  function czyPustyBlok(element) {
    return !normalizujTekst(element.textContent) && !element.querySelector("br");
  }

  function oczyscHtmlPrzezDom(html, KonstruktorParsera) {
    const dokument = new KonstruktorParsera().parseFromString(`<div>${html || ""}</div>`,"text/html");
    const korzen = dokument.body.firstElementChild;
    if (!korzen) return "";
    korzen.querySelectorAll(ZABRONIONE_ZNACZNIKI).forEach(element=>element.remove());
    korzen.querySelectorAll("a").forEach(link=>link.replaceWith(...link.childNodes));
    Array.from(korzen.querySelectorAll(BLOKI_TRESCI)).reverse().forEach(element=>{
      if (czyNiepozadanaTresc(element.textContent)) element.remove();
    });
    Array.from(korzen.querySelectorAll("*")).reverse().forEach(element=>{
      const nazwa = element.tagName.toLowerCase();
      if (!DOZWOLONE_ZNACZNIKI.has(nazwa)) element.replaceWith(...element.childNodes);
      else Array.from(element.attributes).forEach(atrybut=>element.removeAttribute(atrybut.name));
    });
    Array.from(korzen.querySelectorAll("p,li,ul,ol,div,section,article")).reverse().forEach(element=>{
      if (czyPustyBlok(element)) element.remove();
    });
    return korzen.innerHTML.trim();
  }

  function tekstBezZnacznikow(html) {
    return String(html || "")
      .replace(/<br\s*\/?>/gi," ")
      .replace(/<[^>]+>/g," ")
      .replace(/&nbsp;|&#160;/gi," ")
      .replace(/&amp;/gi,"&")
      .replace(/&lt;/gi,"<")
      .replace(/&gt;/gi,">")
      .replace(/&quot;/gi,"\"")
      .replace(/&#39;|&apos;/gi,"'")
      .replace(/\s+/g," ")
      .trim();
  }

  function usunNiepozadaneBlokiBezDom(html) {
    let wynik = String(html || "");
    for (const nazwa of ["p","li","div","section","article","blockquote"]) {
      const wzorzec = new RegExp(`<${nazwa}\\b[^>]*>([\\s\\S]*?)<\\/${nazwa}>`,"gi");
      wynik = wynik.replace(wzorzec,(calosc,tresc)=>czyNiepozadanaTresc(tekstBezZnacznikow(tresc)) ? "" : calosc);
    }
    return wynik;
  }

  function oczyscHtmlBezDom(html) {
    let wynik = String(html || "");
    for (const nazwa of ["script","style","svg","iframe","object","form","button"]) {
      wynik = wynik.replace(new RegExp(`<${nazwa}\\b[^>]*>[\\s\\S]*?<\\/${nazwa}>`,"gi"),"");
    }
    wynik = wynik.replace(/<(?:img|input)\b[^>]*\/?\s*>/gi,"");
    wynik = wynik.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi,"$1");
    wynik = usunNiepozadaneBlokiBezDom(wynik);
    wynik = wynik.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi,(calosc,nazwa)=>{
      const malymi = nazwa.toLowerCase();
      if (!DOZWOLONE_ZNACZNIKI.has(malymi)) return "";
      return calosc.startsWith("</") ? `</${malymi}>` : `<${malymi}>`;
    });
    return wynik.replace(/^(?:\s|\||&nbsp;)+|(?:\s|\||&nbsp;)+$/gi,"").trim();
  }

  function oczyscHtml(html, KonstruktorParsera = globalny.DOMParser) {
    return typeof KonstruktorParsera === "function"
      ? oczyscHtmlPrzezDom(html,KonstruktorParsera)
      : oczyscHtmlBezDom(html);
  }

  function znajdzZnacznik(dokument, kod) {
    return Array.from(dokument.querySelectorAll(`.${kod}`)).find(element=>element.classList.contains("text_over")) || null;
  }

  function znajdzKotwiceSekcji(znacznik, dokument) {
    let kotwica = znacznik;
    while (kotwica.parentElement && kotwica.parentElement !== dokument.body && !kotwica.nextSibling) {
      kotwica = kotwica.parentElement;
    }
    return kotwica;
  }

  function czyKolejnyZnacznik(wezel) {
    return wezel.nodeType === 1
      && (wezel.matches(".text_over") || !!wezel.querySelector(".text_over"));
  }

  function pobierzSekcjePrzezDom(dokument, kod, KonstruktorParsera) {
    const znacznik = znajdzZnacznik(dokument,kod);
    if (!znacznik) return "";
    let wezel = znajdzKotwiceSekcji(znacznik,dokument).nextSibling;
    const fragmenty = [];
    let licznik = 0;
    while (wezel && licznik++ < 1000) {
      if (czyKolejnyZnacznik(wezel)) break;
      fragmenty.push(wezel.nodeType === 1 ? wezel.outerHTML : wezel.textContent || "");
      wezel = wezel.nextSibling;
    }
    return oczyscHtml(fragmenty.join(""),KonstruktorParsera);
  }

  function klasaZnacznika(tekstZnacznika) {
    const dopasowanie = String(tekstZnacznika).match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return (dopasowanie?.[1] || dopasowanie?.[2] || dopasowanie?.[3] || "").split(/\s+/);
  }

  function pobierzSekcjeBezDom(html, kod) {
    const znaczniki = Array.from(String(html || "").matchAll(/<([a-z0-9]+)\b[^>]*>/gi));
    const poczatek = znaczniki.find(dopasowanie=>{
      const klasy = klasaZnacznika(dopasowanie[0]);
      return klasy.includes("text_over") && klasy.includes(kod);
    });
    if (!poczatek) return "";
    const koniecZnacznika = String(html).indexOf(`</${poczatek[1]}>`,poczatek.index) + poczatek[1].length + 3;
    const od = koniecZnacznika > poczatek.index ? koniecZnacznika : poczatek.index + poczatek[0].length;
    const nastepny = znaczniki.find(dopasowanie=>dopasowanie.index >= od && klasaZnacznika(dopasowanie[0]).includes("text_over"));
    return oczyscHtmlBezDom(String(html).slice(od,nastepny?.index ?? String(html).length));
  }

  function parsujOpisySemper(html, KonstruktorParsera = globalny.DOMParser) {
    const wynik = {};
    if (typeof KonstruktorParsera === "function") {
      const dokument = new KonstruktorParsera().parseFromString(String(html || ""),"text/html");
      for (const [klucz,kod] of Object.entries(SEKCJE_SEMPER)) wynik[klucz] = pobierzSekcjePrzezDom(dokument,kod,KonstruktorParsera);
    } else {
      for (const [klucz,kod] of Object.entries(SEKCJE_SEMPER)) wynik[klucz] = pobierzSekcjeBezDom(html,kod);
    }
    return wynik;
  }

  const interfejs = { MAPOWANIE_POL_OPISOWYCH, oczyscHtml, parsujOpisySemper };
  globalny.NarzedziaOpisowSemper = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
