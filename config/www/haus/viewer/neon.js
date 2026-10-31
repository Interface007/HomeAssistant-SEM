/*
 * Neon: the same model on a dark drawing board, with glowing edges.
 *
 * What makes it glow is not the surfaces but the bloom over bright lines, so
 * the fills stay dark and thin and the edges carry the building. Everything
 * the look adds that is not a component - edge lines, room floors, lamp glows,
 * the grid - sits in `stage`, outside the model. That is deliberate: a fat
 * line is a Mesh in three.js, and inside the model it would turn up in every
 * `traverse` that looks for components (tree, picking, bounding boxes).
 *
 * The colors say what a thing is, not what it is made of: cyan shell, amber
 * doors, magenta cables, orange heat. The warm pools on the floors mark the
 * modelled light fixtures, not their switching state - the model knows where a
 * lamp is, not whether it is on.
 *
 * All of it is built on first use: whoever never opens the neon view pays
 * nothing for it.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { meta } from "haus/state.js";
import { mitRaster } from "haus/raster.js";
import { camera, clipPlane, main, renderer, scene } from "haus/scene.js";

// fill: surface color, opacity; edge: line color, power (above 1 it blooms),
// width in pixels; glow: the surface shines by itself. `layer` is the switch
// the HUD offers for it.
const STYLE = {
  wall:      { fill: 0x10263f, opacity: 0.3, edge: 0x39e6ff, power: 1.7, width: 1.6 },
  slab:      { fill: 0x0a1424, opacity: 1, edge: 0x2b9fd0, power: 1, width: 1.1 },
  roof:      { fill: 0x121f36, opacity: 0.42, edge: 0x7fb2ff, power: 1.2, width: 1.3, layer: "dach" },
  beam:      { fill: 0x16263e, opacity: 0.55, edge: 0x4f7396, power: 0.8, width: 1, layer: "dach" },
  insulation:{ fill: 0x10263f, opacity: 0.12, layer: "dach" },
  solar:     { fill: 0x0c2e78, opacity: 0.9, edge: 0x6ea8ff, power: 1.5, width: 1.2, layer: "dach" },
  chimney:   { fill: 0x1a2840, opacity: 0.7, edge: 0xff8a66, power: 1, width: 1.2 },
  stair:     { fill: 0x1b2d4a, opacity: 0.85, edge: 0x9a8cff, power: 1.3, width: 1.1 },
  door:      { fill: 0xffb347, opacity: 0.1, edge: 0xffb347, power: 1.6, width: 1.4 },
  furniture: { fill: 0x2a2352, opacity: 0.7, edge: 0xb18cff, power: 1, width: 1, layer: "moebel" },
  sanitary:  { fill: 0x2a4a63, opacity: 0.8, edge: 0xbfe9ff, power: 1, width: 1, layer: "moebel" },
  lamp:      { glow: 0xffd9a0, power: 3 },
  heat:      { glow: 0xff6a3d, power: 1.6, layer: "technik" },
  cable:     { glow: 0xff4fd8, power: 1.5, layer: "technik" },
  device:    { glow: 0x4dffb8, power: 1.3, layer: "technik" },
  other:     { fill: 0x1a2840, opacity: 0.6, edge: 0x4f7396, power: 0.8, width: 1 },
};

function styleOf(m) {
  switch (m?.typ ?? "") {
    case "IfcWall": return "wall";
    case "IfcSlab": return "slab";
    case "IfcRoof": return "roof";
    case "IfcBeam": return "beam";
    case "IfcCovering": return "insulation";
    case "IfcSolarDevice": return "solar";
    case "IfcChimney": return "chimney";
    case "IfcStairFlight": return "stair";
    case "IfcFurniture": return "furniture";
    case "IfcSanitaryTerminal": return "sanitary";
    case "IfcLightFixture": return "lamp";
    case "IfcSpaceHeater": case "IfcPipeSegment": case "IfcValve": return "heat";
    case "IfcCableSegment": case "IfcCableCarrierSegment": return "cable";
    case "IfcOutlet": case "IfcSwitchingDevice": case "IfcSensor":
    case "IfcJunctionBox": case "IfcCommunicationsAppliance":
    case "IfcElectricFlowStorageDevice": case "IfcUnitaryControlElement":
      return "device";
    default: return "other";
  }
}

const WINDOW_GLOW = { closed: 0x39e6ff, open: 0xffb020, tilted: 0xff4d4d };

// ------------------------------------------------------------ Materials
const fills = new Map();
const lines = new Map();

function fillFor(key) {
  if (!fills.has(key)) fills.set(key, makeFill(STYLE[key]));
  return fills.get(key);
}

function makeFill(s) {
  const glass = !s.glow && s.opacity < 1;
  const material = mitRaster(new THREE.MeshLambertMaterial({
    color: s.glow ? 0x000000 : s.fill,
    transparent: glass,
    opacity: glass ? s.opacity : 1,
    // Thin glass must not hide what lies behind it, or the rooms disappear
    // behind the first wall.
    depthWrite: !glass,
    side: THREE.DoubleSide,
    clippingPlanes: [clipPlane],
  }));
  material.userData.own = false;
  if (s.glow) {
    material.emissive.setHex(s.glow);
    material.emissiveIntensity = s.power;
    material.userData.glow = { color: s.glow, intensity: s.power };
  }
  return material;
}

function lineFor(key) {
  if (!lines.has(key)) {
    const s = STYLE[key];
    lines.set(key, new LineMaterial({
      color: new THREE.Color(s.edge).multiplyScalar(s.power),
      linewidth: s.width,
      clippingPlanes: [clipPlane],
    }));
  }
  return lines.get(key);
}

// ------------------------------------------------------------ Stage
const stage = new THREE.Group();
stage.visible = false;
scene.add(stage);
stage.add(new THREE.HemisphereLight(0x7fb4ff, 0x0a1020, 1.5));
const moon = new THREE.DirectionalLight(0x9fd0ff, 0.9);
moon.position.set(-30, 45, 20);
stage.add(moon);

const edgeGroup = new THREE.Group();
const roomGroup = new THREE.Group();
const lampGroup = new THREE.Group();
stage.add(edgeGroup, roomGroup, lampGroup);

const backdrop = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(256, 300, 40, 256, 300, 420);
  r.addColorStop(0, "#12233f");
  r.addColorStop(0.55, "#0a1428");
  r.addColorStop(1, "#050913");
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// A drawing board, not terrain: the terrain is not modelled, and the grid lies
// at the foot of the model only because the model has to stand on something.
function makeGrid(box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 3.2;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        center: { value: new THREE.Vector2(center.x, center.z) },
        radius: { value: radius },
      },
      vertexShader: /* glsl */`varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`varying vec3 vWorld;
        uniform vec2 center;
        uniform float radius;
        float gridLine(vec2 p, float step) {
          vec2 c = p / step;
          vec2 w = fwidth(c);
          vec2 f = abs(fract(c - 0.5) - 0.5);
          vec2 l = 1.0 - smoothstep(vec2(0.0), w * 1.4, f);
          return max(l.x, l.y) * (1.0 - smoothstep(0.1, 0.4, max(w.x, w.y)));
        }
        void main() {
          float d = distance(vWorld.xz, center) / radius;
          float fade = 1.0 - smoothstep(0.1, 1.0, d);
          float a = gridLine(vWorld.xz, 1.0) * 0.16
                  + gridLine(vWorld.xz, 5.0) * 0.34;
          vec3 c = vec3(0.13, 0.62, 0.86);
          float pool = exp(-d * d * 22.0) * 0.16;
          gl_FragColor = vec4(c, max(a, pool) * fade);
        }`,
    }));
  mesh.position.y = box.min.y - 0.03;
  return mesh;
}

// ------------------------------------------------------------ Rooms
// Room floors come from the metadata: IfcSpace is not in the glTF, the outline
// and floor height are (`raum_umriss` in ifc_to_glb.py). glTF is Y-up: model Y
// becomes -Z.
export const rooms = [];

function area(points) {
  let sum = 0;
  points.forEach(([x, y], i) => {
    const [u, v] = points[(i + 1) % points.length];
    sum += x * v - u * y;
  });
  return Math.abs(sum) / 2;
}

function readRooms() {
  rooms.length = 0;
  for (const [gid, m] of Object.entries(meta)) {
    if (m.typ !== "IfcSpace" || !m.umriss?.length) continue;
    const s = m.psets?.Pset_Schild;
    if (!s) continue;
    rooms.push({
      gid,
      name: m.name || gid,
      short: s.Kurz ? String(s.Kurz) : "",
      storey: m.geschoss,
      floor: m.boden,
      height: m.raumhoehe,
      outline: m.umriss,
      area: area(m.umriss),
      center: new THREE.Vector3(Number(s.X), m.boden + 0.05, -Number(s.Y)),
      lamps: [],
      plate: null,
    });
  }
}

function inside(points, x, y) {
  let hit = false;
  points.forEach(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) / (by - ay) * (bx - ax)) {
      hit = !hit;
    }
  });
  return hit;
}

function distanceToOutline(points, x, y) {
  let best = Infinity;
  points.forEach(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax, dy = by - ay;
    const t = THREE.MathUtils.clamp(
      ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  });
  return best;
}

/** The room of a storey a scene point belongs to. A window sits in the wall,
 *  outside every outline, so the nearest room within `reach` metres counts. */
export function roomAt(point, storey, reach = 0.5) {
  const x = point.x, y = -point.z;
  const candidates = rooms.filter((r) => r.storey === storey);
  const within = candidates.find((r) => inside(r.outline, x, y));
  if (within) return within;
  let best = null, nearest = reach;
  for (const r of candidates) {
    const d = distanceToOutline(r.outline, x, y);
    if (d < nearest) { nearest = d; best = r; }
  }
  return best;
}

const MAX_LAMPS = 4;
const LAMP_REACH = 2.6;

function makePlate(room) {
  const shape = new THREE.Shape(
    room.outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ShapeGeometry(shape);
  const pos = geometry.attributes.position;
  // A hair above the floor, or it flickers against the slab.
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i), room.floor + 0.012, -pos.getY(i));
  }
  const lamps = Array.from({ length: MAX_LAMPS }, (_, i) => {
    const p = room.lamps[i];
    return p ? new THREE.Vector2(p.x, p.z) : new THREE.Vector2(1e4, 1e4);
  });
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    clipping: true,
    clippingPlanes: [clipPlane],
    uniforms: {
      lamps: { value: lamps },
      reach: { value: LAMP_REACH },
      marked: { value: 0 },
    },
    vertexShader: /* glsl */`varying vec2 vPlan;
      #include <clipping_planes_pars_vertex>
      void main() {
        vPlan = position.xz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        #include <clipping_planes_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */`varying vec2 vPlan;
      uniform vec2 lamps[${MAX_LAMPS}];
      uniform float reach;
      uniform float marked;
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        float warm = 0.0;
        for (int i = 0; i < ${MAX_LAMPS}; i++) {
          float d = distance(vPlan, lamps[i]) / reach;
          warm += exp(-d * d * 2.2);
        }
        vec3 base = vec3(0.03, 0.2, 0.3) * (1.0 + marked * 1.2);
        gl_FragColor = vec4(base + vec3(1.0, 0.68, 0.34) * min(warm, 1.0) * 0.7,
                            1.0);
      }`,
  });
  return new THREE.Mesh(geometry, material);
}

const glowTexture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,240,215,1)");
  r.addColorStop(0.25, "rgba(255,205,140,.55)");
  r.addColorStop(1, "rgba(255,180,100,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

/** Highlight one room's floor, or none. */
export function markRoom(room) {
  for (const r of rooms) {
    if (r.plate) r.plate.material.uniforms.marked.value = r === room ? 1 : 0;
  }
}

// ------------------------------------------------------------ Build
let root = null, box = null, built = false;
const edges = [];     // { mesh, line }
const layersOff = new Set();

function clearGroup(group) {
  for (const o of [...group.children]) {
    group.remove(o);
    o.geometry?.dispose();
    if (group !== edgeGroup) o.material?.dispose();
  }
}

/** A new model arrived: whatever was built belongs to the old one. */
export function resetNeon(newRoot, newBox) {
  root = newRoot;
  box = newBox;
  built = false;
  edges.length = 0;
  clearGroup(edgeGroup);
  clearGroup(roomGroup);
  clearGroup(lampGroup);
  for (const o of stage.children.filter((c) => c.userData.grid)) {
    stage.remove(o);
    o.geometry.dispose();
    o.material.dispose();
  }
}

export function ensureNeon() {
  if (built || !root) return;
  built = true;
  readRooms();
  root.updateMatrixWorld(true);

  const seenLamps = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.userData.gid ? meta[o.userData.gid] : null;
    const key = styleOf(m);
    const glazed = m?.typ === "IfcWindow" || /glas/i.test(m?.material ?? "");
    const edgeKey = glazed ? "wall" : m?.typ === "IfcDoor" ? "door" : key;
    if (glazed) {
      // One material per window: its color carries the state of the contact.
      o.userData.neonMaterial = makeFill({ glow: WINDOW_GLOW.closed, power: 0.75 });
      o.userData.neonMaterial.userData.own = undefined;
      o.userData.neonMaterial.transparent = true;
      o.userData.neonMaterial.opacity = 0.5;
      o.userData.neonMaterial.depthWrite = false;
    } else {
      o.userData.neonMaterial = fillFor(edgeKey);
    }
    o.userData.neonLayer = STYLE[edgeKey].layer;

    if (STYLE[edgeKey].edge) {
      const geometry = new LineSegmentsGeometry().fromEdgesGeometry(
        new THREE.EdgesGeometry(o.geometry, 28));
      const line = new LineSegments2(geometry, lineFor(edgeKey));
      line.matrixAutoUpdate = false;
      line.matrix.copy(o.matrixWorld);
      line.frustumCulled = false;
      edgeGroup.add(line);
      edges.push({ mesh: o, line });
    }

    if (m?.typ === "IfcLightFixture" && !seenLamps.has(o.userData.gid)) {
      seenLamps.add(o.userData.gid);
      const p = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      roomAt(p, m.geschoss)?.lamps.push(p);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture, color: 0xffe2b8, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, clippingPlanes: [clipPlane],
      }));
      halo.position.copy(p);
      halo.scale.setScalar(1.3);
      lampGroup.add(halo);
    }
  });

  for (const room of rooms) {
    room.plate = makePlate(room);
    roomGroup.add(room.plate);
  }

  const grid = makeGrid(box);
  grid.userData.grid = true;
  stage.add(grid);
  applyLayers();
}

function applyLayers() {
  for (const [key, material] of fills) {
    material.visible = !layersOff.has(STYLE[key].layer);
  }
  for (const { mesh, line } of edges) {
    line.visible = mesh.visible && !layersOff.has(mesh.userData.neonLayer);
  }
  roomGroup.visible = !layersOff.has("raeume");
  lampGroup.visible = !layersOff.has("raeume");
}

export function setLayer(name, on) {
  if (on) layersOff.delete(name); else layersOff.add(name);
  applyLayers();
}

export function layerOn(name) { return !layersOff.has(name); }

/** Paint a window with its contact state. Called by the HUD. */
export function paintWindow(mesh, state) {
  mesh.userData.neonMaterial?.emissive.setHex(WINDOW_GLOW[state]);
  const m = mesh.userData.neonMaterial;
  if (m?.userData) m.userData.glow = { color: WINDOW_GLOW[state], intensity: 0.75 };
}

/** Show or hide the stage; returns the backdrop for scene.background. */
export function showNeonStage(on) {
  stage.visible = on;
  return backdrop;
}

// ------------------------------------------------------------ Drawing
let composer = null;

function makeComposer() {
  const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: 4,
  }));
  c.addPass(new RenderPass(scene, camera));
  // Threshold below the edges and above the dark fills: only what is meant to
  // glow does, without a separate bloom scene.
  c.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.62));
  c.addPass(new OutputPass());
  const fit = () => {
    c.setPixelRatio(renderer.getPixelRatio());
    c.setSize(main.clientWidth, main.clientHeight);
  };
  new ResizeObserver(fit).observe(main);
  fit();
  return c;
}

export function drawNeon() {
  composer ??= makeComposer();
  // The tree hides components through mesh.visible; their edges follow here.
  for (const { mesh, line } of edges) {
    line.visible = mesh.visible && !layersOff.has(mesh.userData.neonLayer);
  }
  composer.render();
}
