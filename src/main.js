import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CAMPUS, GROUPS, ENTRIES, ROADS, ZONES, TREE_ZONES, BOUNDS, S, X, Z, FLOOR_H } from './data.js';

/* =====================================================================
   Helpers
   ===================================================================== */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const { clamp, lerp } = THREE.MathUtils;
const hexCss = (n) => '#' + new THREE.Color(n).getHexString();
const isPhone = () => window.innerWidth <= 820;

/* =====================================================================
   World + data preprocessing (screenshot pixels -> metres)
   ===================================================================== */
const WB = { minX: X(BOUNDS.x1), maxX: X(BOUNDS.x2), minZ: Z(BOUNDS.y1), maxZ: Z(BOUNDS.y2) };
const WCX = (WB.minX + WB.maxX) / 2;
const WCZ = (WB.minZ + WB.maxZ) / 2;

const toRect = ([x1, y1, x2, y2]) => ({
  x: X((x1 + x2) / 2), z: Z((y1 + y2) / 2), w: (x2 - x1) * S, d: (y2 - y1) * S,
});

const entries = ENTRIES.map((e) => {
  const rects = e.rects.map(toRect);
  const minX = Math.min(...rects.map((r) => r.x - r.w / 2));
  const maxX = Math.max(...rects.map((r) => r.x + r.w / 2));
  const minZ = Math.min(...rects.map((r) => r.z - r.d / 2));
  const maxZ = Math.max(...rects.map((r) => r.z + r.d / 2));
  return {
    ...e,
    rects,
    inner: e.inner ? toRect(e.inner) : null,
    color: e.color ?? 0xdddddd,
    height: e.height ?? (e.floors ? e.floors * FLOOR_H : 1),
    cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, bw: maxX - minX, bd: maxZ - minZ,
  };
});
const byId = new Map(entries.map((e) => [e.id, e]));
const groupName = new Map(GROUPS.map((g) => [g.id, g.name]));

const roads = ROADS.map((r) => ({
  ...r,
  width: r.w * S,
  pts: r.pts.map(([px, py]) => new THREE.Vector2(X(px), Z(py))),
}));

/* =====================================================================
   Renderer, scene, camera, controls
   ===================================================================== */
const appEl = $('#app');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
appEl.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'label-layer';
appEl.appendChild(labelRenderer.domElement);

const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

const scene = new THREE.Scene();
const skyDay = new THREE.Color(0x9fd4ff);
const skyNight = new THREE.Color(0x070b1a);
scene.background = skyDay.clone();
scene.fog = new THREE.Fog(0x9fd4ff, 750, 2400);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 4500);

const overviewView = () => {
  const aspect = window.innerWidth / window.innerHeight;
  const k = Math.max(1, 0.72 / aspect);
  const target = new THREE.Vector3(WCX + 4, 0, WCZ + 6);
  return { target, pos: target.clone().add(new THREE.Vector3(60, 430, 300).multiplyScalar(k)) };
};

// The tour (and the home view) start at the main gate and end at the first junction inside it
const gateEntry = byId.get('gate');
const junctionEntry = byId.get('diversion');
const GATE = new THREE.Vector3(gateEntry.cx, 0, gateEntry.cz);
const JUNC = new THREE.Vector3(junctionEntry.cx, 0, junctionEntry.cz);
const off = (base, x, y, z) => new THREE.Vector3(base.x + x, y, base.z + z);
const gateView = () => ({ pos: off(GATE, -30, 9, 11), target: off(GATE, 2, 4, 0) });
const homeView = gateView;
const tourCam = new THREE.CatmullRomCurve3(
  [off(GATE, -30, 9, 11), off(GATE, 6, 4.6, 3.4), off(JUNC, -24, 5.2, 3.2), off(JUNC, -20, 20, 24)], false, 'centripetal');
const tourLook = new THREE.CatmullRomCurve3(
  [off(GATE, 2, 4, 0), off(GATE, 40, 2, -0.5), off(JUNC, 6, 1.8, -0.5), off(JUNC, 0, 0, 0)], false, 'centripetal');
const TOUR_DUR = 16;

camera.position.copy(overviewView().pos);

const hintEl = $('#hint');

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 14;
controls.maxDistance = 1300;
controls.maxPolarAngle = Math.PI / 2.08;
controls.screenSpacePanning = false;
controls.target.copy(homeView().target);

/* ---------- Lights ---------- */
const hemi = new THREE.HemisphereLight(0xdff1ff, 0x4a5a3a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
const SUN_OFFSET = new THREE.Vector3(150, 240, 110);
sun.castShadow = true;
sun.shadow.mapSize.set(isPhone() ? 2048 : 4096, isPhone() ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 900 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
let shadowHalf = 150;

const nightMats = [];
const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffe3a0, emissiveIntensity: 0 });
const pickables = [];
const pulsers = [];

/* =====================================================================
   Terrain (painted canvas) + roads
   ===================================================================== */
const BASE = '#6a8f4c';
const TM = 70; // terrain margin (m)
const T = { minX: WB.minX - TM, maxX: WB.maxX + TM, minZ: WB.minZ - TM, maxZ: WB.maxZ + TM };
T.w = T.maxX - T.minX; T.h = T.maxZ - T.minZ;
const TN = 2048;
const tcx = (xm) => ((xm - T.minX) / T.w) * TN;
const tcz = (zm) => ((zm - T.minZ) / T.h) * TN;

function canvasRectFromPx([x1, y1, x2, y2]) {
  const a = tcx(X(x1)), b = tcz(Z(y1)), c = tcx(X(x2)), d = tcz(Z(y2));
  return [a, b, c - a, d - b];
}

function makeTerrainTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TN;
  const c = cv.getContext('2d');
  c.fillStyle = BASE; c.fillRect(0, 0, TN, TN);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = rand() < 0.5 ? 'rgba(130,170,80,0.10)' : 'rgba(60,95,50,0.10)';
    c.beginPath(); c.arc(rand() * TN, rand() * TN, 10 + rand() * 60, 0, 6.283); c.fill();
  }
  ZONES.forEach((z) => {
    const [x, y, w, h] = canvasRectFromPx(z.rect);
    c.save();
    c.shadowColor = z.color; c.shadowBlur = z.type === 'forest' ? 60 : 18;
    c.fillStyle = z.color; c.fillRect(x, y, w, h);
    c.restore();
    if (z.type === 'field') {
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
      for (let yy = y + 8; yy < y + h; yy += 14) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    }
    for (let i = 0; i < Math.max(30, (w * h) / 4000); i++) {
      c.fillStyle = z.type === 'dirt' ? (rand() < 0.5 ? 'rgba(255,240,200,0.12)' : 'rgba(120,90,50,0.12)')
        : 'rgba(0,0,0,0.07)';
      c.beginPath(); c.arc(x + rand() * w, y + rand() * h, 4 + rand() * 18, 0, 6.283); c.fill();
    }
  });
  // feather the texture edges into the plain ground so there is no visible seam
  const F = 190;
  [[0, 0, TN, 0, 0, F, TN, F], [0, TN, TN, TN, 0, TN - F, TN, F], [0, 0, 0, TN, 0, 0, F, TN], [TN, 0, TN, TN, TN - F, 0, F, TN]].forEach(([gx1, gy1, gx2, gy2, rx, ry, rw, rh], i) => {
    const horizontal = i < 2;
    const g = horizontal
      ? c.createLinearGradient(0, i === 0 ? 0 : TN, 0, i === 0 ? F : TN - F)
      : c.createLinearGradient(i === 2 ? 0 : TN, 0, i === 2 ? F : TN - F, 0);
    g.addColorStop(0, BASE); g.addColorStop(1, 'rgba(106,143,76,0)');
    c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

const baseGround = new THREE.Mesh(
  new THREE.PlaneGeometry(7000, 7000),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(BASE), roughness: 1 })
);
baseGround.rotation.x = -Math.PI / 2;
baseGround.position.y = -0.05;
baseGround.receiveShadow = true;
scene.add(baseGround);

