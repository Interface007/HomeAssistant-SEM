/*
 * The controls of the neon view: storey and room pills, cards floating at
 * their place in the model, switches for the layers.
 *
 * Everything shown is read off the model or off Home Assistant. Without Home
 * Assistant - the single file on its own - the cards show what the model knows
 * (rooms, areas, counts) and no live values. A number that only looks alive
 * would be worse than none.
 */
import * as THREE from "three";
import {
  bbox, byGid, deviceLabels, meta, readings, roomLabels, wallLabels,
} from "haus/state.js";
import { camera, controls, main } from "haus/scene.js";
import { applyClip, clipInput } from "haus/section.js";
import { neon, setNeon } from "haus/appearance.js";
import {
  layerOn, markRoom, paintWindow, roomAt, rooms, setLayer,
} from "haus/neon.js";
import { showUpTo } from "haus/filter.js";
import { entitiesOf, windowState } from "haus/readings.js";
import { enter, walking, walkStoreySel } from "haus/walk.js";

const STOREYS = ["Dachgeschoss", "Erdgeschoss", "Kellergeschoss"];
const LAYERS = [["raeume", "Räume"], ["technik", "Haustechnik"],
                ["moebel", "Möbel"], ["dach", "Dach"]];
const KEY = "housemodel.neon";

const toggle = document.getElementById("neonToggle");
const hud = document.getElementById("hud");
const storeyNav = document.getElementById("hudStoreys");
const roomNav = document.getElementById("hudRooms");
const layerNav = document.getElementById("hudLayers");
const cardBox = document.getElementById("hudCards");
const lineBox = document.getElementById("hudLines");
const roomPanel = document.getElementById("hudRoom");

const quiet = matchMedia("(prefers-reduced-motion: reduce)");
const number = (v, digits = 1) => v.toLocaleString("de-DE", {
  minimumFractionDigits: digits, maximumFractionDigits: digits });
const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;

let storey = null, room = null;
let cards = [];
let contents = new Map();    // room or storey -> { windows, heaters, ... }

// ------------------------------------------------------------ Contents
const blank = () => ({ windows: [], heaters: 0, outlets: 0, lamps: 0, sensors: [] });

// Which room holds what is not in the model, it follows from where things
// are: `roomAt` against the outlines.
function countContents() {
  contents = new Map();
  for (const s of STOREYS) contents.set(s, blank());
  for (const r of rooms) contents.set(r, blank());
  for (const [gid, meshes] of byGid) {
    const m = meta[gid];
    if (!m) continue;
    const box = new THREE.Box3();
    meshes.forEach((mesh) => box.expandByObject(mesh));
    const inRoom = roomAt(box.getCenter(new THREE.Vector3()), m.geschoss);
    for (const c of [contents.get(m.geschoss), contents.get(inRoom)]) {
      if (!c) continue;
      if (m.typ === "IfcWindow") c.windows.push(gid);
      else if (m.typ === "IfcSpaceHeater") c.heaters++;
      else if (m.typ === "IfcOutlet") c.outlets++;
      else if (m.typ === "IfcLightFixture") c.lamps++;
      if (entitiesOf(gid).length) c.sensors.push(gid);
    }
  }
}

function liveValue(c, role) {
  for (const gid of c.sensors) {
    const entity = Object.fromEntries(entitiesOf(gid))[role];
    const r = readings.get(entity);
    if (r) return `${String(r.value).replace(".", ",")} ${r.unit}`.trim();
  }
  return null;
}

function openWindows(c) {
  return c.windows.filter((gid) => {
    const s = windowState(gid);
    return s === "open" || s === "tilted";
  }).length;
}

function storeySummary(name) {
  const c = contents.get(name) ?? blank();
  const here = rooms.filter((r) => r.storey === name);
  const open = openWindows(c);
  return [
    counted(here.length, "Raum", "Räume"),
    `${number(here.reduce((sum, r) => sum + r.area, 0))} m²`,
    open ? `${open} offen` : counted(c.windows.length, "Fenster", "Fenster"),
  ].join(" · ");
}

// ------------------------------------------------------------ Cards
function clearCards() {
  cardBox.replaceChildren();
  lineBox.replaceChildren();
  cards = [];
}

function addCard({ anchor, title, text, onClick, offset = null }) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = offset ? "hud-card" : "hud-chip";
  const head = document.createElement("strong");
  head.textContent = title;
  el.append(head);
  const body = document.createElement("span");
  el.append(body);
  body.textContent = text;
  el.onclick = onClick;
  cardBox.append(el);
  let leader = null;
  if (offset) {
    leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
    lineBox.append(leader);
  }
  const card = { el, body, anchor, offset, leader };
  cards.push(card);
  return card;
}

