/*
 * Sidebar lists for storeys and components, and the visibility derived from
 * them.
 */
import {
  byStorey, byType, groupColor, hiddenStoreys, hiddenTypes, model, PALETTE,
  roomLabels, wallLabels,
} from "haus/state.js";
import { walkStoreySel } from "haus/walk.js";

export function renderLists(selectedStorey = "") {
  buildList("storeys", byStorey, hiddenStoreys, (k) => k);
  buildList("types", byType, hiddenTypes, (k) => k.replace(/^Ifc/, ""));
  walkStoreySel.innerHTML = "";
  [...byStorey.keys()].sort().forEach((k) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    if (k === selectedStorey || (!selectedStorey && /Erdgeschoss/i.test(k))) o.selected = true;
    walkStoreySel.append(o);
  });
}

function buildList(id, map, hidden, labelFn) {
  const host = document.getElementById(id);
  host.innerHTML = "";
  [...map.keys()].sort().forEach((key) => {
    const meshes = map.get(key);
    const row = document.createElement("label");
    row.className = "row";
    const cb = Object.assign(document.createElement("input"),
      { type: "checkbox", checked: !hidden.has(key) });
    cb.onchange = () => {
      if (cb.checked) hidden.delete(key);
      else hidden.add(key);
      applyVisibility();
    };
    row.append(cb);
    if (id === "types") {
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = "#" + (groupColor.get(key) ?? PALETTE._default)
        .toString(16).padStart(6, "0");
      row.append(sw);
    }
    const txt = document.createElement("span");
    txt.textContent = labelFn(key);
    const cnt = document.createElement("span");
    cnt.className = "count"; cnt.textContent = meshes.length;
    row.append(txt, cnt);
    host.append(row);
  });
}

export function applyVisibility() {
  if (!model) return;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.visible = !hiddenTypes.has(o.userData.gruppe)
      && !hiddenStoreys.has(o.userData.geschoss);
  });
  // Labels hang off no mesh and therefore have to obey the storey filter
  // themselves - otherwise the names of a hidden storey float freely in the
  // air above whatever is left standing.
  for (const group of [wallLabels, roomLabels]) {
    for (const sprite of group.children) {
      sprite.visible = !hiddenStoreys.has(sprite.userData.geschoss);
    }
  }
}
