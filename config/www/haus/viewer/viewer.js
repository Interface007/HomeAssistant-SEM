/*
 * Entry point: pulls the aspects together, wires up what belongs to no single
 * one of them - drag and drop, the sidebar, the render loop - and starts the
 * viewer.
 *
 * The aspects themselves live next to this file:
 *   zustand.js    shared state (model, metadata, lookup tables)
 *   szene.js      renderer, camera, orbit control, light, clipping plane
 *   laden.js      loading and installing the model
 *   schnitt.js    horizontal section plane
 *   filter.js     storey and component lists, visibility
 *   schilder.js   wall and room labels
 *   messwerte.js  readings and window states from Home Assistant
 *   begehen.js    walking through a storey
 *   auswahl.js    picking and the info panel
 */
import * as THREE from "three";
import { model, setMeta } from "haus/zustand.js";
import {
  camera, controls, dropEl, main, renderer, resize, scene,
} from "haus/szene.js";
import { install, loadDefaultFiles, loadEmbedded, loadURL } from "haus/laden.js";
import { begehen, laufen, taste } from "haus/begehen.js";
import "haus/auswahl.js";

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
const SPEICHER_LEISTE = "hausmodell.leiste";
const leisteKnopf = document.getElementById("leiste");
const leisteText = document.getElementById("leisteText");

function leisteSetzen(offen) {
  document.body.classList.toggle("leiste-zu", !offen);
  leisteKnopf.setAttribute("aria-expanded", String(offen));
  leisteKnopf.firstElementChild.innerHTML = offen ? "&#10005;" : "&#9776;";
  leisteText.textContent = "Bauteile";
  try { localStorage.setItem(SPEICHER_LEISTE, offen ? "auf" : "zu"); } catch {}
  resize();
}

let leisteStart = "zu";
try { leisteStart = localStorage.getItem(SPEICHER_LEISTE) ?? "zu"; } catch {}
leisteSetzen(leisteStart === "auf");
leisteKnopf.addEventListener("click", () =>
  leisteSetzen(document.body.classList.contains("leiste-zu")));

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (begehen) laufen(dt);
  else controls.update();
  renderer.render(scene, camera);
});

// Small hook for measuring from the outside (tests, fault finding).
window.hausmodell = {
  kamera: camera,
  begehen: () => begehen,
  taste,
  laufen: (dt) => laufen(dt),
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
