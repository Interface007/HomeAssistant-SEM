/*
 * Readings on the device, and window states as a color.
 *
 * The viewer knows no credentials. The values arrive by postMessage from the
 * page it is embedded in (Home Assistant card); which entities it needs for
 * that it announces itself after loading.
 */
import * as THREE from "three";
import {
  byType, geraeteschilder, messwerte, meta, nachGid,
} from "haus/zustand.js";
import { scene } from "haus/szene.js";
import { schild } from "haus/schilder.js";

const VERALTET_S = 3600;   // from here on a value counts as old

const KURZ = { Temperatur: "", Feuchte: "", Batterie: "Batt " };
// Two kinds of roles: readings become a label on the component, states color
// it in. A window contact needs no label - the color already says everything,
// and a label on every window would only be noise.
const MESSROLLEN = new Set(["Temperatur", "Feuchte", "Batterie"]);
const FENSTER = { zu: 0x3f7d9c, offen: 0xe0a615, gekippt: 0xc0392b };
const KIPPSCHWELLE = 5;   // degrees; below this the window is not tilted
// Reading order, independent of how the properties sit in the pset - those
// arrive alphabetically from the sidecar file and would otherwise start with
// the battery.
const REIHENFOLGE = ["Temperatur", "Feuchte", "Batterie"];

function zahlDeutsch(s) {
  return /^-?\d+([.,]\d+)?$/.test(s) ? s.replace(".", ",") : s;
}

function entitaetenVon(gid) {
  const pset = meta[gid]?.psets?.Pset_HomeAssistant;
  if (!pset) return [];
  const rang = (k) => {
    const i = REIHENFOLGE.indexOf(k);
    return i < 0 ? REIHENFOLGE.length : i;
  };
  return Object.entries(pset)
    // `Geraet` is the stable name, `Area` the room reference, `id` the IFC
    // instance number - none of them is an entity one could subscribe to.
    // Without this filter the viewer ordered `bedroom` as a reading and would
    // never get an answer.
    .filter(([k]) => k !== "id" && k !== "Geraet" && k !== "Area")
    .map(([k, v]) => [k, String(v)])
    .sort((a, b) => rang(a[0]) - rang(b[0]) || a[0].localeCompare(b[0]));
}

function alleEntitaeten() {
  const aus = new Set();
  for (const gid of Object.keys(meta)) {
    for (const [, e] of entitaetenVon(gid)) aus.add(e);
  }
  return [...aus];
}

function alterText(sekunden) {
  if (sekunden == null) return "keine Daten";
  if (sekunden < 90) return "gerade eben";
  if (sekunden < 5400) return `vor ${Math.round(sekunden / 60)} min`;
  if (sekunden < 172800) return `vor ${Math.round(sekunden / 3600)} h`;
  return `vor ${Math.round(sekunden / 86400)} d`;
}

export function messwerteSchilder() {
  geraeteschilder.clear();
  const gesehen = new Set();
  for (const [gruppe, meshes] of byType) {
    for (const mesh of meshes) {
      const gid = mesh.userData.gid;
      if (!gid || gesehen.has(gid)) continue;
      const eintraege = entitaetenVon(gid)
        .filter(([rolle]) => MESSROLLEN.has(rolle));
      if (!eintraege.length) continue;
      gesehen.add(gid);

      const teile = [];
      let juengstes = null;
      for (const [rolle, entity] of eintraege) {
        const w = messwerte.get(entity);
        const kurz = KURZ[rolle] ?? `${rolle} `;
        teile.push(w ? `${kurz}${zahlDeutsch(w.wert)} ${w.einheit}`.trim()
                     : `${kurz}—`.trim());
        if (w?.alter != null) {
          juengstes = juengstes == null ? w.alter : Math.min(juengstes, w.alter);
        }
      }
      const alt = juengstes == null || juengstes > VERALTET_S;
      const zeilen = [meta[gid]?.name ?? gruppe,
                      teile.join("  ·  "),
                      alterText(juengstes)];

      const kasten = new THREE.Box3().setFromObject(mesh);
      const mitte = kasten.getCenter(new THREE.Vector3());
      const groesse = kasten.getSize(new THREE.Vector3());
      const duenn = groesse.x < groesse.z;
      const n = duenn ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const abstand = (duenn ? groesse.x : groesse.z) / 2 + 0.05;
      // Two labels, one per side - the one inside the wall is hidden by the
      // wall itself, so the viewer need not know the mounting side.
      for (const seite of [1, -1]) {
        const sp = schild(zeilen, alt);
        sp.position.copy(mitte).setY(mitte.y + 0.30)
          .addScaledVector(n, seite * abstand);
        geraeteschilder.add(sp);
      }
    }
  }
  if (!geraeteschilder.parent) scene.add(geraeteschilder);
  geraeteschilder.visible = document.getElementById("messwerte").checked;
}

function offenLaut(wert) {
  return /^(on|open|offen|true|geoeffnet)$/i.test(String(wert ?? ""));
}

export function fensterFaerben() {
  let gefunden = false;
  for (const [gid, meshes] of nachGid) {
    const rollen = Object.fromEntries(entitaetenVon(gid));
    if (!rollen.Kontakt && !rollen.Neigung) continue;
    gefunden = true;

    const kontakt = messwerte.get(rollen.Kontakt);
    const neigung = messwerte.get(rollen.Neigung);
    const winkel = neigung
      ? parseFloat(String(neigung.wert).replace(",", ".")) : NaN;

    // Tilted beats open: a tilted window usually reports both, and the tilt
    // state is the sharper statement.
    let farbe = FENSTER.zu;
    if (Number.isFinite(winkel) && winkel > KIPPSCHWELLE) farbe = FENSTER.gekippt;
    else if (kontakt && offenLaut(kontakt.wert)) farbe = FENSTER.offen;

    for (const mesh of meshes) mesh.material.color.setHex(farbe);
  }
  document.getElementById("fensterLegende").hidden = !gefunden;
}

// Only the embedding page may send values. The content is exclusively drawn
// into a canvas, never inserted as HTML.
addEventListener("message", (e) => {
  if (window.parent === window || e.source !== window.parent) return;
  const d = e.data;
  if (!d || d.typ !== "haus-modell/messwerte" || typeof d.werte !== "object") return;
  for (const [entity, w] of Object.entries(d.werte)) {
    if (typeof entity !== "string" || !w) continue;
    messwerte.set(entity.slice(0, 120), {
      wert: String(w.wert ?? "—").slice(0, 24),
      einheit: String(w.einheit ?? "").slice(0, 12),
      alter: Number.isFinite(w.alter) ? w.alter : null,
    });
  }
  messwerteSchilder();
  fensterFaerben();
});

export function entitaetenAnsagen() {
  if (window.parent === window) return;
  const entitaeten = alleEntitaeten();
  if (!entitaeten.length) return;
  // Target origin "*": only a list of entity ids goes out, and the viewer does
  // not know the origin of the embedding page.
  window.parent.postMessage(
    { typ: "haus-modell/entitaeten", entitaeten }, "*");
}

document.getElementById("messwerte").onchange = (e) => {
  geraeteschilder.visible = e.target.checked;
};
