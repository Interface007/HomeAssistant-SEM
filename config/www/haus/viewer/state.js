/*
 * Shared state of the viewer.
 *
 * Everything several aspects need at once lives here and only here: the loaded
 * model, its metadata and the lookup tables built from them. The three
 * reassignable values are exported as live bindings plus a setter - importing
 * modules keep reading `meta[gid]` as before, and only `loading.js` decides
 * when a new model takes over.
 *
 * The keys inside `meta` (typ, geschoss, gruppe, psets, Pset_HomeAssistant,
 * ...) stay German on purpose: they are the data format that ifc_to_glb.py
 * writes, not names this file is free to choose.
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

export function setModel(value) { model = value; }
export function setMeta(value) { meta = value; }
export function setBbox(value) { bbox = value; }

export const byType = new Map();     // component group -> Mesh[]
export const groupColor = new Map(); // component group -> color (for the legend)
export const byStorey = new Map();   // storey -> Mesh[]
export const byGid = new Map();      // GlobalId -> Mesh[] (for the state color)
export const collidables = [];       // meshes checked against while walking
export const wallLabels = new THREE.Group();    // wall names
export const roomLabels = new THREE.Group();    // room names
export const deviceLabels = new THREE.Group();  // readings on devices
export const readings = new Map();   // entity_id -> {value, unit, age}
export const hiddenTypes = new Set();
export const hiddenStoreys = new Set();

export const push = (map, key, value) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
};
