import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { arrangeForestTrees, parkTrees, amenityClearings } from './landscape.js';
import { createVegetationLOD } from './vegetation-lod.js';

const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const clamp = THREE.MathUtils.clamp;

// Ring-based leaf masses have lobed silhouettes, tapered ends and no spherical primitives.
function leafMass(center, radii, seed, detail) {
  const rings = detail === 2 ? 6 : detail === 1 ? 4 : 3;
  const sides = detail === 2 ? 11 : detail === 1 ? 9 : 7;
  const vertices = [], indices = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const profile = Math.pow(Math.max(0.001, Math.sin(t * Math.PI)), 0.58);
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2;
      const lobes = 1 + 0.15 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 5 - t * 4 + seed);
      vertices.push(
        center[0] + Math.cos(a) * radii[0] * profile * lobes + Math.sin(t * 4 + seed) * 0.08,
        center[1] + (t - 0.5) * radii[1] * 2,
        center[2] + Math.sin(a) * radii[2] * profile * lobes,
      );
      if (j < rings && i < sides) {
        const k = j * (sides + 1) + i;
        indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

function limb(points, radius, detail) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geometry = new THREE.TubeGeometry(path, detail === 2 ? 7 : 4, radius, detail === 2 ? 7 : 5, false).toNonIndexed();
  geometry.deleteAttribute('uv');
  return geometry;
}