const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(T.w, T.h),
  new THREE.MeshStandardMaterial({ map: makeTerrainTexture(), roughness: 1 })
);
terrain.rotation.x = -Math.PI / 2;
terrain.position.set((T.minX + T.maxX) / 2, 0, (T.minZ + T.maxZ) / 2);
terrain.receiveShadow = true;
scene.add(terrain);

/* ---------- Roads ---------- */
function makeRoadTexture(kind) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#41454c'; c.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 500; i++) {
    c.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
    c.fillRect(rand() * 256, rand() * 64, 2, 2);
  }
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(0, 3, 256, 2); c.fillRect(0, 59, 256, 2);
  if (kind === 'main') {
    c.fillStyle = '#f2d04b';
    for (let x = 0; x < 256; x += 64) c.fillRect(x + 6, 30, 36, 4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}
const roadTex = { main: makeRoadTexture('main'), road: makeRoadTexture('road') };
const roadJointMat = new THREE.MeshStandardMaterial({ color: 0x41454c, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

roads.forEach((r, ri) => {
  const y = 0.1 + ri * 0.012;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const dx = b.x - a.x, dz = b.y - a.y;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const tex = roadTex[r.kind].clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / (r.kind === 'main' ? 16 : 12), 1);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, r.width),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI / 2, Math.atan2(-dz, dx), 0);
    mesh.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (let i = 1; i < r.pts.length - 1; i++) {
    const j = new THREE.Mesh(new THREE.CircleGeometry(r.width / 2, 20), roadJointMat);
    j.rotation.x = -Math.PI / 2;
    j.position.set(r.pts[i].x, y + 0.002, r.pts[i].y);
    j.receiveShadow = true;
    scene.add(j);
  }
});

function distToRoad(x, z) {
  let best = Infinity;
  roads.forEach((r) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const abx = b.x - a.x, abz = b.y - a.y;
      const t = clamp(((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz || 1), 0, 1);
      const d = Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t)) - r.width / 2;
      if (d < best) best = d;
    }
  });
  return best;
}

/* =====================================================================
   Buildings
   ===================================================================== */
function wallTextures(colorHex, cols, rows) {
  const cw = 48, ch = 56;
  const cv = document.createElement('canvas');
  cv.width = cols * cw; cv.height = rows * ch;
  const ev = document.createElement('canvas');
  ev.width = cv.width; ev.height = cv.height;
  const c = cv.getContext('2d');
  const e = ev.getContext('2d');
  c.fillStyle = hexCss(colorHex); c.fillRect(0, 0, cv.width, cv.height);
  e.fillStyle = '#000'; e.fillRect(0, 0, ev.width, ev.height);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw, y = j * ch;
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, y + ch - 3, cw, 3);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x + 9, y + 12, 30, 32);
      const g = c.createLinearGradient(0, y + 14, 0, y + 42);
      g.addColorStop(0, '#6f97c4'); g.addColorStop(1, '#243a58');
      c.fillStyle = g; c.fillRect(x + 11, y + 14, 26, 28);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x + 23, y + 14, 2, 28);
      if (rand() < 0.55) {
        e.fillStyle = rand() < 0.5 ? '#ffd98a' : '#fff0c4';
        e.fillRect(x + 11, y + 14, 26, 28);
      }
    }
  }
  const mk = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  return { map: mk(cv), emissiveMap: mk(ev) };
}

function makeSolarTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#b9bcc2'; c.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const x = i * 32 + 2, y = j * 32 + 2;
      const g = c.createLinearGradient(x, y, x + 28, y + 28);
      g.addColorStop(0, '#27447a'); g.addColorStop(1, '#14213d');
      c.fillStyle = g; c.fillRect(x, y, 28, 28);
      c.strokeStyle = 'rgba(190,210,235,0.45)'; c.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        c.beginPath(); c.moveTo(x + k * 7, y); c.lineTo(x + k * 7, y + 28); c.stroke();
        c.beginPath(); c.moveTo(x, y + k * 7); c.lineTo(x + 28, y + k * 7); c.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}
const solarTexBase = makeSolarTexture();
function solarMat(w, d) {
  const t = solarTexBase.clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(1, w / 9), Math.max(1, d / 9));
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.25 });
}

const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.95 });
const parapetMat = new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 0.95 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2d28, roughness: 0.7 });
const canopyMat = new THREE.MeshStandardMaterial({ color: 0x575b63, roughness: 0.8 });
const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.7 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.6 });
const plazaMat = new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 1 });

function addMesh(parent, geo, mat, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  if (opts.id) { m.userData.id = opts.id; pickables.push(m); }
  parent.add(m);
  return m;
}

function buildBox(e, r, { entrance = true } = {}) {
  const g = new THREE.Group();
  g.position.set(r.x, 0, r.z);
  scene.add(g);
  const h = e.height;

  const colsX = Math.max(2, Math.round(r.d / 3.4));
  const colsZ = Math.max(2, Math.round(r.w / 3.4));
  const mkMat = (t) => {
    const m = new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85,
    });
    nightMats.push(m);
    return m;
  };
  const mx = mkMat(wallTextures(e.color, colsX, e.floors));
  const mz = mkMat(wallTextures(e.color, colsZ, e.floors));
  const top = e.solar ? solarMat(r.w, r.d) : roofMat;

  addMesh(g, new THREE.BoxGeometry(r.w, h, r.d), [mx, mx, top, roofMat, mz, mz], 0, h / 2, 0, { id: e.id });

  // parapet frame
  const t = 0.35;
  addMesh(g, new THREE.BoxGeometry(r.w + 0.4, 0.7, t), parapetMat, 0, h + 0.35, r.d / 2 - t / 2 + 0.2, { cast: false });
  addMesh(g, new THREE.BoxGeometry(r.w + 0.4, 0.7, t), parapetMat, 0, h + 0.35, -r.d / 2 + t / 2 - 0.2, { cast: false });
  addMesh(g, new THREE.BoxGeometry(t, 0.7, r.d + 0.4), parapetMat, r.w / 2 - t / 2 + 0.2, h + 0.35, 0, { cast: false });
  addMesh(g, new THREE.BoxGeometry(t, 0.7, r.d + 0.4), parapetMat, -r.w / 2 + t / 2 - 0.2, h + 0.35, 0, { cast: false });

  // rooftop details
  if (r.w >= 14 && r.d >= 12) {
    addMesh(g, new THREE.CylinderGeometry(1, 1, 1.6, 16), tankMat, -r.w * 0.3, h + 1.4, -r.d * 0.15);
    addMesh(g, new THREE.BoxGeometry(2.6, 1.8, 2.6), roofMat, r.w * 0.3, h + 1.5, -r.d * 0.1);
  }

  // entrance on the south face
  if (entrance) {
    const fz = r.d / 2;
    addMesh(g, new THREE.BoxGeometry(2.4, 2.5, 0.2), doorMat, 0, 1.25, fz + 0.05, { id: e.id });
    addMesh(g, new THREE.BoxGeometry(5.2, 0.3, 2.6), canopyMat, 0, 3.1, fz + 1.2, { id: e.id });
    addMesh(g, new THREE.CylinderGeometry(0.16, 0.16, 3.1, 10), pillarMat, -2.3, 1.55, fz + 2.3);
    addMesh(g, new THREE.CylinderGeometry(0.16, 0.16, 3.1, 10), pillarMat, 2.3, 1.55, fz + 2.3);
  }
  return g;
}

