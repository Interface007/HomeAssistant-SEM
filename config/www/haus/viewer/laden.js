/*
 * Loading and installing the model: glb + meta.json from the neighbouring
 * files, from an embedded copy, or from files dropped onto the page.
 *
 * `install` is the one place that turns a loaded glTF scene into the lookup
 * tables in zustand.js and lets every other aspect rebuild itself.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  bbox, byStorey, byType, collidables, groupColor, hiddenStoreys, hiddenTypes,
  meta, model, nachGid, PALETTE, push, setBbox, setMeta, setModel,
} from "haus/zustand.js";
import { camera, clipPlane, controls, dropEl, fit, scene } from "haus/szene.js";
import { clipInput, setupClip } from "haus/schnitt.js";
import { applyVisibility, renderLists } from "haus/filter.js";
import { beschriften, raeumeBeschriften } from "haus/schilder.js";
import {
  entitaetenAnsagen, fensterFaerben, messwerteSchilder,
} from "haus/messwerte.js";
import { verlassen, walkStoreySel } from "haus/begehen.js";

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
const SEITEN_VERSION = location.search.replace(/^\?/, "");

function mitVersion(datei, extra = "") {
  const teile = [SEITEN_VERSION, extra].filter(Boolean).join("&");
  return teile ? `${datei}?${teile}` : datei;
}

export async function loadDefaultFiles({ bustCache = false } = {}) {
  const extra = bustCache ? `t=${Date.now()}` : "";
  let mitMeta = false;
  let stand = "";
  try {
    const r = await fetch(mitVersion("haus.meta.json", extra),
                          { cache: "no-store" });
    if (r.ok) {
      setMeta(await r.json());
      mitMeta = true;
      // Show the file timestamp as well: that way one can see at a glance
      // whether the browser really has the new state.
      const lm = r.headers.get("last-modified");
      if (lm) {
        const d = new Date(lm);
        if (!Number.isNaN(d.valueOf())) {
          stand = ` · Stand ${d.toLocaleString("de-DE",
            { dateStyle: "short", timeStyle: "short" })}`;
        }
      }
    } else setMeta({});
  } catch { setMeta({}); }
  // The label should name what was really loaded - otherwise it claims
  // metadata that is not there at all.
  await loadURL(mitVersion("haus.glb", extra),
    (mitMeta ? "haus.glb + haus.meta.json" : "haus.glb (ohne Metadaten)")
    + stand);
}

// For the single-file edition: the model sits in the document as base64.
// loader.parse works directly on the buffer, entirely without fetch - that is
// the only way that also works under file://.
async function loadBase64(b64, label) {
  const roh = atob(b64);
  const puffer = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) puffer[i] = roh.charCodeAt(i);
  const gltf = await new Promise((ok, fehler) =>
    loader.parse(puffer.buffer, "", ok, fehler));
  install(gltf.scene, label);
}

export async function loadEmbedded() {
  const eMeta = document.getElementById("eingebettetMeta");
  const eGlb = document.getElementById("eingebettetGlb");
  if (!eMeta || !eGlb) throw new Error("keine eingebetteten Daten");
  setMeta(JSON.parse(eMeta.textContent));
  await loadBase64(eGlb.textContent.trim(), "eingebettet");
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
  verlassen();
  if (model) scene.remove(model);
  setModel(root);
  byType.clear(); byStorey.clear(); groupColor.clear(); nachGid.clear();
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
    const verglast = type === "IfcWindow" || /glas/i.test(m?.material ?? "");
    // Group = switching group in the component list. The default is the IFC
    // class, ceilings are named individually by the converter (base slab,
    // ceiling above ...).
    const gruppe = m?.gruppe ?? type;
    const storey = m?.geschoss ?? "ohne Zuordnung";
    const typfarbe = PALETTE[type] ?? PALETTE._default;
    const color = verglast ? PALETTE.IfcWindow : typfarbe;
    o.userData.gid = gid;
    o.userData.gruppe = gruppe;
    o.userData.geschoss = storey;
    o.material = new THREE.MeshLambertMaterial({
      color,
      clippingPlanes: [clipPlane],
      transparent: verglast,
      opacity: verglast ? 0.45 : 1,
      side: THREE.DoubleSide,
    });
    // Legend always in the type color, otherwise a glass door dyes the whole
    // "Door" group blue.
    if (!groupColor.has(gruppe)) groupColor.set(gruppe, typfarbe);
    push(byType, gruppe, o);
    if (gid) push(nachGid, gid, o);
    // Doors are closed fillings in the model. When walking one has to get
    // through them, so they do not count as an obstacle.
    if (type !== "IfcDoor") collidables.push(o);
    push(byStorey, storey, o);
  });

  scene.add(model);
  beschriften();
  raeumeBeschriften();
  messwerteSchilder();
  fensterFaerben();
  entitaetenAnsagen();
  setBbox(new THREE.Box3().setFromObject(model));
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
  .catch((err) => console.warn("Reload fehlgeschlagen", err));
