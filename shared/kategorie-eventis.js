(function (globalny) {
  "use strict";

  // Aliasy opisują domeny. Wyniki zawsze odnoszą się wyłącznie do opcji odczytanych z formularza.
  const SLOWNIK_KATEGORII = [
    { aliasy: ["fundusze europejskie", "fundusze unijne", "fundusze UE", "projekty europejskie", "unia europejska", "dotacje"],
      mocne: ["sl2021", "feniks", "kpo", "efs", "efrr"], zwykle: ["dotac*", "dofinansowan*"],
      frazy: ["projekt* unijn*", "fundusz* europejsk*", "fundusz* ue", "perspektyw* finansow*", "rozliczan* dotac*"], wykluczenia: [] },
    { aliasy: ["zarządzanie projektami", "zarządzanie projektem", "projekty"],
      mocne: ["prince2", "pmbok", "pmp"], zwykle: ["projekt*", "harmonogram*"],
      frazy: ["zarzadzan* projekt*", "studium wykonalnosci", "ryzyk* projekt*"], wykluczenia: [] },
    { aliasy: ["prawo budowlane", "budownictwo", "nieruchomości"],
      mocne: [], zwykle: ["budowlan*", "budow*", "nieruchomosci*"],
      frazy: ["praw* budowlan*", "pozwolen* na budow*", "nadzor* budowlan*"], wykluczenia: [] },
    { aliasy: ["zamówienia publiczne", "przetargi"],
      mocne: ["pzp", "swz"], zwykle: ["przetarg*", "zamawiajac*"],
      frazy: ["zamowien* publiczn*", "zamowieni* publiczn*", "tryb podstawow*"], wykluczenia: [] },
    { aliasy: ["kadry i płace", "kadry", "płace", "prawo pracy", "hr", "zarządzanie zasobami ludzkimi"],
      mocne: ["zus", "ppk"], zwykle: ["kadr*", "plac*", "wynagrodzen*", "urlop*", "mobbing*"],
      frazy: ["praw* pracy", "czas* pracy", "list* plac*"], wykluczenia: [] },
    { aliasy: ["ochrona środowiska", "środowisko", "ekologia"],
      mocne: ["bdo", "kobize"], zwykle: ["odpad*", "emisj*", "srodowisk*"],
      frazy: ["ochron* srodowisk*", "ochron* powietrz*", "pozwolen* zintegrowan*"], wykluczenia: [] },
    { aliasy: ["podatki", "finanse i księgowość", "księgowość", "rachunkowość", "finanse"],
      mocne: ["vat", "cit", "pit", "ksef", "jpk"], zwykle: ["podatk*", "ksiegow*", "rachunkow*", "bilans*"],
      frazy: ["sprawozdan* finansow*", "cen* transferow*"], wykluczenia: ["perspektyw* finansow*"] },
    { aliasy: ["cyberbezpieczeństwo", "bezpieczeństwo it", "informatyka", "it", "technologie informatyczne"],
      mocne: ["nis2", "phishing", "ransomware", "cyberbezpieczen*"], zwykle: ["informatycz*", "cyberatak*"],
      frazy: ["bezpieczenstw* it", "bezpieczenstw* sieci", "ochron* system*"], wykluczenia: [] },
    { aliasy: ["administracja publiczna", "administracja", "samorząd"],
      mocne: ["kpa"], zwykle: ["samorzad*", "urzed*", "administrac*"],
      frazy: ["administrac* publiczn*", "instrukcj* kancelaryjn*", "postepowan* administracyjn*"], wykluczenia: [] }
  ];
  const SLOWA_OGOLNE = new Set(["szkolenie", "szkolenia", "szkolen", "szkoleniowe", "warsztaty", "warsztat", "praktyczne", "praktyczny", "certyfikowane", "certyfikowany", "online", "kurs", "kursy", "prawo", "zarzadzanie", "publiczne", "publiczna", "w", "i", "z", "na", "dla", "oraz"]);

  function normalizujKategorie(tekst) {
    return String(tekst || "").replace(/<[^>]*>/g, " ").toLowerCase().replace(/ł/g, "l")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function zawieraWzorzec(tekst, wzorzec) {
    const fragmenty = wzorzec.split(" ").map(fragment => normalizujKategorie(fragment) + (fragment.endsWith("*") ? "[a-z]*" : ""));
    return new RegExp(`(?:^| )${fragmenty.join(" +")}(?= |$)`).test(tekst);
  }

  function ocenTekstKategorii(tekst, definicja) {
    const trafienia = [
      ...definicja.mocne.map(wzorzec => ({ wzorzec, waga: 48 })),
      ...definicja.frazy.map(wzorzec => ({ wzorzec, waga: 42 })),
      ...definicja.zwykle.map(wzorzec => ({ wzorzec, waga: 20 }))
    ].filter(({ wzorzec }) => zawieraWzorzec(tekst, wzorzec));
    const kara = definicja.wykluczenia.filter(wzorzec => zawieraWzorzec(tekst, wzorzec)).length * 30;
    return Math.max(0, trafienia.reduce((suma, trafienie) => suma + trafienie.waga, 0) + Math.max(0, trafienia.length - 1) * 8 - kara);
  }

  function usunSlowaOgolne(tekst) {
    return normalizujKategorie(tekst).split(" ").filter(slowo => !SLOWA_OGOLNE.has(slowo)).join(" ");
  }

  function rankingKategorii(kategorie, { tytul = "", opis = "" } = {}) {
    const tytulNorm = normalizujKategorie(tytul);
    const opisNorm = normalizujKategorie(opis);
    return kategorie.map((kategoria, kolejnosc) => {
      const nazwa = normalizujKategorie(kategoria.nazwa);
      const definicje = SLOWNIK_KATEGORII.filter(definicja => definicja.aliasy.some(alias => normalizujKategorie(alias) === nazwa));
      const slowaNazwy = usunSlowaOgolne(kategoria.nazwa).split(" ").filter(slowo => slowo.length >= 4);
      const definicjaNazwy = { mocne: [], zwykle: slowaNazwy, frazy: [], wykluczenia: [] };
      const ocen = tekst => Math.max(ocenTekstKategorii(tekst, definicjaNazwy), ...definicje.map(definicja => ocenTekstKategorii(tekst, definicja)));
      // Opis tylko wspiera tytuł; sam opis nie daje mocnej sugestii.
      const punkty = ocen(tytulNorm) + Math.min(20, ocen(opisNorm) * 0.2);
      return { ...kategoria, punkty, wynik: Math.round(98 * (1 - Math.exp(-punkty / 45))), kolejnosc };
    }).sort((pierwsza, druga) => druga.punkty - pierwsza.punkty || pierwsza.kolejnosc - druga.kolejnosc);
  }

  const interfejs = { SLOWNIK_KATEGORII, normalizujKategorie, rankingKategorii };
  globalny.KategorieEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