function addPlaza(r) {
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 6, r.d + 6), plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(r.x, 0.06, r.z + 1.5);
  plaza.receiveShadow = true;
  scene.add(plaza);
}

function addBlock(e) {
  addPlaza(e.rects[0]);
  buildBox(e, e.rects[0]);
}

function addCourtyard(e) {
  const o = e.rects[0], i = e.inner;
  addPlaza(o);
  const x1 = o.x - o.w / 2, x2 = o.x + o.w / 2, z1 = o.z - o.d / 2, z2 = o.z + o.d / 2;
  const ix1 = i.x - i.w / 2, ix2 = i.x + i.w / 2, iz1 = i.z - i.d / 2, iz2 = i.z + i.d / 2;
  const wings = [
    { a: x1, b: z1, c: x2, d: iz1, front: false },
    { a: x1, b: iz2, c: x2, d: z2, front: true },
    { a: x1, b: iz1, c: ix1, d: iz2, front: false },
    { a: ix2, b: iz1, c: x2, d: iz2, front: false },
  ];
  wings.forEach((w) =>
    buildBox(e, { x: (w.a + w.c) / 2, z: (w.b + w.d) / 2, w: w.c - w.a, d: w.d - w.b }, { entrance: w.front })
  );
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(i.w, i.d), new THREE.MeshStandardMaterial({ color: 0x4f9a46, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(i.x, 0.1, i.z);
  lawn.receiveShadow = true;
  lawn.userData.id = e.id; pickables.push(lawn);
  scene.add(lawn);
}

function addShed(e) {
  e.rects.forEach((r, k) => {
    const g = new THREE.Group();
    g.position.set(r.x, 0, r.z);
    scene.add(g);
    const wallH = e.height - 1.8;
    addMesh(g, new THREE.BoxGeometry(r.w, wallH, r.d), new THREE.MeshStandardMaterial({ color: e.color, roughness: 0.8 }), 0, wallH / 2, 0, { id: e.id });
    const rise = 1.8;
    const shape = new THREE.Shape();
    shape.moveTo(-r.d / 2 - 0.3, 0); shape.lineTo(r.d / 2 + 0.3, 0); shape.lineTo(0, rise); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: r.w + 0.6, bevelEnabled: false });
    geo.translate(0, 0, -(r.w + 0.6) / 2);
    geo.rotateY(Math.PI / 2);
    const roofColor = [0x7f95ad, 0xaab4c0, 0x8da0b3][k % 3];
    addMesh(g, geo, new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.6, metalness: 0.2 }), 0, wallH, 0, { id: e.id });
  });
}

/* ---------- Sports ground, court, tank ---------- */
function groundTexture() {
  const W = 1024, H = 900;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#c4a678'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    const p = rand();
    c.fillStyle = p < 0.35 ? 'rgba(255,240,205,0.10)' : p < 0.7 ? 'rgba(110,80,45,0.10)' : 'rgba(120,130,60,0.09)';
    c.beginPath(); c.arc(rand() * W, rand() * H, 6 + rand() * 36, 0, 6.283); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

function flatPick(e, geo, mat, r, y) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(r.x, y, r.z);
  m.receiveShadow = true;
  m.userData.id = e.id;
  pickables.push(m);
  scene.add(m);
  return m;
}

function addGround(e) {
  const r = e.rects[0];
  flatPick(e, new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }), r, 0.12);
}

function addCourt(e) {
  const r = e.rects[0];
  const W = 256, H = Math.round(256 * (r.d / r.w));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#2f7c8f'; c.fillRect(0, 0, W, H);
  const m = 16;
  c.fillStyle = '#c4553a'; c.fillRect(m, m, W - 2 * m, H - 2 * m);
  c.strokeStyle = '#fff'; c.lineWidth = 3;
  c.strokeRect(m, m, W - 2 * m, H - 2 * m);
  c.beginPath(); c.moveTo(m, H / 2); c.lineTo(W - m, H / 2); c.stroke();
  c.beginPath(); c.arc(W / 2, H / 2, 28, 0, 6.283); c.stroke();
  c.strokeRect(W / 2 - 34, m, 68, 80);
  c.strokeRect(W / 2 - 34, H - m - 80, 68, 80);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  flatPick(e, new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), r, 0.2);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x555a62, roughness: 0.5, metalness: 0.4 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  [-1, 1].forEach((s) => {
    const z = r.z + s * (r.d / 2 - 1.6);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8), poleMat);
    pole.position.set(r.x, 1.6, z + s * 0.6); pole.castShadow = true; scene.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.08), boardMat);
    board.position.set(r.x, 3.1, z); board.castShadow = true; scene.add(board);
  });
}

function addFootball(e) {
  const r = e.rects[0];
  const W = 256, H = Math.round(256 * (r.d / r.w));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#2e8b3d'; c.fillRect(0, 0, W, H);
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    c.fillStyle = i % 2 ? '#339a44' : '#2a8238';
    c.fillRect(0, (i * H) / stripes, W, H / stripes + 1);
  }
  const m = 10;
  c.strokeStyle = '#fff'; c.lineWidth = 3;
  c.strokeRect(m, m, W - 2 * m, H - 2 * m);
  c.beginPath(); c.moveTo(m, H / 2); c.lineTo(W - m, H / 2); c.stroke();
  c.beginPath(); c.arc(W / 2, H / 2, 26, 0, 6.283); c.stroke();
  c.strokeRect(W / 2 - 52, m, 104, 44);
  c.strokeRect(W / 2 - 52, H - m - 44, 104, 44);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  flatPick(e, new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), r, 0.2);

  const goalMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });
  [-1, 1].forEach((sgn) => {
    const z = r.z + sgn * (r.d / 2 - 0.3);
    [-1.8, 1.8].forEach((dx) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), goalMat);
      post.position.set(r.x + dx, 1.1, z); post.castShadow = true; scene.add(post);
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.1, 0.1), goalMat);
    bar.position.set(r.x, 2.2, z); bar.castShadow = true; scene.add(bar);
  });
  // thin fence so it reads as an enclosed court
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.6, transparent: true, opacity: 0.45 });
  [[0, r.d / 2 + 0.6, r.w + 1.2, 0.1], [0, -r.d / 2 - 0.6, r.w + 1.2, 0.1]].forEach(([dx, dz, w, d]) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), fenceMat);
    f.position.set(r.x + dx, 1.2, r.z + dz); scene.add(f);
  });
  [[r.w / 2 + 0.6], [-r.w / 2 - 0.6]].forEach(([dx]) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, r.d + 1.2), fenceMat);
    f.position.set(r.x + dx, 1.2, r.z); scene.add(f);
  });
}

