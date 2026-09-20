/*
 * Walking through a storey - with the controls one knows from games.
 *
 * Still no physics engine, but a body instead of a point: a vertical cylinder
 * of RADIUS that is pushed out of walls by a ring of short rays at knee, chest
 * and eye height. That is what lets one slide along a wall and round a door
 * frame instead of getting stuck on it. Movement has inertia (it takes a tenth
 * of a second to get going and to stop), steps are climbed smoothly, and
 * whoever walks off an edge falls under gravity until the next floor.
 */
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import {
  byStorey, byType, collidables, model, roomLabels, wallLabels,
} from "haus/state.js";
import { camera, controls, FOV_ORBIT, infoEl, main, renderer } from "haus/scene.js";
import { applyClip, clipInput } from "haus/section.js";
import { setRealistic } from "haus/appearance.js";

// Eye level from the body height: eyes sit at roughly 93 % of the body height.
// Plus the floor build-up, because the model only knows the bare floor - in
// reality one stands 11 cm higher than on the modelled surface.
const EYE_FACTOR = 0.93;
const FLOOR_BUILDUP = 0.11;
let eyeHeight = 1.87 * EYE_FACTOR + FLOOR_BUILDUP;

const RADIUS = 0.25;          // m, half a shoulder width
const PROBE_HEIGHTS = [0.55, 1.2];   // m above the feet, plus eye level
const SPEED = 1.8;            // m/s, a brisk indoor walk
const RUN = 2.0;              // factor with Shift
const ACCEL = 10;             // 1/s, how quickly the speed follows the keys
const STEP_UP = 0.45;         // m that count as a step, not as a wall
const SNAP_DOWN = 0.45;       // m one steps down without falling
const GRAVITY = 9.81;
const MAX_SUBSTEP = 0.08;     // m, keeps a slow frame from tunnelling a wall

const walkControls = new PointerLockControls(camera, renderer.domElement);
const crosshair = document.getElementById("crosshair");
const walkBtn = document.getElementById("walk");
export const walkStoreySel = document.getElementById("walkStorey");
export const keys = new Set();
const ray = new THREE.Raycaster();
export let walking = false;

const velocity = new THREE.Vector3();   // horizontal, m/s
let fallSpeed = 0;
let feet = 0;                           // y of the surface one stands on

const bodyHeightEl = document.getElementById("bodyHeight");
const fovEl = document.getElementById("fov");
const fovValueEl = document.getElementById("fovValue");
const realisticEl = document.getElementById("realistic");

function setEyeHeight() {
  const h = parseFloat(bodyHeightEl.value);
  if (!Number.isFinite(h)) return;
  eyeHeight = h * EYE_FACTOR + FLOOR_BUILDUP;
}
bodyHeightEl.addEventListener("input", setEyeHeight);

// The field of view is given horizontally, as in games (Unreal defaults to
// 90 degrees). A fixed vertical angle made narrow or portrait windows - the
// sidebar open, the dashboard tile - look like a view through a letterbox:
// at an aspect of 0.8, 60 degrees vertically leave only 50 horizontally.
// The vertical angle follows from the window; it is capped so that a
// portrait phone does not turn into a fisheye.
function applyFov() {
  fovValueEl.textContent = `${fovEl.value}°`;
  if (!walking) return;
  const h = THREE.MathUtils.degToRad(parseFloat(fovEl.value));
  const aspect = main.clientWidth / Math.max(main.clientHeight, 1);
  const v = 2 * Math.atan(Math.tan(h / 2) / aspect);
  camera.fov = Math.min(THREE.MathUtils.radToDeg(v), 100);
  camera.updateProjectionMatrix();
}
fovEl.addEventListener("input", applyFov);
new ResizeObserver(applyFov).observe(main);

realisticEl.addEventListener("change", () => {
  if (walking) setRealistic(realisticEl.checked);
});

