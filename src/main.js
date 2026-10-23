import * as THREE from 'three';
import { MaquetteControls } from './camera-controls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createVegetation } from './vegetation.js';
import { circularizeRoundabout, createAmenities, createSurroundings } from './landscape.js';
import { createCatalog, lotMatches, normalizeLotQuery, alignParcelIdentities } from './experience/catalog.js';
import { createExperienceStore } from './experience/store.js';
import { createExperienceUI } from './experience/ui.js';
import { createSurroundingsUI } from './experience/surroundings.js';
import { createSolarSimulation } from './solar/simulation.js';
import { getMapViewport, syncVisualViewport, watchResponsiveLayout } from './responsive.js';
import { createPotentialEngine } from './experience/potential.js';
import * as conceptModule from './experience/potential-scene.js';

const container = document.querySelector('#viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.4 : 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
container.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Maquete interativa. Arraste para mover; botão direito para girar; rolagem para aproximar.');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9eee8');
const model = new THREE.Group();
scene.add(model);
const treeGroup = new THREE.Group();
const numbering = new THREE.Group();
const lotNumbering = new THREE.Group();
model.add(treeGroup, numbering, lotNumbering);

const perspective = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.4, 5000);
const orthographic = new THREE.OrthographicCamera(-500, 500, 300, -300, 0.1, 4000);
let camera = perspective;
let controls;
let mode = 'perspective';
let data;
let referencePlane;
let queued = false;
let showNumbers = true;
let vegetation;
let surroundings;
let nearbyUI;
let solarSimulation;
let catalog, experienceStore, buyerUI;
let cameraFlight = null;
let conceptGroup = null, conceptEntry = null, conceptRequest = 0;
let potentialEngine, potentialGroup = null;
const lotEntries = new Map();
const lotVisualRanges = new Map();
const matchingLotIds = new Set();
const viewOffset = new THREE.Vector2(), viewOffsetGoal = new THREE.Vector2();
let labelsFade = 1;
let lastFrame = 0;
let lastCameraChange = 0;
let previousFrameActive = false;
let qualityMode = 'auto';
let quality = innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4 ? 'medium' : 'high';
let frameSamples = [];
let lastQualityChange = 0;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const qualityProfiles = {
  high: { dpr: 1.8, pixels: 4000000, shadow: 2048 },
  medium: { dpr: 1.45, pixels: 2800000, shadow: 1536 },
  low: { dpr: 1.1, pixels: 1900000, shadow: 1024 },
};
const target = new THREE.Vector3(0, 0, 10);
const UNIT = 0.105;
const world = ([x, y], elevation = 0) => new THREE.Vector3((x - 4325) * UNIT, elevation, (y - 2379) * UNIT);
let randomState = 16753;
const random = () => ((randomState = (randomState * 1664525 + 1013904223) >>> 0) / 4294967296);

const hemisphere = new THREE.HemisphereLight('#edf5ff', '#7b8564', 1.32);
scene.add(hemisphere);
const sunlight = new THREE.DirectionalLight('#fff0d7', 2.8);
sunlight.position.set(-260, 500, -220);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
Object.assign(sunlight.shadow.camera, { left: -590, right: 590, top: 480, bottom: -480, near: 1, far: 1500 });
sunlight.shadow.normalBias = 0.035;
sunlight.shadow.bias = -0.00015;
sunlight.shadow.radius = 3;
scene.add(sunlight);

function grainTexture(base, variation, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(size, size);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = (random() - 0.5) * variation;
    for (let c = 0; c < 3; c++) pixels.data[i + c] = Math.max(0, Math.min(255, base[c] + n));
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.16, 0.16);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

const materials = {
  asphalt: new THREE.MeshStandardMaterial({ color: '#4e585d', roughness: 0.9, map: grainTexture([222, 224, 224], 21) }),
  base: new THREE.MeshStandardMaterial({ color: '#96a58f', roughness: 0.9 }),
  curb: new THREE.MeshStandardMaterial({ color: '#e4e3d8', roughness: 0.74 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: '#c8cbbf', roughness: 0.88, map: grainTexture([239, 239, 234], 12) }),
  residential: new THREE.MeshStandardMaterial({ color: '#85ad56', roughness: 0.94, map: grainTexture([238, 244, 225], 13) }),
  residential2: new THREE.MeshStandardMaterial({ color: '#8fb75e', roughness: 0.94, map: grainTexture([238, 244, 225], 13) }),
  commercial: new THREE.MeshStandardMaterial({ color: '#819fca', roughness: 0.8 }),
  utility: new THREE.MeshStandardMaterial({ color: '#a58542', roughness: 0.94 }),
  park: new THREE.MeshStandardMaterial({ color: '#568c3e', roughness: 0.98, map: grainTexture([221, 237, 203], 29) }),
  forest: new THREE.MeshStandardMaterial({ color: '#3d6a32', roughness: 1, map: grainTexture([204, 225, 181], 31) }),
};
for (const [name, material] of Object.entries(materials)) {
  if (material.map) {
    material.bumpMap = material.map;
    material.bumpScale = name === 'asphalt' ? 0.055 : name === 'park' || name === 'forest' ? 0.045 : 0.025;
  }
}
const batches = new Map();
const batchVertexCounts = new Map();
const lotMaterial = materials.residential.clone();
lotMaterial.color.set('#ffffff');
lotMaterial.vertexColors = true;
lotMaterial.polygonOffset = true;
lotMaterial.polygonOffsetFactor = -1;
lotMaterial.polygonOffsetUnits = -1;

