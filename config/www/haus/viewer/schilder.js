/*
 * Labels in the model: wall names and room names.
 *
 * Drawn as sprites with size falloff: readable up close, small at a distance,
 * without having to fiddle with font sizes. Two labels per wall, one on each
 * side - otherwise the label is stuck inside the wall.
 */
import * as THREE from "three";
import { byType, labels, meta, raumschilder } from "haus/zustand.js";
import { scene } from "haus/szene.js";

const SCHILDHOEHE = 0.14;     // m in world coordinates

export function schild(text, blass = false) {
  const zeilen = Array.isArray(text) ? text : [text];
  const fs = 44, pad = 10, zh = fs + 6;
  const mess = document.createElement("canvas").getContext("2d");
  mess.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  const c = document.createElement("canvas");
  c.width = Math.ceil(Math.max(...zeilen.map((z) => mess.measureText(z).width)))
            + pad * 2;
  c.height = zh * zeilen.length + pad * 2 - 6;
  const g = c.getContext("2d");
  g.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  g.fillStyle = "rgba(228,231,226,0.92)";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#22282a";
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  // Stale values pale: an old reading that looks like a current one is worse
  // than no reading at all.
  g.fillStyle = blass ? "#7d8a8c" : "#0d5c63";
  g.textBaseline = "middle";
  zeilen.forEach((z, i) => g.fillText(z, pad, pad + zh * i + fs / 2 - 3));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  sp.scale.set(SCHILDHOEHE * c.width / c.height, SCHILDHOEHE, 1);
  return sp;
}

export function beschriften() {
  labels.clear();
  const gesehen = new Set();
  for (const mesh of byType.get("IfcWall") ?? []) {
    const gid = mesh.userData.gid;
    const name = meta[gid]?.name;
    if (!name || gesehen.has(gid)) continue;
    gesehen.add(gid);

    const kasten = new THREE.Box3().setFromObject(mesh);
    const mitte = kasten.getCenter(new THREE.Vector3());
    const groesse = kasten.getSize(new THREE.Vector3());
    // thinnest horizontal extent is the wall thickness -> that is the normal
    const duenn = groesse.x < groesse.z;
    const n = duenn ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const abstand = (duenn ? groesse.x : groesse.z) / 2 + 0.04;
    const y = Math.min(mitte.y, kasten.min.y + 1.55);
    for (const seite of [1, -1]) {
      const sp = schild(name);
      sp.position.copy(mitte).setY(y).addScaledVector(n, seite * abstand);
      sp.userData.geschoss = mesh.userData.geschoss;
      labels.add(sp);
    }
  }
  if (!labels.parent) scene.add(labels);
  labels.visible = document.getElementById("labels").checked;
}

// Room names. Unlike the walls they hang off no mesh: IfcSpace is not exported
// to glTF in the first place (DEFAULT_EXCLUDE in ifc_to_glb.py), otherwise 14
// opaque blocks would sit in the model. The labels therefore come from the
// metadata alone - `Pset_Schild` carries a point guaranteed to lie inside the
// room polygon, at eye level above the finished floor.
export function raeumeBeschriften() {
  raumschilder.clear();
  for (const [gid, m] of Object.entries(meta)) {
    if (m.typ !== "IfcSpace") continue;
    const s = m.psets?.Pset_Schild;
    if (!s) continue;
    const kurz = s.Kurz ? String(s.Kurz) : "";
    const sp = schild(kurz ? [m.name || gid, kurz] : [m.name || gid]);
    // glTF is Y-up (y-up in ifc_to_glb.py): model Z becomes Y, model Y becomes
    // -Z. The same rotation as for the rest of the scene.
    sp.position.set(Number(s.X), Number(s.Z), -Number(s.Y));
    // Noticeably bigger than the wall labels: a room name should be readable
    // from a top view of the whole storey, not only when standing in front of
    // it. 0.14 * 3.2 = roughly 45 cm label height.
    sp.scale.multiplyScalar(3.2);
    sp.userData.geschoss = m.geschoss;
    raumschilder.add(sp);
  }
  if (!raumschilder.parent) scene.add(raumschilder);
  raumschilder.visible = document.getElementById("raumnamen").checked;
}

document.getElementById("labels").onchange = (e) => {
  labels.visible = e.target.checked;
};

document.getElementById("raumnamen").onchange = (e) => {
  raumschilder.visible = e.target.checked;
};
