/*
 * haus-modell-card.js -- Lovelace-Karte, die das Hausmodell einbettet und
 * ihm Messwerte hineinreicht.
 *
 * Warum diese Karte statt eines einfachen iframe-Panels: der Viewer soll
 * KEINE Zugangsdaten kennen. Er wird als Einzeldatei weitergegeben
 * (bundle.py), und ein Long-Lived Token darin waere ein Vollzugriff auf diese
 * Home-Assistant-Instanz fuer jeden, der die Datei bekommt. Die Karte laeuft
 * dagegen innerhalb von Home Assistant, hat `hass` ohnehin und schiebt nur
 * die fertigen Werte per postMessage in den iframe.
 *
 * Einbau:
 *   1. Datei nach config/www/haus-modell-card.js kopieren
 *   2. Einstellungen -> Dashboards -> Ressourcen -> hinzufuegen:
 *      /local/haus-modell-card.js  als JavaScript-Modul
 *   3. Karte anlegen:
 *        type: custom:haus-modell-card
 *        url: /local/haus_viewer.html
 *        hoehe: 640px
 *
 * Der Viewer sagt nach dem Laden selbst an, welche Entitaeten er braucht -
 * die Karte muss also nicht doppelt konfiguriert werden.
 */

const TYP_ANSAGE = "haus-modell/entitaeten";
const TYP_WERTE = "haus-modell/messwerte";

class HausModellCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.url) {
      throw new Error("url fehlt (Pfad zum Viewer, z. B. /local/haus_viewer.html)");
    }
    this._config = config;
    this._entitaeten = [];
    this._letzte = "";

    const card = document.createElement("ha-card");
    if (config.title) card.header = config.title;
    this._frame = document.createElement("iframe");
    // Home Assistant liefert /local/ mit langer Cache-Dauer aus. Ohne
    // Anhaengsel laedt der Browser nach einem Export weiter den alten Viewer -
    // und mischt ihn mit frischen Metadaten, was zu Fehlern fuehrt, die
    // aussehen wie Zauberei (Beschriftungen aktuell, Farben nicht). Der
    // Viewer reicht das Anhaengsel an haus.glb und haus.meta.json weiter.
    const stempel = config.version ?? Date.now();
    this._frame.src = config.url
      + (config.url.includes("?") ? "&" : "?") + "v=" + stempel;
    this._frame.style.cssText =
      `width:100%;height:${config.hoehe || config.height || "640px"};` +
      "border:0;display:block";
    // Der Viewer braucht nur Skripte und gleiche Herkunft fuer postMessage.
    this._frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    card.appendChild(this._frame);
    this.replaceChildren(card);

    // Der Viewer meldet nach dem Laden, welche Entitaeten er anzeigen will.
    this._hoerer = (e) => {
      if (e.source !== this._frame.contentWindow) return;
      if (!e.data || e.data.typ !== TYP_ANSAGE) return;
      const liste = e.data.entitaeten;
      if (!Array.isArray(liste)) return;
      this._entitaeten = liste.filter((x) => typeof x === "string").slice(0, 200);
      this._letzte = "";           // erzwingt ein Senden
      this._senden();
    };
    window.addEventListener("message", this._hoerer);
  }

  disconnectedCallback() {
    if (this._hoerer) window.removeEventListener("message", this._hoerer);
  }

  set hass(hass) {
    this._hass = hass;
    this._senden();
  }

  _senden() {
    if (!this._hass || !this._frame?.contentWindow || !this._entitaeten.length) return;

    const jetzt = Date.now();
    const werte = {};
    for (const eid of this._entitaeten) {
      const s = this._hass.states[eid];
      if (!s) continue;
      const gemessen = Date.parse(s.last_updated || s.last_changed || "");
      werte[eid] = {
        wert: s.state,
        einheit: s.attributes?.unit_of_measurement ?? "",
        alter: Number.isFinite(gemessen)
          ? Math.max(0, Math.round((jetzt - gemessen) / 1000)) : null,
      };
    }

    // `hass` aendert sich bei jedem Zustandswechsel im ganzen Haus. Ohne
    // diesen Vergleich wuerde die Karte den iframe im Sekundentakt fluten,
    // obwohl sich an diesen Entitaeten nichts geaendert hat.
    const abdruck = JSON.stringify(
      Object.fromEntries(Object.entries(werte).map(
        ([k, v]) => [k, [v.wert, v.einheit]])));
    if (abdruck === this._letzte) return;
    this._letzte = abdruck;

    this._frame.contentWindow.postMessage(
      { typ: TYP_WERTE, werte }, window.location.origin);
  }

  getCardSize() {
    return 8;
  }
}

customElements.define("haus-modell-card", HausModellCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "haus-modell-card",
  name: "Hausmodell",
  description: "3D-Modell des Hauses mit Messwerten an den Geräten",
});
