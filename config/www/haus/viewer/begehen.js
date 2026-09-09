/*
 * Walking through a storey.
 *
 * No physics model, but two rays: one downwards for the standing height, one
 * in the direction of travel as a collision check. That is enough for a
 * building and stays comprehensible.
 */
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { byStorey, collidables, model } from "haus/zustand.js";
import { camera, controls, FOV_ORBIT, infoEl, renderer } from "haus/szene.js";
import { applyClip, clipInput } from "haus/schnitt.js";

// Eye level from the body height: eyes sit at roughly 93 % of the body height.
// Plus the floor build-up, because the model only knows the bare floor - in
// reality one stands 11 cm higher than on the modelled surface.
const AUGENFAKTOR = 0.93;
const BODENAUFBAU = 0.11;
let AUGENHOEHE = 1.87 * AUGENFAKTOR + BODENAUFBAU;
const RADIUS = 0.30;          // m distance kept from the wall
const TEMPO = 3.0;            // m/s
const STUFE = 0.45;           // m that can be climbed per frame

const walkControls = new PointerLockControls(camera, renderer.domElement);
const crosshair = document.getElementById("crosshair");
const walkBtn = document.getElementById("walk");
export const walkStoreySel = document.getElementById("walkStorey");
export const taste = new Set();
const strahlUnten = new THREE.Raycaster();
const strahlVorn = new THREE.Raycaster();
export let begehen = false;

const groesseEl = document.getElementById("groesse");
const fovEl = document.getElementById("fov");
const fovWertEl = document.getElementById("fovWert");

function augenhoeheSetzen() {
  const g = parseFloat(groesseEl.value);
  if (!Number.isFinite(g)) return;
  AUGENHOEHE = g * AUGENFAKTOR + BODENAUFBAU;
  if (begehen) aufBoden(true);
}
groesseEl.addEventListener("input", augenhoeheSetzen);

function blickwinkelSetzen() {
  fovWertEl.textContent = `${fovEl.value}°`;
  if (begehen) {
    camera.fov = parseFloat(fovEl.value);
    camera.updateProjectionMatrix();
  }
}
fovEl.addEventListener("input", blickwinkelSetzen);

addEventListener("keydown", (e) => {
  if (begehen && [" ", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
  if (begehen && e.code === "Escape") { verlassen(); return; }
  taste.add(e.code);
});
addEventListener("keyup", (e) => taste.delete(e.code));

// Not every environment grants access to the pointer lock API (embedded views,
// some browser profiles). Then one looks around with the mouse button held
// down - the same movement, only without a captured pointer.
const blick = new THREE.Euler(0, 0, 0, "YXZ");
let zieht = false;
renderer.domElement.addEventListener("pointerdown", () => {
  if (begehen && !walkControls.isLocked) zieht = true;
});
addEventListener("pointerup", () => { zieht = false; });
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!zieht || !begehen || walkControls.isLocked) return;
  blick.setFromQuaternion(camera.quaternion);
  blick.y -= e.movementX * 0.0022;
  blick.x -= e.movementY * 0.0022;
  blick.x = Math.max(-Math.PI / 2 + 0.01,
                     Math.min(Math.PI / 2 - 0.01, blick.x));
  camera.quaternion.setFromEuler(blick);
});

export function betreten() {
  if (!model) return;
  const name = walkStoreySel.value;
  const meshes = byStorey.get(name) || [];
  if (!meshes.length) return;

  const kasten = new THREE.Box3();
  meshes.forEach((m) => kasten.expandByObject(m));
  const start = freierPunkt(kasten);
  camera.position.copy(start);
  aufBoden(true);

  // A low section plane would make the storey invisible
  clipInput.value = clipInput.max;
  applyClip();

  controls.enabled = false;
  begehen = true;
  crosshair.hidden = false;
  camera.fov = parseFloat(fovEl.value);
  camera.updateProjectionMatrix();
  try { walkControls.lock(); } catch { /* fallback takes over */ }
  infoEl.innerHTML = `<div class="title">${name}</div>`
    + `<dl><dt>Begehen</dt><dd>WASD laufen</dd>`
    + `<dt></dt><dd>Maus schauen</dd>`
    + `<dt></dt><dd>Umschalt schneller</dd>`
    + `<dt></dt><dd>Esc zurueck</dd></dl>`;
  infoEl.classList.add("on");
}

