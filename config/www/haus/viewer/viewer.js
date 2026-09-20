/*
 * Entry point: pulls the aspects together, wires up what belongs to no single
 * one of them - drag and drop, the sidebar, the render loop - and starts the
 * viewer.
 *
 * The aspects themselves live next to this file:
 *   state.js      shared state (model, metadata, lookup tables)
 *   scene.js      renderer, camera, orbit control, light, clipping plane
 *   loading.js    loading and installing the model
 *   section.js    horizontal section plane
 *   appearance.js plan colors or realistic light, materials and shading
 *   filter.js     storey and component lists, visibility
 *   labels.js     wall and room labels
 *   readings.js   readings and window states from Home Assistant
 *   walk.js       walking through a storey
 *   selection.js  picking and the info panel
 */
import * as THREE from "three";
import { model, setMeta } from "haus/state.js";
import {
  camera, controls, dropEl, main, renderer, resize, scene,
} from "haus/scene.js";
import {
  install, loadDefaultFiles, loadEmbedded, loadURL,
} from "haus/loading.js";
import { keys, walk, walking } from "haus/walk.js";
import { draw } from "haus/appearance.js";
import "haus/selection.js";

// ---------------------------------------------------------------- Files
["dragenter", "dragover"].forEach((t) =>
  addEventListener(t, (e) => { e.preventDefault(); dropEl.classList.add("armed"); }));
addEventListener("dragleave", () => dropEl.classList.remove("armed"));
addEventListener("drop", async (e) => {
  e.preventDefault();
  dropEl.classList.remove("armed");
  const files = [...e.dataTransfer.files];
  const json = files.find((f) => f.name.endsWith(".json"));
  if (json) setMeta(JSON.parse(await json.text()));
  const glb = files.find((f) => /\.(glb|gltf)$/i.test(f.name));
  if (glb) {
    const url = URL.createObjectURL(glb);
    await loadURL(url, glb.name);
    URL.revokeObjectURL(url);
  } else if (json && model) {
    // Metadata handed in later: apply the mapping to the loaded model
    install(model, document.getElementById("source").textContent);
  }
});

// ---------------------------------------------------------------- Start
addEventListener("resize", resize); resize();
// React to layout changes as well, not only to window sizes: the sidebar folds
// in and out, and in the dashboard the iframe changes its size without a
// resize event ever reaching the window.
new ResizeObserver(() => resize()).observe(main);

// ------------------------------------------------------- Sidebar on/off
// Collapsed by default: embedded in a dashboard every bit of screen width
// counts, and the component list is only needed occasionally. The choice is
// remembered so it does not have to be made again on every standalone visit.
const SIDEBAR_KEY = "housemodel.sidebar";
const sidebarBtn = document.getElementById("sidebar");
const sidebarText = document.getElementById("sidebarText");

function setSidebar(open) {
  document.body.classList.toggle("sidebar-closed", !open);
  sidebarBtn.setAttribute("aria-expanded", String(open));
  sidebarBtn.firstElementChild.innerHTML = open ? "&#10005;" : "&#9776;";
  sidebarText.textContent = "Bauteile";
  try { localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed"); } catch {}
  resize();
}

let stored = "closed";
try { stored = localStorage.getItem(SIDEBAR_KEY) ?? "closed"; } catch {}
setSidebar(stored === "open");
sidebarBtn.addEventListener("click", () =>
  setSidebar(document.body.classList.contains("sidebar-closed")));

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (walking) walk(dt);
  else controls.update();
  draw();
});

// Small hook for measuring from the outside (tests, fault finding).
window.houseModel = {
  camera,
  walking: () => walking,
  keys,
  walk: (dt) => walk(dt),
};

// Fetch model and metadata on opening the page. The default is haus.glb +
// haus.meta.json next to this HTML file. The embedded data from bundle.py is
// only the fallback for double click / file://.
(async () => {
  try {
    await loadDefaultFiles();
  } catch {
    try {
      await loadEmbedded();
    } catch {
      document.querySelector("#drop div").innerHTML =
        "<strong>haus.glb</strong> und <strong>haus.meta.json</strong> "
        + "zusammen hierher ziehen";
    }
  }
})();
