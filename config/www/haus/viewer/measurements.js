/*
 * Ablesen und Messen auf den sichtbaren Flaechen.
 *
 * Angezeigt wird in MODELLkoordinaten (X Osten, Y Norden, Z Hoehe) - das ist
 * das System aus haus.yaml. Die Szene selbst rechnet in glTF-Achsen (Y oben);
 * die Umrechnung steht in raster.js. Wer hier glTF-Zahlen ablesen wuerde,
 * bekaeme Y und Z vertauscht und Y mit falschem Vorzeichen.
 *
 * Drei Dinge:
 *   - der Punkt unter dem Mauszeiger, laufend,
 *   - zwei gesetzte Punkte mit Abstand und Plan/Ist-Vergleich,
 *   - dieselben Punkte BEZOGEN auf ein Bauteil, damit sich ein Eintrag wie
 *     `punkt:`/`hoehe:` direkt ablesen laesst statt ihn zu rechnen.
 */
import * as THREE from "three";
import { bbox, byGid, meta, model } from "haus/state.js";
import { camera, renderer, scene } from "haus/scene.js";
import { formatModell, nachModell } from "haus/raster.js";

const marks = new THREE.Group();
const lineMaterial = new THREE.LineBasicMaterial({ color: 0xc0392b, depthTest: false });
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xc0392b, depthTest: false });
marks.visible = false;
scene.add(marks);

const ray = new THREE.Raycaster();
const points = [];
const measureToggle = document.getElementById("measureMode");
const hoverInfo = document.getElementById("measureHover");
const pointInfo = document.getElementById("measurePoints");
const distanceInfo = document.getElementById("measureDistance");
const planInput = document.getElementById("measurePlan");
const actualInput = document.getElementById("measureActual");
const correctionInfo = document.getElementById("measureCorrection");
const referenceSel = document.getElementById("measureRef");
const referenceInfo = document.getElementById("measureRefOut");
const clearButton = document.getElementById("clearMeasure");

// ------------------------------------------------------------ Bezugsbauteil
// Die Huelle des Bauteils in Modellkoordinaten. Aus der glTF-Box: Modell-Y
// ist die negative Szenen-Z, deshalb tauschen dort min und max die Seiten.
function referenzBox(gid) {
  const meshes = byGid.get(gid) ?? [];
  if (!meshes.length) return null;
  const box = new THREE.Box3();
  meshes.forEach((m) => box.expandByObject(m));
  return {
    min: new THREE.Vector3(box.min.x, -box.max.z, box.min.y),
    max: new THREE.Vector3(box.max.x, -box.min.z, box.max.y),
  };
}

export function fillReferences() {
  const vorher = referenceSel.value;
  referenceSel.innerHTML = '<option value="">— Modellkoordinaten —</option>';
  const eintraege = [...byGid.keys()]
    .map((gid) => [gid, meta[gid]?.name || gid])
    .sort((a, b) => a[1].localeCompare(b[1], "de"));
  for (const [gid, name] of eintraege) {
    const option = document.createElement("option");
    option.value = gid;
    option.textContent = name;
    referenceSel.append(option);
  }
  referenceSel.value = [...byGid.keys()].includes(vorher) ? vorher : "";
}

function bezug(point) {
  const gid = referenceSel.value;
  if (!gid) return "";
  const box = referenzBox(gid);
  if (!box) return "";
  const p = nachModell(point);
  const d = p.clone().sub(box.min);
  const name = meta[gid]?.name || gid;
  return `<div>ab SW-Ecke unten von <b>${name}</b>:`
    + ` X +${d.x.toFixed(3)} · Y +${d.y.toFixed(3)} · Z +${d.z.toFixed(3)}</div>`
    + `<div>ueber OK ${box.max.z.toFixed(3)}:`
    + ` ${p.z - box.max.z >= 0 ? "+" : ""}${(p.z - box.max.z).toFixed(3)} m</div>`;
}

function showReference(point) {
  referenceInfo.innerHTML = point
    ? bezug(point) || "Bauteil als Bezug wählen"
    : "Punkt wählen";
}

// ------------------------------------------------------------ Messpunkte
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
    ? points.map((point, i) => `<div>P${i + 1}: ${formatModell(point)}</div>`).join("")
    : "Noch keine Punkte gewählt";
  if (points.length === 2) {
    const distance = points[0].distanceTo(points[1]);
    const d = nachModell(points[1]).sub(nachModell(points[0]));
    distanceInfo.innerHTML = `Ist-Abstand ${distance.toFixed(3)} m`
      + `<div>ΔX ${d.x.toFixed(3)} · ΔY ${d.y.toFixed(3)} · ΔZ ${d.z.toFixed(3)}</div>`;
    actualInput.value = distance.toFixed(3);
  } else {
    distanceInfo.textContent = "Zwei Punkte auf Flächen wählen";
  }
  showReference(points[points.length - 1] ?? null);
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

function treffer(event) {
  if (!model) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const cursor = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  ray.setFromCamera(cursor, camera);
  return ray.intersectObject(model, true).find((entry) => entry.object.visible)
    ?? null;
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (!measureToggle.checked) return;
  const hit = treffer(event);
  if (hit) addPoint(hit.point);
});

// Der Punkt unter dem Zeiger, laufend: damit laesst sich eine Koordinate
// ablesen, ohne sie erst als Messpunkt zu setzen.
renderer.domElement.addEventListener("pointermove", (event) => {
  if (!measureToggle.checked) return;
  const hit = treffer(event);
  hoverInfo.textContent = hit
    ? formatModell(hit.point)
    : "Zeiger auf eine Fläche halten";
});

measureToggle.addEventListener("change", (event) => {
  marks.visible = event.target.checked;
  if (!event.target.checked) hoverInfo.textContent = "Messen ausgeschaltet";
  else hoverInfo.textContent = "Zeiger auf eine Fläche halten";
});
referenceSel.addEventListener("change", () =>
  showReference(points[points.length - 1] ?? null));
planInput.addEventListener("input", updateCorrection);
actualInput.addEventListener("input", updateCorrection);
clearButton.addEventListener("click", clearMeasurement);

updatePanel();

export function refreshMeasurements() {
  clearMeasurement();
  fillReferences();
  marks.visible = measureToggle.checked;
  if (bbox) showReference(null);
}