export function verlassen() {
  if (!begehen) return;
  begehen = false;
  camera.fov = FOV_ORBIT;
  camera.updateProjectionMatrix();
  infoEl.classList.remove("on");
  crosshair.hidden = true;
  controls.enabled = true;
  controls.target.copy(camera.position).add(
    camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(4));
  controls.update();
}
walkControls.addEventListener("unlock", verlassen);
walkBtn.onclick = betreten;

// The centre of the storey bbox often sits in the middle of a wall. So probe a
// coarse grid, collect all points with enough clearance to the nearest
// component and take the most central of those.
//
// Not the point with the *largest* clearance: that reliably sits in a door
// opening, because there the ray runs off into the open and never hits
// anything.
function freierPunkt(kasten) {
  const y = kasten.min.y + AUGENHOEHE;
  const N = 16;
  const MINABSTAND = 0.8;
  const richtungen = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    richtungen.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const probe = new THREE.Raycaster();
  probe.far = 12;
  const mitte = kasten.getCenter(new THREE.Vector3()).setY(y);

  let bester = mitte.clone();
  let besteNote = -Infinity;
  let ersatz = mitte.clone();
  let ersatzAbstand = -1;

  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const q = new THREE.Vector3(
        THREE.MathUtils.lerp(kasten.min.x, kasten.max.x, i / N), y,
        THREE.MathUtils.lerp(kasten.min.z, kasten.max.z, j / N));
      let naechste = Infinity;
      for (const d of richtungen) {
        probe.set(q, d);
        const t = probe.intersectObjects(collidables, false);
        naechste = Math.min(naechste, t.length ? t[0].distance : probe.far);
        if (naechste < MINABSTAND) break;
      }
      if (naechste > ersatzAbstand) { ersatzAbstand = naechste; ersatz = q; }
      if (naechste < MINABSTAND) continue;
      const note = -q.distanceTo(mitte);        // the more central, the better
      if (note > besteNote) { besteNote = note; bester = q; }
    }
  }
  return besteNote > -Infinity ? bester : ersatz;
}

function aufBoden(sofort = false) {
  strahlUnten.set(camera.position.clone().setY(camera.position.y + 0.2),
                  new THREE.Vector3(0, -1, 0));
  strahlUnten.far = AUGENHOEHE + 3;
  const treffer = strahlUnten.intersectObjects(collidables, false);
  if (!treffer.length) return;
  const ziel = treffer[0].point.y + AUGENHOEHE;
  const d = ziel - camera.position.y;
  camera.position.y += sofort ? d : Math.max(-STUFE, Math.min(STUFE, d));
}

// Is there a floor below this point at all? Without the check one walks
// through the terrace door into nothing, because doors are no obstacles and
// the terrain is not modelled.
function hatBoden(punkt) {
  strahlUnten.set(punkt.clone().setY(punkt.y + 0.2), new THREE.Vector3(0, -1, 0));
  strahlUnten.far = AUGENHOEHE + STUFE + 0.5;
  return strahlUnten.intersectObjects(collidables, false).length > 0;
}

function schritt(richtung, weite) {
  if (weite === 0) return;
  const v = richtung.clone().multiplyScalar(weite);
  strahlVorn.set(camera.position, v.clone().normalize());
  strahlVorn.far = Math.abs(weite) + RADIUS;
  if (strahlVorn.intersectObjects(collidables, false).length) return;
  const ziel = camera.position.clone().add(v);
  if (!hatBoden(ziel)) return;
  camera.position.copy(ziel);
}

export function laufen(dt) {
  const schnell = taste.has("ShiftLeft") || taste.has("ShiftRight");
  const weite = TEMPO * (schnell ? 2.4 : 1) * dt;
  const vor = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const seit = new THREE.Vector3().crossVectors(vor, camera.up).normalize();

  let v = 0, h = 0;
  if (taste.has("KeyW") || taste.has("ArrowUp")) v += 1;
  if (taste.has("KeyS") || taste.has("ArrowDown")) v -= 1;
  if (taste.has("KeyD") || taste.has("ArrowRight")) h += 1;
  if (taste.has("KeyA") || taste.has("ArrowLeft")) h -= 1;

  // checked separately so one can slide along walls
  schritt(vor, v * weite);
  schritt(seit, h * weite);
  aufBoden();
}