function shapeFrom(polygon) {
  const shape = new THREE.Shape();
  polygon.forEach((point, i) => {
    const p = world(point);
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();
  return shape;
}

function addSurface(polygon, material, height, bottom = 0, lotId = null) {
  const geometry = new THREE.ExtrudeGeometry(shapeFrom(polygon), {
    depth: height, bevelEnabled: false, steps: 1, curveSegments: 4,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  geometry.clearGroups();
  if (lotId) {
    const count = geometry.attributes.position.count;
    const shade = material.color.clone();
    material = lotMaterial;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = shade.r; colors[i * 3 + 1] = shade.g; colors[i * 3 + 2] = shade.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    lotVisualRanges.set(lotId, { start: batchVertexCounts.get(material) || 0, count, shade });
  }
  batchVertexCounts.set(material, (batchVertexCounts.get(material) || 0) + geometry.attributes.position.count);
  if (!batches.has(material)) batches.set(material, []);
  batches.get(material).push(geometry);
}

function finishSurfaces() {
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error('Não foi possível montar as superfícies da implantação.');
    const mesh = new THREE.Mesh(merged, material);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    model.add(mesh);
    if (material === lotMaterial) for (const range of lotVisualRanges.values()) range.attribute = merged.attributes.color;
    geometries.forEach(geometry => geometry.dispose());
  }
  batches.clear();
  batchVertexCounts.clear();
}

function makeNumbers() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d');
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let n = 1; n <= 47; n++) {
    const cell = n - 1;
    context.font = '500 70px "Segoe UI", sans-serif';
    context.fillStyle = '#435039';
    context.fillText(String(n).padStart(2, '0'), (cell % 8) * 128 + 64, Math.floor(cell / 8) * 128 + 65);
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const geometries = [];
  for (const block of data.blocks) {
    for (const lot of block.lots) {
      const geometry = new THREE.PlaneGeometry(2.3, 2.3);
      const uv = geometry.attributes.uv;
      const cell = lot.number - 1;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, ((cell % 8) + uv.getX(i)) / 8, 1 - (Math.floor(cell / 8) + 1 - uv.getY(i)) / 8);
      }
      geometry.rotateX(-Math.PI / 2);
      const p = world(lot.label, 0.64);
      geometry.translate(p.x, p.y, p.z);
      geometries.push(geometry);
    }
    const label = document.createElement('canvas');
    label.width = 256;
    label.height = 112;
    const ctx = label.getContext('2d');
    ctx.fillStyle = '#fafbf1';
    ctx.beginPath();
    ctx.roundRect(12, 12, 232, 88, 42);
    ctx.fill();
    ctx.strokeStyle = '#b9c5a6';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '500 47px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3c5432';
    ctx.fillText(block.id, 128, 58);
    const texture = new THREE.CanvasTexture(label);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.position.copy(world(block.label, 5));
    sprite.scale.set(10.5, 4.6, 1);
    sprite.renderOrder = 6;
    sprite.userData.block = block.id;
    numbering.add(sprite);
  }
  const geometry = mergeGeometries(geometries, false);
  const material = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.Mesh(geometry, material);
  lotNumbering.add(mesh);
  geometries.forEach(g => g.dispose());
}

function makeDividers() {
  const unique = new Map();
  for (const block of data.blocks) {
    for (const lot of block.lots) {
      lot.polygon.forEach((a, i) => {
        const b = lot.polygon[(i + 1) % lot.polygon.length];
        const ak = a.map(n => Math.round(n * 10)).join(',');
        const bk = b.map(n => Math.round(n * 10)).join(',');
        const key = ak < bk ? `${ak}:${bk}` : `${bk}:${ak}`;
        if (!unique.has(key)) unique.set(key, [a, b]);
      });
    }
  }
  const points = [];
  unique.forEach(([a, b]) => points.push(world(a, 0.615), world(b, 0.615)));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  model.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#edf0d6', transparent: true, opacity: 0.9 })));
}

// Picking and highlights use the exact existing polygons. No base mesh or source vertex is edited.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const highlights = new Map();
let pickingMesh;
const pickingCells = new Map();
const pickingPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.606);
const pickingPoint = new THREE.Vector3();
const PICK_CELL = 24;
let pendingPick = false;
let hoveredLot = null;
let selectedLot = null;
let focusOutline = null;
let focusBlockId = null;
let focusOpacity = 0;
let pointerDown = null;
const activePointers = new Set();

function makeLotPicking() {
  const geometries = [];
  let face = 0;
  for (const block of data.blocks) for (const lot of block.lots) {
    const geometry = new THREE.ShapeGeometry(shapeFrom(lot.polygon)).toNonIndexed();
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0.606, 0);
    const end = face + geometry.attributes.position.count / 3;
    const polygon = lot.polygon.map(point => world(point));
    const bounds = new THREE.Box3().setFromPoints(polygon);
    const entry = { start: face, end, lot, block, polygon, bounds };
    for (let x = Math.floor(bounds.min.x / PICK_CELL); x <= Math.floor(bounds.max.x / PICK_CELL); x++) {
      for (let z = Math.floor(bounds.min.z / PICK_CELL); z <= Math.floor(bounds.max.z / PICK_CELL); z++) {
        const key = `${x}:${z}`;
        if (!pickingCells.has(key)) pickingCells.set(key, []);
        pickingCells.get(key).push(entry);
      }
    }
    lotEntries.set(lot.id, entry);
    matchingLotIds.add(lot.id);
    face = end;
    geometries.push(geometry);
  }
  const geometry = mergeGeometries(geometries, false);
  pickingMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  pickingMesh.updateMatrixWorld(true);
  geometries.forEach(g => g.dispose());
}