function signTexture(text, bg, fg, border) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 192;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, 1024, 192);
  c.strokeStyle = border; c.lineWidth = 8; c.strokeRect(8, 8, 1008, 176);
  let size = 96;
  c.font = `bold ${size}px sans-serif`;
  while (c.measureText(text).width > 940 && size > 20) { size -= 2; c.font = `bold ${size}px sans-serif`; }
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 512, 100);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

function addCafe(e) {
  const r = e.rects[0];
  const g = new THREE.Group();
  g.position.set(r.x, 0, r.z);
  scene.add(g);
  const h = e.height;
  addPlaza(r);
  addMesh(g, new THREE.BoxGeometry(r.w, h, r.d), new THREE.MeshStandardMaterial({ color: e.color, roughness: 0.8 }), 0, h / 2, 0, { id: e.id });
  addMesh(g, new THREE.BoxGeometry(r.w + 1.2, 0.5, r.d + 1.2), new THREE.MeshStandardMaterial({ color: 0x8a4b2a, roughness: 0.8 }), 0, h + 0.25, 0, { id: e.id });
  // glass front + awning
  const fz = r.d / 2;
  addMesh(g, new THREE.BoxGeometry(r.w * 0.7, 2.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x24384f, roughness: 0.2, metalness: 0.5 }), 0, 1.6, fz + 0.06, { id: e.id });
  const awn = addMesh(g, new THREE.BoxGeometry(r.w * 0.9, 0.2, 2.6), new THREE.MeshStandardMaterial({ color: 0xd9482b, roughness: 0.7 }), 0, 3.0, fz + 1.3, { id: e.id });
  awn.rotation.x = 0.18;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 0.8, 1.2), new THREE.MeshBasicMaterial({ map: signTexture('MASKA CAFE', '#3b1d0e', '#ffd9a0', '#ffb54d') }));
  sign.position.set(0, h - 0.2, fz + 0.12);
  g.add(sign);
  // outdoor tables with umbrellas
  const tableMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e9, roughness: 0.6 });
  [[-r.w * 0.28, 1], [0, 1], [r.w * 0.28, 1]].forEach(([dx], i) => {
    const x = dx, z = fz + 4.8;
    addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), tableMat, x, 1.2, z);
    addMesh(g, new THREE.ConeGeometry(1.5, 0.6, 8), new THREE.MeshStandardMaterial({ color: [0xe63946, 0xf4a261, 0x2a9d8f][i], roughness: 0.8 }), x, 2.6, z);
    addMesh(g, new THREE.CylinderGeometry(0.7, 0.7, 0.08, 12), tableMat, x, 0.75, z);
  });
}

function addTemple(e) {
  const r = e.rects[0];
  const g = new THREE.Group();
  g.position.set(r.x, 0, r.z);
  scene.add(g);
  const stone = new THREE.MeshStandardMaterial({ color: 0xece3d3, roughness: 0.9 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xe9c9a0, roughness: 0.85 });
  const terra = new THREE.MeshStandardMaterial({ color: 0xc8553d, roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.3, metalness: 0.8 });

  addMesh(g, new THREE.BoxGeometry(r.w, 0.8, r.d), stone, 0, 0.4, 0, { id: e.id });          // platform
  addMesh(g, new THREE.BoxGeometry(r.w * 0.55, 0.3, 2.2), stone, 0, 0.15, r.d / 2 + 0.8, { id: e.id }); // steps
  const sw = Math.min(r.w, r.d) * 0.5;
  addMesh(g, new THREE.BoxGeometry(sw, 4.2, sw), sand, 0, 0.8 + 2.1, -1, { id: e.id });      // sanctum
  addMesh(g, new THREE.BoxGeometry(sw * 0.38, 2.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a2d28, roughness: 0.7 }), 0, 0.8 + 1.3, -1 + sw / 2 + 0.05, { id: e.id }); // doorway
  // stepped gopuram tower
  let y = 0.8 + 4.2, w = sw * 0.92;
  for (let i = 0; i < 4; i++) {
    const hh = 1.5;
    addMesh(g, new THREE.BoxGeometry(w, hh, w), i % 2 ? sand : terra, 0, y + hh / 2, -1, { id: e.id });
    y += hh; w *= 0.78;
  }
  addMesh(g, new THREE.ConeGeometry(w * 0.8, 1.6, 8), terra, 0, y + 0.8, -1, { id: e.id });
  addMesh(g, new THREE.SphereGeometry(0.32, 10, 8), gold, 0, y + 1.8, -1);
  addMesh(g, new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), gold, 0, y + 2.4, -1);
  // pillars in front
  [-1, 1].forEach((sgn) => addMesh(g, new THREE.CylinderGeometry(0.22, 0.22, 3.2, 10), pillarMat, sgn * sw * 0.42, 0.8 + 1.6, -1 + sw / 2 + 1.4));
  addMesh(g, new THREE.BoxGeometry(sw * 0.95, 0.3, 1.8), sand, 0, 0.8 + 3.3, -1 + sw / 2 + 1.4);
}

function addMarker(e) {
  const r = e.rects[0];
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.4, 48),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(r.x, 0.5, r.z);
  scene.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(4.4, 32),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(r.x, 0.48, r.z);
  disc.userData.id = e.id;
  pickables.push(disc);
  scene.add(disc);
  pulsers.push({ ring });
}

function addGate(e) {
  const r = e.rects[0];
  const g = new THREE.Group();
  g.position.set(r.x, 0, r.z);
  scene.add(g);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.85 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x8b3a2e, roughness: 0.8 });
  const span = 5.8; // the lane runs east–west, so the gate spans north–south
  [-span, span].forEach((z) => {
    addMesh(g, new THREE.BoxGeometry(1.9, 6, 1.9), mat, 0, 3, z, { id: e.id });
    addMesh(g, new THREE.BoxGeometry(2.4, 0.45, 2.4), cap, 0, 6.2, z, { id: e.id });
  });
  addMesh(g, new THREE.BoxGeometry(1.6, 1.5, span * 2 + 1.9), mat, 0, 6.2, 0, { id: e.id });
  const tex = signTexture(CAMPUS.name.toUpperCase(), '#14532d', '#ffffff', '#facc15');
  [1, -1].forEach((sgn) => {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 0.4, 1.25), new THREE.MeshBasicMaterial({ map: tex }));
    sign.rotation.y = sgn * Math.PI / 2;
    sign.position.set(sgn * 0.83, 6.2, 0);
    g.add(sign);
  });
  // security cabin
  addMesh(g, new THREE.BoxGeometry(3.2, 3, 3.2), mat, 0, 1.5, span + 4.2, { id: e.id });
  addMesh(g, new THREE.BoxGeometry(3.8, 0.4, 3.8), cap, 0, 3.2, span + 4.2, { id: e.id });
}

