/*
 * Walking through a storey.
 *
 * No physics model, but two rays: one downwards for the standing height, one
 * in the direction of travel as a collision check. That is enough for a
 * building and stays comprehensible.
 */
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { byStorey, collidables, model } from "haus/state.js";
import { camera, controls, FOV_ORBIT, infoEl, renderer } from "haus/scene.js";
import { applyClip, clipInput } from "haus/section.js";

// Eye level from the body height: eyes sit at roughly 93 % of the body height.
// Plus the floor build-up, because the model only knows the bare floor - in
// reality one stands 11 cm higher than on the modelled surface.
const EYE_FACTOR = 0.93;
const FLOOR_BUILDUP = 0.11;
let eyeHeight = 1.87 * EYE_FACTOR + FLOOR_BUILDUP;
const CLEARANCE = 0.30;       // m distance kept from the wall
const SPEED = 3.0;            // m/s
const STEP_UP = 0.45;         // m that can be climbed per frame

const walkControls = new PointerLockControls(camera, renderer.domElement);
const crosshair = document.getElementById("crosshair");
const walkBtn = document.getElementById("walk");
export const walkStoreySel = document.getElementById("walkStorey");
export const keys = new Set();
const rayDown = new THREE.Raycaster();
const rayForward = new THREE.Raycaster();
export let walking = false;

const bodyHeightEl = document.getElementById("bodyHeight");
const fovEl = document.getElementById("fov");
const fovValueEl = document.getElementById("fovValue");

function setEyeHeight() {
  const h = parseFloat(bodyHeightEl.value);
  if (!Number.isFinite(h)) return;
  eyeHeight = h * EYE_FACTOR + FLOOR_BUILDUP;
  if (walking) onGround(true);
}
bodyHeightEl.addEventListener("input", setEyeHeight);

function setFov() {
  fovValueEl.textContent = `${fovEl.value}°`;
  if (walking) {
    camera.fov = parseFloat(fovEl.value);
    camera.updateProjectionMatrix();
  }
}
fovEl.addEventListener("input", setFov);

addEventListener("keydown", (e) => {
  if (walking && [" ", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
  if (walking && e.code === "Escape") { leave(); return; }
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));

// Not every environment grants access to the pointer lock API (embedded views,
// some browser profiles). Then one looks around with the mouse button held
// down - the same movement, only without a captured pointer.
const look = new THREE.Euler(0, 0, 0, "YXZ");
let dragging = false;
renderer.domElement.addEventListener("pointerdown", () => {
  if (walking && !walkControls.isLocked) dragging = true;
});
addEventListener("pointerup", () => { dragging = false; });
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging || !walking || walkControls.isLocked) return;
  look.setFromQuaternion(camera.quaternion);
  look.y -= e.movementX * 0.0022;
  look.x -= e.movementY * 0.0022;
  look.x = Math.max(-Math.PI / 2 + 0.01,
                    Math.min(Math.PI / 2 - 0.01, look.x));
  camera.quaternion.setFromEuler(look);
});

export function enter() {
  if (!model) return;
  const name = walkStoreySel.value;
  const meshes = byStorey.get(name) || [];
  if (!meshes.length) return;

  const box = new THREE.Box3();
  meshes.forEach((m) => box.expandByObject(m));
  const start = freeSpot(box);
  camera.position.copy(start);
  onGround(true);

  // A low section plane would make the storey invisible
  clipInput.value = clipInput.max;
  applyClip();

  controls.enabled = false;
  walking = true;
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

export function leave() {
  if (!walking) return;
  walking = false;
  camera.fov = FOV_ORBIT;
  camera.updateProjectionMatrix();
  infoEl.classList.remove("on");
  crosshair.hidden = true;
  controls.enabled = true;
  controls.target.copy(camera.position).add(
    camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(4));
  controls.update();
}
walkControls.addEventListener("unlock", leave);
walkBtn.onclick = enter;

// The centre of the storey bbox often sits in the middle of a wall. So probe a
// coarse grid, collect all points with enough clearance to the nearest
// component and take the most central of those.
//
// Not the point with the *largest* clearance: that reliably sits in a door
// opening, because there the ray runs off into the open and never hits
// anything.
function freeSpot(box) {
  const y = box.min.y + eyeHeight;
  const N = 16;
  const MIN_CLEARANCE = 0.8;
  const directions = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    directions.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const probe = new THREE.Raycaster();
  probe.far = 12;
  const center = box.getCenter(new THREE.Vector3()).setY(y);

  let best = center.clone();
  let bestScore = -Infinity;
  let fallback = center.clone();
  let fallbackClearance = -1;

  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const q = new THREE.Vector3(
        THREE.MathUtils.lerp(box.min.x, box.max.x, i / N), y,
        THREE.MathUtils.lerp(box.min.z, box.max.z, j / N));
      let nearest = Infinity;
      for (const d of directions) {
        probe.set(q, d);
        const hits = probe.intersectObjects(collidables, false);
        nearest = Math.min(nearest, hits.length ? hits[0].distance : probe.far);
        if (nearest < MIN_CLEARANCE) break;
      }
      if (nearest > fallbackClearance) { fallbackClearance = nearest; fallback = q; }
      if (nearest < MIN_CLEARANCE) continue;
      const score = -q.distanceTo(center);      // the more central, the better
      if (score > bestScore) { bestScore = score; best = q; }
    }
  }
  return bestScore > -Infinity ? best : fallback;
}

function onGround(instant = false) {
  rayDown.set(camera.position.clone().setY(camera.position.y + 0.2),
              new THREE.Vector3(0, -1, 0));
  rayDown.far = eyeHeight + 3;
  const hits = rayDown.intersectObjects(collidables, false);
  if (!hits.length) return;
  const target = hits[0].point.y + eyeHeight;
  const d = target - camera.position.y;
  camera.position.y += instant ? d : Math.max(-STEP_UP, Math.min(STEP_UP, d));
}

// Is there a floor below this point at all? Without the check one walks
// through the terrace door into nothing, because doors are no obstacles and
// the terrain is not modelled.
function hasFloor(point) {
  rayDown.set(point.clone().setY(point.y + 0.2), new THREE.Vector3(0, -1, 0));
  rayDown.far = eyeHeight + STEP_UP + 0.5;
  return rayDown.intersectObjects(collidables, false).length > 0;
}

function step(direction, dist) {
  if (dist === 0) return;
  const v = direction.clone().multiplyScalar(dist);
  rayForward.set(camera.position, v.clone().normalize());
  rayForward.far = Math.abs(dist) + CLEARANCE;
  if (rayForward.intersectObjects(collidables, false).length) return;
  const target = camera.position.clone().add(v);
  if (!hasFloor(target)) return;
  camera.position.copy(target);
}

export function walk(dt) {
  const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const dist = SPEED * (fast ? 2.4 : 1) * dt;
  const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const sideways = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

  let f = 0, s = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) s += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) s -= 1;

  // checked separately so one can slide along walls
  step(forward, f * dist);
  step(sideways, s * dist);
  onGround();
}