function pickLot() {
  if (!pickingMesh || referencePlane?.visible) return null;
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(pickingPlane, pickingPoint)) return null;
  const { x, z } = pickingPoint;
  const entries = pickingCells.get(`${Math.floor(x / PICK_CELL)}:${Math.floor(z / PICK_CELL)}`) || [];
  for (const entry of entries) {
    if (!matchingLotIds.has(entry.lot.id) || x < entry.bounds.min.x || x > entry.bounds.max.x || z < entry.bounds.min.z || z > entry.bounds.max.z) continue;
    let inside = false;
    const polygon = entry.polygon;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    if (inside) return entry;
  }
  return null;
}

function pickNearby() {
  if (!surroundings?.visible || referencePlane?.visible) return null;
  surroundings.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer, camera);
  // Elevated markers take priority. Dedicated low-poly proxies make the actual
  // campus buildings and road surfaces clickable without scanning render batches.
  const marker = raycaster.intersectObjects(surroundings.userData.markers, false)[0];
  if (marker) return marker.object.userData.placeId;
  const hits = raycaster.intersectObjects(surroundings.userData.targets, false);
  return (hits.find(hit => hit.object.userData.placeId !== 'ufg') || hits[0])?.object.userData.placeId || null;
}

function setHovered(entry) {
  hoveredLot = entry;
  if (experienceStore && experienceStore.get().hoveredLotId !== (entry?.lot.id || null)) experienceStore.set({ hoveredLotId: entry?.lot.id || null });
  renderer.domElement.style.cursor = entry ? 'pointer' : 'grab';
}

function makeHighlight(entry) {
  const { lot } = entry;
  const material = (materials[lot.category] || materials.residential).clone();
  material.color.lerp(new THREE.Color('#e6f6b0'), 0.24);
  material.transparent = true;
  material.opacity = 0;
  material.depthWrite = false;
  // Reuse views into the existing picking triangles; no second extruded lot is allocated.
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(pickingMesh.geometry.attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array.subarray(entry.start * 3 * attribute.itemSize, entry.end * 3 * attribute.itemSize), attribute.itemSize, attribute.normalized));
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 3;
  const group = new THREE.Group();
  group.add(mesh);
  const edgePoints = [...lot.polygon, lot.polygon[0]].flatMap(p => world(p, 0.635).toArray());
  const borderGeometry = new LineGeometry(); borderGeometry.setPositions(edgePoints);
  const border = new Line2(borderGeometry, new LineMaterial({ color: '#fff3c0', linewidth: 3.5, transparent: true, opacity: 0, depthWrite: false }));
  border.material.resolution.set(innerWidth, innerHeight);
  border.renderOrder = 4;
  group.add(border);
  const labelGeometry = new THREE.PlaneGeometry(2.3, 2.3);
  const uv = labelGeometry.attributes.uv, cell = lot.number - 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ((cell % 8) + uv.getX(i)) / 8, 1 - (Math.floor(cell / 8) + 1 - uv.getY(i)) / 8);
  labelGeometry.rotateX(-Math.PI / 2);
  const position = world(lot.label, 0.64);
  labelGeometry.translate(position.x, position.y, position.z);
  const label = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ map: lotNumbering.children[0].material.map, transparent: true, opacity: 0, depthWrite: false }));
  label.renderOrder = 4;
  group.add(label);
  model.add(group);
  const state = { group, mesh, border, label, amount: 0, lift: 0, entry };
  highlights.set(lot.id, state);
  return state;
}

