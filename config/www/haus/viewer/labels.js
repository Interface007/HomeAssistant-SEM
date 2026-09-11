/*
 * Labels in the model: wall names and room names.
 *
 * Drawn as sprites with size falloff: readable up close, small at a distance,
 * without having to fiddle with font sizes. Two labels per wall, one on each
 * side - otherwise the label is stuck inside the wall.
 */
import * as THREE from "three";
import { byType, meta, roomLabels, wallLabels } from "haus/state.js";
import { scene } from "haus/scene.js";

const LABEL_HEIGHT = 0.14;     // m in world coordinates

export function makeLabel(text, pale = false) {
  const lines = Array.isArray(text) ? text : [text];
  const fs = 44, pad = 10, lh = fs + 6;
  const gauge = document.createElement("canvas").getContext("2d");
  gauge.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  const c = document.createElement("canvas");
  c.width = Math.ceil(Math.max(...lines.map((l) => gauge.measureText(l).width)))
            + pad * 2;
  c.height = lh * lines.length + pad * 2 - 6;
  const g = c.getContext("2d");
  g.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  g.fillStyle = "rgba(228,231,226,0.92)";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#22282a";
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  // Stale values pale: an old reading that looks like a current one is worse
  // than no reading at all.
  g.fillStyle = pale ? "#7d8a8c" : "#0d5c63";
  g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, pad, pad + lh * i + fs / 2 - 3));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  sprite.scale.set(LABEL_HEIGHT * c.width / c.height, LABEL_HEIGHT, 1);
  return sprite;
}

export function labelWalls() {
  wallLabels.clear();
  const seen = new Set();
  for (const mesh of byType.get("IfcWall") ?? []) {
    const gid = mesh.userData.gid;
    const name = meta[gid]?.name;
    if (!name || seen.has(gid)) continue;
    seen.add(gid);

    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // thinnest horizontal extent is the wall thickness -> that is the normal
    const thin = size.x < size.z;
    const n = thin ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const offset = (thin ? size.x : size.z) / 2 + 0.04;
    const y = Math.min(center.y, box.min.y + 1.55);
    for (const side of [1, -1]) {
      const sprite = makeLabel(name);
      sprite.position.copy(center).setY(y).addScaledVector(n, side * offset);
      sprite.userData.geschoss = mesh.userData.geschoss;
      wallLabels.add(sprite);
    }
  }
  if (!wallLabels.parent) scene.add(wallLabels);
  wallLabels.visible = document.getElementById("labels").checked;
}

// Room names. Unlike the walls they hang off no mesh: IfcSpace is not exported
// to glTF in the first place (DEFAULT_EXCLUDE in ifc_to_glb.py), otherwise 14
// opaque blocks would sit in the model. The labels therefore come from the
// metadata alone - `Pset_Schild` carries a point guaranteed to lie inside the
// room polygon, at eye level above the finished floor.
export function labelRooms() {
  roomLabels.clear();
  for (const [gid, m] of Object.entries(meta)) {
    if (m.typ !== "IfcSpace") continue;
    const s = m.psets?.Pset_Schild;
    if (!s) continue;
    const short = s.Kurz ? String(s.Kurz) : "";
    const sprite = makeLabel(short ? [m.name || gid, short] : [m.name || gid]);
    // glTF is Y-up (y-up in ifc_to_glb.py): model Z becomes Y, model Y becomes
    // -Z. The same rotation as for the rest of the scene.
    sprite.position.set(Number(s.X), Number(s.Z), -Number(s.Y));
    // Noticeably bigger than the wall labels: a room name should be readable
    // from a top view of the whole storey, not only when standing in front of
    // it. 0.14 * 3.2 = roughly 45 cm label height.
    sprite.scale.multiplyScalar(3.2);
    sprite.userData.geschoss = m.geschoss;
    roomLabels.add(sprite);
  }
  if (!roomLabels.parent) scene.add(roomLabels);
  roomLabels.visible = document.getElementById("roomNames").checked;
}

document.getElementById("labels").onchange = (e) => {
  wallLabels.visible = e.target.checked;
};

document.getElementById("roomNames").onchange = (e) => {
  roomLabels.visible = e.target.checked;
};
