/*
 * Horizontal section plane: the slider cuts the model open at a chosen height.
 */
import * as THREE from "three";
import { bbox } from "haus/zustand.js";
import { clipPlane } from "haus/szene.js";

export const clipInput = document.getElementById("clip");
const clipLabel = document.getElementById("clipLabel");

export function setupClip(fraction = 1) {
  clipInput.min = bbox.min.y.toFixed(3);
  clipInput.max = bbox.max.y.toFixed(3);
  const f = Number.isFinite(fraction) ? THREE.MathUtils.clamp(fraction, 0, 1) : 1;
  clipInput.value = bbox.min.y + (bbox.max.y - bbox.min.y) * f;
  applyClip();
}

export function applyClip() {
  const y = parseFloat(clipInput.value);
  // Normal (0,-1,0): what stays visible is the range with p.y <= constant
  clipPlane.constant = y;
  // glTF is Y-up, the building zero level sits at the bbox floor
  clipLabel.textContent = `OK ${(y - bbox.min.y).toFixed(2)} m`;
}

clipInput.addEventListener("input", applyClip);