function updateHighlights(delta, numberOpacity) {
  const focused = selectedLot || hoveredLot || (experienceStore?.get().selectedBlock ? { block: catalog.blocks.get(experienceStore.get().selectedBlock) } : null);
  for (const entry of [hoveredLot, selectedLot]) if (entry && !highlights.has(entry.lot.id)) makeHighlight(entry);
  let active = false;
  const approach = (value, goal, speed = 19) => reducedMotion.matches ? goal : THREE.MathUtils.damp(value, goal, speed, delta);
  for (const [id, state] of highlights) {
    const selected = selectedLot?.lot.id === id;
    const shown = selected || hoveredLot?.lot.id === id;
    // Keep a small GPU cache for recently hovered lots instead of continually
    // allocating and disposing three geometries as the pointer crosses blocks.
    if (!shown && state.amount === 0 && highlights.size <= 10) continue;
    state.group.visible = true;
    const amount = shown ? 1 : 0;
    const lift = solarSimulation?.isOpen() || experienceStore?.get().potentialLotIds.length > 1 ? 0 : selected ? 0.19 : shown ? 0.025 : 0;
    state.amount = approach(state.amount, amount);
    state.lift = approach(state.lift, lift, 16);
    state.group.position.y = 0.008 + state.lift;
    state.mesh.material.opacity = state.amount * 0.97;
    state.mesh.material.color.set(selected ? '#f3ce70' : '#d8eaa2');
    state.mesh.material.emissive.set(selected ? '#a57522' : '#000000');
    state.mesh.material.emissiveIntensity = selected && !solarSimulation?.isOpen() ? 0.18 : 0;
    state.mesh.castShadow = false;
    state.border.material.opacity = state.amount * (selected ? 0.95 : 0.62);
    state.border.material.linewidth = selected ? 3.5 : 1.8;
    state.border.material.resolution.set(innerWidth, innerHeight);
    state.label.material.opacity = state.amount * (selected ? Math.max(0.85, numberOpacity) : numberOpacity);
    state.label.visible = !(conceptGroup && selected && state.entry.lot.id === conceptGroup.userData.layout.lotId);
    active ||= Math.abs(state.amount - amount) > 0.002 || Math.abs(state.lift - lift) > 0.001;
    if (!shown && state.amount < 0.002) {
      state.amount = 0; state.lift = 0; state.group.visible = false;
      if (highlights.size > 10) {
        model.remove(state.group);
        state.group.children.forEach(child => { child.geometry.dispose(); child.material.dispose(); });
        highlights.delete(id);
      }
    }
  }
  const nextBlock = focused?.block.id || null;
  if (nextBlock && nextBlock !== focusBlockId) {
    if (focusOutline) { model.remove(focusOutline); focusOutline.geometry.dispose(); focusOutline.material.dispose(); }
    focusOutline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(focused.block.polygon.map(p => world(p, 0.63))), new THREE.LineBasicMaterial({ color: '#e3d69a', transparent: true, opacity: 0, depthWrite: false }));
    model.add(focusOutline);
    focusBlockId = nextBlock;
    focusOpacity = 0;
  }
  focusOpacity = approach(focusOpacity, focused ? 0.6 : 0, 13);
  if (focusOutline) focusOutline.material.opacity = focusOpacity;
  active ||= Math.abs(focusOpacity - (focused ? 0.6 : 0)) > 0.002;
  const occupiedLabels = [];
  const orderedLabels = [...numbering.children].sort((a, b) => Number(b.userData.block === focused?.block.id) - Number(a.userData.block === focused?.block.id));
  for (const label of orderedLabels) {
    const relevant = !focused || label.userData.block === focused.block.id;
    const projected = label.position.clone().project(camera);
    const distance = camera.position.distanceTo(label.position);
    const pixelsPerUnit = camera.isOrthographicCamera ? innerHeight * camera.zoom / (camera.top - camera.bottom) : innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.max(1, distance));
    const width = label.scale.x * pixelsPerUnit + 6, height = label.scale.y * pixelsPerUnit + 4;
    const x = (projected.x + 1) * innerWidth / 2, y = (1 - projected.y) * innerHeight / 2;
    const rect = { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
    const collision = occupiedLabels.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top);
    const hidesConcept = conceptGroup && relevant && camera.position.distanceTo(controls.target) < 180;
    const hidden = collision || hidesConcept || projected.z > 1 || projected.z < -1;
    if (!hidden) occupiedLabels.push(rect);
    const goal = hidden ? 0 : relevant ? 1 : 0.56;
    label.userData.focus = approach(label.userData.focus ?? 1, goal, 13);
    const size = 0.96 + labelsFade * 0.04 + (relevant && focused ? 0.07 : 0);
    const current = approach(label.scale.x / 10.5, size, 13);
    label.scale.set(10.5 * current, 4.6 * current, 1);
    label.material.opacity = labelsFade * label.userData.focus;
    active ||= Math.abs(label.userData.focus - goal) > 0.002 || Math.abs(current - size) > 0.002;
  }
  return active;
}

function updateComposition() {
  const space = getMapViewport();
  viewOffsetGoal.set(innerWidth / 2 - (space.left + space.right) / 2, innerHeight / 2 - (space.top + space.bottom) / 2);
  requestRender();
}

function focusOnBounds(polygon, height = 0.6) {
  if (!controls) return;
  const bounds = new THREE.Box3().setFromPoints(polygon.map(point => world(point, 0.6)));
  bounds.max.y = Math.max(bounds.max.y, height);
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const nextTarget = center.clone();
  const space = getMapViewport();
  const availableWidth = Math.max(80, space.width), availableHeight = Math.max(60, space.height);
  let toPosition, toZoom = camera.zoom;
  if (camera.isOrthographicCamera) {
    const visibleHeight = Math.max((size.z + height) * innerHeight / availableHeight * 2.2, size.x * innerHeight / availableWidth * 2.2, 55);
    toZoom = THREE.MathUtils.clamp((camera.top - camera.bottom) / visibleHeight, controls.minZoom, controls.maxZoom);
    toPosition = camera.position.clone().add(nextTarget.clone().sub(controls.target));
  } else {
    const direction = camera.position.clone().sub(controls.target).normalize();
    direction.y = Math.max(0.5, direction.y); direction.normalize();
    const span = Math.max((size.z * 0.8 + height) * innerHeight / availableHeight, size.x * innerHeight / availableWidth, 24);
    const distance = Math.max(55, span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.7);
    toPosition = nextTarget.clone().add(direction.multiplyScalar(distance));
  }
  cameraFlight = { camera, fromPosition: camera.position.clone(), toPosition, fromTarget: controls.target.clone(), toTarget: nextTarget, fromZoom: camera.zoom, toZoom, start: performance.now(), duration: reducedMotion.matches ? 0 : 950 };
  setHovered(null); pendingPick = false; requestRender();
}

function advanceFlight(timestamp) {
  if (!cameraFlight) return false;
  const flight = cameraFlight;
  const t = flight.duration ? Math.min(1, (timestamp - flight.start) / flight.duration) : 1;
  const ease = t * t * (3 - 2 * t);
  camera.position.lerpVectors(flight.fromPosition, flight.toPosition, ease);
  controls.target.lerpVectors(flight.fromTarget, flight.toTarget, ease);
  if (camera.isOrthographicCamera) { camera.zoom = THREE.MathUtils.lerp(flight.fromZoom, flight.toZoom, ease); camera.updateProjectionMatrix(); }
  if (t === 1) cameraFlight = null;
  return t < 1;
}