entries.forEach((e) => {
  if (e.kind === 'block') addBlock(e);
  else if (e.kind === 'courtyard') addCourtyard(e);
  else if (e.kind === 'shed') addShed(e);
  else if (e.kind === 'ground') addGround(e);
  else if (e.kind === 'court') addCourt(e);
  else if (e.kind === 'football') addFootball(e);
  else if (e.kind === 'cafe') addCafe(e);
  else if (e.kind === 'temple') addTemple(e);
  else if (e.kind === 'gate') addGate(e);
  else if (e.kind === 'marker') addMarker(e);
});

/* =====================================================================
   Trees
   ===================================================================== */
const solidRects = entries.flatMap((e) => {
  const pad = e.kind === 'gate' ? 12 : e.kind === 'cafe' || e.kind === 'temple' ? 8 : 3;
  return e.rects.map((r) => ({ x1: r.x - r.w / 2 - pad, x2: r.x + r.w / 2 + pad, z1: r.z - r.d / 2 - pad, z2: r.z + r.d / 2 + pad + 3 }));
});
const blockedByBuilding = (x, z) => solidRects.some((b) => x > b.x1 && x < b.x2 && z > b.z1 && z < b.z2);
const blocked = (x, z) => blockedByBuilding(x, z) || distToRoad(x, z) < 2.5;

(function addTrees() {
  const spots = [];
  TREE_ZONES.forEach((zn) => {
    const [x1, y1, x2, y2] = zn.rect;
    const ax = X(x1), bx = X(x2), az = Z(y1), bz = Z(y2);
    const want = Math.round(((bx - ax) * (bz - az) * zn.per100) / 100);
    let made = 0;
    for (let tries = 0; tries < want * 4 && made < want; tries++) {
      const x = lerp(ax, bx, rand()), z = lerp(az, bz, rand());
      if (blocked(x, z)) continue;
      spots.push({ x, z, s: lerp(0.85, 1.6, rand()), r: rand() * 6.28, tall: rand() < 0.2, forest: !!zn.forest });
      made++;
    }
  });

  // a few campus trees along the internal roads
  roads.filter((r) => r.kind === 'road').forEach((r) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const len = a.distanceTo(b);
      const nx = -(b.y - a.y) / len, nz = (b.x - a.x) / len;
      for (let d = 10; d < len - 6; d += 22 + rand() * 12) {
        const side = rand() < 0.5 ? -1 : 1;
        const off = r.width / 2 + 3.5;
        const x = a.x + ((b.x - a.x) * d) / len + nx * off * side;
        const z = a.y + ((b.y - a.y) * d) / len + nz * off * side;
        if (blockedByBuilding(x, z) || distToRoad(x, z) < 2.8) continue;
        spots.push({ x, z, s: lerp(0.8, 1.2, rand()), r: rand() * 6.28, tall: false, forest: false });
      }
    }
  });

  const n = spots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2, 6); trunkGeo.translate(0, 1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 1); crownGeo.translate(0, 4.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }), n);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), n);
  [trunks, crowns].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });

  const d = new THREE.Object3D();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    d.position.set(s.x, 0, s.z);
    d.rotation.y = s.r;
    d.scale.set(s.s, s.s * (s.tall ? 1.5 : 1), s.s);
    d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
    crowns.setMatrixAt(i, d.matrix);
    if (s.forest) col.setHSL(lerp(0.27, 0.36, rand()), lerp(0.4, 0.55, rand()), lerp(0.16, 0.27, rand()));
    else col.setHSL(lerp(0.24, 0.35, rand()), lerp(0.4, 0.6, rand()), lerp(0.25, 0.38, rand()));
    crowns.setColorAt(i, col);
  });
  scene.add(trunks, crowns);
})();

/* =====================================================================
   Lamp posts along internal roads
   ===================================================================== */
(function addLamps() {
  const pos = [];
  roads.filter((r) => r.kind === 'road').forEach((r) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const len = a.distanceTo(b);
      const nx = -(b.y - a.y) / len, nz = (b.x - a.x) / len;
      let side = 1;
      for (let d = 14; d < len - 6; d += 30) {
        side = -side;
        const off = r.width / 2 + 1.1;
        const x = a.x + ((b.x - a.x) * d) / len + nx * off * side;
        const z = a.y + ((b.y - a.y) * d) / len + nz * off * side;
        if (blockedByBuilding(x, z)) continue;
        pos.push([x, z]);
      }
    }
  });
  const poles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.1, 0.14, 5.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.6 }),
    pos.length
  );
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 10, 8), lampMat, pos.length);
  const d = new THREE.Object3D();
  pos.forEach(([x, z], i) => {
    d.position.set(x, 2.6, z); d.updateMatrix(); poles.setMatrixAt(i, d.matrix);
    d.position.set(x, 5.3, z); d.updateMatrix(); bulbs.setMatrixAt(i, d.matrix);
  });
  poles.castShadow = true;
  scene.add(poles, bulbs);
})();

/* =====================================================================
   Sky: clouds, stars, moon
   ===================================================================== */
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
const clouds = [];
for (let i = 0; i < 14; i++) {
  const g = new THREE.Group();
  const puffs = 4 + Math.floor(rand() * 3);
  for (let p = 0; p < puffs; p++) {
    const s = lerp(24, 42, rand());
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), cloudMat);
    m.position.set(p * 32 - puffs * 16, rand() * 8, (rand() - 0.5) * 30);
    m.scale.y = 0.5;
    g.add(m);
  }
  // high above the home camera so they never block the campus
  g.position.set(lerp(-1500, 1500, rand()), lerp(750, 950, rand()), lerp(-1500, 300, rand()));
  g.userData.speed = lerp(6, 12, rand());
  scene.add(g);
  clouds.push(g);
}

const starPos = new Float32Array(1000 * 3);
for (let i = 0; i < 1000; i++) {
  const u = rand() * Math.PI * 2;
  const v = Math.acos(rand() * 0.95 + 0.05);
  const r = 2800;
  starPos[i * 3] = r * Math.sin(v) * Math.cos(u);
  starPos[i * 3 + 1] = r * Math.cos(v);
  starPos[i * 3 + 2] = r * Math.sin(v) * Math.sin(u);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })
);
scene.add(stars);

const moonMat = new THREE.MeshBasicMaterial({ color: 0xf4f1de, transparent: true, opacity: 0, fog: false });
const moon = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), moonMat);
moon.position.set(-1200, 1700, -2000);
scene.add(moon);

/* =====================================================================
   Cars (follow road polylines)
   ===================================================================== */
const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12); wheelGeo.rotateX(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.2, metalness: 0.6 });

function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.7, 1.1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 })
  );
  body.position.y = 0.65; body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.95), glassMat);
  cab.position.set(-0.1, 1.25, 0); cab.castShadow = true;
  g.add(body, cab);
  [[-0.8, -0.5], [-0.8, 0.5], [0.8, -0.5], [0.8, 0.5]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.3, z);
    g.add(w);
  });
  return g;
}

