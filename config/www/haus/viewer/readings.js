/*
 * Readings on the device, and window states as a color.
 *
 * The viewer knows no credentials. The values arrive by postMessage from the
 * page it is embedded in (Home Assistant card); which entities it needs for
 * that it announces itself after loading.
 *
 * The wire format (`haus-modell/messwerte`, `wert`, `einheit`, `alter`) and the
 * role names from the IFC pset (`Temperatur`, `Kontakt`, ...) stay German: both
 * are contracts with haus-modell-card.js and with the model data, not names
 * this file may pick. What is stored internally uses English keys.
 */
import * as THREE from "three";
import { byGid, byType, deviceLabels, meta, readings } from "haus/state.js";
import { scene } from "haus/scene.js";
import { makeLabel } from "haus/labels.js";

const STALE_S = 3600;   // from here on a value counts as old

const SHORT = { Temperatur: "", Feuchte: "", Batterie: "Batt " };
// Two kinds of roles: readings become a label on the component, states color
// it in. A window contact needs no label - the color already says everything,
// and a label on every window would only be noise.
const READING_ROLES = new Set(["Temperatur", "Feuchte", "Batterie"]);
const WINDOW = { closed: 0x3f7d9c, open: 0xe0a615, tilted: 0xc0392b };
const TILT_THRESHOLD = 5;   // degrees; below this the window is not tilted
// Reading order, independent of how the properties sit in the pset - those
// arrive alphabetically from the sidecar file and would otherwise start with
// the battery.
const ROLE_ORDER = ["Temperatur", "Feuchte", "Batterie"];

function germanNumber(s) {
  return /^-?\d+([.,]\d+)?$/.test(s) ? s.replace(".", ",") : s;
}

function entitiesOf(gid) {
  const pset = meta[gid]?.psets?.Pset_HomeAssistant;
  if (!pset) return [];
  const rank = (k) => {
    const i = ROLE_ORDER.indexOf(k);
    return i < 0 ? ROLE_ORDER.length : i;
  };
  return Object.entries(pset)
    // `Geraet` is the stable name, `Area` the room reference, `id` the IFC
    // instance number - none of them is an entity one could subscribe to.
    // Without this filter the viewer ordered `bedroom` as a reading and would
    // never get an answer.
    .filter(([k]) => k !== "id" && k !== "Geraet" && k !== "Area")
    .map(([k, v]) => [k, String(v)])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

function allEntities() {
  const out = new Set();
  for (const gid of Object.keys(meta)) {
    for (const [, e] of entitiesOf(gid)) out.add(e);
  }
  return [...out];
}

function ageText(seconds) {
  if (seconds == null) return "keine Daten";
  if (seconds < 90) return "gerade eben";
  if (seconds < 5400) return `vor ${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `vor ${Math.round(seconds / 3600)} h`;
  return `vor ${Math.round(seconds / 86400)} d`;
}

export function labelDevices() {
  deviceLabels.clear();
  const seen = new Set();
  for (const [group, meshes] of byType) {
    for (const mesh of meshes) {
      const gid = mesh.userData.gid;
      if (!gid || seen.has(gid)) continue;
      const entries = entitiesOf(gid).filter(([role]) => READING_ROLES.has(role));
      if (!entries.length) continue;
      seen.add(gid);

      const parts = [];
      let youngest = null;
      for (const [role, entity] of entries) {
        const r = readings.get(entity);
        const short = SHORT[role] ?? `${role} `;
        parts.push(r ? `${short}${germanNumber(r.value)} ${r.unit}`.trim()
                     : `${short}—`.trim());
        if (r?.age != null) {
          youngest = youngest == null ? r.age : Math.min(youngest, r.age);
        }
      }
      const stale = youngest == null || youngest > STALE_S;
      const lines = [meta[gid]?.name ?? group,
                     parts.join("  ·  "),
                     ageText(youngest)];

      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const thin = size.x < size.z;
      const n = thin ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const offset = (thin ? size.x : size.z) / 2 + 0.05;
      // Two labels, one per side - the one inside the wall is hidden by the
      // wall itself, so the viewer need not know the mounting side.
      for (const side of [1, -1]) {
        const sprite = makeLabel(lines, stale);
        sprite.position.copy(center).setY(center.y + 0.30)
          .addScaledVector(n, side * offset);
        deviceLabels.add(sprite);
      }
    }
  }
  if (!deviceLabels.parent) scene.add(deviceLabels);
  deviceLabels.visible = document.getElementById("readings").checked;
}

function readsOpen(value) {
  return /^(on|open|offen|true|geoeffnet)$/i.test(String(value ?? ""));
}

export function colorWindows() {
  let found = false;
  for (const [gid, meshes] of byGid) {
    const roles = Object.fromEntries(entitiesOf(gid));
    if (!roles.Kontakt && !roles.Neigung) continue;
    found = true;

    const contact = readings.get(roles.Kontakt);
    const tilt = readings.get(roles.Neigung);
    const angle = tilt ? parseFloat(String(tilt.value).replace(",", ".")) : NaN;

    // Tilted beats open: a tilted window usually reports both, and the tilt
    // state is the sharper statement.
    let color = WINDOW.closed;
    if (Number.isFinite(angle) && angle > TILT_THRESHOLD) color = WINDOW.tilted;
    else if (contact && readsOpen(contact.value)) color = WINDOW.open;

    for (const mesh of meshes) mesh.material.color.setHex(color);
  }
  document.getElementById("windowLegend").hidden = !found;
}

// Only the embedding page may send values. The content is exclusively drawn
// into a canvas, never inserted as HTML.
addEventListener("message", (e) => {
  if (window.parent === window || e.source !== window.parent) return;
  const d = e.data;
  if (!d || d.typ !== "haus-modell/messwerte" || typeof d.werte !== "object") return;
  for (const [entity, w] of Object.entries(d.werte)) {
    if (typeof entity !== "string" || !w) continue;
    readings.set(entity.slice(0, 120), {
      value: String(w.wert ?? "—").slice(0, 24),
      unit: String(w.einheit ?? "").slice(0, 12),
      age: Number.isFinite(w.alter) ? w.alter : null,
    });
  }
  labelDevices();
  colorWindows();
});

export function announceEntities() {
  if (window.parent === window) return;
  const entitaeten = allEntities();
  if (!entitaeten.length) return;
  // Target origin "*": only a list of entity ids goes out, and the viewer does
  // not know the origin of the embedding page.
  window.parent.postMessage({ typ: "haus-modell/entitaeten", entitaeten }, "*");
}

document.getElementById("readings").onchange = (e) => {
  deviceLabels.visible = e.target.checked;
};