function applyLotFilters() {
  if (!catalog || !experienceStore) return;
  const filters = experienceStore.get().filters, shade = new THREE.Color();
  const joined = new Set(experienceStore.get().potentialLotIds);
  const statusColors = { reserved: '#ba9c58', sold: '#969f98', unavailable: '#a7ada6' };
  matchingLotIds.clear();
  for (const lot of catalog.byId.values()) {
    const matches = lotMatches(lot, filters), range = lotVisualRanges.get(lot.id);
    if (matches) matchingLotIds.add(lot.id);
    if (!range) continue;
    if (statusColors[lot.status]) shade.set(statusColors[lot.status]); else shade.copy(range.shade);
    if (!matches) shade.lerp(new THREE.Color('#90978d'), 0.78).multiplyScalar(0.58);
    else if (selectedLot && selectedLot.lot.id !== lot.id && !joined.has(lot.id)) shade.multiplyScalar(0.79);
    for (let i = range.start; i < range.start + range.count; i++) range.attribute.setXYZ(i, shade.r, shade.g, shade.b);
  }
  const attribute = lotVisualRanges.values().next().value?.attribute;
  if (attribute) attribute.needsUpdate = true;
  setHovered(null); requestRender();
}

function removeConcept({ updateStore = true } = {}) {
  conceptRequest++;
  if (conceptGroup) { model.remove(conceptGroup); conceptModule?.disposeConcept(conceptGroup); conceptGroup = null; }
  conceptEntry = null;
  if (updateStore && experienceStore) experienceStore.set({ activeConcept: null, activeConceptVariant: null, conceptLayout: null, conceptLoading: false });
  renderer.shadowMap.needsUpdate = true; requestRender();
}

function selectLot(id, { history = true, focus = true } = {}) {
  const entry = id ? lotEntries.get(id) : null;
  if (id && !entry) { buyerUI?.toast('Não encontramos este lote no empreendimento.'); return; }
  cameraFlight = null;
  removeConcept({ updateStore: false });
  if (potentialGroup) { model.remove(potentialGroup); conceptModule.disposeConcept(potentialGroup); potentialGroup = null; }
  selectedLot = entry || null; setHovered(null);
  experienceStore?.set({ selectedLotId: entry?.lot.id || null, selectedBlock: entry?.block.id || null, panelOpen: Boolean(entry), leadOpen: false,
    activeConcept: null, activeConceptVariant: null, conceptLayout: null, conceptLoading: false,
    potentialLotIds: entry ? [entry.lot.id] : [], potentialOpen: false, potentialNeighborsOpen: false, lotPanelTab: 'overview' });
  applyLotFilters();
  if (history) {
    const path = entry ? `/lote/${entry.lot.id}` : '/';
    if (location.pathname !== path) window.history.pushState({}, '', path);
  }
  updateComposition();
  if (entry && focus) focusOnBounds(entry.lot.polygon);
  renderer.shadowMap.needsUpdate = true; requestRender();
}

function setPotentialLots(ids) {
  const base = experienceStore.get().selectedLotId;
  ids = [...new Set(ids)];
  if (!base || ids[0] !== base || !potentialEngine.connected(ids)) { buyerUI.toast('Combine apenas terrenos contíguos da mesma quadra, mantendo o lote base.'); return; }
  if (ids.length > 1 && ids.some(id => !['available', 'unknown'].includes(catalog.byId.get(id).status))) { buyerUI.toast('Não é possível adicionar lotes reservados, vendidos ou indisponíveis.'); return; }
  const profile = potentialEngine.profile(ids);
  if (!profile) return;
  const next = conceptModule.buildCombinationOverlay(profile, world);
  removeConcept({ updateStore: false });
  if (potentialGroup) { model.remove(potentialGroup); conceptModule.disposeConcept(potentialGroup); }
  potentialGroup = next; model.add(next);
  experienceStore.set({ potentialLotIds: ids, potentialOpen: true, lotPanelTab: 'potential', activeConcept: null, activeConceptVariant: null, conceptLayout: null, conceptLoading: false });
  applyLotFilters(); updateComposition();
  focusOnBounds(profile.outline || profile.lots.flatMap(lot => lot.polygon));
}

function openPotentialSet(ids) {
  if (!potentialEngine.connected(ids)) { buyerUI.toast('Este conjunto não possui uma ligação de divisas confirmada na maquete.'); return; }
  selectLot(ids[0], { focus: false });
  experienceStore.set({ collection: null }); setPotentialLots(ids);
}

function focusSelectedTerrain() {
  if (!selectedLot) return;
  const profile = potentialEngine?.profile(experienceStore.get().potentialLotIds);
  const polygon = profile?.outline || profile?.lots.flatMap(lot => lot.polygon) || selectedLot.lot.polygon;
  const layout = conceptGroup?.userData.layout;
  focusOnBounds(polygon, layout ? layout.fit.height * layout.floors + 1 : 0.6);
}

async function showConcept(optionId) {
  const state = experienceStore.get(), id = state.selectedLotId;
  const profile = potentialEngine.profile(state.potentialLotIds);
  const option = profile?.options.find(item => item.id === optionId);
  if (!option) { buyerUI.toast('Esta possibilidade não se aplica à configuração atual.'); return; }
  const token = ++conceptRequest;
  experienceStore.set({ conceptLoading: true });
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (token !== conceptRequest || id !== experienceStore.get().selectedLotId) return;
    const next = conceptModule.buildConcept(profile, option, world);
    if (conceptGroup) { model.remove(conceptGroup); conceptModule.disposeConcept(conceptGroup); }
    conceptGroup = next; model.add(next);
    conceptEntry = { start: performance.now(), duration: reducedMotion.matches ? 0 : 520 };
    conceptGroup.traverse(object => { if (object.material) { object.material.transparent = true; object.material.opacity = 0; } });
    experienceStore.set({ activeConcept: optionId, activeConceptVariant: null, conceptLayout: next.userData.layout });
    focusOnBounds(profile.outline, next.userData.layout.fit.height * option.floors + 1);
    renderer.shadowMap.needsUpdate = true; requestRender();
  } catch (error) {
    console.error(error);
    if (token === conceptRequest) buyerUI.toast('Esta visualização não está disponível para este lote.');
  } finally { if (token === conceptRequest) experienceStore.set({ conceptLoading: false }); }
}