const carColors = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xf1faee, 0x6d597a, 0xffb703, 0x264653];
const cars = [];
function addCar(roadIdx, dir, t0) {
  const r = roads[roadIdx];
  const cum = [0];
  for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + r.pts[i].distanceTo(r.pts[i - 1]));
  const mesh = makeCar(carColors[cars.length % carColors.length]);
  scene.add(mesh);
  cars.push({ mesh, r, cum, total: cum[cum.length - 1], dir, s: t0 * cum[cum.length - 1], speed: lerp(5, 9, rand()), lane: r.width * 0.22 });
}
// road 0 = public road, 1 = upper E–W, 2 = lower E–W, 8 = west road
[[0, 1, 0.1], [0, -1, 0.6], [0, 1, 0.8], [1, 1, 0.2], [1, -1, 0.7], [2, 1, 0.5], [2, -1, 0.1], [8, 1, 0.4], [8, -1, 0.85]].forEach(([i, d, t]) => addCar(i, d, t));

function placeCar(c) {
  let i = 1;
  while (i < c.cum.length - 1 && c.cum[i] < c.s) i++;
  const a = c.r.pts[i - 1], b = c.r.pts[i];
  const seg = c.cum[i] - c.cum[i - 1] || 1;
  const t = clamp((c.s - c.cum[i - 1]) / seg, 0, 1);
  let dx = b.x - a.x, dz = b.y - a.y;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  const fx = dx * c.dir, fz = dz * c.dir;
  const lx = -fz * c.lane * -1, lz = fx * c.lane * -1; // keep to one side of the road
  c.mesh.position.set(a.x + (b.x - a.x) * t + lx, 0.35, a.y + (b.y - a.y) * t + lz);
  c.mesh.rotation.y = Math.atan2(-fz, fx);
}
cars.forEach(placeCar);

/* =====================================================================
   Outlines + labels
   ===================================================================== */
const ACCENT = 0x38bdf8;
entries.forEach((e) => {
  e.outlines = e.rects.map((r) => {
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w + 0.8, e.height + 0.8, r.d + 0.8)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    line.position.set(r.x, e.height / 2, r.z);
    line.visible = false;
    scene.add(line);
    return line;
  });

  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = e.short || e.name;
  const label = new CSS2DObject(el);
  label.position.set(e.cx, e.height + 3, e.cz);
  scene.add(label);
  e.labelEl = el;
  e.labelObj = label;
});

// Big college labels, shown when zoomed out (individual block labels take over when zoomed in)
const groupLabels = [];
GROUPS.filter((g) => g.id !== 'fac').forEach((g) => {
  const list = entries.filter((e) => e.group === g.id);
  if (!list.length) return;
  const el = document.createElement('div');
  el.className = 'label group-label';
  el.textContent = g.short || g.name;
  const obj = new CSS2DObject(el);
  obj.position.set(
    list.reduce((s, e) => s + e.cx, 0) / list.length,
    Math.max(...list.map((e) => e.height)) + 28,
    list.reduce((s, e) => s + e.cz, 0) / list.length
  );
  scene.add(obj);
  groupLabels.push(el);
});
const ZOOM_SWITCH = 380;

/* =====================================================================
   UI: grouped list, search, info panel
   ===================================================================== */
const listEl = $('#list');
const searchEl = $('#search');
const emptyEl = $('#empty');
const infoEl = $('#info');
const sidebarEl = $('#sidebar');
const tooltipEl = $('#tooltip');

$('#brand-name').textContent = CAMPUS.title || CAMPUS.name;
$('#brand-sub').textContent = CAMPUS.tagline || '';
document.title = CAMPUS.title || CAMPUS.name;

function subtitle(e) {
  if (e.kind === 'block' || e.kind === 'courtyard') return `${e.floors} floors`;
  if (e.kind === 'shed') return `${e.rects.length} sheds`;
  if (e.kind === 'ground') return 'Open ground';
  if (e.kind === 'court') return 'Sports';
  if (e.kind === 'football') return 'Sports';
  if (e.kind === 'cafe') return 'Cafe';
  if (e.kind === 'temple') return 'Temple';
  if (e.kind === 'gate') return 'Entrance';
  if (e.kind === 'marker') return 'Junction';
  return '';
}

const groupHeads = new Map();
let lastGroup = null;
entries.forEach((e) => {
  if (e.group !== lastGroup) {
    lastGroup = e.group;
    const head = document.createElement('li');
    head.className = 'group';
    head.textContent = groupName.get(e.group) || e.group;
    listEl.appendChild(head);
    groupHeads.set(e.group, head);
  }
  const li = document.createElement('li');
  li.dataset.id = e.id;
  li.innerHTML = `<span class="swatch" style="background:${hexCss(e.color)}"></span>
    <div><div class="t">${esc(e.short || e.name)}</div><div class="s">${esc(subtitle(e))}</div></div>`;
  li.addEventListener('click', () => select(e.id));
  e.li = li;
  e.haystack = [e.name, e.short, groupName.get(e.group), ...(e.labs || []), ...(e.facilities || [])].join(' ').toLowerCase();
  listEl.appendChild(li);
});

searchEl.addEventListener('input', () => {
  const q = searchEl.value.trim().toLowerCase();
  let shown = 0;
  const groupShown = new Set();
  entries.forEach((e) => {
    const ok = !q || e.haystack.includes(q);
    e.li.style.display = ok ? '' : 'none';
    if (ok) { shown++; groupShown.add(e.group); }
  });
  groupHeads.forEach((head, g) => (head.style.display = groupShown.has(g) ? '' : 'none'));
  emptyEl.classList.toggle('hidden', shown > 0);
});

$('#menu-btn').addEventListener('click', () => sidebarEl.classList.toggle('open'));
if (isPhone()) sidebarEl.classList.remove('open');

function chips(title, arr) {
  if (!arr || !arr.length) return '';
  return `<h3>${title}</h3><div class="chips">${arr.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>`;
}

function renderInfo(e) {
  const stats = [];
  const fp = `${Math.round(e.bw)}×${Math.round(e.bd)}`;
  if (e.kind === 'block' || e.kind === 'courtyard') {
    stats.push([e.floors, 'Floors'], [`${Math.round(e.height)} m`, 'Height'], [fp, 'Footprint (m)']);
  } else if (e.kind === 'shed') {
    stats.push([e.rects.length, 'Sheds'], [`${Math.round(e.height)} m`, 'Height']);
  } else if (e.kind === 'marker') {
    // no size stats for a junction
  } else {
    stats.push([fp, 'Size (m)']);
  }
  infoEl.innerHTML = `
    <div class="bar" style="background:${hexCss(e.color)}"></div>
    <div class="head">
      <h2>${esc(e.name)}</h2>
      <span class="tag">${esc(groupName.get(e.group) || '')}</span>
      <button class="close" aria-label="Close">✕</button>
    </div>
    <div class="body">
      <p class="desc">${esc(e.desc || '')}</p>
      ${stats.length ? `<div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>` : ''}
      ${chips('Labs', e.labs)}
      ${chips('Facilities', e.facilities)}
      <div class="nav"><button data-nav="-1">← Prev</button><button data-nav="1">Next →</button></div>
    </div>`;
  infoEl.scrollTop = 0;
}

infoEl.addEventListener('click', (ev) => {
  if (ev.target.closest('.close')) return deselect();
  const nav = ev.target.closest('[data-nav]');
  if (nav) step(Number(nav.dataset.nav));
});

/* =====================================================================
   Selection / hover
   ===================================================================== */
let selected = null;
let hovered = null;