addEventListener("keydown", (e) => {
  if (walking && [" ", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
  if (walking && e.code === "Escape") { leave(); return; }
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
// Keys held while the window loses focus never see their keyup - without this
// one keeps walking into the wall after an alt-tab.
addEventListener("blur", () => keys.clear());

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
  feet = box.min.y;
  feet = floorBelow(start, start.y) ?? box.min.y;
  camera.position.copy(start).setY(feet + eyeHeight);
  velocity.set(0, 0, 0);
  fallSpeed = 0;

  // Keep the compass direction of the overview, but look straight ahead. The
  // overview looks down on the house at 30-40 degrees; carried into the
  // storey that is a view of one's own shoes.
  look.setFromQuaternion(camera.quaternion);
  look.set(0, look.y, 0);
  camera.quaternion.setFromEuler(look);

  // A low section plane would make the storey invisible
  clipInput.value = clipInput.max;
  applyClip();

  controls.enabled = false;
  walking = true;
  setRealistic(realisticEl.checked);
  crosshair.hidden = false;
  applyFov();
  try { walkControls.lock(); } catch { /* fallback takes over */ }
  infoEl.innerHTML = `<div class="title">${name}</div>`
    + `<dl><dt>Begehen</dt><dd>WASD laufen</dd>`
    + `<dt></dt><dd>Maus schauen</dd>`
    + `<dt></dt><dd>Umschalt rennen</dd>`
    + `<dt></dt><dd>Esc zurueck</dd></dl>`;
  infoEl.classList.add("on");
}

export function leave() {
  if (!walking) return;
  walking = false;
  keys.clear();
  setRealistic(false);
  fadeNearby(true);
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

// ------------------------------------------------------------ Body
const DOWN = new THREE.Vector3(0, -1, 0);

// Height of the surface under a point, looked for from one step above the
// feet downwards - so a stair tread ahead is found, a table top is not.
// Doors are not in `collidables`, so a door leaf is never stood upon.
function floorBelow(p, from = feet + STEP_UP, reach = 3.5) {
  ray.set(new THREE.Vector3(p.x, from, p.z), DOWN);
  ray.far = from - feet + reach;
  const hit = ray.intersectObjects(collidables, false)[0];
  return hit ? hit.point.y : null;
}

// Ring of rays around the body axis. Each hit closer than RADIUS pushes the
// body out along the hit surface's normal - not back along the ray, which is
// what makes it slide along walls and round corners.
const RING = Array.from({ length: 12 }, (_, k) => {
  const a = (k / 12) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
});
const normal = new THREE.Vector3();

function pushOut(pos) {
  for (const h of [...PROBE_HEIGHTS, eyeHeight - 0.05]) {
    const origin = new THREE.Vector3(pos.x, feet + h, pos.z);
    for (const dir of RING) {
      ray.set(origin, dir);
      ray.far = RADIUS;
      const hit = ray.intersectObjects(collidables, false)[0];
      if (!hit?.face) continue;
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      normal.y = 0;
      if (normal.lengthSq() < 1e-4) continue;    // floor or ceiling
      normal.normalize();
      if (normal.dot(dir) > 0) normal.negate();  // double-sided: face us
      const gap = hit.distance * -normal.dot(dir);
      if (gap >= RADIUS) continue;
      pos.addScaledVector(normal, RADIUS - gap);
      origin.x = pos.x; origin.z = pos.z;
    }
  }
}

function moveBody(delta) {
  const pos = camera.position.clone();
  const steps = Math.max(1, Math.ceil(delta.length() / MAX_SUBSTEP));
  const part = delta.clone().divideScalar(steps);
  for (let i = 0; i < steps; i++) {
    const before = pos.clone();
    pos.add(part);
    pushOut(pos);
    // No floor within reach: the terrace door opens onto the unmodelled
    // terrain. Stay inside instead of falling into nothing.
    if (floorBelow(pos) === null) { pos.copy(before); break; }
  }
  return pos;
}

function settle(dt) {
  const floor = floorBelow(camera.position);
  if (floor === null) return;
  const grounded = fallSpeed === 0;
  if (floor > feet || (grounded && floor >= feet - SNAP_DOWN)) {
    // Step up or down: glide instead of jumping, a stair should feel like one.
    feet += (floor - feet) * (1 - Math.exp(-18 * dt));
    if (Math.abs(floor - feet) < 0.002) feet = floor;
  } else {
    fallSpeed += GRAVITY * dt;
    feet = Math.max(floor, feet - fallSpeed * dt);
    if (feet === floor) fallSpeed = 0;
  }
  camera.position.y = feet + eyeHeight;
}

// ------------------------------------------------------------ Near things
// Doors are closed leaves in the model but no obstacles while walking. Walking
// through an opaque board is irritating, so a door fades out as one comes
// close and back in behind. Labels do the same: a room name at eye level
// would otherwise fill the whole screen when one stands next to it.
const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

function fadeNearby(reset = false) {
  const eye = camera.position;
  for (const door of byType.get("IfcDoor") ?? []) {
    const box = door.userData.box ??= new THREE.Box3().setFromObject(door);
    const f = reset ? 1 : 0.12 + 0.88 * smooth(box.distanceToPoint(eye), 0.3, 1.4);
    for (const mat of [door.userData.planMaterial, door.userData.realMaterial]) {
      if (!mat) continue;
      mat.userData.opacity ??= mat.opacity;
      mat.userData.transparent ??= mat.transparent;
      mat.opacity = mat.userData.opacity * f;
      mat.transparent = mat.userData.transparent || f < 0.999;
    }
  }
  for (const [group, near, far] of [[roomLabels, 1.2, 3.5], [wallLabels, 0.2, 0.7]]) {
    for (const sprite of group.children) {
      sprite.material.opacity = reset ? 1
        : smooth(sprite.position.distanceTo(eye), near, far);
    }
  }
}

export function walk(dt) {
  const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const sideways = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

  let f = 0, s = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) s += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) s -= 1;

  const wish = forward.multiplyScalar(f).addScaledVector(sideways, s);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(SPEED * (run ? RUN : 1));
  velocity.lerp(wish, 1 - Math.exp(-ACCEL * dt));
  if (velocity.lengthSq() < 1e-6) velocity.set(0, 0, 0);

  if (velocity.lengthSq() > 0) {
    const start = camera.position.clone();
    const end = moveBody(velocity.clone().multiplyScalar(dt));
    camera.position.x = end.x;
    camera.position.z = end.z;
    // What the walls took away is gone from the speed as well - otherwise one
    // sticks to a wall with full momentum and shoots off at its end.
    const moved = end.sub(start).setY(0).divideScalar(Math.max(dt, 1e-6));
    if (moved.lengthSq() < velocity.lengthSq()) velocity.copy(moved);
  }
  settle(dt);
  fadeNearby();
}
