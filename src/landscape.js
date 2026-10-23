import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAerialContext } from './aerial-context.js';

// All coordinates refer to the supplied raster. These are landscape compositions,
// not cadastral dimensions or surveyed campus buildings.
export const amenityClearings = [
  { center: [7700, 3645], radius: 108 },
  { center: [7490, 3790], radius: 155 },
  { center: [7600, 3700], radius: 90 },
];
export const parkTrees = [
  [4030, 4390], [4370, 4390], [4390, 4170], [4070, 4190],
  [4390, 3890], [4070, 3740], [4270, 3540], [4250, 3220],
  [3850, 3405], [3975, 3310], [4110, 3225], [4290, 3085],
  [4380, 3360], [4405, 3590], [3870, 3670], [4010, 3850],
  [4010, 4035], [4025, 4240], [4030, 4520], [4400, 4510],
  [4430, 4340], [4430, 4175], [4430, 4010], [4430, 3800],
  [4350, 3750], [4130, 4140],
].map((point, i) => ({ point, size: i >= 20 ? 0.85 : 0.95 + (i % 3) * 0.12, type: i >= 20 && i <= 23 ? 1 : i % 4 === 0 ? 3 : i % 3, secondary: false }));

function inside([x, y], polygon) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}

// Keep every forest tree. Only trees occupying the reference leisure clearing
// are redistributed into the interior of the same forest, with fixed spacing.
export function arrangeForestTrees(trees, polygon) {
  const blocked = p => amenityClearings.some(a => Math.hypot(p[0] - a.center[0], p[1] - a.center[1]) < a.radius + 35);
  const displaced = trees.filter(t => t.secondary && blocked(t.point));
  const occupied = trees.filter(t => t.secondary && !blocked(t.point)).map(t => t.point);
  let next = 0;
  for (let y = 3970; y < 4540 && next < displaced.length; y += 24) {
    for (let x = 5900; x < 8000 && next < displaced.length; x += 24) {
      const p = [x, y];
      if (!inside(p, polygon) || blocked(p) || occupied.some(q => Math.hypot(q[0] - x, q[1] - y) < 22)) continue;
      displaced[next++].point = p;
      occupied.push(p);
    }
  }
}

// Equal-area circular island and curb, at the original island's area centroid.
// No road, block or lot coordinates are modified.
export function circularizeRoundabout(data) {
  const area = data.greenAreas.find(a => a.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'Rotatoria central');
  if (!area) return;
  const measure = polygon => {
    let twice = 0, x = 0, y = 0;
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length], cross = a[0] * b[1] - b[0] * a[1];
      twice += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
    });
    return { size: Math.abs(twice / 2), center: [x / (3 * twice), y / (3 * twice)] };
  };
  const original = measure(area.polygon), curb = measure(area.curb);
  const circle = size => Array.from({ length: 128 }, (_, i) => {
    const angle = i / 128 * Math.PI * 2;
    // Correct the discretized circle's area, rather than its ideal analytic area.
    const radius = Math.sqrt(2 * size / (128 * Math.sin(2 * Math.PI / 128)));
    return [original.center[0] + Math.cos(angle) * radius, original.center[1] + Math.sin(angle) * radius];
  });
  area.polygon = circle(original.size);
  area.curb = circle(curb.size);
}