function refreshHighlights() {
  entries.forEach((e) => {
    const isSel = e === selected;
    e.outlines.forEach((o) => {
      o.visible = isSel || e === hovered;
      o.material.color.setHex(isSel ? ACCENT : 0xffffff);
    });
    e.labelEl.classList.toggle('active', isSel);
    e.li.classList.toggle('active', isSel);
  });
}

function viewFor(e) {
  const target = new THREE.Vector3(e.cx, e.height * 0.45, e.cz);
  const size = Math.max(e.bw, e.bd, e.height);
  const dist = size * 1.2 + 24;
  const dir = new THREE.Vector3(0.55, 0.62, 1).normalize();
  const pos = target.clone().addScaledVector(dir, dist);
  if (isPhone()) target.y -= dist * 0.22; // info sheet covers the lower half on phones
  return { target, pos };
}

function select(id, opts = {}) {
  const e = byId.get(id);
  if (!e) return;
  if (!opts.fromTour) stopTour();
  selected = e;
  renderInfo(e);
  infoEl.classList.remove('hidden');
  infoEl.style.animation = 'none'; void infoEl.offsetWidth; infoEl.style.animation = '';
  refreshHighlights();
  e.li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (isPhone()) sidebarEl.classList.remove('open');
  if (!opts.noFly) {
    const v = viewFor(e);
    flyTo(v.pos, v.target);
  }
}

function deselect() {
  selected = null;
  infoEl.classList.add('hidden');
  refreshHighlights();
}

function step(dir, opts = {}) {
  const idx = selected ? entries.indexOf(selected) : dir > 0 ? -1 : 0;
  const next = (idx + dir + entries.length) % entries.length;
  select(entries[next].id, opts);
}

/* ---------- Picking ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  return hits.length ? hits[0].object.userData.id : null;
}

const canvasEl = renderer.domElement;
canvasEl.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse' || ev.buttons) { tooltipEl.classList.add('hidden'); return; }
  const id = pick(ev);
  const e = id ? byId.get(id) : null;
  if (e !== hovered) { hovered = e; refreshHighlights(); }
  canvasEl.style.cursor = e ? 'pointer' : 'grab';
  if (e) {
    tooltipEl.textContent = e.name;
    tooltipEl.style.left = ev.clientX + 'px';
    tooltipEl.style.top = ev.clientY + 'px';
    tooltipEl.classList.remove('hidden');
  } else tooltipEl.classList.add('hidden');
});
canvasEl.addEventListener('pointerleave', () => {
  tooltipEl.classList.add('hidden');
  if (hovered) { hovered = null; refreshHighlights(); }
});

let down = null;
canvasEl.addEventListener('pointerdown', (ev) => {
  down = { x: ev.clientX, y: ev.clientY, t: performance.now(), button: ev.button };
});
canvasEl.addEventListener('pointerup', (ev) => {
  if (!down || down.button !== 0) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
  const quick = performance.now() - down.t < 600;
  down = null;
  if (moved > 6 || !quick) return;
  const id = pick(ev);
  if (id) select(id);
  else deselect();
});

/* =====================================================================
   Camera flights + tour
   ===================================================================== */
let flight = null;
function flyTo(pos, target, dur = 1.8) {
  const fromPos = camera.position.clone();
  flight = {
    t: 0, dur,
    fromPos, fromT: controls.target.clone(),
    toPos: pos.clone(), toT: target.clone(),
    lift: Math.min(fromPos.distanceTo(pos) * 0.12, 60),
  };
}
function stepFlight(dt) {
  if (!flight) return;
  flight.t += dt;
  const k = Math.min(flight.t / flight.dur, 1);
  const s = easeInOut(k);
  camera.position.lerpVectors(flight.fromPos, flight.toPos, s);
  camera.position.y = Math.max(3, camera.position.y + Math.sin(s * Math.PI) * flight.lift);
  controls.target.lerpVectors(flight.fromT, flight.toT, s);
  if (k >= 1) flight = null;
}

controls.addEventListener('start', () => {
  flight = null;
  stopTour();
  hintEl.classList.add('fade');
});

const btnTour = $('#btn-tour');
let touring = false;
let tourState = null;
function startTour() {
  touring = true;
  btnTour.classList.add('active');
  btnTour.firstChild.nodeValue = '⏸';
  deselect();
  const s = gateView();
  flyTo(s.pos, s.target, 0.8);
  tourState = { phase: 'approach', t: 0 };
}
function stopTour() {
  if (!touring) return;
  touring = false;
  tourState = null;
  btnTour.classList.remove('active');
  btnTour.firstChild.nodeValue = '▶';
}
function finishTour() {
  stopTour();
  select('diversion', { fromTour: true, noFly: true });
}
function stepTour(dt) {
  if (!touring || flight || !tourState) return;
  if (tourState.phase === 'approach') { tourState.phase = 'hold'; tourState.t = 0; return; }
  tourState.t += dt;
  if (tourState.phase === 'hold') {
    if (tourState.t > 0.3) { tourState.phase = 'drive'; tourState.t = 0; }
    return;
  }
  const k = Math.min(tourState.t / TOUR_DUR, 1);
  const s = Math.min((k * Math.PI)/2);
  camera.position.copy(tourCam.getPointAt(s));
  controls.target.copy(tourLook.getPointAt(s));
  if (k >= 1) finishTour();
}
btnTour.addEventListener('click', () => (touring ? stopTour() : startTour()));

function goHome() {
  stopTour();
  deselect();
  const h = homeView();
  flyTo(h.pos, h.target, 2.2);
}
$('#btn-home').addEventListener('click', goHome);

function goOverview() {
  stopTour();
  deselect();
  const h = overviewView();
  flyTo(h.pos, h.target, 2.4);
}
$('#btn-map').addEventListener('click', goOverview);

/* ---------- Day / night ---------- */
const sunDayC = new THREE.Color(0xfff1d6), sunNightC = new THREE.Color(0x6f86ff);
const hemiDayC = new THREE.Color(0xdff1ff), hemiNightC = new THREE.Color(0x2a3a7a);
const hemiGroundDay = new THREE.Color(0x4a5a3a), hemiGroundNight = new THREE.Color(0x10131f);
const cloudDay = new THREE.Color(0xffffff), cloudNight = new THREE.Color(0x3a4468);
let nightT = 0;
let nightTarget = 0;

function applyTime(t) {
  scene.background.copy(skyDay).lerp(skyNight, t);
  scene.fog.color.copy(scene.background);
  hemi.intensity = lerp(0.95, 0.3, t);
  hemi.color.copy(hemiDayC).lerp(hemiNightC, t);
  hemi.groundColor.copy(hemiGroundDay).lerp(hemiGroundNight, t);
  sun.intensity = lerp(1.5, 0.18, t);
  sun.color.copy(sunDayC).lerp(sunNightC, t);
  nightMats.forEach((m) => (m.emissiveIntensity = t * 1.6));
  lampMat.emissiveIntensity = t * 3;
  stars.material.opacity = t;
  moonMat.opacity = t;
  cloudMat.color.copy(cloudDay).lerp(cloudNight, t);
  cloudMat.opacity = lerp(0.9, 0.3, t);
}

