/*
 * Two ways of drawing the same model.
 *
 * "Plan" is the CAD look of the overview: one flat color per IFC class, even
 * light from everywhere, nothing that distracts from reading the building.
 *
 * "Realistic" is for walking through it: surface colors instead of layer
 * colors, a sun that casts shadows through the windows, a sky that lights the
 * rooms softly, screen-space ambient occlusion that darkens corners and edges,
 * and the modelled light fixtures actually glowing. That is what makes a game
 * engine feel "real" - not the polygon count, but light that comes from
 * somewhere and gets caught in corners.
 *
 * Every mesh carries both materials (userData.planMaterial / realMaterial);
 * switching is a pointer swap, no rebuilding. The surface colors are
 * assumptions, not survey data: the model knows "Aussenwand 30 cm", not the
 * paint. They are chosen to look like an ordinary plastered house with wooden
 * floors and are meant as a backdrop, not as a finish schedule.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { meta } from "haus/state.js";
import {
  camera, clipPlane, main, planLights, renderer, scene,
} from "haus/scene.js";

export let realistic = false;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ------------------------------------------------------------ Surfaces
// Colors per IFC class and material text. Slabs and roofs are colored per
// face orientation (see `paintByNormal`): the top of a ceiling slab is the
// floor of the room above, its underside the white ceiling below.
const SURFACE = {
  wall:      { color: 0xeeeae2, roughness: 0.92 },   // plaster, painted
  cellar:    { color: 0xd6d2ca, roughness: 0.95 },   // masonry / concrete
  door:      { color: 0xf1efe9, roughness: 0.45 },   // white lacquer
  wood:      { color: 0xa7794a, roughness: 0.6 },
  softwood:  { color: 0xc49a66, roughness: 0.7 },
  concrete:  { color: 0xb9b5ad, roughness: 0.9 },
  stone:     { color: 0xb0a99c, roughness: 0.85 },
  chimney:   { color: 0xc4bcb0, roughness: 0.9 },
  eps:       { color: 0xf3f3ef, roughness: 0.95 },
  device:    { color: 0xf2f2ee, roughness: 0.4 },
  ceramic:   { color: 0xf7f7f5, roughness: 0.15 },
  metal:     { color: 0x9aa0a4, roughness: 0.4, metalness: 0.6 },
  cable:     { color: 0x303235, roughness: 0.6 },
  solar:     { color: 0x1f2a3a, roughness: 0.25, metalness: 0.3 },
  other:     { color: 0xd9d6cf, roughness: 0.8 },
};

// Face colors for slabs: [top, underside, edge]. The top of the base slab is
// the cellar floor (concrete), every other slab carries a wooden floor.
const SLAB_FACES = {
  "Bodenplatte":              [0xa9a59d, 0xa9a59d, 0xa9a59d],
  "Decke ueber Keller":       [0xb68b5e, 0xe2dfd8, 0xe0ddd6],
  "Decke ueber Erdgeschoss":  [0xb68b5e, 0xf4f2ee, 0xe0ddd6],
  "Decke ueber Dachgeschoss": [0xc9b28c, 0xf4f2ee, 0xe0ddd6],
  "Terrasse":                 [0xb0a99c, 0xb0a99c, 0xb0a99c],
  _default:                   [0xb68b5e, 0xf4f2ee, 0xe0ddd6],
};
// Roof: tiles outside, plastered slope inside, edges in between.
const ROOF_FACES = [0x8e4a38, 0xf1eee8, 0xd8d2c6];

function surfaceOf(m) {
  const type = m?.typ ?? "";
  const mat = m?.material ?? "";
  switch (type) {
    case "IfcWall": return /Keller|Beton/i.test(mat) ? "cellar" : "wall";
    case "IfcDoor": return "door";
    case "IfcStairFlight": return /Holz/i.test(mat) ? "wood" : "concrete";
    case "IfcBeam": return "softwood";
    case "IfcChimney": return "chimney";
    case "IfcCovering": return "eps";
    case "IfcFurniture": return "wood";
    case "IfcSanitaryTerminal": return "ceramic";
    case "IfcSolarDevice": return "solar";
    case "IfcPipeSegment": case "IfcValve": return "metal";
    case "IfcCableSegment": case "IfcCableCarrierSegment": return "cable";
    case "IfcOutlet": case "IfcSwitchingDevice": case "IfcSensor":
    case "IfcJunctionBox": case "IfcCommunicationsAppliance":
    case "IfcElectricFlowStorageDevice": return "device";
    default: return /Stein/i.test(mat) ? "stone" : "other";
  }
}

const shared = new Map();
function standard(key) {
  if (!shared.has(key)) {
    shared.set(key, new THREE.MeshStandardMaterial({
      metalness: 0, ...SURFACE[key], clippingPlanes: [clipPlane],
      side: THREE.DoubleSide,
    }));
    shared.get(key).userData.own = false;
  }
  return shared.get(key);
}

const vertexColored = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.8, metalness: 0,
  clippingPlanes: [clipPlane], side: THREE.DoubleSide,
});

const glass = () => new THREE.MeshStandardMaterial({
  color: 0xcfe3ec, roughness: 0.05, metalness: 0, transparent: true,
  opacity: 0.18, depthWrite: false, clippingPlanes: [clipPlane],
  side: THREE.DoubleSide,
});

const lamp = new THREE.MeshStandardMaterial({
  color: 0xfff3dc, emissive: 0xffe2b8, emissiveIntensity: 2.5,
  clippingPlanes: [clipPlane],
});

const hidden = new THREE.MeshBasicMaterial({ visible: false });

// Shared materials are marked, so that selection.js does not light up every
// wall when one is picked.
for (const m of [vertexColored, lamp, hidden]) m.userData.own = false;

// Per-vertex color from the face orientation in world space. The geometry is
// cloned first: glTF may share one buffer between several nodes.
function paintByNormal(mesh, [top, bottom, edge]) {
  const g = mesh.geometry = mesh.geometry.clone();
  const nrm = g.attributes.normal;
  if (!nrm) return;
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const cTop = new THREE.Color(top), cBottom = new THREE.Color(bottom),
        cEdge = new THREE.Color(edge);
  const colors = new Float32Array(nrm.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < nrm.count; i++) {
    n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
    const c = n.y > 0.2 ? cTop : n.y < -0.2 ? cBottom : cEdge;
    c.toArray(colors, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function realMaterialFor(mesh, m) {
  const type = m?.typ ?? "";
  const glazed = type === "IfcWindow" || /glas/i.test(m?.material ?? "");
  if (type === "IfcOpeningElement" || type === "IfcSpace") return hidden;
  if (glazed) return glass();
  if (type === "IfcLightFixture") return lamp;
  if (type === "IfcSlab") {
    paintByNormal(mesh, SLAB_FACES[m?.gruppe] ?? SLAB_FACES._default);
    return vertexColored;
  }
  if (type === "IfcRoof") { paintByNormal(mesh, ROOF_FACES); return vertexColored; }
  // Doors get a material of their own: walk.js fades each one separately.
  if (type === "IfcDoor") {
    const door = standard("door").clone();
    door.userData = {};
    return door;
  }
  return standard(surfaceOf(m));
}

// ------------------------------------------------------------ Light
export const realLights = new THREE.Group();

// Sun from the south-west in the afternoon, about 40 degrees high. glTF axes:
// X = east, Y = up, Z = south.
const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.64, 0.54).normalize();
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
realLights.add(sun, sun.target);
// Stand-in for the light bouncing around a room: from above a pale sky, from
// below the warm grey of floors and walls. Without it every ceiling takes on
// the color of the ground outside, since nothing else lights it from below.
realLights.add(new THREE.HemisphereLight(0xdfe8ff, 0xe0d8cc, 0.9));
const fixtureLights = new THREE.Group();
realLights.add(fixtureLights);

// Sky as environment: a gradient from zenith blue to a pale horizon, and a
// neutral warm grey below it. It lights every surface a little, gives glass
// something to reflect and is what one sees through the windows. The ground
// half is deliberately a color at infinity and not a plane: the terrain is
// not modelled, and a plane at a guessed height would pretend it were.
const pmrem = new THREE.PMREMGenerator(renderer);
const skyTexture = (() => {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        zenith: { value: new THREE.Color(0x5d8fcf) },
        horizon: { value: new THREE.Color(0xe3ecf2) },
        groundNear: { value: new THREE.Color(0xc2beb2) },
        ground: { value: new THREE.Color(0x96927f) },
      },
      vertexShader: `varying vec3 vDir;
        void main() { vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDir;
        uniform vec3 zenith, horizon, groundNear, ground;
        void main() { float h = normalize(vDir).y;
          vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55))
                           : mix(groundNear, ground, pow(-h, 0.35));
          gl_FragColor = vec4(c, 1.0); }`,
    })));
  return pmrem.fromScene(s, 0.01).texture;
})();

// ------------------------------------------------------------ Model
export function prepare(root, bbox) {
  root.updateMatrixWorld(true);
  fixtureLights.clear();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.userData.gid ? meta[o.userData.gid] : null;
    o.userData.planMaterial = o.material;
    o.userData.realMaterial = realMaterialFor(o, m);
    const transparent = o.userData.realMaterial.transparent;
    o.castShadow = !transparent;
    o.receiveShadow = true;
    if (m?.typ === "IfcLightFixture") {
      // A warm bulb just below the fixture. No shadow of its own - four
      // cube shadow maps would cost more than the whole rest of the scene,
      // so `distance` keeps the light from reaching far through walls.
      const p = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const bulb = new THREE.PointLight(0xffe0b8, 4, 5, 2);
      bulb.position.copy(p).y -= 0.25;
      fixtureLights.add(bulb);
    }
  });

  // Shadow frustum around the whole house: bounding sphere, seen from the sun.
  const sphere = bbox.getBoundingSphere(new THREE.Sphere());
  sun.target.position.copy(sphere.center);
  sun.position.copy(sphere.center).addScaledVector(SUN_DIRECTION, sphere.radius * 2);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -sphere.radius;
  cam.right = cam.top = sphere.radius;
  cam.near = sphere.radius * 0.5;
  cam.far = sphere.radius * 3.5;
  cam.updateProjectionMatrix();

  apply(root);
}

const PLAN_BACKGROUND = scene.background;
scene.add(realLights);
realLights.visible = false;

let current = null;
function apply(root = current) {
  current = root;
  if (!root) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.planMaterial) return;
    o.material = realistic ? o.userData.realMaterial : o.userData.planMaterial;
  });
  scene.background = realistic ? skyTexture : PLAN_BACKGROUND;
  scene.environment = realistic ? skyTexture : null;
  scene.environmentIntensity = 0.55;
  planLights.visible = !realistic;
  realLights.visible = realistic;
  renderer.toneMapping = realistic ? THREE.ACESFilmicToneMapping
                                   : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.05;
}

export function setRealistic(on) {
  if (on === realistic) return;
  realistic = on;
  apply();
}

// ------------------------------------------------------------ Drawing
// MSAA on the composer target, otherwise the post-processing chain throws away
// the antialiasing the plain renderer had.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType, samples: 4,
}));
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, 1, 1);
ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1,
                        scale: 1.3, samples: 16 });
ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6,
                      rings: 2, samples: 16 });
// Labels and glass stay out of the occlusion buffer: a sprite would cast a
// dark rectangle, and glass would darken the view out of the window.
const baseOverride = ao.overrideVisibility.bind(ao);
ao.overrideVisibility = () => {
  baseOverride();
  scene.traverse((o) => {
    if (o.isSprite || (o.isMesh && o.material.transparent)) o.visible = false;
  });
};
composer.addPass(ao);
composer.addPass(new OutputPass());

function resizeComposer() {
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(main.clientWidth, main.clientHeight);
}
new ResizeObserver(resizeComposer).observe(main);
resizeComposer();

export function draw() {
  if (realistic) composer.render();
  else renderer.render(scene, camera);
}