function storeyAnchor(name) {
  const here = rooms.filter((r) => r.storey === name);
  const center = bbox.getCenter(new THREE.Vector3());
  return new THREE.Vector3(bbox.max.x, here[0].floor + 1.2, center.z);
}

function showCards() {
  clearCards();
  if (!storey) {
    STOREYS.filter((s) => rooms.some((r) => r.storey === s)).forEach((s, i) => {
      addCard({
        anchor: storeyAnchor(s),
        title: s,
        text: storeySummary(s),
        offset: [90, 20 + i * 12],
        onClick: () => goStorey(s),
      });
    });
    return;
  }
  for (const r of rooms) {
    if (r.storey !== storey || r === room) continue;
    const temperature = liveValue(contents.get(r) ?? blank(), "Temperatur");
    addCard({
      anchor: r.center.clone().setY(r.floor + 1.0),
      title: r.name,
      text: temperature ?? `${number(r.area)} m²`,
      onClick: () => goRoom(r),
    });
  }
}

function showRoomPanel() {
  roomPanel.hidden = !room;
  markRoom(room);
  if (!room) return;
  const c = contents.get(room) ?? blank();
  const rows = [
    ["Fläche", `${number(room.area, 2)} m²`],
    ["Raumhöhe", `${number(room.height, 2)} m`],
  ];
  const temperature = liveValue(c, "Temperatur");
  const humidity = liveValue(c, "Feuchte");
  if (temperature) rows.push(["Temperatur", temperature]);
  if (humidity) rows.push(["Feuchte", humidity]);
  const open = openWindows(c);
  rows.push(["Fenster", open ? `${c.windows.length}, ${open} offen`
                             : String(c.windows.length)]);
  rows.push(["Heizkörper", String(c.heaters)]);
  rows.push(["Steckdosen", String(c.outlets)]);
  if (c.lamps) rows.push(["Leuchten", String(c.lamps)]);

  const title = document.createElement("h3");
  title.textContent = room.name;
  const tag = document.createElement("p");
  tag.textContent = room.short;
  const list = document.createElement("dl");
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    list.append(dt, dd);
  }
  roomPanel.replaceChildren(title, tag, list);
}

function refreshValues() {
  for (const [gid, meshes] of byGid) {
    const state = windowState(gid);
    if (state) meshes.forEach((mesh) => paintWindow(mesh, state));
  }
  if (neon) { showCards(); showRoomPanel(); }
}

// ------------------------------------------------------------ Pills
function pill(label, active, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "hud-pill";
  b.textContent = label;
  b.setAttribute("aria-pressed", String(active));
  b.onclick = onClick;
  return b;
}

function renderPills() {
  const present = STOREYS.filter((s) => rooms.some((r) => r.storey === s));
  storeyNav.replaceChildren(
    pill("Alle Etagen", !storey, () => goStorey(null)),
    ...present.map((s) => pill(s, storey === s, () => goStorey(s))));
  roomNav.replaceChildren(...(storey ? rooms : [])
    .filter((r) => r.storey === storey)
    .map((r) => pill(r.name, room === r, () => goRoom(r))));
  roomNav.hidden = !storey;
  layerNav.replaceChildren(...LAYERS.map(([key, label]) =>
    pill(label, layerOn(key), () => {
      setLayer(key, !layerOn(key));
      renderPills();
    })));
}

// ------------------------------------------------------------ Flights
let flight = null;

function flyTo({ position, target, clip }) {
  const start = {
    position: camera.position.clone(),
    target: controls.target.clone(),
    clip: parseFloat(clipInput.value),
  };
  if (quiet.matches) {
    camera.position.copy(position);
    controls.target.copy(target);
    clipInput.value = clip;
    applyClip();
    controls.update();
    return;
  }
  flight = { start, position, target, clip, t: 0 };
}

function runFlight(dt) {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / 0.9);
  const e = 1 - (1 - flight.t) ** 3;
  camera.position.lerpVectors(flight.start.position, flight.position, e);
  controls.target.lerpVectors(flight.start.target, flight.target, e);
  clipInput.value = THREE.MathUtils.lerp(flight.start.clip, flight.clip, e);
  applyClip();
  if (flight.t >= 1) flight = null;
}

// Above the viewing direction the camera already has: a flight should feel
// like leaning in, not like being carried around the house.
function viewFrom(target, distance, elevation = 0.95) {
  const flat = camera.position.clone().sub(controls.target).setY(0);
  if (flat.lengthSq() < 1e-6) flat.set(1, 0, 1);
  flat.normalize().multiplyScalar(Math.cos(elevation) * distance);
  return target.clone().add(flat).setY(target.y + Math.sin(elevation) * distance);
}

