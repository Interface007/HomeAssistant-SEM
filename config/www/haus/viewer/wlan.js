/*
 * WLAN coverage: received level of the access points as a point cloud.
 *
 * Everything this module needs comes from the metadata: the access points
 * carry `Pset_Funk_AP` (EIRP per band, frequency, cap per component), every
 * damping component carries `Pset_Funk` (dB/m inside the material, loss per
 * surface, fixed loss per passage). Both are written by build_ifc.py from the
 * `funk` block in haus.yaml - the derivation of every number lives there, not
 * here.
 *
 * Per sample point and access point one straight ray:
 *   level = EIRP - free space loss - sum over the components it passes
 *   free space   20 lg(d/m) + 20 lg(f/GHz) + 32.45
 *   component    min(cap, 2 x surface + dB/m x path inside + fixed)
 * The path inside is measured on the mesh itself, so thickness and angle of
 * incidence are both in it. No reflection, no diffraction, no antenna pattern:
 * a lower bound rather than a forecast. A point shows the best access point.
 *
 * Sample points fill the rooms (IfcSpace outline, floor and height from the
 * metadata). The 5 GHz grid is offset by half a spacing in all three axes, so
 * with both bands on the clouds interleave instead of covering each other -
 * every point is still computed exactly where it is drawn.
 *
 * The pset and property names (`Pset_Funk`, `dB_m_ghz_5`, ...) are German on
 * purpose: they are the data format of the converter.
 */
import * as THREE from "three";
import { byGid, meta, model } from "haus/state.js";
import { clipPlane, scene } from "haus/scene.js";
import { displayStorey } from "haus/tree.js";

const BANDS = [
  { key: "ghz_2_4", label: "2,4 GHz", color: 0xffd400, input: "wlan24", offset: 0 },
  { key: "ghz_5", label: "5 GHz", color: 0x18b84a, input: "wlan5", offset: 0.5 },
];
// Display range of the level. Above TOP every point is full size; below
// BOTTOM there is no usable connection and no point is drawn.
const TOP = -35, BOTTOM = -90;
const MIN_DISTANCE = 0.5;     // m; inside that the far field formula is moot
const DEDUPE = 1e-4;          // m; hits closer than that are one surface

const statusEl = document.getElementById("wlanStatus");
const roomsEl = document.getElementById("wlanRooms");
const spacingSel = document.getElementById("wlanSpacing");
const apsEl = document.getElementById("wlanAps");
// Switched-off access points by GlobalId. Kept across a new model and a new
// spacing: a switch the user set should not flip back on by itself.
const disabledAps = new Set();

let result = null;            // { spacing, bands: { key: [...] }, rooms }
let running = null;           // promise of the computation in progress
let generation = 0;           // bumped on every new model: stale runs give up
const clouds = new Map();     // band key -> THREE.Group (one Points per storey)
let visibleStoreys = null;    // null: all