async function setupExperience() {
  catalog = await createCatalog(data);
  potentialEngine = createPotentialEngine(catalog);
  const identityMap = new Map(data.blocks.flatMap(block => block.lots.filter(lot => lot.geometryId).map(lot => [lot.geometryId, lot.id])));
  experienceStore = createExperienceStore(new Set(catalog.byId.keys()), identityMap);
  buyerUI = createExperienceUI({ catalog, potentialEngine, store: experienceStore, actions: {
    selectLot, showPotential: showConcept, setPotentialLots, openPotentialSet, removeConcept,
    focusBlock,
    overview: () => setCamera('perspective'),
    simulateSun: () => solarSimulation?.open(),
  } });
  experienceStore.subscribe(state => state.filters, applyLotFilters);
  experienceStore.subscribe(state => `${state.panelOpen}:${state.sheet}`, updateComposition);
  applyLotFilters();
  const restore = () => {
    const match = location.pathname.match(/^\/lote\/(Q\d{1,2}-L\d{1,2})\/?$/i);
    selectLot(match ? normalizeLotQuery(match[1]) : null, { history: false, focus: Boolean(match) });
  };
  window.addEventListener('popstate', restore);
  restore();
}

function focusBlock(id) {
  const block = catalog?.blocks.get(id); if (!block) return;
  selectLot(null, { focus: false }); experienceStore.set({ selectedBlock: id }); focusOnBounds(block.polygon);
}

function resizeRenderer() {
  const profile = qualityProfiles[quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, profile.dpr, Math.sqrt(profile.pixels / Math.max(1, innerWidth * innerHeight))));
  renderer.setSize(innerWidth, innerHeight);
}

function applyQuality(level) {
  quality = level;
  const profile = qualityProfiles[level];
  resizeRenderer();
  sunlight.shadow.mapSize.set(profile.shadow, profile.shadow);
  if (sunlight.shadow.map) { sunlight.shadow.map.dispose(); sunlight.shadow.map = null; }
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  document.querySelector('#quality') && (document.querySelector('#quality').title = `Qualidade atual: ${{ high: 'Alta', medium: 'Média', low: 'Baixa' }[quality]}`);
  frameSamples = [];
  lastQualityChange = performance.now();
  requestRender();
}

function requestRender() {
  if (!queued) { queued = true; requestAnimationFrame(render); }
}