function builder() {
  const root = new THREE.Group(), materials = new Map();
  // One small shared surface texture, with static UVs baked into the batches.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d'), pixels = context.createImageData(64, 64);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const shade = 236 + ((i * 13 + Math.floor(i / 256) * 7) % 20);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade; pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const grain = new THREE.CanvasTexture(canvas); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.colorSpace = THREE.SRGBColorSpace;
  const material = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, map: grain, roughness: 0.82 }));
    return materials.get(color);
  };
  const mesh = (parent, geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const object = new THREE.Mesh(geometry, material(color));
    object.position.set(...position); object.rotation.set(...rotation); parent.add(object); return object;
  };
  const box = (p, pos, size, color, ry = 0) => mesh(p, new THREE.BoxGeometry(...size), color, pos, [0, ry, 0]);
  const rod = (p, a, b, radius, color) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const object = mesh(p, new THREE.CylinderGeometry(radius, radius, direction.length(), 8), color);
    object.position.copy(from.add(to).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  };
  const disc = (p, pos, radius, color, height = 0.07) => mesh(p, new THREE.CylinderGeometry(radius, radius, height, 48), color, pos);
  const batch = (castsShadow = false) => {
    root.updateMatrixWorld(true);
    const buckets = new Map();
    const finishes = new Map();
    const timber = new Set(['796047', 'a67b4a', 'ba7f42']);
    const paintedMetal = new Set(['62766a', '527d75', '517f7e', '438da8', '4e9cbd', '3d948f', '667169', '577f79', '626d64']);
    root.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const positions = geometry.attributes.position, normals = geometry.attributes.normal;
      const uv = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        const horizontal = Math.abs(normals.getY(i)) > 0.6;
        const side = Math.abs(normals.getX(i)) > Math.abs(normals.getZ(i));
        uv[i * 2] = (side && !horizontal ? positions.getZ(i) : positions.getX(i)) * 0.6;
        uv[i * 2 + 1] = (horizontal ? positions.getZ(i) : positions.getY(i)) * 0.6;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      // Bake the original colors into vertices. Batch by physical finish rather
      // than paint color: the playground keeps every piece with fewer draws.
      const hex = object.material.color.getHexString();
      const finish = timber.has(hex) ? 'timber' : paintedMetal.has(hex) ? 'metal' : 'mineral';
      if (!finishes.has(finish)) finishes.set(finish, new THREE.MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, map: grain,
        roughness: finish === 'metal' ? 0.57 : finish === 'timber' ? 0.88 : 0.83,
        metalness: finish === 'metal' ? 0.16 : 0,
      }));
      const colors = new Float32Array(positions.count * 3), tint = object.material.color;
      for (let i = 0; i < positions.count; i++) {
        const shade = 0.92 + 0.08 * Math.max(0, normals.getY(i));
        colors[i * 3] = tint.r * shade; colors[i * 3 + 1] = tint.g * shade; colors[i * 3 + 2] = tint.b * shade;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const finishMaterial = finishes.get(finish);
      if (!buckets.has(finishMaterial)) buckets.set(finishMaterial, []);
      buckets.get(finishMaterial).push(geometry);
      object.geometry.dispose();
    });
    const result = new THREE.Group();
    for (const [mat, parts] of buckets) {
      const merged = mergeGeometries(parts, false);
      const object = new THREE.Mesh(mergeVertices(merged), mat);
      merged.dispose();
      object.matrixAutoUpdate = false;
      parts.forEach(g => g.dispose()); object.receiveShadow = true; object.castShadow = castsShadow; result.add(object);
    }
    materials.forEach(mat => mat.dispose());
    return result;
  };
  return { root, box, rod, disc, mesh, batch };
}

function kiosk(b, parent) {
  b.disc(parent, [0, 0.14, 0], 4.4, '#d7c7a5', 0.28);
  for (const x of [-2.65, 2.65]) for (const z of [-2.65, 2.65]) b.rod(parent, [x, 0.25, z], [x, 4.2, z], 0.16, '#796047');
  b.mesh(parent, new THREE.ConeGeometry(5.3, 2.4, 4), '#cc784b', [0, 5.2, 0], [0, Math.PI / 4, 0]);
  for (const z of [-3.55, 3.55]) b.box(parent, [0, 4.04, z], [7.4, 0.2, 0.2], '#796047');
  for (const x of [-3.55, 3.55]) b.box(parent, [x, 4.04, 0], [0.2, 0.2, 7.4], '#796047');
  for (let i = -3; i <= 3; i++) {
    b.rod(parent, [i, 4.04, -3.5], [i * 0.12, 6.36, -0.42], 0.035, '#a67b4a');
    b.rod(parent, [i, 4.04, 3.5], [i * 0.12, 6.36, 0.42], 0.035, '#a67b4a');
  }
  for (const x of [-2.65, 2.65]) {
    b.rod(parent, [x, 1.3, -2.65], [x, 1.3, 2.65], 0.075, '#a67b4a');
    for (const z of [-1.8, -0.9, 0, 0.9, 1.8]) b.rod(parent, [x, 0.3, z], [x, 1.3, z], 0.045, '#a67b4a');
  }
  b.box(parent, [0, 1.5, 0], [3.7, 0.18, 1.7], '#a67b4a');
  for (const z of [-1.55, 1.55]) {
    b.box(parent, [0, 0.85, z], [3.7, 0.17, 0.6], '#a67b4a');
    for (const x of [-1.3, 1.3]) b.box(parent, [x, 0.45, z], [0.18, 0.8, 0.4], '#626d64');
  }
}