// ------------------------------------------------------------ Geometry
function collect() {
  model.updateMatrixWorld(true);
  const proxies = [], aps = [];
  // Own proxies instead of the scene meshes: those change their material
  // (plan, realistic, neon) and with it the side that a ray can hit. The
  // proxies share the geometry and are always double sided.
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const [gid, meshes] of byGid) {
    const psets = meta[gid]?.psets;
    if (psets?.Pset_Funk_AP) {
      const box = new THREE.Box3();
      for (const o of meshes) box.expandByObject(o);
      aps.push({ gid, name: meta[gid].name || gid,
                 pos: box.getCenter(new THREE.Vector3()),
                 pset: psets.Pset_Funk_AP });
      continue;
    }
    const f = psets?.Pset_Funk;
    if (!f) continue;
    const loss = BANDS.map((b) => ({
      perM: Number(f[`dB_m_${b.key}`]) || 0,
      surface: Number(f[`Grenzflaeche_dB_${b.key}`]) || 0,
      fixed: Number(f[`Fest_dB_${b.key}`]) || 0,
    }));
    if (loss.every((l) => !l.perM && !l.fixed)) continue;
    for (const o of meshes) {
      const p = new THREE.Mesh(o.geometry, material);
      p.matrixAutoUpdate = false;
      p.matrixWorld.copy(o.matrixWorld);
      p.userData.loss = loss;
      proxies.push(p);
    }
  }
  return { proxies, aps };
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Sample points in model coordinates (X east, Y north, Z up), per room.
function samples(spacing, offset) {
  const out = [];
  for (const [gid, m] of Object.entries(meta)) {
    if (m.typ !== "IfcSpace" || !m.umriss?.length) continue;
    const poly = m.umriss.map(([x, y]) => [Number(x), Number(y)]);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const d = spacing * offset;
    const z0 = Number(m.boden) + 0.2, z1 = Number(m.boden) + Number(m.raumhoehe) - 0.1;
    const storey = displayStorey(m);
    for (let x = Math.min(...xs) + spacing / 2 + d; x < Math.max(...xs); x += spacing) {
      for (let y = Math.min(...ys) + spacing / 2 + d; y < Math.max(...ys); y += spacing) {
        if (!inside(poly, x, y)) continue;
        for (let z = z0 + d; z < z1; z += spacing) {
          out.push({ room: gid, storey, x, y, z });
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------------ Physics
const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3();

// Loss in dB per band along the straight line a -> b.
function pathLoss(a, b, proxies, cap) {
  dir.subVectors(b, a);
  const length = dir.length();
  dir.divideScalar(length);
  raycaster.set(a, dir);
  raycaster.far = length;
  const byMesh = new Map();
  for (const h of raycaster.intersectObjects(proxies, false)) {
    if (!byMesh.has(h.object)) byMesh.set(h.object, []);
    const list = byMesh.get(h.object);
    if (!list.length || h.distance - list[list.length - 1] > DEDUPE) list.push(h.distance);
  }
  const total = BANDS.map(() => 0);
  for (const [mesh, ds] of byMesh) {
    // In and out in pairs. An odd count means the point sits inside the
    // body (a sample inside a piece of furniture): the path ends there.
    if (ds.length % 2) ds.push(length);
    for (let i = 0; i < ds.length; i += 2) {
      const path = ds[i + 1] - ds[i];
      mesh.userData.loss.forEach((l, k) => {
        total[k] += Math.min(cap, 2 * l.surface + l.perM * path + l.fixed);
      });
    }
  }
  return total;
}

function freeSpace(d, ghz) {
  return 20 * Math.log10(Math.max(d, MIN_DISTANCE)) + 20 * Math.log10(ghz) + 32.45;
}

const toScene = (p) => new THREE.Vector3(p.x, p.z, -p.y);

async function compute(spacing, gen) {
  const { proxies, aps } = collect();
  if (!aps.length) throw new Error("keine Access Points mit Pset_Funk_AP im Modell");
  // The room bodies are prisms up to the highest point of the room; under a
  // sloped roof their upper corners stick out into the open. A point counts
  // only if something lies above it - roof, ceiling or slab.
  const up = new THREE.Raycaster();
  up.far = 30;
  const covered = (p) => {
    up.set(toScene(p), new THREE.Vector3(0, 1, 0));
    return up.intersectObjects(proxies, false).length > 0;
  };
  const work = BANDS.map((band) => ({
    band, points: samples(spacing, band.offset).filter(covered) }));
  const total = work.reduce((n, w) => n + w.points.length, 0) * aps.length;
  let done = 0, last = performance.now();
  const bands = {};
  for (const { band, points } of work) {
    const k = BANDS.indexOf(band);
    for (const p of points) {
      const target = toScene(p);
      // Every access point separately, not only the best one: switching one
      // off in the panel must not need a new computation.
      p.levels = aps.map((ap) => {
        done++;
        const eirp = Number(ap.pset[`EIRP_dBm_${band.key}`]);
        const ghz = Number(ap.pset[`Frequenz_GHz_${band.key}`]);
        if (!Number.isFinite(eirp) || !Number.isFinite(ghz)) return -Infinity;
        const cap = Number(ap.pset.Grenze_dB) || 40;
        const d = ap.pos.distanceTo(target);
        return eirp - freeSpace(d, ghz) - pathLoss(ap.pos, target, proxies, cap)[k];
      });
      if (performance.now() - last > 30) {
        statusEl.textContent = `rechnet … ${Math.round(100 * done / total)} %`;
        await new Promise((r) => setTimeout(r, 0));
        if (gen !== generation) return null;
        last = performance.now();
      }
    }
    bands[band.key] = points;
  }
  return { spacing, bands, aps, proxies: proxies.length };
}

// Best level per point among the access points that are switched on.
function pick() {
  if (!result) return;
  const on = result.aps.map((ap) => !disabledAps.has(ap.gid));
  for (const band of BANDS) {
    for (const p of result.bands[band.key]) {
      p.level = -Infinity;
      p.ap = null;
      p.levels.forEach((level, i) => {
        if (on[i] && level > p.level) { p.level = level; p.ap = result.aps[i].name; }
      });
    }
  }
}

// One switch per access point, straight from the metadata - available before
// the first computation, so one can start with an access point already off.
function renderAps() {
  apsEl.replaceChildren();
  const found = Object.entries(meta)
    .filter(([, m]) => m.psets?.Pset_Funk_AP)
    .sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)));
  for (const [gid, m] of found) {
    const label = document.createElement("label");
    label.className = "row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !disabledAps.has(gid);
    cb.onchange = () => {
      if (cb.checked) disabledAps.delete(gid); else disabledAps.add(gid);
      refresh();
    };
    const pset = m.psets.Pset_Funk_AP;
    const text = document.createElement("span");
    text.textContent = `${m.name || gid}`;
    text.title = `EIRP ${pset.EIRP_dBm_ghz_2_4 ?? "—"} / ${pset.EIRP_dBm_ghz_5 ?? "—"} dBm`
      + " (2,4 / 5 GHz)";
    label.append(cb, text);
    apsEl.append(label);
  }
}

// Switches changed: new best values, new clouds, new table - no new rays.
function refresh() {
  if (!result) return;
  pick();
  clearClouds();
  renderRooms();
  show();
}

// ------------------------------------------------------------ Drawing
const VERTEX = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
attribute float strength;
uniform float size;
uniform float scale;
varying float vStrength;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  vStrength = strength;
  gl_PointSize = size * (0.3 + 0.7 * strength) * scale / -mvPosition.z;
}`;
const FRAGMENT = /* glsl */ `
#include <clipping_planes_pars_fragment>
uniform vec3 color;
varying float vStrength;
void main() {
  #include <clipping_planes_fragment>
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(color * (0.8 + 0.2 * vStrength), 0.35 + 0.6 * vStrength);
}`;

function buildCloud(band, points, spacing) {
  const group = new THREE.Group();
  group.name = `WLAN ${band.label}`;
  const byStorey = new Map();
  for (const p of points) {
    if (p.level < BOTTOM) continue;
    if (!byStorey.has(p.storey)) byStorey.set(p.storey, []);
    byStorey.get(p.storey).push(p);
  }
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(band.color) },
      size: { value: spacing * 0.3 },
      scale: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    clipping: true,
    clippingPlanes: [clipPlane],
  });
  for (const [storey, list] of byStorey) {
    const pos = new Float32Array(list.length * 3);
    const strength = new Float32Array(list.length);
    list.forEach((p, i) => {
      pos.set([p.x, p.z, -p.y], i * 3);
      strength[i] = THREE.MathUtils.clamp((p.level - BOTTOM) / (TOP - BOTTOM), 0, 1);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("strength", new THREE.BufferAttribute(strength, 1));
    const cloud = new THREE.Points(geometry, material);
    cloud.userData.storey = storey;
    cloud.renderOrder = 10;
    // Point size in pixels follows the perspective: half the drawing buffer
    // height over tan(fov/2) is the pixel count of one metre at distance 1.
    cloud.onBeforeRender = (r, s, camera) => {
      const h = r.getDrawingBufferSize(new THREE.Vector2()).y;
      material.uniforms.scale.value = camera.isPerspectiveCamera
        ? h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : h / 2;
    };
    group.add(cloud);
  }
  return group;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmt(v) {
  return v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)}`;
}

