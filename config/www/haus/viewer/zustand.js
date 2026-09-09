/*
 * Shared state of the viewer.
 *
 * Everything several aspects need at once lives here and only here: the loaded
 * model, its metadata and the lookup tables built from them. The three
 * reassignable values are exported as live bindings plus a setter - importing
 * modules keep reading `meta[gid]` as before, and only `laden.js` decides when
 * a new model takes over.
 */
import * as THREE from "three";

// Color code follows CAD layers, not taste
export const PALETTE = {
  IfcWall:   0xb9b0a4, IfcSlab:  0x9aa3a6, IfcRoof:  0x6f7a80,
  IfcWindow: 0x3f7d9c, IfcDoor:  0xa8763b, IfcSpace: 0x0d5c63,
  _default:  0xa5aca6,
};

export let model = null;
export let meta = {};
export let bbox = null;

export function setModel(wert) { model = wert; }
export function setMeta(wert) { meta = wert; }
export function setBbox(wert) { bbox = wert; }

export const byType = new Map();     // component group -> Mesh[]
export const groupColor = new Map(); // component group -> color (for the legend)
export const byStorey = new Map();   // storey -> Mesh[]
export const nachGid = new Map();    // GlobalId -> Mesh[] (for the state color)
export const collidables = [];       // meshes checked against while walking
export const labels = new THREE.Group();           // wall labels
export const raumschilder = new THREE.Group();     // room names
export const geraeteschilder = new THREE.Group();  // readings on devices
export const messwerte = new Map();  // entity_id -> {wert, einheit, alter}
export const hiddenTypes = new Set();
export const hiddenStoreys = new Set();

export const push = (map, key, val) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
};
