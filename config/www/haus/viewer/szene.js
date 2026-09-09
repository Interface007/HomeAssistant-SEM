/*
 * Stage: renderer, scene, camera, orbit control, light and the clipping plane.
 * Everything that exists exactly once and that the other aspects draw into.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bbox } from "haus/zustand.js";

export const main = document.querySelector("main");
export const dropEl = document.getElementById("drop");
export const infoEl = document.getElementById("info");

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
main.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe4e7e2);
export const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;   // do not look below the terrain

scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9a90, 2.2));
const sun = new THREE.DirectionalLight(0xfff4e6, 1.4);
sun.position.set(-30, 45, 20);
scene.add(sun);

export const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

export const FOV_ORBIT = 45;

// ---------------------------------------------------------------- Camera
// Where fit() last put the camera. As long as it still stands there the view
// belongs to nobody, and a change of format may re-frame it. The comparison
// deliberately takes the place of a flag: it also covers walking, where the
// camera is moved past the orbit control and no event would tell us.
const framedPos = new THREE.Vector3();
const framedTarget = new THREE.Vector3();
let framedEps = 0;            // 0 = never fitted, so nothing to compare against

function stillFramed() {
  return framedEps > 0
    && camera.position.distanceToSquared(framedPos) < framedEps
    && controls.target.distanceToSquared(framedTarget) < framedEps;
}

// Viewing direction of the fitted view: from the front right, slightly above.
// Only the direction is fixed here, the distance is measured.
const VIEW_DIR = new THREE.Vector3(0.7, 0.5, 0.7).normalize();

export function fit() {
  if (!bbox) return;
  const center = bbox.getCenter(new THREE.Vector3());
  // Distance from the eight corners of the bounding box, each measured against
  // BOTH view angles separately. The bounding sphere would be simpler, but its
  // radius is the room diagonal - far more than the house ever covers from
  // this angle, so the model sat small and lost in the middle. Per corner and
  // per axis also settles the question of format on its own: in portrait the
  // horizontal angle is the narrow one and decides, in landscape the vertical.
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const tanV = Math.tan(vFov / 2);
  const tanH = tanV * camera.aspect;
  const right = new THREE.Vector3().crossVectors(camera.up, VIEW_DIR).normalize();
  const up = new THREE.Vector3().crossVectors(VIEW_DIR, right).normalize();
  const corner = new THREE.Vector3();
  let dist = 0;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? bbox.max.x : bbox.min.x,
               i & 2 ? bbox.max.y : bbox.min.y,
               i & 4 ? bbox.max.z : bbox.min.z).sub(center);
    // Component towards the camera: a corner that comes closer needs distance
    // of its own, otherwise it pushes out of the picture sideways.
    const depth = corner.dot(VIEW_DIR);
    dist = Math.max(dist,
                    depth + Math.abs(corner.dot(right)) / tanH,
                    depth + Math.abs(corner.dot(up)) / tanV);
  }
  dist = Math.max(dist * 1.06, 0.1);   // never zero on a degenerate model
  camera.position.copy(center).addScaledVector(VIEW_DIR, dist);
  controls.target.copy(center);
  camera.near = dist / 500; camera.far = dist * 12;
  camera.updateProjectionMatrix();
  controls.update();
  framedPos.copy(camera.position);
  framedTarget.copy(controls.target);
  // A millimetre of tolerance per metre of viewing distance: enough for the
  // rounding that damping leaves behind on every update(), far below any
  // movement a hand could make.
  framedEps = (dist * 1e-3) ** 2;
}

export function resize() {
  // Never zero: a container that is briefly not laid out yet would otherwise
  // hand the camera an aspect ratio of NaN, and nothing would be drawn at all.
  const w = Math.max(main.clientWidth, 1), h = Math.max(main.clientHeight, 1);
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  // The framing depends on the format: what fits in landscape runs out of the
  // picture in portrait. So as long as nobody has taken the camera over, fit
  // again for the new format - that also catches the first measurement, which
  // in an embedded iframe often only arrives after the model.
  if (stillFramed()) fit();
}

document.getElementById("fit").onclick = fit;
document.getElementById("top").onclick = () => {
  if (!bbox) return;
  const c = bbox.getCenter(new THREE.Vector3());
  const s = bbox.getSize(new THREE.Vector3());
  camera.position.set(c.x, c.y + Math.max(s.x, s.z) * 1.6, c.z + 0.001);
  controls.target.copy(c); controls.update();
};