function playground(b, parent) {
  b.disc(parent, [-3.8, 0.06, 0], 7.4, '#d6bf70', 0.12);
  b.disc(parent, [5.7, 0.08, 0], 5.1, '#78b4ba', 0.12);
  b.disc(parent, [-4.9, 0.06, -7.1], 5.8, '#d6bf70', 0.12);
  // Roofed play tower, ladder, slide and safety rails.
  for (const x of [-6.1, -3.7]) for (const z of [-1.2, 1.2]) b.rod(parent, [x, 0.1, z], [x, 4.8, z], 0.13, '#e4aa4f');
  b.box(parent, [-4.9, 2.3, 0], [2.8, 0.24, 2.8], '#ba7f42');
  b.mesh(parent, new THREE.ConeGeometry(2.4, 1.5, 4), '#e17d45', [-4.9, 5.1, 0], [0, Math.PI / 4, 0]);
  for (const z of [-1.35, 1.35]) b.rod(parent, [-6.1, 3.6, z], [-3.7, 3.6, z], 0.1, '#3d948f');
  const profile = new THREE.Shape();
  profile.moveTo(-3.7, 2.45); profile.bezierCurveTo(-2.5, 2.45, -1.2, 0.24, 0.6, 0.24);
  profile.lineTo(1, 0.24); profile.lineTo(1, 0.08); profile.lineTo(0.6, 0.08);
  profile.bezierCurveTo(-1.2, 0.08, -2.5, 2.29, -3.7, 2.29); profile.closePath();
  const chute = new THREE.ExtrudeGeometry(profile, { depth: 1.2, bevelEnabled: false, curveSegments: 12 }); chute.translate(0, 0, -0.6);
  b.mesh(parent, chute, '#4e9cbd');
  for (const z of [-0.67, 0.67]) {
    const rail = new THREE.CatmullRomCurve3([new THREE.Vector3(-3.7, 2.65, z), new THREE.Vector3(-2.5, 2.18, z), new THREE.Vector3(-0.5, 0.6, z), new THREE.Vector3(1, 0.45, z)]);
    b.mesh(parent, new THREE.TubeGeometry(rail, 16, 0.1, 6, false), '#438da8');
  }
  // A second tower, slatted bridge and climbing net enrich the play structure.
  for (const x of [-6.1, -3.7]) for (const z of [-9.2, -6.8]) b.rod(parent, [x, 0.1, z], [x, 4.8, z], 0.13, '#e4aa4f');
  b.box(parent, [-4.9, 2.3, -8], [2.8, 0.24, 2.8], '#ba7f42');
  b.mesh(parent, new THREE.ConeGeometry(2.4, 1.5, 4), '#4e9cbd', [-4.9, 5.1, -8], [0, Math.PI / 4, 0]);
  for (let z = -6.5; z <= -1.5; z += 0.42) b.box(parent, [-4.9, 2.28, z], [2.4, 0.16, 0.32], '#ba7f42');
  for (const x of [-6.1, -3.7]) {
    b.rod(parent, [x, 3.5, -6.8], [x, 3.5, -1.2], 0.065, '#517f7e');
    for (let z = -6.5; z <= -1.5; z += 0.7) b.rod(parent, [x, 2.3, z], [x, 3.5, z], 0.035, '#517f7e');
  }
  for (let z = -9.2; z <= -6.7; z += 0.5) b.rod(parent, [-8, 0.2, z], [-6.2, 2.4, z], 0.04, '#d7b74d');
  for (let t = 0; t <= 1; t += 0.2) b.rod(parent, [-8 + 1.8 * t, 0.2 + 2.2 * t, -9.2], [-8 + 1.8 * t, 0.2 + 2.2 * t, -6.8], 0.04, '#d7b74d');
  for (const x of [-6.2, -3.6]) b.rod(parent, [x, 0.2, 4], [x, 2.5, 1.5], 0.1, '#517f7e');
  for (let i = 0; i < 6; i++) b.rod(parent, [-6.2, 0.35 + i * 0.38, 3.8 - i * 0.42], [-3.6, 0.35 + i * 0.38, 3.8 - i * 0.42], 0.085, '#d7b74d');
  // Two-seat A-frame swing.
  for (const x of [3.1, 8.1]) for (const z of [-2.1, 2.1]) b.rod(parent, [x, 0.15, z], [x, 4.1, 0], 0.13, '#527d75');
  b.rod(parent, [3.1, 4.1, 0], [8.1, 4.1, 0], 0.16, '#d9ae53');
  for (const x of [4.4, 6.7]) {
    for (const dx of [-0.45, 0.45]) b.rod(parent, [x + dx, 4, 0], [x + dx, 1, 0], 0.035, '#667169');
    b.box(parent, [x, 0.95, 0], [1.15, 0.15, 0.65], '#de9753');
  }
  // Seesaw and two spring riders.
  b.box(parent, [-3, 0.65, -4.7], [0.5, 1.2, 0.7], '#5e8f88');
  const beam = b.box(parent, [-3, 1.1, -4.7], [4.9, 0.2, 0.5], '#e4ac50'); beam.rotation.z = 0.13;
  for (const x of [-5, -1]) b.rod(parent, [x, 1.2, -4.7], [x, 1.9, -4.7], 0.08, '#577f79');
  for (const x of [1, 3.3]) {
    b.rod(parent, [x, 0.1, 5], [x, 0.85, 5], 0.13, '#687c6c');
    b.box(parent, [x, 1, 5], [1.1, 0.38, 0.55], x === 1 ? '#d38b59' : '#65a5b4');
    b.box(parent, [x + 0.4, 1.35, 5], [0.3, 0.55, 0.45], '#e2bb68');
  }
  b.disc(parent, [-6.5, 0.38, 6], 1.8, '#4e9cbd', 0.2);
  b.rod(parent, [-6.5, 0.2, 6], [-6.5, 1.5, 6], 0.13, '#e4aa4f');
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, x = -6.5 + Math.cos(a) * 1.4, z = 6 + Math.sin(a) * 1.4;
    b.rod(parent, [x, 0.4, z], [x, 1.5, z], 0.065, '#e4aa4f');
    b.rod(parent, [-6.5, 1.5, 6], [x, 1.5, z], 0.065, '#e4aa4f');
  }
}

