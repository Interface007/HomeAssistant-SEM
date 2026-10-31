/*
 * Messraster auf den Flaechen.
 *
 * Ein waagerechtes Gitter im Raum hilft beim Aufmessen wenig: es liegt fast
 * nie dort, wo das Bauteil ist, und sobald man heranzoomt, ist es aus dem
 * Bild. Dieses Raster liegt deshalb AUF den Flaechen - ein Gitter aus Ebenen
 * im Weltkoordinatensystem, das jede Oberflaeche schneidet. Auf einer Wand
 * erscheinen dieselben Linien wie auf dem Boden, und beide zeigen dieselben
 * Koordinaten.
 *
 * Gezeichnet wird im Shader der Bauteilmaterialien (`mitRaster`), nicht als
 * zweites Netz: so folgt das Raster jeder Geometrie, auch dem Dachschraegen
 * und den Bohrungen, ohne dass etwas doppelt gezeichnet wird.
 *
 * Die Beschriftung kommt aus der Kamera, nicht aus dem Modell: sie sitzt an
 * den Meterlinien rund um den Punkt in der Bildmitte. Deshalb ist auch dann
 * ablesbar, wo man ist, wenn man so nah steht, dass keine Bauteilkante mehr
 * im Bild ist - genau der Fall, in dem ein Raster ohne Beschriftung nutzlos
 * waere.
 *
 * Angezeigt wird in MODELLkoordinaten (X Osten, Y Norden, Z Hoehe), nicht in
 * den glTF-Achsen der Szene. Umgerechnet wird in `nachModell`.
 */
import * as THREE from "three";
import { model } from "haus/state.js";
import { camera, controls, main, renderer, scene } from "haus/scene.js";

// glTF ist Y-up: Modell-Z wird zur Szenen-Y, Modell-Y zur negativen Szenen-Z
// (dieselbe Drehung wie in ifc_to_glb.py).
export function nachModell(p) {
  return new THREE.Vector3(p.x, -p.z, p.y);
}

export function formatModell(p, trenner = " · ") {
  const m = nachModell(p);
  return `X ${m.x.toFixed(3)}${trenner}Y ${m.y.toFixed(3)}${trenner}`
    + `Z ${m.z.toFixed(3)}`;
}

// ------------------------------------------------------------ Shader
const uniforms = {
  rasterAn: { value: 0 },
  rasterWeite: { value: 0.1 },
  rasterFein: { value: new THREE.Color(0x0d5c63) },
  rasterGrob: { value: new THREE.Color(0xc0392b) },
};

const LINIE = /* glsl */`
float rasterLinie(float wert, float weite) {
  float c = wert / weite;
  float d = fwidth(c);
  float f = abs(fract(c - 0.5) - 0.5);
  // Linienbreite in Pixeln statt in Metern: aus der Naehe duenn, aus der
  // Ferne nicht dicker. Und ausblenden, sobald die Felder kleiner als ein
  // paar Pixel werden - sonst wird die Flaeche einfach nur schmutzig.
  float linie = 1.0 - smoothstep(0.0, d * 1.6, f);
  return linie * (1.0 - smoothstep(0.08, 0.28, d));
}
`;

const ANWENDEN = /* glsl */`
#include <color_fragment>
if (rasterAn > 0.5) {
  vec3 n = normalize(vRasterNormal);
  // Eine Ebenenschar liegt parallel zur Flaeche, wenn deren Normale auf der
  // Achse steht - dann gibt es keine Schnittlinie, sondern hoechstens einen
  // Volltreffer. Diese Schar wird ausgeblendet, sonst leuchtet ein Boden auf
  // runder Hoehe komplett auf.
  vec3 quer = vec3(1.0) - abs(n);
  float fein = max(max(
    rasterLinie(vRasterWelt.x, rasterWeite) * quer.x,
    rasterLinie(vRasterWelt.y, rasterWeite) * quer.y),
    rasterLinie(vRasterWelt.z, rasterWeite) * quer.z);
  float grob = max(max(
    rasterLinie(vRasterWelt.x, 1.0) * quer.x,
    rasterLinie(vRasterWelt.y, 1.0) * quer.y),
    rasterLinie(vRasterWelt.z, 1.0) * quer.z);
  diffuseColor.rgb = mix(diffuseColor.rgb, rasterFein, fein * 0.28);
  diffuseColor.rgb = mix(diffuseColor.rgb, rasterGrob, grob * 0.85);
}
`;

/** Ein Bauteilmaterial um das Flaechenraster erweitern. */
export function mitRaster(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "varying vec3 vRasterWelt;\n"
      + "varying vec3 vRasterNormal;\n"
      + shader.vertexShader
        .replace("#include <beginnormal_vertex>",
          "#include <beginnormal_vertex>\n"
          + "vRasterNormal = normalize(mat3(modelMatrix) * objectNormal);")
        .replace("#include <begin_vertex>",
          "#include <begin_vertex>\n"
          + "vRasterWelt = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = "uniform float rasterAn;\n"
      + "uniform float rasterWeite;\n"
      + "uniform vec3 rasterFein;\n"
      + "uniform vec3 rasterGrob;\n"
      + "varying vec3 vRasterWelt;\n"
      + "varying vec3 vRasterNormal;\n"
      + LINIE
      + shader.fragmentShader.replace("#include <color_fragment>", ANWENDEN);
  };
  // Sonst teilen sich Materialien mit und ohne Raster dasselbe Programm.
  material.customProgramCacheKey = () => "raster";
  return material;
}