function renderRooms() {
  if (!result) { roomsEl.replaceChildren(); return; }
  const rows = new Map();
  for (const band of BANDS) {
    for (const p of result.bands[band.key]) {
      if (!rows.has(p.room)) rows.set(p.room, { [BANDS[0].key]: [], [BANDS[1].key]: [], aps: new Map() });
      const row = rows.get(p.room);
      if (Number.isFinite(p.level)) row[band.key].push(p.level);
      if (p.ap) row.aps.set(p.ap, (row.aps.get(p.ap) ?? 0) + 1);
    }
  }
  const order = { Kellergeschoss: 0, Erdgeschoss: 1, Dachgeschoss: 2 };
  const table = document.createElement("table");
  table.className = "wlan-rooms";
  table.innerHTML = "<thead><tr><th>Raum</th><th>2,4</th><th>5</th><th>AP</th></tr></thead>";
  const body = document.createElement("tbody");
  [...rows.entries()]
    .sort(([a], [b]) => (order[displayStorey(meta[a])] ?? 9) - (order[displayStorey(meta[b])] ?? 9)
      || String(meta[a].name).localeCompare(String(meta[b].name)))
    .forEach(([gid, row]) => {
      const tr = document.createElement("tr");
      const ap = [...row.aps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      for (const text of [meta[gid].name || gid, fmt(median(row[BANDS[0].key])),
                          fmt(median(row[BANDS[1].key])), ap.replace(/\s*\(.*\)$/, "")]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      body.append(tr);
    });
  table.append(body);
  roomsEl.replaceChildren(table);
}

function clearClouds() {
  for (const group of clouds.values()) {
    scene.remove(group);
    group.traverse((o) => { if (o.isPoints) o.geometry.dispose(); });
    group.children[0]?.material.dispose();
  }
  clouds.clear();
}

function applyStoreys() {
  for (const group of clouds.values()) {
    for (const c of group.children) {
      c.visible = !visibleStoreys || visibleStoreys.has(c.userData.storey);
    }
  }
}

function show() {
  for (const band of BANDS) {
    const on = document.getElementById(band.input).checked;
    if (on && result && !clouds.has(band.key)) {
      const group = buildCloud(band, result.bands[band.key], result.spacing);
      clouds.set(band.key, group);
      scene.add(group);
    }
    const group = clouds.get(band.key);
    if (group) group.visible = on;
  }
  applyStoreys();
}

async function update() {
  const wanted = BANDS.some((b) => document.getElementById(b.input).checked);
  const spacing = parseFloat(spacingSel.value);
  if (!wanted) { show(); return; }
  if (!model) return;
  if (result && result.spacing === spacing) { show(); return; }
  if (running) return;
  const gen = generation;
  const t0 = performance.now();
  running = compute(spacing, gen)
    .then((r) => {
      if (!r || gen !== generation) return;
      clearClouds();
      result = r;
      pick();
      const n = BANDS.reduce((s, b) => s + r.bands[b.key].length, 0);
      statusEl.textContent = `${r.aps.length} Access Points, ${r.proxies} dämpfende `
        + `Körper, ${n} Punkte · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
      renderRooms();
    })
    .catch((err) => { statusEl.textContent = `Fehler: ${err.message}`; console.warn(err); })
    .finally(() => { running = null; update(); });
}

// A new model invalidates everything; a running computation notices through
// `generation` and stops at its next pause.
export function resetWlan() {
  generation++;
  result = null;
  clearClouds();
  renderRooms();
  renderAps();
  statusEl.textContent = "Aus – Häkchen setzen zum Rechnen";
  update();
}

// Storey filter from the component tree: a storey that is switched off
// takes its points along.
export function setWlanStoreys(storeys) {
  visibleStoreys = storeys;
  applyStoreys();
}

for (const band of BANDS) document.getElementById(band.input).addEventListener("change", update);
spacingSel.addEventListener("change", update);

// For tests and fault finding: the computed levels without the cloud.
window.houseWlan = () => result;