function picnic(b, p) {
  for (let i = -4; i <= 4; i++) b.box(p, [i * 0.92, 0.12, 0], [0.86, 0.24, 7], '#a67b4a');
  for (const x of [-3.6, 3.6]) for (const z of [-2.7, 2.7]) b.rod(p, [x, 0, z], [x, 4.2, z], 0.14, '#796047');
  for (let i = -5; i <= 5; i++) b.box(p, [i * 0.8, 4.3, 0], [0.25, 0.24, 7.4], '#796047');
  for (const z of [-2.7, 2.7]) b.box(p, [0, 4.05, z], [8.4, 0.3, 0.2], '#796047');
  b.box(p, [0, 1.55, 0], [3.9, 0.17, 1.6], '#a67b4a');
  for (const z of [-1.3, 1.3]) bench(b, p, 0, z, z < 0 ? Math.PI : 0);
  for (const x of [-1.4, 1.4]) b.box(p, [x, 0.8, 0], [0.18, 1.5, 1.1], '#62766a');
}

function toddlerGarden(b, p) {
  b.disc(p, [0, 0.1, 0], 5.2, '#d7c7a5', 0.2);
  b.disc(p, [0, 0.22, 0], 3.8, '#d6bf70', 0.08);
  const rim = new THREE.TorusGeometry(3.85, 0.16, 6, 40);
  b.mesh(p, rim, '#a67b4a', [0, 0.3, 0], [Math.PI / 2, 0, 0]);
  for (const [x, z] of [[-1.3, -0.5], [0.8, 1.2]]) {
    b.mesh(p, new THREE.CylinderGeometry(0.35, 0.24, 0.4, 10), '#4e9cbd', [x, 0.48, z]);
    b.rod(p, [x - 0.3, 0.64, z], [x + 0.3, 0.64, z], 0.045, '#e4aa4f');
  }
  for (const angle of [0, 2.1, 4.2]) b.rod(p, [Math.cos(angle) * 4, 0.2, Math.sin(angle) * 4], [Math.cos(angle) * 4, 4.5, Math.sin(angle) * 4], 0.09, '#796047');
  const shade = new THREE.BufferGeometry(); shade.setAttribute('position', new THREE.Float32BufferAttribute([4, 4.5, 0, Math.cos(4.2) * 4, 4.5, Math.sin(4.2) * 4, Math.cos(2.1) * 4, 4.5, Math.sin(2.1) * 4], 3));
  shade.setIndex([0, 1, 2]); shade.computeVertexNormals(); b.mesh(p, shade, '#78b4ba');
  bench(b, p, 0, 4.5, Math.PI);
}