// ------------------------------------------------------------ Beschriftung
const schilder = new THREE.Group();
schilder.renderOrder = 20;
scene.add(schilder);

const texturen = new Map();

function schildTextur(text) {
  if (texturen.has(text)) return texturen.get(text);
  const fs = 34, pad = 8;
  const mess = document.createElement("canvas").getContext("2d");
  mess.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  const c = document.createElement("canvas");
  c.width = Math.ceil(mess.measureText(text).width) + pad * 2;
  c.height = fs + pad * 2;
  const g = c.getContext("2d");
  g.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  g.fillStyle = "rgba(228,231,226,0.94)";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#c0392b";
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  g.fillStyle = "#22282a";
  g.textBaseline = "middle";
  g.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texturen.set(text, { tex, seite: c.width / c.height });
  return texturen.get(text);
}

// Bildschirmfeste Groesse: sizeAttenuation aus. Ein Schild ist damit aus
// jeder Entfernung gleich gross - beim Heranzoomen wird es nicht riesig.
function schild(text, hoehe = 0.019) {
  const { tex, seite } = schildTextur(text);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
    sizeAttenuation: false,
  }));
  sprite.scale.set(hoehe * seite, hoehe, 1);
  return sprite;
}

const strahl = new THREE.Raycaster();
const ACHSEN = [
  { index: 0, name: "X", vorzeichen: 1 },    // Szene-X  = Modell-X (Osten)
  { index: 2, name: "Y", vorzeichen: -1 },   // Szene-Z  = -Modell-Y (Norden)
  { index: 1, name: "Z", vorzeichen: 1 },    // Szene-Y  = Modell-Z (Hoehe)
];

function beschrifte() {
  schilder.clear();
  if (!uniforms.rasterAn.value || !model) return;

  // Punkt in der Bildmitte: er bestimmt, welcher Ausschnitt beschriftet wird.
  strahl.setFromCamera(new THREE.Vector2(0, 0), camera);
  const treffer = strahl.intersectObject(model, true)
    .find((t) => t.object.visible && t.object.material.visible && t.face);
  if (!treffer) return;

  const punkt = treffer.point;
  const normale = treffer.face.normal.clone()
    .transformDirection(treffer.object.matrixWorld).normalize();

  const mitte = schild(formatModell(punkt, "  "), 0.024);
  mitte.position.copy(punkt).addScaledVector(normale, 0.01);
  // Anker unter dem Schild: es steht ueber dem Punkt statt auf ihm und
  // verdeckt die Stelle nicht, die man gerade abliest.
  mitte.center.set(0.5, -0.7);
  schilder.add(mitte);

  // Wie viel Welt passt ins Bild? Daraus folgt, wie viele Meterlinien
  // beschriftet werden - aus der Ferne jede zweite oder fuenfte.
  const sicht = 2 * punkt.distanceTo(camera.position)
    * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const schritt = [0.5, 1, 2, 5, 10, 20].find((s) => sicht / s <= 5) ?? 50;

  for (const achse of ACHSEN) {
    // Achsen, die auf der Flaeche senkrecht stehen, liefern keine Linie.
    if (Math.abs(normale.getComponent(achse.index)) > 0.9) continue;
    const wert = punkt.getComponent(achse.index);
    const erste = Math.ceil((wert - sicht / 2) / schritt) * schritt;
    for (let v = erste; v <= wert + sicht / 2; v += schritt) {
      if (Math.abs(v - wert) < 1e-6) continue;
      const ziel = punkt.clone();
      ziel.setComponent(achse.index, v);
      // Zurueck auf die Flaeche: der Punkt soll auf der Ebene liegen, auf
      // die man gerade schaut, sonst schwebt das Schild im Raum.
      ziel.addScaledVector(normale, -ziel.clone().sub(punkt).dot(normale));
      if (ziel.distanceTo(punkt) > sicht) continue;
      const wertModell = achse.vorzeichen * v;
      const s = schild(`${achse.name} ${wertModell.toFixed(2)}`);
      s.position.copy(ziel).addScaledVector(normale, 0.01);
      schilder.add(s);
    }
  }
}

// Nicht bei jedem Frame: die Beschriftung braucht einen Strahlschuss durch
// das ganze Modell. Nach der letzten Kamerabewegung reicht einmal.
let zeitgeber = null;
function beschrifteBald() {
  clearTimeout(zeitgeber);
  zeitgeber = setTimeout(beschrifte, 120);
}
controls.addEventListener("change", beschrifteBald);
new ResizeObserver(beschrifteBald).observe(main);

// ------------------------------------------------------------ Bedienung
const anAus = document.getElementById("surfaceGrid");
const weiteWahl = document.getElementById("gridSpacing");

export function setzeRaster() {
  uniforms.rasterAn.value = anAus.checked ? 1 : 0;
  uniforms.rasterWeite.value = parseFloat(weiteWahl.value);
  schilder.visible = anAus.checked;
  beschrifte();
}

anAus.addEventListener("change", setzeRaster);
weiteWahl.addEventListener("change", setzeRaster);
renderer.domElement.addEventListener("pointerup", beschrifteBald);

export function refreshRaster() {
  setzeRaster();
}