const btnNight = $('#btn-night');
btnNight.addEventListener('click', () => {
  nightTarget = nightTarget ? 0 : 1;
  btnNight.classList.toggle('active', nightTarget === 1);
  btnNight.firstChild.nodeValue = nightTarget ? '☀' : '☾';
  btnNight.querySelector('span').textContent = nightTarget ? 'Day' : 'Night';
});

/* ---------- Other toolbar buttons ---------- */
const btnLabels = $('#btn-labels');
btnLabels.addEventListener('click', () => {
  document.body.classList.toggle('labels-off');
  btnLabels.classList.toggle('active', !document.body.classList.contains('labels-off'));
});

const btnFull = $('#btn-full');
if (!document.fullscreenEnabled) btnFull.style.display = 'none';
btnFull.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});

setTimeout(() => hintEl.classList.add('fade'), 9000);

/* ---------- Keyboard ---------- */
window.addEventListener('keydown', (ev) => {
  if (document.activeElement === searchEl) {
    if (ev.key === 'Escape') { searchEl.value = ''; searchEl.dispatchEvent(new Event('input')); searchEl.blur(); }
    return;
  }
  if (ev.key === 'ArrowRight') step(1);
  else if (ev.key === 'ArrowLeft') step(-1);
  else if (ev.key === 'Escape') deselect();
  else if (ev.key === 'h' || ev.key === 'H') goHome();
  else if (ev.key === 'm' || ev.key === 'M') goOverview();
});

/* =====================================================================
   Minimap
   ===================================================================== */
const mm = $('#minimap');
const mctx = mm.getContext('2d');
const MM_W = 160;
const MM_H = Math.round((MM_W * (WB.maxZ - WB.minZ)) / (WB.maxX - WB.minX));
const dpr = Math.min(window.devicePixelRatio || 1, 2);
mm.width = MM_W * dpr; mm.height = MM_H * dpr;
mm.style.width = MM_W + 'px'; mm.style.height = MM_H + 'px';
const mmx = (x) => ((x - WB.minX) / (WB.maxX - WB.minX)) * MM_W;
const mmz = (z) => ((z - WB.minZ) / (WB.maxZ - WB.minZ)) * MM_H;

function drawMinimap() {
  const c = mctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#34603a';
  c.fillRect(0, 0, MM_W, MM_H);
  ZONES.forEach((z) => {
    c.fillStyle = z.type === 'forest' ? '#244a2a' : z.color;
    const x1 = mmx(X(z.rect[0])), y1 = mmz(Z(z.rect[1])), x2 = mmx(X(z.rect[2])), y2 = mmz(Z(z.rect[3]));
    c.globalAlpha = 0.85; c.fillRect(x1, y1, x2 - x1, y2 - y1); c.globalAlpha = 1;
  });
  c.lineCap = 'round'; c.lineJoin = 'round';
  roads.forEach((r) => {
    c.strokeStyle = '#6b7079';
    c.lineWidth = Math.max(1.5, (r.width / (WB.maxX - WB.minX)) * MM_W);
    c.beginPath();
    r.pts.forEach((p, i) => (i ? c.lineTo(mmx(p.x), mmz(p.y)) : c.moveTo(mmx(p.x), mmz(p.y))));
    c.stroke();
  });
  entries.forEach((e) => {
    const on = e === selected, hov = e === hovered;
    c.fillStyle = on ? '#38bdf8' : hov ? '#ffffff' : e.kind === 'ground' ? '#c4a678' : hexCss(e.color);
    e.rects.forEach((r) => {
      c.fillRect(mmx(r.x - r.w / 2), mmz(r.z - r.d / 2), Math.max(2, mmx(r.x + r.w / 2) - mmx(r.x - r.w / 2)), Math.max(2, mmz(r.z + r.d / 2) - mmz(r.z - r.d / 2)));
    });
  });
  const cx = mmx(camera.position.x), cz = mmz(camera.position.z);
  const tx = mmx(controls.target.x), tz = mmz(controls.target.z);
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(clamp(cx, 0, MM_W), clamp(cz, 0, MM_H)); c.lineTo(tx, tz); c.stroke();
  c.fillStyle = '#fbbf24'; c.beginPath(); c.arc(tx, tz, 3.5, 0, Math.PI * 2); c.fill();
}

mm.addEventListener('click', (ev) => {
  const r = mm.getBoundingClientRect();
  const wx = WB.minX + ((ev.clientX - r.left) / r.width) * (WB.maxX - WB.minX);
  const wz = WB.minZ + ((ev.clientY - r.top) / r.height) * (WB.maxZ - WB.minZ);
  const hit = entries.find((e) => e.rects.some((q) => Math.abs(wx - q.x) <= q.w / 2 + 2 && Math.abs(wz - q.z) <= q.d / 2 + 2));
  if (hit) return select(hit.id);
  stopTour();
  const delta = new THREE.Vector3(wx, 0, wz).sub(controls.target).setY(0);
  flyTo(camera.position.clone().add(delta), new THREE.Vector3(wx, 0, wz), 1.2);
});

/* =====================================================================
   Resize + main loop
   ===================================================================== */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

applyTime(0);
refreshHighlights();

const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  stepFlight(dt);

  if (nightT !== nightTarget) {
    nightT += (nightTarget - nightT) * Math.min(dt * 3, 1);
    if (Math.abs(nightTarget - nightT) < 0.003) nightT = nightTarget;
    applyTime(nightT);
  }

  clouds.forEach((c) => {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 1600) c.position.x = -1600;
  });

  cars.forEach((car) => {
    car.s += car.dir * car.speed * dt;
    if (car.s > car.total) car.s = 0; else if (car.s < 0) car.s = car.total;
    placeCar(car);
  });

  stepTour(dt);

  const now = performance.now() / 1000;
  pulsers.forEach((p) => {
    p.ring.scale.setScalar(1 + 0.16 * Math.sin(now * 2.6));
    p.ring.material.opacity = 0.65 + 0.3 * Math.sin(now * 2.6);
  });

  controls.target.x = clamp(controls.target.x, WB.minX, WB.maxX);
  controls.target.z = clamp(controls.target.z, WB.minZ, WB.maxZ);
  controls.update();

  // shadows follow the camera focus; the shadow box grows when zoomed out
  const dist = camera.position.distanceTo(controls.target);
  const half = clamp(dist * 0.6, 80, 330);
  if (Math.abs(half - shadowHalf) > shadowHalf * 0.06) {
    shadowHalf = half;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    sun.shadow.camera.updateProjectionMatrix();
  }
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).add(SUN_OFFSET);

  // zoomed out: show college labels; zoomed in: show block labels
  const zoomed = dist < ZOOM_SWITCH;
  groupLabels.forEach((el) => el.classList.toggle('far', zoomed));
  entries.forEach((e) => {
    const tooFar = (!zoomed && !e.labelFar) || (e.labelMax && camera.position.distanceTo(e.labelObj.getWorldPosition(tmpV)) > e.labelMax);
    e.labelEl.classList.toggle('far', tooFar);
  });

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  drawMinimap();
}
animate();

/* Intro: hide loader, fly camera to the home view */
requestAnimationFrame(() => {
  setTimeout(() => {
    $('#loader').classList.add('done');
    const h = homeView();
    flyTo(h.pos, h.target, 4.6);
  }, 500);
});