function fitness(b, p) {
  b.disc(p, [0, 0.1, 0], 6.2, '#d5cbb1', 0.2);
  for (const x of [-4, -1.5, 1]) {
    b.rod(p, [x, 0, -2], [x, 3.5, -2], 0.1, '#517f7e');
    b.rod(p, [x, 3.5, -2], [x + 2.5, 3.5, -2], 0.1, '#e4aa4f');
  }
  b.rod(p, [3.5, 0, -2], [3.5, 3.5, -2], 0.1, '#517f7e');
  for (const x of [-3, 2.4]) {
    b.rod(p, [x, 0, 1], [x, 2.3, 1], 0.12, '#517f7e');
    b.rod(p, [x, 2.3, 1], [x, 2.3, 3], 0.1, '#e4aa4f');
    for (const dx of [-0.6, 0.6]) {
      b.rod(p, [x + dx, 2.1, 1.2], [x + dx, 0.45, 2.5], 0.07, '#517f7e');
      b.box(p, [x + dx, 0.4, 2.5], [0.55, 0.14, 0.8], '#a67b4a');
    }
  }
}

function bench(b, parent, x, z, angle = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = angle; parent.add(g);
  b.box(g, [0, 0.8, 0], [3, 0.18, 0.8], '#9e7d55');
  b.box(g, [0, 1.35, -0.4], [3, 0.85, 0.13], '#a5865d');
  for (const dx of [-1, 1]) b.box(g, [dx, 0.4, 0], [0.14, 0.8, 0.65], '#62766a');
}

function path(b, points, width, color, y = 0.39) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], c = points[i + 1], dx = c.x - a.x, dz = c.z - a.z;
    b.box(b.root, [(a.x + c.x) / 2, y, (a.z + c.z) / 2], [width, 0.07, Math.hypot(dx, dz)], color, Math.atan2(dx, dz));
  }
  for (const p of points) b.disc(b.root, [p.x, y, p.z], width / 2, color);
}

function anchor(b, world, point, fn, scale = 1, rotation = 0) {
  const g = new THREE.Group(); g.position.copy(world(point, 0.36)); g.scale.setScalar(scale); g.rotation.y = rotation; b.root.add(g); fn(b, g); return g;
}

