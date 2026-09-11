/*
 * Picking a component and the info panel that describes it.
 */
import * as THREE from "three";
import { meta, model } from "haus/state.js";
import { camera, infoEl, renderer } from "haus/scene.js";
import { walking } from "haus/walk.js";

const ray = new THREE.Raycaster();
ray.params.Line = { threshold: 0.1 };
let selected = null;

renderer.domElement.addEventListener("pointerdown", (e) => {
  if (!model) return;
  const r = renderer.domElement.getBoundingClientRect();
  // While walking the mouse pointer is captured - then the crosshair applies.
  const pos = walking
    ? new THREE.Vector2(0, 0)
    : new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(pos, camera);
  const hit = ray.intersectObject(model, true).find((h) => h.object.visible);
  select(hit ? hit.object : null);
});

function select(obj) {
  if (selected) selected.material.emissive?.setHex(0x000000);
  selected = obj;
  if (!obj) { infoEl.classList.remove("on"); return; }
  obj.material.emissive = new THREE.Color(0x0d5c63);
  obj.material.emissiveIntensity = 0.35;
  const m = meta[obj.userData.gid];
  const rows = [
    ["Typ", m?.typ?.replace(/^Ifc/, "") ?? "unbekannt"],
    ["Geschoss", m?.geschoss ?? "—"],
  ];
  if (m?.material) rows.push(["Material", m.material]);
  rows.push(["GlobalId", obj.userData.gid ?? "—"]);
  for (const [pset, props] of Object.entries(m?.psets ?? {})) {
    for (const [k, v] of Object.entries(props)) {
      if (k === "id") continue;
      rows.push([`${pset}.${k}`, String(v)]);
    }
  }
  infoEl.innerHTML =
    `<div class="title">${m?.name || "ohne Namen"}</div><dl>` +
    rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("") + "</dl>";
  infoEl.classList.add("on");
}
