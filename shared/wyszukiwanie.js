(function (globalny) {
  "use strict";

  const POMIJANE_SLOWA = new Set([
    "oraz", "wraz", "wedlug", "praktyczne", "kompleksowe", "warsztaty",
    "szkolenie", "szkolenia", "kurs", "dla", "nad", "pod", "online",
    "dniowe", "dniowy", "dniowa", "certyfikowane", "stacjonarne"
  ]);

  const ODRZUCANE_SCIEZKI_IIST = [
    /\/formularz-zgloszenia/i,
    /\/blog(?:\/|$)/i,
    /\/kontakt(?:[.,/]|$)/i,
    /\/regulamin/i,
    /\/polityk/i,
    /\/miast/i,
    /\/kategori/i,
    /\/szkolenia\.php$/i
  ];

  function oczyscLinie(wartosc) {
    return String(wartosc || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[-*•–·▪▫]\s*/, "")
      .trim();
  }

  function normalizujTytul(wartosc) {
    return String(wartosc || "")
      .toLowerCase()
      .replace(/ł/g, "l")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/certyfikowane\s+szkolenie\s+online/g, " ")
      .replace(/szkolenie\s+online/g, " online ")
      .replace(/[„”«»'\"]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tytulPrzedPierwszymSeparatorem(tytul) {
    const czysty = oczyscLinie(tytul);
    const chroniony = czysty
      .replace(/\bds\.\s*/gi, "ds§ ")
      .replace(/\bm\.in\.\s*/gi, "m§in§ ");
    const fragment = (chroniony.split(/\s(?:[-–—|])\s|[;:!?…]/)[0] || chroniony).trim();
    return fragment
      .replace(/\bds§\s*/gi, "ds. ")
      .replace(/\bm§in§\s*/gi, "m.in. ")
      .trim();
  }

  function istotneSlowa(wartosc) {
    return normalizujTytul(wartosc)
      .split(" ")
      .filter(slowo => slowo.length > 2 && !POMIJANE_SLOWA.has(slowo));
  }

  function zbiorTokenow(wartosc) {
    return new Set(istotneSlowa(wartosc));
  }

  function usunKoncowkeMarketingowa(wartosc) {
    let wynik = oczyscLinie(wartosc);
    const koncowki = [
      /\s*[-–—,:;|]?\s*certyfikowane\s+szkolenie\s+online\s*$/i,
      /\s*[-–—,:;|]?\s*szkolenie\s+online\s*$/i,
      /\s*[-–—,:;|]?\s*szkolenie\s*$/i,
      /\s*[-–—,:;|]?\s*warsztaty\s+(?:praktyczne|szkoleniowe)\s*$/i,
      /\s*[-–—,:;|]?\s*\d+\s*[-–—]?\s*dniowe\s*$/i,
      /\s*[-–—,:;|]?\s*\d+\s*[-–—]?\s*dniowe\s+(?:warsztaty|szkolenie)(?:\s+(?:praktyczne|szkoleniowe|online))?\s*$/i,
      /\s*[-–—,:;|]?\s*\d+\s*[-–—]?\s*dniowe\s+warsztaty\s+praktyczne\s*$/i
    ];
    let poprzedni;
    do {
      poprzedni = wynik;
      for (const wzorzec of koncowki) wynik = wynik.replace(wzorzec, "").trim();
    } while (wynik !== poprzedni);
    return wynik.replace(/\s*[-–—,:;|]\s*$/, "").trim();
  }

  function generujWariantyZapytania(tytul, limit = 5) {
    const pelny = oczyscLinie(tytul);
    const bezKoncowki = usunKoncowkeMarketingowa(pelny);
    const przedSeparatorem = tytulPrzedPierwszymSeparatorem(bezKoncowki || pelny);
    const slowaPoczatkowe = oczyscLinie(bezKoncowki || pelny).split(/\s+/).slice(0, 10).join(" ");
    const tokeny = istotneSlowa(bezKoncowki || pelny).slice(0, 9).join(" ");
    const kandydaci = [pelny, przedSeparatorem, bezKoncowki, slowaPoczatkowe, tokeny];
    const widziane = new Set();
    return kandydaci.filter(wariant => {
      const klucz = normalizujTytul(wariant);
      if (klucz.length < 12 || istotneSlowa(wariant).length < 2 || widziane.has(klucz)) return false;
      widziane.add(klucz);
      return true;
    }).slice(0, limit);
  }

  function znacznikiLiczbowe(wartosc) {
    const tekst = normalizujTytul(wartosc);
    const wynik = new Set();
    for (const dopasowanie of tekst.matchAll(/\b(\d{2,3})\s+(\d{3})\b/g)) wynik.add(`${dopasowanie[1]}${dopasowanie[2]}`);
    for (const dopasowanie of tekst.matchAll(/\b(19\d{2}|20\d{2}|\d+)\b/g)) {
      const liczba = dopasowanie[1];
      if (liczba.length === 4 || Number(liczba) >= 10) wynik.add(liczba);
    }
    const dni = String(wartosc || "").toLowerCase().match(/\b(\d+)\s*[-–—]?\s*dniow/);
    if (dni) wynik.add(`${dni[1]}dni`);
    return wynik;
  }

  function wspolnyPoczatek(listaA, listaB) {
    const limit = Math.min(listaA.length, listaB.length, 6);
    let zgodne = 0;
    while (zgodne < limit && listaA[zgodne] === listaB[zgodne]) zgodne++;
    return limit ? zgodne / limit : 0;
  }

  function zgodnoscKolejnosci(listaA, listaB) {
    const wazne = listaA.slice(0, 6);
    if (!wazne.length) return 0;
    let pozycja = -1;
    let zgodne = 0;
    for (const slowo of wazne) {
      const znaleziona = listaB.indexOf(slowo, pozycja + 1);
      if (znaleziona >= 0) {
        zgodne++;
        pozycja = znaleziona;
      }
    }
    return zgodne / wazne.length;
  }

  function ocenZgodnoscTytulow(tytulEventis, tytulZrodlowy) {
    const znormalizowanyEventis = normalizujTytul(tytulEventis);
    const znormalizowanyZrodlowy = normalizujTytul(tytulZrodlowy);
    if (znormalizowanyEventis && znormalizowanyEventis === znormalizowanyZrodlowy) return 1;
    const listaA = istotneSlowa(tytulEventis);
    const listaB = istotneSlowa(tytulZrodlowy);
    const zbiorA = new Set(listaA);
    const zbiorB = new Set(listaB);
    if (!zbiorA.size || !zbiorB.size) return 0;
    const wspolne = [...zbiorA].filter(slowo => zbiorB.has(slowo)).length;
    const suma = new Set([...zbiorA, ...zbiorB]).size;
    const jaccard = wspolne / suma;
    const pokrycieKrotszego = wspolne / Math.min(zbiorA.size, zbiorB.size);
    const pokrycieEventis = wspolne / zbiorA.size;
    const poczatek = wspolnyPoczatek(listaA, listaB);
    const kolejnosc = (zgodnoscKolejnosci(listaA, listaB) + zgodnoscKolejnosci(listaB, listaA)) / 2;
    const specyficznosc = Math.min(1, wspolne / 4);

    const liczbyA = znacznikiLiczbowe(tytulEventis);
    const liczbyB = znacznikiLiczbowe(tytulZrodlowy);
    const wspolneLiczby = [...liczbyA].filter(liczba => liczbyB.has(liczba)).length;
    const zgodnoscLiczb = liczbyA.size && liczbyB.size
      ? wspolneLiczby / new Set([...liczbyA, ...liczbyB]).size
      : 0;
    const karaZaSprzeczneLiczby = liczbyA.size && liczbyB.size && !wspolneLiczby ? 0.14 : 0;

    let wynik = 0.27 * jaccard
      + 0.22 * pokrycieKrotszego
      + 0.16 * pokrycieEventis
      + 0.13 * poczatek
      + 0.12 * kolejnosc
      + 0.10 * zgodnoscLiczb;
    wynik = wynik * (0.72 + 0.28 * specyficznosc) - karaZaSprzeczneLiczby;
    if (wspolne <= 2 && (zbiorA.size > 3 || zbiorB.size > 3)) wynik = Math.min(wynik, 0.58);
    return Math.max(0, Math.min(1, wynik));
  }

  function ocenWynikWyszukiwania(zapytanie, tytulKandydata) {
    const zgodnosc = ocenZgodnoscTytulow(zapytanie, tytulKandydata);
    const zapytanieNorm = normalizujTytul(zapytanie);
    const kandydatNorm = normalizujTytul(tytulKandydata);
    const zawieranie = zapytanieNorm && kandydatNorm
      && (zapytanieNorm.includes(kandydatNorm) || kandydatNorm.includes(zapytanieNorm)) ? 0.08 : 0;
    return Math.min(1, zgodnosc + zawieranie);
  }

  function bezpiecznyUrl(wartosc, baza) {
    try { return new URL(String(wartosc || "").trim(), baza); } catch { return null; }
  }

  function absolutnyUrlSemper(wartosc) {
    const url = bezpiecznyUrl(wartosc, "https://www.szkolenia-semper.pl/");
    if (!url || url.protocol !== "https:" || url.username || url.password || !/(^|\.)szkolenia-semper\.pl$/i.test(url.hostname)) return "";
    url.hash = "";
    return url.href;
  }

  function czySzczegolySemper(wartosc) {
    const url = absolutnyUrlSemper(wartosc);
    if (!url) return false;
    return /^\/component\/trainings\/details\/(?:szkolenie,\d+\.html|[^/?#]+,\d+,html)$/i.test(new URL(url).pathname);
  }

  function absolutnyUrlIist(wartosc) {
    const url = bezpiecznyUrl(wartosc, "https://szkoleniaiist.com.pl/");
    if (!url || url.protocol !== "https:" || url.username || url.password || !/(^|\.)szkoleniaiist\.com\.pl$/i.test(url.hostname)) return "";
    url.hash = "";
    return url.href;
  }

  function czySzczegolyIist(wartosc) {
    const url = absolutnyUrlIist(wartosc);
    if (!url) return false;
    let sciezka;
    try { sciezka = decodeURIComponent(new URL(url).pathname); } catch { return false; }
    if (sciezka === "/" || ODRZUCANE_SCIEZKI_IIST.some(wzorzec => wzorzec.test(sciezka))) return false;
    return /,\d+\.html$/i.test(sciezka);
  }

  function dekodujEncjeHtml(wartosc) {
    return String(wartosc || "")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function dekodujHtmlWyszukiwania(wartosc) {
    const tekst = String(wartosc || "");
    try {
      const wynik = JSON.parse(tekst);
      return typeof wynik === "string" ? wynik : tekst;
    } catch { return tekst; }
  }

  function dekodujBase64(wartosc) {
    if (!wartosc) return "";
    try {
      if (typeof atob === "function") return atob(wartosc);
      if (typeof Buffer !== "undefined") return Buffer.from(wartosc, "base64").toString("utf8");
    } catch {}
    return "";
  }

  function odczytajAtrybuty(tekst) {
    const wynik = {};
    const wzorzec = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let dopasowanie;
    while ((dopasowanie = wzorzec.exec(tekst))) {
      wynik[dopasowanie[1].toLowerCase()] = dekodujEncjeHtml(dopasowanie[2] ?? dopasowanie[3] ?? dopasowanie[4] ?? "");
    }
    return wynik;
  }

  function kotwiceZHtml(html) {
    const wynik = [];
    const wzorzec = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let dopasowanie;
    while ((dopasowanie = wzorzec.exec(dekodujHtmlWyszukiwania(html)))) {
      const atrybuty = odczytajAtrybuty(dopasowanie[1]);
      const tekst = dekodujEncjeHtml(dopasowanie[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      wynik.push({ atrybuty, tekst });
    }
    return wynik;
  }

  function linkiZWyszukiwarkiSemper(html, zapytanie) {
    const widziane = new Set();
    return kotwiceZHtml(html).map(kotwica => {
      const urlHref = absolutnyUrlSemper(kotwica.atrybuty.href || "");
      const url = czySzczegolySemper(urlHref)
        ? urlHref
        : absolutnyUrlSemper(dekodujBase64(kotwica.atrybuty["data-url"]));
      const tytul = oczyscLinie(kotwica.atrybuty.title || kotwica.tekst || url);
      return { url, title: tytul, searchScore: ocenWynikWyszukiwania(zapytanie, `${tytul} ${url}`) };
    }).filter(kandydat => {
      if (!czySzczegolySemper(kandydat.url) || !kandydat.title || widziane.has(kandydat.url)) return false;
      widziane.add(kandydat.url);
      return kandydat.searchScore > 0;
    }).sort((a, b) => b.searchScore - a.searchScore);
  }

  function linkiZWyszukiwarkiIist(html, zapytanie, baza = "https://szkoleniaiist.com.pl/") {
    const widziane = new Set();
    return kotwiceZHtml(html).map(kotwica => {
      const url = absolutnyUrlIist(bezpiecznyUrl(kotwica.atrybuty.href, baza)?.href || "");
      const tytul = oczyscLinie(kotwica.atrybuty.title || kotwica.tekst || "");
      return { url, title: tytul, searchScore: ocenWynikWyszukiwania(zapytanie, tytul) };
    }).filter(kandydat => {
      if (!czySzczegolyIist(kandydat.url) || !kandydat.title || widziane.has(kandydat.url)) return false;
      widziane.add(kandydat.url);
      return true;
    }).sort((a, b) => b.searchScore - a.searchScore);
  }

  function urlZJsonSemper(wartosc) {
    try {
      const wynik = JSON.parse(String(wartosc || ""));
      const surowyUrl = typeof wynik === "string" ? wynik : wynik?.url;
      const url = absolutnyUrlSemper(surowyUrl || "");
      return czySzczegolySemper(url) ? url : "";
    } catch { return ""; }
  }

  const api = {
    oczyscLinie,
    normalizujTytul,
    tytulPrzedPierwszymSeparatorem,
    istotneSlowa,
    zbiorTokenow,
    usunKoncowkeMarketingowa,
    generujWariantyZapytania,
    ocenZgodnoscTytulow,
    ocenWynikWyszukiwania,
    absolutnyUrlSemper,
    czySzczegolySemper,
    absolutnyUrlIist,
    czySzczegolyIist,
    dekodujHtmlWyszukiwania,
    linkiZWyszukiwarkiSemper,
    linkiZWyszukiwarkiIist,
    urlZJsonSemper
  };

  globalny.NarzedziaWyszukiwaniaEventis = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
