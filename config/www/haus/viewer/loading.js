/*
 * Loading and installing the model: glb + meta.json from the neighbouring
 * files, from an embedded copy, or from files dropped onto the page.
 *
 * `install` is the one place that turns a loaded glTF scene into the lookup
 * tables in state.js and lets every other aspect rebuild itself.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  bbox, byGid, byStorey, byType, collidables, groupColor, hiddenStoreys,
  hiddenTypes, meta, model, PALETTE, push, setBbox, setMeta, setModel,
} from "haus/state.js";
import { camera, clipPlane, controls, dropEl, fit, scene } from "haus/scene.js";
import { clipInput, setupClip } from "haus/section.js";
import { applyVisibility, renderLists } from "haus/filter.js";
import { labelRooms, labelWalls } from "haus/labels.js";
import { announceEntities, colorWindows, labelDevices } from "haus/readings.js";
import { leave, walkStoreySel } from "haus/walk.js";
import { prepare } from "haus/appearance.js";

const loader = new GLTFLoader();

export async function loadURL(url, label) {
  const gltf = await loader.loadAsync(url);
  install(gltf.scene, label);
}

// A query suffix on the page URL is passed on to the neighbouring files. That
// way the whole set can be fetched fresh in one go: if the embedding page
// loads viewer.html?v=123, the same applies to haus.glb and haus.meta.json.
// Without it the browser can mix an old viewer with new metadata - then
// components and code no longer match, and errors look like magic.
const PAGE_VERSION = location.search.replace(/^\?/, "");

function withVersion(file, extra = "") {
  const parts = [PAGE_VERSION, extra].filter(Boolean).join("&");
  return parts ? `${file}?${parts}` : file;
}

export async function loadDefaultFiles({ bustCache = false } = {}) {
  const extra = bustCache ? `t=${Date.now()}` : "";
  let hasMeta = false;
  let stamp = "";
  try {
    const r = await fetch(withVersion("haus.meta.json", extra),
                          { cache: "no-store" });
    if (r.ok) {
      setMeta(await r.json());
      hasMeta = true;
      // Show the file timestamp as well: that way one can see at a glance
      // whether the browser really has the new state.
      const lm = r.headers.get("last-modified");
      if (lm) {
        const d = new Date(lm);
        if (!Number.isNaN(d.valueOf())) {
          stamp = ` · Stand ${d.toLocaleString("de-DE",
            { dateStyle: "short", timeStyle: "short" })}`;
        }
      }
    } else setMeta({});
  } catch { setMeta({}); }
  // The label should name what was really loaded - otherwise it claims
  // metadata that is not there at all.
  await loadURL(withVersion("haus.glb", extra),
    (hasMeta ? "haus.glb + haus.meta.json" : "haus.glb (ohne Metadaten)")
    + stamp);
}

// For the single-file edition: the model sits in the document as base64.
// loader.parse works directly on the buffer, entirely without fetch - that is
// the only way that also works under file://.
async function loadBase64(b64, label) {
  const raw = atob(b64);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  const gltf = await new Promise((resolve, reject) =>
    loader.parse(buffer.buffer, "", resolve, reject));
  install(gltf.scene, label);
}

export async function loadEmbedded() {
  const metaEl = document.getElementById("embeddedMeta");
  const glbEl = document.getElementById("embeddedGlb");
  if (!metaEl || !glbEl) throw new Error("no embedded data");
  setMeta(JSON.parse(metaEl.textContent));
  await loadBase64(glbEl.textContent.trim(), "eingebettet");
}

async function reloadDefaultFiles() {
  const button = document.getElementById("reload");
  button.disabled = true;
  button.textContent = "lade...";
  try {
    await loadDefaultFiles({ bustCache: true });
  } catch (err) {
    try {
      await loadEmbedded();
    } catch {
      dropEl.classList.remove("hide");
      document.querySelector("#drop div").innerHTML =
        "<strong>haus.glb</strong> und <strong>haus.meta.json</strong> "
        + "zusammen hierher ziehen";
      throw err;
    }
  } finally {
    button.disabled = false;
    button.textContent = "Neu laden";
  }
}

function snapshotViewState() {
  const state = {
    hiddenTypes: new Set(hiddenTypes),
    hiddenStoreys: new Set(hiddenStoreys),
    walkStorey: walkStoreySel.value,
  };
  if (bbox) {
    const min = parseFloat(clipInput.min), max = parseFloat(clipInput.max);
    state.clip = (parseFloat(clipInput.value) - min) / Math.max(max - min, 1e-9);
    state.camera = camera.position.clone();
    state.target = controls.target.clone();
  }
  return state;
}

export function install(root, label, state = snapshotViewState()) {
  leave();
  if (model) scene.remove(model);
  setModel(root);
  byType.clear(); byStorey.clear(); groupColor.clear(); byGid.clear();
  collidables.length = 0;
  hiddenTypes.clear();
  hiddenStoreys.clear();
  state.hiddenTypes?.forEach((k) => hiddenTypes.add(k));
  state.hiddenStoreys?.forEach((k) => hiddenStoreys.add(k));

  model.traverse((o) => {
    if (!o.isMesh) return;
    // Node name = IFC GlobalId (serializer option use-element-guids)
    let node = o, gid = null;
    while (node && !gid) { if (meta[node.name]) gid = node.name; node = node.parent; }
    const m = gid ? meta[gid] : null;
    const type = m?.typ ?? "_default";
    // Draw glazed components transparent - windows anyway, doors only if their
    // material is glass (the terrace door for instance).
    const glazed = type === "IfcWindow" || /glas/i.test(m?.material ?? "");
    // Group = switching group in the component list. The default is the IFC
    // class, ceilings are named individually by the converter (base slab,
    // ceiling above ...).
    const group = m?.gruppe ?? type;
    const storey = m?.geschoss ?? "ohne Zuordnung";
    const typeColor = PALETTE[type] ?? PALETTE._default;
    const color = glazed ? PALETTE.IfcWindow : typeColor;
    o.userData.gid = gid;
    o.userData.gruppe = group;
    o.userData.geschoss = storey;
    o.material = new THREE.MeshLambertMaterial({
      color,
      clippingPlanes: [clipPlane],
      transparent: glazed,
      opacity: glazed ? 0.45 : 1,
      side: THREE.DoubleSide,
    });
    // Legend always in the type color, otherwise a glass door dyes the whole
    // "Door" group blue.
    if (!groupColor.has(group)) groupColor.set(group, typeColor);
    push(byType, group, o);
    if (gid) push(byGid, gid, o);
    // Doors are closed fillings in the model. When walking one has to get
    // through them, so they do not count as an obstacle.
    if (type !== "IfcDoor") collidables.push(o);
    push(byStorey, storey, o);
  });

  setBbox(new THREE.Box3().setFromObject(model));
  prepare(model, bbox);
  scene.add(model);
  labelWalls();
  labelRooms();
  labelDevices();
  colorWindows();
  announceEntities();
  fit();
  if (state.camera && state.target) {
    camera.position.copy(state.camera);
    controls.target.copy(state.target);
    controls.update();
  }
  setupClip(state.clip);
  renderLists(state.walkStorey);
  applyVisibility();
  dropEl.classList.add("hide");
  document.getElementById("source").textContent = label;
  // Without metadata every component falls into "ohne Zuordnung" - that is the
  // most common stumbling block and must not happen silently.
  document.getElementById("metaWarn").hidden = Object.keys(meta).length > 0;
}

document.getElementById("reload").onclick = () => reloadDefaultFiles()
  .catch((err) => console.warn("reload failed", err));
