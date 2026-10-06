(function (globalny) {
  "use strict";

  function odczytajKategorie(dokument) {
    const formularz = dokument.querySelector("form#eventForm") || dokument.querySelector('input[name="event[title]"],textarea[name="event[title]"]')?.closest("form");
    if (!formularz) return { formularz: null, sekcja: null, kategorie: [] };
    const selektor = 'input[type="checkbox"],select[multiple]';
    const znaczniki = Array.from(formularz.querySelectorAll("label,legend,h2,h3,h4,h5,strong,b,span,div,p"))
      .filter(element => /^kategorie wydarzenia\b/.test(globalny.KategorieEventis.normalizujKategorie(element.textContent)) && element.textContent.length < 240)
      .sort((pierwszy, drugi) => pierwszy.textContent.length - drugi.textContent.length);
    let sekcja = null;
    let kontrolki = [];
    for (const znacznik of znaczniki) {
      let przodek = znacznik;
      while (przodek && przodek !== formularz) {
        const znalezione = Array.from(przodek.querySelectorAll(selektor));
        if (znalezione.length) {
          sekcja = przodek;
          const nazwane = znalezione.filter(pole => /categor|kategori/i.test(pole.name));
          kontrolki = nazwane.length ? nazwane : znalezione;
          break;
        }
        przodek = przodek.parentElement;
      }
      if (sekcja) break;
    }
    // Nazwa pola jest drugim źródłem, gdy nagłówek jest osobnym sąsiadem kontrolki.
    if (!kontrolki.length) kontrolki = Array.from(formularz.querySelectorAll(selektor)).filter(pole => /categor|kategori/i.test(pole.name));
    const kategorie = kontrolki.flatMap(kontrolka => {
      if (kontrolka.tagName === "SELECT") return Array.from(kontrolka.options).filter(opcja => opcja.value).map(opcja => ({
        nazwa: opcja.textContent.trim(), kontrolka, opcja, wartosc: opcja.value, identyfikator: kontrolka.id
      }));
      const etykiety = Array.from(kontrolka.labels || []);
      const nazwa = etykiety.map(etykieta => etykieta.textContent).join(" ").trim() || kontrolka.getAttribute("aria-label");
      return nazwa ? [{ nazwa, kontrolka, wartosc: kontrolka.value, identyfikator: kontrolka.id }] : [];
    });
    return { formularz, sekcja, kategorie };
  }

  function czyWybrana(kategoria) {
    return Boolean(kategoria.opcja ? kategoria.opcja.selected : kategoria.kontrolka.checked);
  }

  function odczytajLimit({ formularz, sekcja, kategorie }) {
    if (!formularz) return null;
    const poleLimit = sekcja?.getAttribute("data-max-selected") || kategorie[0]?.kontrolka.getAttribute("data-max-selected");
    if (/^[1-4]$/.test(poleLimit || "")) return Number(poleLimit);
    const tekstSekcji = globalny.KategorieEventis.normalizujKategorie(sekcja?.textContent);
    const aktywne = Array.from(formularz.querySelectorAll("select,input")).filter(pole => {
      if (pole.closest("#esync-root") || kategorie.some(kategoria => kategoria.kontrolka === pole)) return false;
      const etykieta = pole.tagName === "SELECT"
        ? Array.from(pole.selectedOptions, opcja => opcja.textContent).join(" ")
        : Array.from(pole.labels || [], element => element.textContent).join(" ");
      return /type|typ|pack|pakiet|premium|prime|plan|wariant/i.test(`${pole.name} ${pole.id}`)
        || /\bprime\b|\bpremium\b/i.test(etykieta);
    });
    const opisy = aktywne.flatMap(pole => {
      if (pole.tagName === "SELECT") return Array.from(pole.selectedOptions).map(opcja => `${opcja.value} ${opcja.textContent}`);
      if ((pole.type === "radio" || pole.type === "checkbox") && !pole.checked) return [];
      return [`${pole.value} ${Array.from(pole.labels || [], etykieta => etykieta.textContent).join(" ")}`];
    }).join(" ");
    const opisNorm = globalny.KategorieEventis.normalizujKategorie(opisy);
    const prime = /\bprime\b/.test(opisNorm);
    const premium = /\bpremium\b/.test(opisNorm);
    if (prime !== premium) return premium ? 4 : 2;
    const liczby = Array.from(tekstSekcji.matchAll(/(?:maks(?:ymalnie)?|max|limit)\s*(\d+)/g), dopasowanie => Number(dopasowanie[1]));
    if (liczby.length === 1 && liczby[0] > 0 && liczby[0] <= 4
      && !(/\bprime\b/.test(tekstSekcji) && /\bpremium\b/.test(tekstSekcji))) return liczby[0];
    // Sam tekst zawierający opis obu ofert nie mówi, którą ofertę wybrano.
    const tekst = globalny.KategorieEventis.normalizujKategorie(formularz.textContent);
    const nazwy = [...tekst.matchAll(/\b(?:prime|premium)\b/g)].map(dopasowanie => dopasowanie[0]);
    if (nazwy.length && nazwy.every(nazwa => nazwa === nazwy[0])) return nazwy[0] === "premium" ? 4 : 2;
    return null;
  }

  function przelaczKategorie(kategoria, katalog, limit) {
    const wybrana = czyWybrana(kategoria);
    if (kategoria.kontrolka.disabled || kategoria.opcja?.disabled || kategoria.kontrolka.matches(":disabled")) return "Ta kategoria jest niedostępna.";
    if (!wybrana && limit === null) return "Nie rozpoznano limitu kategorii. Wybierz kategorię w formularzu Eventis.";
    if (!wybrana && katalog.filter(czyWybrana).length >= limit) return `Osiągnięto limit ${limit} kategorii.`;
    const widok = kategoria.kontrolka.ownerDocument.defaultView;
    if (kategoria.opcja) {
      kategoria.opcja.selected = !wybrana;
      kategoria.kontrolka.dispatchEvent(new widok.Event("input", { bubbles: true }));
      kategoria.kontrolka.dispatchEvent(new widok.Event("change", { bubbles: true }));
    } else {
      // Natywny click uruchamia także podpięte przez Eventis listenery/pluginy i input/change.
      kategoria.kontrolka.click();
    }
    return czyWybrana(kategoria) === wybrana ? "Eventis nie przyjął zmiany kategorii." : "";
  }

  function utworzKontrolerKategorii(dokument, pobierzTekst) {
    let panel = null;
    let rozwinieta = true;
    let pozostale = false;
    let komunikat = "";
    let zaplanowano = false;
    let zatrzymano = false;
    let ostatniWidok = "";
    const widok = dokument.defaultView;
    const ucieczka = tekst => String(tekst).replace(/[&<>"']/g, znak => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[znak]));

    function odswiez() {
      if (!panel?.isConnected || zatrzymano) return;
      rozwinieta = panel.querySelector("details")?.open ?? rozwinieta;
      const katalog = odczytajKategorie(dokument);
      const limit = odczytajLimit(katalog);
      const ranking = globalny.KategorieEventis.rankingKategorii(katalog.kategorie, pobierzTekst());
      const najlepsze = ranking.filter(kategoria => kategoria.wynik > 20).slice(0, 5);
      const widoczne = pozostale ? ranking : ranking.filter(kategoria => najlepsze.includes(kategoria) || czyWybrana(kategoria));
      const liczbaWybranych = ranking.filter(czyWybrana).length;
      const tresc = `<details class="esync-card esync-kategorie" ${rozwinieta ? "open" : ""}><summary>Sugerowane kategorie <small>${liczbaWybranych}${limit ? ` / ${limit}` : ""}</small></summary>
        <p class="esync-small esync-muted">Wynik dopasowania, nie prawdopodobieństwo. Kliknij, aby zaznaczyć lub odznaczyć.</p>
        ${!ranking.length ? '<p class="esync-small">Nie znaleziono obsługiwanych kategorii w formularzu Eventis.</p>' : !najlepsze.length && !pozostale ? '<p class="esync-small">Brak mocnych sugestii dla tego tytułu.</p>' : ""}
        <div class="esync-kategorie-lista">${widoczne.map(kategoria => `<button type="button" class="esync-kategoria ${kategoria.wynik >= 70 ? "esync-kategoria-mocna" : kategoria.wynik >= 40 ? "esync-kategoria-srednia" : ""}" data-kategoria="${kategoria.kolejnosc}" aria-pressed="${czyWybrana(kategoria)}" ${kategoria.kontrolka.disabled || kategoria.opcja?.disabled ? "disabled" : ""}><span>${czyWybrana(kategoria) ? "✓ " : ""}${ucieczka(kategoria.nazwa)}</span><small>${kategoria.wynik}%</small></button>`).join("")}</div>
        ${ranking.length > najlepsze.length ? `<button type="button" class="esync-btn" data-pozostale>${pozostale ? "Ukryj pozostałe" : "Pokaż pozostałe"}</button>` : ""}
        <p class="esync-small" role="status" aria-live="polite">${ucieczka(komunikat)}</p></details>`;
      if (tresc === ostatniWidok) return;
      ostatniWidok = tresc;
      panel.innerHTML = tresc;
      panel.querySelector("details").addEventListener("toggle", zdarzenie => {
        if (zdarzenie.target.isConnected) rozwinieta = zdarzenie.target.open;
      });
      panel.querySelector("[data-pozostale]")?.addEventListener("click", () => { pozostale = !pozostale; odswiez(); });
      for (const przycisk of panel.querySelectorAll("[data-kategoria]")) przycisk.addEventListener("click", () => {
        const aktualny = odczytajKategorie(dokument);
        const kategoria = aktualny.kategorie[Number(przycisk.dataset.kategoria)];
        komunikat = kategoria ? przelaczKategorie(kategoria, aktualny.kategorie, odczytajLimit(aktualny)) : "Lista kategorii zmieniła się. Spróbuj ponownie.";
        odswiez();
        zaplanujOdswiezenie();
      });
    }

    function zaplanujOdswiezenie(zdarzenie) {
      if (zdarzenie?.target?.closest?.("#esync-root") || zaplanowano || zatrzymano) return;
      if (zdarzenie) komunikat = "";
      zaplanowano = true;
      widok.queueMicrotask(() => { zaplanowano = false; odswiez(); });
    }

    // Obserwacja zdarzeń i mutacji zamiast pollingu; obejmuje także zastąpienie całego formularza.
    const obserwator = new widok.MutationObserver(zmiany => {
      if (zmiany.some(zmiana => !zmiana.target.closest?.("#esync-root") && !zmiana.target.parentElement?.closest("#esync-root"))) zaplanujOdswiezenie();
    });
    obserwator.observe(dokument.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["checked", "selected", "disabled", "value", "data-max-selected"] });
    dokument.addEventListener("input", zaplanujOdswiezenie);
    dokument.addEventListener("change", zaplanujOdswiezenie);
    function zatrzymaj() {
      zatrzymano = true;
      obserwator.disconnect();
      dokument.removeEventListener("input", zaplanujOdswiezenie);
      dokument.removeEventListener("change", zaplanujOdswiezenie);
      widok.removeEventListener("pagehide", zatrzymaj);
    }
    widok.addEventListener("pagehide", zatrzymaj);
    return {
      podlacz(element) {
        rozwinieta = panel?.querySelector("details")?.open ?? rozwinieta;
        panel = element; ostatniWidok = ""; odswiez();
      },
      odswiez, zatrzymaj
    };
  }

  const interfejs = { odczytajKategorie, czyWybrana, odczytajLimit, przelaczKategorie, utworzKontrolerKategorii };
  globalny.KontrolerKategoriiEventis = interfejs;
  if (typeof module !== "undefined" && module.exports) module.exports = interfejs;
})(typeof globalThis !== "undefined" ? globalThis : this);
