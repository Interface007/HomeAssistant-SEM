/*
 * Picking a component and the info panel that describes it.
 */
import * as THREE from "three";
import { meta, model } from "haus/state.js";
import { camera, infoEl, renderer } from "haus/scene.js";
import { mitRaster } from "haus/raster.js";
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
  const hit = ray.intersectObject(model, true)
    .find((h) => h.object.visible && h.object.material.visible);
  select(hit ? hit.object : null);
});

// All materials of a mesh (plan, realistic, neon, see appearance.js), so the
// highlight survives switching between them. The realistic and neon materials
// are shared between components of a kind; a picked one gets its own copy
// first, otherwise every wall would light up with it.
function ownMaterials(o) {
  for (const key of ["realMaterial", "neonMaterial"]) {
    const shared = o.userData[key];
    if (!shared || shared.userData.own !== false) continue;
    // clone() nimmt onBeforeCompile nicht mit - sonst verliert genau das
    // angeklickte Bauteil sein Raster.
    const copy = mitRaster(shared.clone());
    copy.userData = { glow: shared.userData.glow };
    o.userData[key] = copy;
    if (o.material === shared) o.material = copy;
  }
  return [o.userData.planMaterial ?? o.material, o.userData.realMaterial,
          o.userData.neonMaterial].filter(Boolean);
}

// Neon devices glow by themselves; deselecting must bring that glow back
// instead of leaving them black.
function restore(m) {
  m.emissive?.setHex(m.userData.glow?.color ?? 0x000000);
  if (m.userData.glow) m.emissiveIntensity = m.userData.glow.intensity;
}

function select(obj) {
  if (selected) ownMaterials(selected).forEach(restore);
  selected = obj;
  if (!obj) { infoEl.classList.remove("on"); return; }
  for (const m of ownMaterials(obj)) {
    if (!m.emissive) continue;
    m.emissive.setHex(0x0d5c63);
    m.emissiveIntensity = 0.35;
  }
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