export function createAmenities(data, model, world) {
  const b = builder();
  // Layouts stay strictly inside their original green-area boundaries.
  path(b, [[4435, 4500], [4230, 4460], [4200, 4300], [4300, 4100], [4360, 3800], [4250, 3430], [4020, 3430]].map(p => world(p)), 2, '#d5cbb1');
  path(b, [[4300, 4100], [4180, 3980], [4190, 3830]].map(p => world(p)), 1.8, '#d5cbb1');
  anchor(b, world, [4210, 3960], playground);
  anchor(b, world, [4175, 4340], kiosk);
  anchor(b, world, [4330, 4320], picnic);
  anchor(b, world, [3960, 3515], toddlerGarden);
  anchor(b, world, [4250, 3650], fitness);
  path(b, [[4230, 4460], [4330, 4400], [4330, 4320]].map(p => world(p)), 1.7, '#d5cbb1');
  path(b, [[4250, 3430], [4250, 3650], [4360, 3800]].map(p => world(p)), 1.7, '#d5cbb1');
  path(b, [[4020, 3430], [3960, 3430], [3960, 3515]].map(p => world(p)), 1.7, '#d5cbb1');
  // Segmented edging, waste bins, water station and bicycle stands are static
  // geometry in the same material batches, rather than independent objects.
  for (const point of [[4320, 4120], [4110, 4280], [4090, 3450]]) {
    anchor(b, world, point, (b, p) => {
      b.mesh(p, new THREE.CylinderGeometry(0.38, 0.32, 1.1, 10), '#62766a', [0, 0.55, 0]);
      b.disc(p, [0, 1.14, 0], 0.41, '#796047', 0.12);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4; b.rod(p, [Math.cos(a) * 0.34, 0.12, Math.sin(a) * 0.34], [Math.cos(a) * 0.34, 1.08, Math.sin(a) * 0.34], 0.04, '#a67b4a');
      }
    });
  }
  anchor(b, world, [4310, 4440], (b, p) => {
    for (const x of [-1, 0, 1]) {
      b.rod(p, [x, 0, 0], [x, 1.2, 0], 0.065, '#62766a');
      b.rod(p, [x, 1.2, 0], [x, 1.2, 1.2], 0.065, '#62766a');
      b.rod(p, [x, 1.2, 1.2], [x, 0, 1.2], 0.065, '#62766a');
    }
    b.box(p, [-3, 0.8, 0], [0.7, 1.6, 0.7], '#b1a98b');
    b.disc(p, [-3, 1.65, 0], 0.48, '#62766a', 0.12);
    b.rod(p, [-3, 1.72, 0], [-3, 1.95, 0], 0.055, '#62766a');
  });
  anchor(b, world, [4310, 4140], (b, p) => { bench(b, p, 0, 0, Math.PI / 2); bench(b, p, 0, 5, Math.PI / 2); });
  anchor(b, world, [4300, 3550], (b, p) => bench(b, p, 0, 0));
  for (const point of [[4100, 4470], [4360, 4310], [4365, 3550]]) {
    anchor(b, world, point, (b, p) => {
      b.disc(p, [0, 0.12, 0], 1.7, '#b1a98b', 0.24);
      b.disc(p, [0, 0.29, 0], 1.45, '#6e954b', 0.16);
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.399, radius = 0.35 + i * 0.1;
        b.mesh(p, new THREE.IcosahedronGeometry(0.23, 0), i % 2 ? '#d6b86b' : '#c97ea3', [Math.cos(angle) * radius, 0.48, Math.sin(angle) * radius]);
      }
    });
  }
  // The reference shows an orange-roof kiosk and yellow/blue play surfaces
  // at the north-east entrance to the forest.
  anchor(b, world, [7700, 3645], kiosk, 0.8, -0.3);
  anchor(b, world, [7490, 3790], playground, 0.82, -0.35);
  path(b, [[7730, 3565], [7700, 3645], [7600, 3700], [7490, 3790]].map(p => world(p)), 1.7, '#d5cbb1');
  anchor(b, world, [7620, 3815], (b, p) => bench(b, p, 0, 0, -0.35));
  // Lamps and planters along the Q12 park walk; no moving lights or animation.
  for (const p of [[4395, 4470], [4325, 4270], [4385, 4070], [4385, 3700], [4140, 3440]]) {
    anchor(b, world, p, (b, g) => {
      b.rod(g, [0, 0, 0], [0, 4.2, 0], 0.07, '#6a7b70');
      b.box(g, [0, 4.2, 0], [0.65, 0.18, 0.65], '#e0d9b7');
      b.disc(g, [0, 0.25, 0], 0.7, '#a59d82', 0.5);
      b.disc(g, [0, 0.55, 0], 0.57, '#83965b', 0.2);
    });
  }
  const result = b.batch(true); result.name = 'Lazer e paisagismo'; model.add(result);
}

