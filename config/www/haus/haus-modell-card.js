/*
 * haus-modell-card.js -- Lovelace card that embeds the house model and hands
 * readings into it.
 *
 * Why this card instead of a plain iframe panel: the viewer must know NO
 * credentials. It is passed around as a single file (bundle.py), and a
 * long-lived token inside it would be full access to this Home Assistant
 * instance for anyone who gets the file. The card, by contrast, runs inside
 * Home Assistant, has `hass` anyway, and only pushes the finished values into
 * the iframe by postMessage.
 *
 * Installation:
 *   1. Copy the file to config/www/haus-modell-card.js
 *   2. Settings -> Dashboards -> Resources -> add:
 *      /local/haus-modell-card.js  as a JavaScript module
 *   3. Create the card:
 *        type: custom:haus-modell-card
 *        url: /local/haus_viewer.html
 *        hoehe: 640px
 *
 * After loading, the viewer announces itself which entities it needs - so the
 * card does not have to be configured twice.
 *
 * The message keys (typ, werte, wert, einheit, alter) are the wire format
 * shared with the viewer and stay as they are; renaming them would have to
 * happen on both sides at once.
 */

const TYPE_ANNOUNCE = "haus-modell/entitaeten";
const TYPE_VALUES = "haus-modell/messwerte";

class HausModellCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.url) {
      throw new Error("url fehlt (Pfad zum Viewer, z. B. /local/haus_viewer.html)");
    }
    this._config = config;
    this._entities = [];
    this._last = "";

    const card = document.createElement("ha-card");
    if (config.title) card.header = config.title;
    this._frame = document.createElement("iframe");
    // Home Assistant serves /local/ with a long cache lifetime. Without a
    // suffix the browser keeps loading the old viewer after an export - and
    // mixes it with fresh metadata, which produces errors that look like magic
    // (labels current, colors not). The viewer passes the suffix on to
    // haus.glb, haus.meta.json, viewer.css and its modules.
    const stamp = config.version ?? Date.now();
    this._frame.src = config.url
      + (config.url.includes("?") ? "&" : "?") + "v=" + stamp;
    this._frame.style.cssText =
      `width:100%;height:${config.hoehe || config.height || "640px"};` +
      "border:0;display:block";
    // The viewer only needs scripts and same origin for postMessage.
    this._frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    card.appendChild(this._frame);
    this.replaceChildren(card);

    // After loading, the viewer reports which entities it wants to show.
    this._listener = (e) => {
      if (e.source !== this._frame.contentWindow) return;
      if (!e.data || e.data.typ !== TYPE_ANNOUNCE) return;
      const list = e.data.entitaeten;
      if (!Array.isArray(list)) return;
      this._entities = list.filter((x) => typeof x === "string").slice(0, 200);
      this._last = "";           // forces a send
      this._send();
    };
    window.addEventListener("message", this._listener);
  }

  disconnectedCallback() {
    if (this._listener) window.removeEventListener("message", this._listener);
  }

  set hass(hass) {
    this._hass = hass;
    this._send();
  }

  _send() {
    if (!this._hass || !this._frame?.contentWindow || !this._entities.length) return;

    const now = Date.now();
    const werte = {};
    for (const eid of this._entities) {
      const s = this._hass.states[eid];
      if (!s) continue;
      const measured = Date.parse(s.last_updated || s.last_changed || "");
      werte[eid] = {
        wert: s.state,
        einheit: s.attributes?.unit_of_measurement ?? "",
        alter: Number.isFinite(measured)
          ? Math.max(0, Math.round((now - measured) / 1000)) : null,
      };
    }

    // `hass` changes on every state change in the whole house. Without this
    // comparison the card would flood the iframe every second, even though
    // nothing changed on these entities.
    const fingerprint = JSON.stringify(
      Object.fromEntries(Object.entries(werte).map(
        ([k, v]) => [k, [v.wert, v.einheit]])));
    if (fingerprint === this._last) return;
    this._last = fingerprint;

    this._frame.contentWindow.postMessage(
      { typ: TYPE_VALUES, werte }, window.location.origin);
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
