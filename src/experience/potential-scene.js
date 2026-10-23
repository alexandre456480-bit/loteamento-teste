import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planPoint } from './potential-geometry.js';

function shapeFor(ring, world) {
  const shape = new THREE.Shape();
  ring.forEach((point, i) => { const p = world(point); if (i) shape.lineTo(p.x, -p.z); else shape.moveTo(p.x, -p.z); });
  shape.closePath(); return shape;
}
function unionShape(profile, world) {
  const shape = shapeFor(profile.outline, world);
  shape.holes = profile.holes.map(ring => shapeFor(ring, world));
  return shape;
}
export function buildCombinationOverlay(profile, world) {
  const group = new THREE.Group(); group.name = 'Conjunto conceitual de terrenos';
  if (!profile.outline || profile.ids.length < 2) return group;
  const geometry = new THREE.ShapeGeometry(unionShape(profile, world));
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0.619, 0);
  const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#4a9b9b', transparent: true, opacity: 0.2, depthWrite: false }));
  group.add(surface);
  for (const ring of [profile.outline, ...profile.holes]) {
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring.map(point => world(point, 0.646))), new THREE.LineBasicMaterial({ color: '#ffe0a0', depthWrite: false }));
    line.renderOrder = 4; group.add(line);
  }
  return group;
}

export function buildConcept(profile, option, world) {
  const group = new THREE.Group(); group.name = `Potencial ilustrativo: ${option.name}`;
  const batches = new Map();
  const definitions = {
    home: { color: '#eee7d4', roughness: 0.85 }, units: { color: '#e5e5d6', roughness: 0.88 },
    commerce: { color: '#b5cbd1', roughness: 0.72 }, roof: { color: '#5f7875', roughness: 0.82 },
    garden: { color: '#639b51', roughness: 1 }, path: { color: '#d7cba9', roughness: 0.95 },
    parking: { color: '#a3b1b1', roughness: 0.95 }, marking: { color: '#fff4d4', roughness: 0.9 },
  };
  const cornersFor = rect => rect.corners || [[rect.x, rect.z], [rect.x + rect.w, rect.z], [rect.x + rect.w, rect.z + rect.d], [rect.x, rect.z + rect.d]];
  function volume(rect, height, elevation, finish) {
    const points = cornersFor(rect).map(point => planPoint(point, profile.frame));
    const geometry = new THREE.ExtrudeGeometry(shapeFor(points, world), { depth: height, bevelEnabled: false, steps: 1, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2); geometry.translate(0, elevation, 0); geometry.clearGroups();
    if (!batches.has(finish)) batches.set(finish, []);
    batches.get(finish).push(geometry);
  }
  for (const rect of option.gardens) volume(rect, 0.022, 0.005, 'garden');
  for (const rect of option.paths) volume(rect, 0.025, 0.008, 'path');
  for (const rect of option.parking) {
    volume(rect, 0.025, 0.008, 'parking');
    const stripe = Math.min(rect.w * 0.035, 0.28);
    for (const x of [rect.x + stripe, rect.x + rect.w - stripe * 2]) volume({ x, z: rect.z + rect.d * 0.04, w: stripe, d: rect.d * 0.92 }, 0.008, 0.039, 'marking');
  }
  let maximumHeight = 0;
  for (const building of option.buildings) {
    const industrial = building.style === 'warehouse';
    const floorHeight = industrial ? building.floorHeight || 4.6 : 2.8;
    const material = ['store', 'shops', 'center', 'warehouse'].includes(building.style) ? 'commerce' : ['units', 'long', 'cluster'].includes(building.style) ? 'units' : 'home';
    for (let floor = 0; floor < building.floors; floor++) {
      volume(building, floorHeight - 0.12, floor * floorHeight, material);
      volume(building, 0.12, (floor + 1) * floorHeight - 0.12, 'roof');
    }
    maximumHeight = Math.max(maximumHeight, building.floors * floorHeight);
  }
  for (const [finish, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(item => item.dispose());
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(definitions[finish]));
    mesh.castShadow = !['path', 'parking', 'garden', 'marking'].includes(finish);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; group.add(mesh);
  }
  group.userData.baseHeight = 0.617;
  group.position.y = group.userData.baseHeight;
  group.userData.layout = { ...option, lotId: profile.ids[0], lotIds: [...profile.ids], fit: { height: maximumHeight / Math.max(1, option.floors) }, name: option.name };
  return group;
}

export function disposeConcept(group) {
  group.traverse(object => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
    else object.material?.dispose();
  });
}