function label(group, world, point, title, subtitle, width = 72, placeId, elevation = 25) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 288;
  const c = canvas.getContext('2d');
  const background = c.createLinearGradient(0, 0, 1024, 288); background.addColorStop(0, '#123452'); background.addColorStop(1, '#235d83');
  c.fillStyle = background; c.beginPath(); c.roundRect(6, 6, 1012, 276, 30); c.fill();
  c.strokeStyle = '#dfbb69'; c.lineWidth = 5; c.stroke();
  c.textAlign = 'center'; c.fillStyle = '#fff7e3'; c.font = '600 57px Segoe UI, sans-serif'; c.fillText(title, 512, 96, 950);
  c.fillStyle = '#d0e1ec'; c.font = '33px Segoe UI, sans-serif'; c.fillText(subtitle, 512, 158, 950);
  c.fillStyle = '#e7c77c'; c.font = '600 28px Segoe UI, sans-serif'; c.fillText('CLIQUE PARA CONHECER  ↗', 512, 235);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.position.copy(world(point, elevation)); sprite.scale.set(width, width * 288 / 1024, 1); sprite.renderOrder = 7;
  sprite.userData.placeId = placeId; group.add(sprite); group.userData.markers.push(sprite);
  const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([world(point, 0.3), world(point, elevation - width * 288 / 2048)]), new THREE.LineBasicMaterial({ color: '#c8a34d', transparent: true, opacity: 0.85 }));
  group.add(stem);
  return sprite;
}

function offsetPolygon(points, amount) {
  return points.map((p, i) => {
    const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
    const a = new THREE.Vector2(p[0] - before[0], p[1] - before[1]).normalize();
    const b = new THREE.Vector2(after[0] - p[0], after[1] - p[1]).normalize();
    const na = new THREE.Vector2(a.y, -a.x), nb = new THREE.Vector2(b.y, -b.x);
    const bisector = na.clone().add(nb).normalize().multiplyScalar(amount / Math.max(0.1, na.dot(na.clone().add(nb).normalize())));
    return [p[0] + bisector.x, p[1] + bisector.y];
  });
}

