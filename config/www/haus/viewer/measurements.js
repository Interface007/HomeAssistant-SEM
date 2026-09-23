/*
 * Coordinate grid and point-to-point measurements on visible model surfaces.
 * Coordinates use the model's world system: X east, Y up, Z north.
 */
import * as THREE from "three";
import { bbox, model } from "haus/state.js";
import { camera, renderer, scene } from "haus/scene.js";
import { clipInput } from "haus/section.js";

let grid = new THREE.GridHelper(10, 10, 0x0d5c63, 0x8d9a90);
grid.visible = false;
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

const marks = new THREE.Group();
const lineMaterial = new THREE.LineBasicMaterial({ color: 0xc0392b, depthTest: false });
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xc0392b, depthTest: false });
marks.visible = false;
scene.add(marks);

const ray = new THREE.Raycaster();
const points = [];
const gridToggle = document.getElementById("coordinateGrid");
const measureToggle = document.getElementById("measureMode");
const pointInfo = document.getElementById("measurePoints");
const distanceInfo = document.getElementById("measureDistance");
const planInput = document.getElementById("measurePlan");
const actualInput = document.getElementById("measureActual");
const correctionInfo = document.getElementById("measureCorrection");
const clearButton = document.getElementById("clearMeasure");

function currentGridY() {
  return bbox ? parseFloat(clipInput.value) || bbox.max.y : 0;
}

function updateGrid() {
  if (!bbox) return;
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  const extent = Math.max(size.x, size.z, 1) * 1.15;
  const divisions = Math.max(10, Math.ceil(extent));
  scene.remove(grid);
  grid.geometry.dispose();
  grid.material.dispose();
  grid = new THREE.GridHelper(extent, divisions, 0x0d5c63, 0x8d9a90);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.set(center.x, currentGridY(), center.z);
  grid.visible = gridToggle.checked;
  scene.add(grid);
}

function updateGridHeight() {
  if (bbox) grid.position.y = currentGridY();
}

function formatPoint(point) {
  return `X ${point.x.toFixed(3)} · Y ${point.y.toFixed(3)} · Z ${point.z.toFixed(3)}`;
}

function updateCorrection() {
  const plan = parseFloat(planInput.value);
  const actual = parseFloat(actualInput.value);
  if (!Number.isFinite(plan) || !Number.isFinite(actual) || plan === 0) {
    correctionInfo.textContent = "Plan- und Ist-Maß eingeben";
    return;
  }
  const delta = actual - plan;
  const percent = delta / plan * 100;
  correctionInfo.textContent = `Abweichung ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} m · `
    + `${percent >= 0 ? "+" : ""}${percent.toFixed(1)} % · Faktor ${(actual / plan).toFixed(4)}`;
}

function updatePanel() {
  pointInfo.innerHTML = points.length
    ? points.map((point, i) => `<div>P${i + 1}: ${formatPoint(point)}</div>`).join("")
    : "Noch keine Punkte gewählt";
  if (points.length === 2) {
    const distance = points[0].distanceTo(points[1]);
    distanceInfo.textContent = `Ist-Abstand ${distance.toFixed(3)} m`;
    actualInput.value = distance.toFixed(3);
  } else {
    distanceInfo.textContent = "Zwei Punkte auf Flächen wählen";
  }
  updateCorrection();
}

function addPoint(point) {
  if (points.length === 2) {
    points.length = 0;
    marks.clear();
  }
  points.push(point.clone());
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), pointMaterial);
  marker.position.copy(point);
  marks.add(marker);
  if (points.length === 2) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, lineMaterial);
    line.renderOrder = 10;
    marks.add(line);
  }
  updatePanel();
}

function clearMeasurement() {
  points.length = 0;
  marks.clear();
  updatePanel();
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (!measureToggle.checked || !model) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const cursor = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  ray.setFromCamera(cursor, camera);
  const hit = ray.intersectObject(model, true).find((entry) => entry.object.visible);
  if (hit) addPoint(hit.point);
});

gridToggle.addEventListener("change", (event) => {
  grid.visible = event.target.checked;
  if (event.target.checked) updateGrid();
});
measureToggle.addEventListener("change", (event) => {
  marks.visible = event.target.checked;
});
clipInput.addEventListener("input", updateGridHeight);
planInput.addEventListener("input", updateCorrection);
actualInput.addEventListener("input", updateCorrection);
clearButton.addEventListener("click", clearMeasurement);

updatePanel();
export function refreshMeasurements() {
  clearMeasurement();
  updateGrid();
  marks.visible = measureToggle.checked;
}