function render(timestamp) {
  queued = false;
  if (document.hidden) { previousFrameActive = false; return; }
  const frameTime = lastFrame ? timestamp - lastFrame : 16.7;
  const delta = Math.min(frameTime / 1000, 0.05);
  lastFrame = timestamp;
  let active = advanceFlight(timestamp);
  const offsetSpeed = reducedMotion.matches ? 1 : 1 - Math.exp(-14 * delta);
  viewOffset.lerp(viewOffsetGoal, offsetSpeed);
  if (viewOffset.distanceTo(viewOffsetGoal) > 0.15) active = true;
  if (viewOffset.lengthSq() > 0.01 || viewOffsetGoal.lengthSq() > 0.01) camera.setViewOffset(innerWidth, innerHeight, viewOffset.x, viewOffset.y, innerWidth, innerHeight);
  else if (camera.view?.enabled) camera.clearViewOffset();
  const changed = controls?.update();
  camera.updateMatrixWorld();
  if (controls) {
    if (pendingPick && !cameraFlight) {
      pendingPick = false;
      const place = pickNearby();
      setHovered(place ? null : pickLot());
      if (place) renderer.domElement.style.cursor = 'pointer';
    }
    const distance = camera.isOrthographicCamera ? 500 / camera.zoom : camera.position.distanceTo(controls.target);
    labelsFade = reducedMotion.matches ? Number(showNumbers) : THREE.MathUtils.damp(labelsFade, Number(showNumbers), 16, delta);
    active ||= Math.abs(labelsFade - Number(showNumbers)) > 0.002;
    const opacity = THREE.MathUtils.clamp((850 - distance) / 330, 0, 0.9) * labelsFade;
    numbering.visible = labelsFade > 0.002;
    lotNumbering.visible = opacity > 0.015;
    lotNumbering.children.forEach(child => { child.material.opacity = opacity; });
    const highlightsActive = updateHighlights(delta, opacity);
    active ||= highlightsActive;
    const pixelScale = camera.isOrthographicCamera ? innerHeight * camera.zoom / (camera.top - camera.bottom) : innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const planting = vegetation?.update({ camera, pixelScale, quality });
    active ||= planting?.animate || false;
    if (planting?.shadowsChanged) renderer.shadowMap.needsUpdate = true;
  }
  if (conceptEntry && conceptGroup) {
    const t = conceptEntry.duration ? Math.min(1, (timestamp - conceptEntry.start) / conceptEntry.duration) : 1;
    const ease = t * t * (3 - 2 * t);
    conceptGroup.position.y = (conceptGroup.userData.baseHeight || 0.81) - 0.08 * (1 - ease);
    conceptGroup.traverse(object => { if (object.material) object.material.opacity = ease; });
    if (t < 1) active = true; else conceptEntry = null;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.render(scene, camera);
  const measuringMotion = previousFrameActive || (lastCameraChange > 0 && timestamp - lastCameraChange < 120);
  if (qualityMode === 'auto' && measuringMotion && frameTime > 4 && frameTime < 500) {
    frameSamples.push(frameTime);
    if (frameSamples.length >= 36 && timestamp - lastQualityChange > 2500) {
      const average = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;
      if (average > 25 && quality !== 'low') applyQuality(quality === 'high' ? 'medium' : 'low');
      else frameSamples = [];
    }
  }
  previousFrameActive = Boolean(changed || active);
  if (previousFrameActive) requestRender();
}

function setCamera(view) {
  cameraFlight = null;
  mode = view;
  controls?.dispose();
  const aspect = innerWidth / innerHeight;
  const space = getMapViewport();
  const overviewDistance = Math.max(1070 * innerHeight / space.width, 620 * innerHeight / space.height) / (2 * Math.tan(Math.PI / 10)) * 1.13;
  if (view === 'top') {
    const height = Math.max(665 * innerHeight / space.height, 1110 * innerHeight / space.width) * 1.08;
    Object.assign(orthographic, { left: -height * aspect / 2, right: height * aspect / 2, top: height / 2, bottom: -height / 2, zoom: 1 });
    orthographic.position.set(target.x, 1100, target.z + 0.001);
    orthographic.up.set(0, 0, -1);
    orthographic.lookAt(target);
    orthographic.updateProjectionMatrix();
    camera = orthographic;
  } else {
    perspective.aspect = aspect;
    perspective.far = Math.max(5000, overviewDistance * 2.4);
    perspective.updateProjectionMatrix();
    perspective.position.copy(target).add(new THREE.Vector3(0, 0.9, 0.44).normalize().multiplyScalar(overviewDistance));
    perspective.up.set(0, 1, 0);
    perspective.lookAt(target);
    camera = perspective;
  }
  controls = new MaquetteControls(camera, renderer.domElement);
  controls.target.copy(target);
  // Apply the full gesture delta immediately: damping made the map trail the
  // finger. Programmatic focus flights keep their own smooth interpolation.
  controls.enableDamping = false;
  controls.enableRotate = view !== 'top';
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI / 2.5;
  controls.minDistance = 6;
  controls.maxDistance = Math.max(3200, overviewDistance * 1.5);
  controls.minZoom = 0.45;
  controls.maxZoom = 24;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false;
  controls.zoomSpeed = 1.15;
  controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.PAN;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.listenToKeyEvents(renderer.domElement);
  controls.addEventListener('change', () => { lastCameraChange = performance.now(); requestRender(); });
  controls.addEventListener('start', () => { cameraFlight = null; pendingPick = false; setHovered(null); requestRender(); });
  controls.update();
  updateComposition();
  experienceStore?.set({ cameraMode: view });
  document.querySelector('#view-name').textContent = view === 'top' ? 'Vista superior ortográfica' : 'Perspectiva geral';
  for (const [id, selected] of [['top', view === 'top'], ['perspective', view !== 'top']]) {
    document.getElementById(id)?.classList.toggle('active', selected);
    document.getElementById(id)?.setAttribute('aria-pressed', String(selected));
  }
  requestRender();
}

async function initialize() {
  const response = await fetch('/geometry.json');
  if (!response.ok) throw new Error('Não foi possível carregar a geometria.');
  data = await response.json();
  alignParcelIdentities(data);
  circularizeRoundabout(data);
  addSurface(data.perimeter, materials.base, 3.2, -3.3);
  addSurface(data.perimeter, materials.asphalt, 0.13, -0.13);
  for (const block of data.blocks) {
    addSurface(block.curb, materials.curb, 0.31);
    addSurface(block.sidewalk, materials.sidewalk, 0.05, 0.31);
    addSurface(block.polygon, materials.residential, 0.21, 0.36);
    for (const lot of block.lots) {
      const material = lot.category === 'residential' ? (lot.number % 3 ? materials.residential : materials.residential2) : materials[lot.category];
      addSurface(lot.polygon, material, 0.035, 0.57, lot.id);
    }
  }
  for (const area of data.greenAreas) {
    addSurface(area.curb, materials.curb, 0.28);
    addSurface(area.polygon, area.forest ? materials.forest : materials.park, 0.04, 0.28);
  }
  finishSurfaces();
  createAmenities(data, model, world);
  surroundings = createSurroundings(data, model, world);
  nearbyUI = createSurroundingsUI();
  makeDividers();
  makeNumbers();
  vegetation = createVegetation(data, treeGroup, world);
  makeLotPicking();
  applyQuality(quality);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.ShadowMaterial({ color: '#687751', opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3.35;
  ground.receiveShadow = true;
  scene.add(ground);
  setCamera('perspective');
  await setupExperience();
  solarSimulation = createSolarSimulation({ scene, light: sunlight, hemisphere, renderer, vegetation, data, model, world, requestRender,
    getSelection: () => catalog.byId.get(experienceStore.get().selectedLotId),
    onVisibilityChange() { updateComposition(); focusSelectedTerrain(); },
  });
  experienceStore.subscribe(state => state.selectedLotId, () => solarSimulation.updateSelection());
  watchResponsiveLayout(updateComposition);
  if (!selectedLot) setCamera(mode);
  // Compile visible and hidden LOD materials during loading, not on first zoom.
  await renderer.compileAsync(scene, camera);
  const loading = document.querySelector('#loading');
  loading.style.opacity = '0';
  loading.style.pointerEvents = 'none';
  setTimeout(() => loading.remove(), 600);
}

function toggle(button, enabled) {
  button.classList.toggle('active', enabled);
  button.setAttribute('aria-pressed', String(enabled));
}

document.querySelector('#top')?.addEventListener('click', () => setCamera('top'));
document.querySelector('#perspective')?.addEventListener('click', () => setCamera('perspective'));
document.querySelector('#reset')?.addEventListener('click', () => setCamera(mode));
document.querySelector('#surroundings')?.addEventListener('click', event => {
  if (!surroundings) return;
  surroundings.visible = !surroundings.visible;
  nearbyUI?.setAvailable(surroundings.visible);
  toggle(event.currentTarget, surroundings.visible);
  requestRender();
});
document.querySelector('#vegetation')?.addEventListener('click', event => {
  treeGroup.visible = !treeGroup.visible;
  toggle(event.currentTarget, treeGroup.visible);
  requestRender();
});
document.querySelector('#labels')?.addEventListener('click', event => {
  showNumbers = !showNumbers;
  toggle(event.currentTarget, showNumbers);
  requestRender();
});
document.querySelector('#quality')?.addEventListener('change', event => {
  qualityMode = event.currentTarget.value;
  applyQuality(qualityMode === 'auto' ? (innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4) ? 'medium' : 'high') : qualityMode);
});

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  buyerUI?.updateTooltip(event.clientX, event.clientY);
}
renderer.domElement.addEventListener('pointerdown', event => {
  renderer.domElement.focus({ preventScroll: true });
  activePointers.add(event.pointerId);
  if (activePointers.size > 1) { if (pointerDown) pointerDown.dragged = true; return; }
  if (event.button === 0) pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
});
renderer.domElement.addEventListener('pointermove', event => {
  if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) pointerDown.dragged = true;
  if (event.pointerType === 'touch' || event.buttons || activePointers.size > 1) { setHovered(null); return; }
  updatePointer(event);
  pendingPick = true;
  requestRender();
});
renderer.domElement.addEventListener('pointerup', event => {
  activePointers.delete(event.pointerId);
  if (pointerDown?.id !== event.pointerId) return;
  if (!pointerDown.dragged && event.button === 0 && !activePointers.size) {
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const place = pickNearby();
    const label = !referencePlane?.visible && numbering.visible ? raycaster.intersectObjects(numbering.children, false).find(hit => hit.object.material.opacity > 0.3)?.object : null;
    if (place) nearbyUI?.open(place);
    else if (label && catalog) focusBlock(label.userData.block);
    else {
      const entry = pickLot();
      selectLot(entry?.lot.id === selectedLot?.lot.id ? null : entry?.lot.id || null);
    }
  }
  pointerDown = null;
  requestRender();
});
renderer.domElement.addEventListener('pointerleave', () => { pendingPick = false; setHovered(null); requestRender(); });
renderer.domElement.addEventListener('pointercancel', event => {
  activePointers.delete(event.pointerId);
  pointerDown = null;
  pendingPick = false;
  setHovered(null);
  requestRender();
});
window.addEventListener('keydown', event => { if (event.key === 'Escape' && !nearbyUI?.isOpen() && !solarSimulation?.isOpen()) { selectLot(null); experienceStore?.set({ collection: null }); } });
document.addEventListener('visibilitychange', () => { lastFrame = 0; frameSamples = []; requestRender(); });
reducedMotion.addEventListener('change', requestRender);
document.querySelector('#reference')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!referencePlane) {
    button.disabled = true;
    try {
      const texture = await new THREE.TextureLoader().loadAsync('/reference.jpg');
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      referencePlane = new THREE.Mesh(new THREE.PlaneGeometry(8650 * UNIT, 4758 * UNIT), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.63, depthWrite: false, depthTest: false }));
      referencePlane.rotation.x = -Math.PI / 2;
      referencePlane.position.y = 12;
      referencePlane.renderOrder = 15;
      referencePlane.visible = false;
      scene.add(referencePlane);
    } finally { button.disabled = false; }
  }
  referencePlane.visible = !referencePlane.visible;
  setHovered(null);
  toggle(button, referencePlane.visible);
  if (referencePlane.visible) setCamera('top');
  requestRender();
});
let resizeFrame = 0, previousViewportWidth = innerWidth, previousViewportHeight = innerHeight;
function resizeViewport() {
  resizeFrame = 0;
  syncVisualViewport();
  const widthChanged = previousViewportWidth !== innerWidth;
  const sizeChanged = widthChanged || previousViewportHeight !== innerHeight;
  previousViewportWidth = innerWidth; previousViewportHeight = innerHeight;
  if (!sizeChanged) { updateComposition(); return; }
  cameraFlight = null;
  resizeRenderer();
  if (camera.isPerspectiveCamera) {
    camera.aspect = innerWidth / innerHeight;
  } else {
    const halfHeight = (camera.top - camera.bottom) / 2;
    camera.left = -halfHeight * innerWidth / innerHeight;
    camera.right = halfHeight * innerWidth / innerHeight;
  }
  camera.updateProjectionMatrix();
  updateComposition();
  const editing = document.activeElement?.matches('input,textarea,select');
  if (widthChanged && !editing) {
    if (selectedLot) focusSelectedTerrain();
    else if (data && controls && camera.position.distanceTo(controls.target) > 650) setCamera(mode);
  }
  requestRender();
}
function scheduleViewportResize() {
  if (!resizeFrame) resizeFrame = requestAnimationFrame(resizeViewport);
}
window.addEventListener('resize', scheduleViewportResize);
window.visualViewport?.addEventListener('resize', scheduleViewportResize);

initialize().catch(error => {
  console.error(error);
  const loading = document.querySelector('#loading');
  if (loading) {
    loading.querySelector('p').textContent = `Não foi possível abrir a maquete: ${error.message}`;
    loading.querySelector('.loading-symbol').style.display = 'none';
  }
});
