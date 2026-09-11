/*
 * Stage: renderer, scene, camera, orbit control, light and the clipping plane.
 * Everything that exists exactly once and that the other aspects draw into.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bbox } from "haus/state.js";

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
export function fit() {
  if (!bbox) return;
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  // Distance from the bounding sphere and the NARROWER of the two view angles.
  // A fixed factor is not enough: in portrait orientation the horizontal angle
  // is much smaller than the vertical one, and the house ran out of frame
  // sideways - on a phone only one corner of the house was visible.
  const radius = size.length() / 2;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.08;
  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
  controls.target.copy(center);
  camera.near = dist / 500; camera.far = dist * 12;
  camera.updateProjectionMatrix();
  controls.update();
}

export function resize() {
  const w = main.clientWidth, h = main.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

document.getElementById("fit").onclick = fit;
document.getElementById("top").onclick = () => {
  if (!bbox) return;
  const c = bbox.getCenter(new THREE.Vector3());
  const s = bbox.getSize(new THREE.Vector3());
  camera.position.set(c.x, c.y + Math.max(s.x, s.z) * 1.6, c.z + 0.001);
  controls.target.copy(c); controls.update();
};