function storeyTop(name) {
  // The storeys below end where the next one is hidden. The top storey has no
  // slab of its own to stop at, so the section cuts through it at 2.15 m -
  // lower would decapitate the doors, higher leaves the roof over the rooms.
  const floor = Math.min(...rooms.filter((r) => r.storey === name)
    .map((r) => r.floor));
  return name === STOREYS[0] ? floor + 2.15 : parseFloat(clipInput.max);
}

export function goStorey(name) {
  storey = name;
  room = null;
  showUpTo(name);
  if (name) {
    const here = rooms.filter((r) => r.storey === name);
    const box = new THREE.Box3();
    here.forEach((r) => r.outline.forEach(([x, y]) =>
      box.expandByPoint(new THREE.Vector3(x, r.floor, -y))));
    const target = box.getCenter(new THREE.Vector3());
    const span = box.getSize(new THREE.Vector3()).length();
    flyTo({ position: viewFrom(target, span * 1.5), target,
            clip: storeyTop(name) });
  } else {
    const size = bbox.getSize(new THREE.Vector3()).length();
    const target = bbox.getCenter(new THREE.Vector3());
    flyTo({ position: viewFrom(target, size * 1.15, 0.62), target,
            clip: parseFloat(clipInput.max) });
  }
  renderPills();
  showCards();
  showRoomPanel();
}

function goRoom(r) {
  if (storey !== r.storey) goStorey(r.storey);
  room = r;
  const span = Math.max(...r.outline.map(([x, y]) =>
    Math.hypot(x - r.center.x, y + r.center.z)));
  flyTo({ position: viewFrom(r.center, Math.max(span * 3, 6), 1.05),
          target: r.center.clone(), clip: storeyTop(r.storey) });
  renderPills();
  showCards();
  showRoomPanel();
}

// ------------------------------------------------------------ Every frame
const projected = new THREE.Vector3();

function placeCards() {
  const w = main.clientWidth, h = main.clientHeight;
  for (const card of cards) {
    projected.copy(card.anchor).project(camera);
    const x = (projected.x + 1) / 2 * w;
    const y = (1 - projected.y) / 2 * h;
    const seen = projected.z < 1 && x > -40 && x < w + 40 && y > 0 && y < h;
    card.el.style.visibility = seen ? "visible" : "hidden";
    if (!seen) { card.leader?.setAttribute("x1", -9); continue; }
    if (!card.offset) {
      card.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      continue;
    }
    const cw = card.el.offsetWidth, ch = card.el.offsetHeight;
    const px = Math.min(x + card.offset[0], w - cw - 12);
    const py = Math.min(y + card.offset[1] - ch / 2, h - ch - 70);
    card.el.style.transform = `translate(${px}px,${py}px)`;
    card.leader.setAttribute("x1", x);
    card.leader.setAttribute("y1", y);
    card.leader.setAttribute("x2", px);
    card.leader.setAttribute("y2", py + ch / 2);
  }
}

let wasWalking = false;

export function updateHud(dt) {
  if (!neon) return;
  runFlight(dt);
  placeCards();
}

// ------------------------------------------------------------ Modes
// The sprite labels of the other views would only compete with the cards.
function syncLabels() {
  wallLabels.visible = !neon && document.getElementById("labels").checked;
  roomLabels.visible = !neon && document.getElementById("roomNames").checked;
  deviceLabels.visible = !neon && document.getElementById("readings").checked;
}

export function setNeonMode(on) {
  setNeon(on);
  document.body.classList.toggle("neon", on);
  hud.hidden = !on;
  toggle.textContent = on ? "Klassisch" : "Neon";
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  syncLabels();
  if (on) {
    refreshValues();
  } else {
    flight = null;
    markRoom(null);
  }
}

/** A model was installed: rooms, contents and pills start over. */
export function refreshHud() {
  storey = null;
  room = null;
  flight = null;
  if (neon) {
    countAll();
    syncLabels();
  }
}

function countAll() {
  countContents();
  renderPills();
  refreshValues();
}

export function startHud() {
  toggle.onclick = () => {
    setNeonMode(!neon);
    if (neon) countAll();
  };
  document.getElementById("hudWalk").onclick = () => {
    if (storey) walkStoreySel.value = storey;
    enter();
  };
  // The tilt of the camera wins over a flight still under way.
  main.addEventListener("pointerdown", (e) => {
    if (e.target.tagName === "CANVAS") flight = null;
  });
  // readings.js has stored the values by the time this listener runs.
  addEventListener("message", () => refreshValues());
  // Walking leaves the HUD behind: one looks at the rooms, not at the cards.
  setInterval(() => {
    if (walking !== wasWalking) {
      wasWalking = walking;
      document.body.classList.toggle("walking", walking);
    }
  }, 200);

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch {}
  if (location.hash === "#neon" || (stored === "on" && location.hash !== "#klassisch")) {
    setNeonMode(true);
  }
}