export function createSurroundings(data, model, world) {
  const group = new THREE.Group(); group.name = 'Entorno esquemático';
  group.add(createAerialContext(data, world));
  group.userData.markers = []; group.userData.targets = [];
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const hitBox = (point, size, placeId, rotation = 0) => {
    const target = new THREE.Mesh(new THREE.BoxGeometry(...size), hitMaterial);
    target.position.copy(point); target.rotation.y = rotation; target.userData.placeId = placeId;
    group.add(target); group.userData.targets.push(target);
  };
  const b = builder(), ring = offsetPolygon(data.perimeter, 115);
  // Roads are offset OUTSIDE the untouched perimeter. The original perimeter
  // remains the final authority for the subdivision's own streets.
  const route = [...ring, ring[0]].map(p => world(p));
  path(b, route, 12.5, '#d3d8cd', -0.09);
  path(b, route, 8.4, '#98a5a5', -0.01);
  for (let i = 0; i < ring.length; i++) {
    const a = world(ring[i]), z = world(ring[(i + 1) % ring.length]);
    const length = a.distanceTo(z), direction = z.clone().sub(a).normalize();
    if (i < 3) hitBox(a.clone().add(z).multiplyScalar(0.5), [9, 0.4, length], ['ab21', 'esperanca', 'flamboyant'][i], Math.atan2(direction.x, direction.z));
    for (let d = 5; d < length - 5; d += 9) {
      const p = a.clone().addScaledVector(direction, d);
      b.box(b.root, [p.x, 0.05, p.z], [0.13, 0.025, 3.2], '#e6e5ca', Math.atan2(direction.x, direction.z));
    }
  }
  // Quiet neighborhood volumes outside AB-21 and Esperança, subordinate to
  // the subdivision. They indicate urban context rather than specific houses.
  for (const edge of [0, 1]) {
    const a = world(ring[edge]), z = world(ring[edge + 1]);
    const tangent = z.clone().sub(a).normalize(), normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
    const angle = Math.atan2(tangent.x, tangent.z), length = a.distanceTo(z);
    for (let d = 40; d < length - 35; d += 57) {
      const street = a.clone().addScaledVector(tangent, d).addScaledVector(normal, 19);
      path(b, [street.clone().addScaledVector(normal, -15), street.clone().addScaledVector(normal, 15)], 3.2, '#d0d8cf', -0.03);
      for (const side of [-1, 1]) {
        const p = street.clone().addScaledVector(tangent, side * 11).addScaledVector(normal, 6);
        b.box(b.root, [p.x, 0.85, p.z], [7, 1.8, 10], '#d6dcd2', angle);
        b.box(b.root, [p.x, 1.85, p.z], [7.5, 0.2, 10.5], '#bbc8bc', angle);
      }
    }
  }
  // A restrained context strip below Alameda Flamboyant represents the campus.
  const bottomLeft = ring[3], bottomRight = ring[2];
  const lerp = (a, z, t) => [a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t];
  const campusCenter = lerp(bottomLeft, bottomRight, 0.60); campusCenter[1] += 410;
  hitBox(world(campusCenter, 1.7), [470, 5, 58], 'ufg');
  hitBox(world([campusCenter[0] - 1428, campusCenter[1] - 124], 2), [43, 4, 10], 'inf');
  hitBox(world([campusCenter[0] - 142, campusCenter[1] - 133], 2), [51, 4, 10], 'letras');
  anchor(b, world, campusCenter, (b, p) => {
    b.box(p, [0, -0.5, 0], [470, 0.3, 58], '#dce2d0');
    b.box(p, [0, -0.29, 0], [445, 0.08, 3.2], '#bbc5b6');
    for (const [x, z, length] of [[-150, -13, 42], [-95, 12, 33], [-15, -14, 50], [70, 12, 46], [145, -12, 42]]) {
      b.box(p, [x, 1.1, z], [length, 2.8, 9], '#c0c9bf');
      b.box(p, [x, 2.6, z], [length + 1, 0.3, 10], '#a8b6ad');
      b.box(p, [x, 0.02, z > 0 ? 5 : -5], [2, 0.08, 10], '#c4cbbb');
    }
    // Modest groves, repeated as merged low-poly assets, no expensive lights.
    for (let i = 0; i < 28; i++) {
      const x = -216 + i * 16, z = i % 2 ? 23 : -24;
      b.rod(p, [x, 0, z], [x, 2.2, z], 0.16, '#929c80');
      b.mesh(p, new THREE.IcosahedronGeometry(2.4, 0), '#a1b38b', [x, 3.6, z]);
    }
  });
  group.add(b.batch());
  const roadPoint = (edge, t, nudge) => {
    const p = lerp(ring[edge], ring[(edge + 1) % ring.length], t);
    const a = ring[edge], z = ring[(edge + 1) % ring.length], length = Math.hypot(z[0] - a[0], z[1] - a[1]);
    return [p[0] + (z[1] - a[1]) / length * nudge, p[1] - (z[0] - a[0]) / length * nudge];
  };
  label(group, world, roadPoint(0, 0.55, 145), 'Rua AB-21', 'Conexão com a vizinhança', 72, 'ab21', 28);
  label(group, world, roadPoint(1, 0.54, 160), 'Av. Esperança', 'Uma referência para seus caminhos', 78, 'esperanca', 30);
  label(group, world, roadPoint(2, 0.80, 95), 'Alameda Flamboyant', 'Ao lado do Campus Samambaia', 84, 'flamboyant', 26);
  label(group, world, [campusCenter[0] + 1500, campusCenter[1] + 190], 'UFG · Campus Samambaia', 'Educação, conhecimento e oportunidades', 108, 'ufg', 36);
  label(group, world, [campusCenter[0] - 1550, campusCenter[1] + 160], 'Instituto de Informática', 'INF · UFG', 65, 'inf', 22);
  label(group, world, [campusCenter[0] - 300, campusCenter[1] + 60], 'Faculdade de Letras', 'UFG', 62, 'letras', 24);
  model.add(group); return group;
}