function palmLeaves(detail) {
  const positions = [], indices = [];
  const sections = detail === 2 ? 9 : detail === 1 ? 6 : 4;
  for (let leaf = 0; leaf < 11; leaf++) {
    const a = leaf * 2.399;
    const length = 2.0 + Math.sin(leaf * 3.7) * 0.35;
    const offset = positions.length / 3;
    for (let j = 0; j <= sections; j++) {
      const t = j / sections;
      const reach = length * t;
      const height = 5.0 + Math.sin(t * Math.PI) * 0.9 - t * t * 0.95;
      const width = Math.sin(t * Math.PI) * 0.28 * (1 + Math.sin(t * 30) * 0.16);
      for (const side of [-1, 0, 1]) positions.push(
        Math.cos(a) * reach - Math.sin(a) * width * side,
        height - Math.abs(side) * 0.06,
        Math.sin(a) * reach + Math.cos(a) * width * side,
      );
      if (j < sections) {
        const k = offset + j * 3;
        indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

function treeAsset(type, detail) {
  const random = seeded(871 + type * 319);
  const foliage = [], wood = [];
  const column = type === 1, umbrella = type === 2, palm = type === 5;
  wood.push(limb([[0, 0, 0], [0.1, 1.5, -0.04], [-0.04, 3.1, 0.06], [0.13, palm ? 5 : 4.1, 0]], palm ? 0.14 : 0.17, detail));
  if (palm) foliage.push(palmLeaves(detail));
  else {
    const count = column ? 6 : 8;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399 + random() * 0.3;
      const reach = column ? 0.35 + random() * 0.3 : 0.65 + random() * (umbrella ? 1.2 : 0.85);
      const y = column ? 2.1 + i * 0.43 : umbrella ? 3.8 + random() * 0.5 : 3.1 + random() * 1.2;
      const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
      const size = 0.75 + random() * 0.5;
      foliage.push(leafMass([x, y, z], [size * (column ? 0.66 : 1.0), size * (umbrella ? 0.58 : column ? 0.95 : 0.8), size * (column ? 0.68 : 0.88)], type + i * 0.9, detail));
      if (i < (detail === 0 ? 2 : 5)) wood.push(limb([[0, 1.7 + i * 0.18, 0], [x * 0.45, y - 0.8, z * 0.45], [x, y - 0.3, z]], 0.055 + (5 - i) * 0.009, detail));
    }
  }
  const rawCrown = mergeGeometries(foliage, false), rawTrunk = mergeGeometries(wood, false);
  const crown = mergeVertices(rawCrown), trunk = mergeVertices(rawTrunk);
  // Soft canopy self-shading baked into shared vertices; no extra light or pass.
  const position = crown.attributes.position, normal = crown.attributes.normal;
  const shades = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const shade = 0.76 + 0.16 * clamp((position.getY(i) - 2) / 3.5, 0, 1) + 0.08 * Math.max(0, normal.getY(i));
    shades[i * 3] = shade; shades[i * 3 + 1] = shade; shades[i * 3 + 2] = shade;
  }
  crown.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  rawCrown.dispose(); rawTrunk.dispose();
  foliage.forEach(g => g.dispose());
  wood.forEach(g => g.dispose());
  return { crown, trunk };
}

// Bake the existing models into a small atlas on the CPU. Far trees remain in place,
// represented by six triangles instead of hundreds of canopy and branch triangles.
function makeTreeAtlas(assets) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 768;
  const ctx = canvas.getContext('2d');
  const colors = [0, 1, 2, 3, 4, 5].map(type => new THREE.Color().setHSL(type === 3 ? 0.92 : type === 4 ? 0.14 : 0.27, type === 3 ? 0.55 : 0.56, type === 3 ? 0.56 : type === 4 ? 0.51 : 0.32));
  const sun = new THREE.Vector3(-0.5, 1, 0.35).normalize();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3(), edge = new THREE.Vector3();
  const color = new THREE.Color();
  for (let type = 0; type < 6; type++) for (const top of [false, true]) {
    const tile = type * 2 + Number(top), ox = tile % 4 * 256, oy = Math.floor(tile / 4) * 256;
    const faces = [];
    for (const [geometry, base] of [[assets[type][0].trunk, new THREE.Color('#65553c')], [assets[type][0].crown, colors[type]]]) {
      const pos = geometry.attributes.position, indices = geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        a.fromBufferAttribute(pos, indices.getX(i)); b.fromBufferAttribute(pos, indices.getX(i + 1)); c.fromBufferAttribute(pos, indices.getX(i + 2));
        normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
        const baked = geometry.attributes.color;
        const shade = baked ? (baked.getX(indices.getX(i)) + baked.getX(indices.getX(i + 1)) + baked.getX(indices.getX(i + 2))) / 3 : 1;
        color.copy(base).multiplyScalar(shade * (0.7 + Math.max(0, normal.dot(sun)) * 0.65));
        faces.push({ points: [a.clone(), b.clone(), c.clone()], depth: top ? (a.y + b.y + c.y) / 3 : (a.z + b.z + c.z) / 3, color: color.getStyle() });
      }
    }
    faces.sort((first, second) => first.depth - second.depth);
    ctx.save(); ctx.beginPath(); ctx.rect(ox + 1, oy + 1, 254, 254); ctx.clip();
    for (const face of faces) {
      ctx.beginPath();
      face.points.forEach((point, i) => {
        const x = ox + 128 + point.x / 6.8 * 252;
        const y = top ? oy + 128 + point.z / 6.8 * 252 : oy + 254 - point.y / 6.6 * 252;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath(); ctx.fillStyle = face.color; ctx.fill();
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, colors };
}

function treeCards(type) {
  const parts = [];
  for (let plane = 0; plane < 3; plane++) {
    const top = plane === 2;
    const geometry = new THREE.PlaneGeometry(6.8, top ? 6.8 : 6.6);
    const tile = type * 2 + Number(top), uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ((tile % 4) + (1 + uv.getX(i) * 254) / 256) / 4, 1 - (Math.floor(tile / 4) + (1 + (1 - uv.getY(i)) * 254) / 256) / 3);
    if (top) geometry.rotateX(-Math.PI / 2).translate(0, 4.1, 0);
    else geometry.rotateY(plane * Math.PI / 2).translate(0, 3.3, 0);
    parts.push(geometry);
  }
  const result = mergeGeometries(parts, false);
  parts.forEach(g => g.dispose());
  return result;
}

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

export function createVegetation(data, group, world) {
  const random = seeded(47261);
  const trees = [];
  for (const block of data.blocks) for (const lot of block.lots) {
    const p = lot.frontage;
    const outward = new THREE.Vector2(p[0] - lot.label[0], p[1] - lot.label[1]).normalize();
    trees.push({ point: [p[0] + outward.x * 8, p[1] + outward.y * 8], size: 0.7 + random() * 0.3, type: Math.floor(random() * 3), secondary: false });
  }
  const forest = data.greenAreas.find(a => a.forest);
  const xs = forest.polygon.map(p => p[0]), ys = forest.polygon.map(p => p[1]);
  for (let y = Math.min(...ys); y < Math.max(...ys); y += 40) for (let x = Math.min(...xs); x < Math.max(...xs); x += 40) {
    const point = [x + (random() - 0.5) * 30, y + (random() - 0.5) * 30];
    if (inside(point, forest.polygon)) trees.push({ point, size: 0.82 + random() * 0.7, type: random() < 0.035 ? 3 : Math.floor(random() * 3), secondary: true });
  }
  const scale = 8650 / 1800;
  for (let t = 0; t <= 1; t += 0.043) trees.push({ point: [scale * (1176 + t * 205), scale * (468 - t * 87)], size: 0.82 + random() * 0.16, type: 3, secondary: false });
  for (let t = 0; t < 1; t += 0.027) trees.push({ point: [scale * (1349 + t * 394), scale * (45 + t * 876)], size: 0.62 + random() * 0.1, type: 4, secondary: false });
  // A few palms join the existing avenue planting, without adding any new planting footprint.
  trees.filter(tree => tree.type === 4).forEach((tree, i) => { if (i % 7 === 3) tree.type = 5; });
  arrangeForestTrees(trees, forest.polygon);

  // Thin only one in five candidates deep inside the dense right-hand forest.
  // Keep its outline, leisure clearings and every street/park tree untouched.
  let forestIndex = 0, removedTrees = 0;
  for (const tree of trees) {
    if (!tree.secondary || forestIndex++ % 5 !== 2) continue;
    if (amenityClearings.some(area => Math.hypot(tree.point[0] - area.center[0], tree.point[1] - area.center[1]) < area.radius + 100)) continue;
    const nearEdge = forest.polygon.some((a, i) => {
      const b = forest.polygon[(i + 1) % forest.polygon.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = clamp(((tree.point[0] - a[0]) * dx + (tree.point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      return Math.hypot(tree.point[0] - a[0] - t * dx, tree.point[1] - a[1] - t * dy) < 75;
    });
    if (!nearEdge) { tree.omit = true; removedTrees++; }
  }

  const foliageMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: THREE.FrontSide });
  const barkMaterial = new THREE.MeshLambertMaterial({ color: '#65553c' });
  const assets = Array.from({ length: 6 }, (_, type) => [treeAsset(type, 0), treeAsset(type, 1), treeAsset(type, 2)]);
  const atlas = makeTreeAtlas(assets);
  const cardMaterial = new THREE.MeshBasicMaterial({ map: atlas.texture, alphaTest: 0.38, side: THREE.DoubleSide, alphaToCoverage: true });
  const cards = Array.from({ length: 6 }, (_, type) => treeCards(type));
  const records = [];
  const object = new THREE.Object3D(), color = new THREE.Color();
  // Preserve the original seeded order, positions, dimensions, rotations and color variation.
  for (const sourceTrees of [trees, parkTrees]) for (let type = 0; type < 6; type++) for (const secondary of [false, true]) {
    for (const tree of sourceTrees.filter(tree => tree.type === type && tree.secondary === secondary)) {
      object.position.copy(world(tree.point, 0.27));
      object.rotation.set(0, random() * Math.PI * 2, 0);
      object.scale.set(tree.size * (0.88 + random() * 0.22), tree.size * (0.86 + random() * 0.25), tree.size);
      object.updateMatrix();
      const hue = type === 3 ? 0.9 + random() * 0.04 : type === 4 ? 0.125 + random() * 0.025 : 0.235 + random() * 0.075;
      color.setHSL(hue, type === 3 ? 0.55 : 0.5 + random() * 0.15, type === 3 ? 0.56 : type === 4 ? 0.51 : 0.26 + random() * 0.12);
      // Consume the same seeded variation even for omitted forest trees so
      // every remaining tree retains its original transform and color pattern.
      if (tree.omit) continue;
      const record = { matrix: object.matrix.clone(), color: color.clone(), position: object.position.clone(), secondary, type };
      records.push(record);
    }
  }
  const lod = createVegetationLOD({ records, assets, cards, atlas, group, foliageMaterial, barkMaterial, cardMaterial });
  // A shared contact-shadow atlas replaces thousands of far-tree shadow-map draws.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(32, 32, 3, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(34,47,25,0.8)'); gradient.addColorStop(0.65, 'rgba(34,47,25,0.35)'); gradient.addColorStop(1, 'rgba(34,47,25,0)');
  shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 64, 64);
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, opacity: 0.2, depthWrite: false }), records.length);
  records.forEach((entry, i) => {
    entry.matrix.decompose(object.position, object.quaternion, object.scale);
    object.position.y = entry.secondary ? 0.335 : 0.375;
    object.updateMatrix(); shadows.setMatrixAt(i, object.matrix);
  });
  shadows.computeBoundingSphere(); group.add(shadows);
  group.userData.treeCount = records.length;
  group.userData.removedForestTrees = removedTrees;

  // Fixed low-detail shadow geometry: independent of visible LOD and zoom,
  // split by species and street/forest so the solar toggle preserves both.
  const streetShadows = new THREE.Group(), forestShadows = new THREE.Group();
  forestShadows.visible = false; group.add(streetShadows, forestShadows);
  const invisible = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  let shadowAssetsReady = false;
  function prepareSolarShadows() {
    if (shadowAssetsReady) return;
    for (let type = 0; type < 6; type++) for (const secondary of [false, true]) {
      const entries = records.filter(record => record.type === type && record.secondary === secondary);
      if (!entries.length) continue;
      // Coarse closed silhouettes replace branch-by-branch shadow geometry.
      // Visible foliage remains unchanged; every retained tree still casts.
      const column = type === 1, palm = type === 5, umbrella = type === 2;
      const canopy = new THREE.SphereGeometry(1, 7, 4);
      canopy.scale(column ? 1 : 2.2, palm ? 0.48 : column ? 1.9 : umbrella ? 0.85 : 1.45, column ? 1 : 1.9);
      canopy.translate(0, palm ? 4.9 : column ? 4 : 3.8, 0);
      const trunk = new THREE.CylinderGeometry(0.15, 0.18, 3.8, 5).translate(0, 1.9, 0);
      const geometry = mergeGeometries([canopy, trunk], false);
      canopy.dispose(); trunk.dispose();
      const mesh = new THREE.InstancedMesh(geometry, invisible, entries.length);
      entries.forEach((record, i) => mesh.setMatrixAt(i, record.matrix));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.customDepthMaterial = depth; mesh.castShadow = true;
      // Shadow rendering uses onBeforeShadow; skip the invisible geometry's
      // vertex work in the normal color pass using its independent callbacks.
      mesh.onBeforeRender = () => { mesh.count = 0; };
      mesh.onAfterRender = () => { mesh.count = entries.length; };
      (secondary ? forestShadows : streetShadows).add(mesh);
    }
    shadowAssetsReady = true;
  }
  // The fixed street-tree shadows are cached and never rebuilt by zooming.
  prepareSolarShadows();

  // Three small shrub assets are confined to the existing forest, below the canopy.
  const shrubMaterial = new THREE.MeshStandardMaterial({ color: '#5a8f32', roughness: 1 });
  for (let type = 0; type < 3; type++) {
    const geometry = leafMass([0, 0.35, 0], [0.55 + type * 0.15, 0.35 + type * 0.12, 0.65], type * 1.7, 1);
    const entries = trees.filter((tree, i) => tree.secondary && !tree.omit && i % 11 === type);
    const shrubs = new THREE.InstancedMesh(geometry, shrubMaterial, entries.length);
    entries.forEach((tree, i) => {
      object.position.copy(world(tree.point, 0.32));
      object.rotation.set(0, i * 2.399, 0);
      object.scale.setScalar(0.9 + random() * 0.6);
      object.updateMatrix();
      shrubs.setMatrixAt(i, object.matrix);
    });
    shrubs.computeBoundingSphere();
    shrubs.receiveShadow = true;
    group.add(shrubs);
  }

  group.traverse(mesh => { mesh.updateMatrix(); mesh.matrixAutoUpdate = false; });

  return {
    treeCount: records.length,
    setSolarMode(enabled) {
      forestShadows.visible = enabled;
      if (!enabled) cardMaterial.color.set('#ffffff');
    },
    setSolarBrightness(value) { cardMaterial.color.setRGB(value, value, value); },
    update: lod.update,
  };
}
