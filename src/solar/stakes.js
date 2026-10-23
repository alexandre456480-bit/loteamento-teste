import * as THREE from 'three';

// Equal-height reference stakes; these are simulation helpers, not buildings.
const HEIGHT = 4.5;
const WIDTH = 0.7;
const SURFACE = 0.605;

function interiorPoint(polygon) {
  let area = 0, x = 0, y = 0;
  polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  });
  const candidate = area ? [x / (3 * area), y / (3 * area)] : polygon[0];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > candidate[1]) !== (b[1] > candidate[1]) && candidate[0] < (b[0] - a[0]) * (candidate[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  if (inside) return candidate;
  // A concave parcel's area centroid can lie outside it. Use an interior
  // triangle instead; never substitute a bounding-box center across a road.
  const points = polygon.map(([px, py]) => new THREE.Vector2(px, py));
  let best = null, bestArea = -1;
  for (const indices of THREE.ShapeUtils.triangulateShape(points, [])) {
    const [a, b, c] = indices.map(index => points[index]);
    const triangleArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    if (triangleArea > bestArea) { bestArea = triangleArea; best = [(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3]; }
  }
  return best || candidate;
}

export function createSolarStakes(data, world) {
  const lots = data.blocks.flatMap(block => block.lots);
  const group = new THREE.Group();
  group.name = 'Estacas de referencia solar por lote';
  group.visible = false;
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(WIDTH, HEIGHT, WIDTH),
    new THREE.MeshStandardMaterial({ color: '#d3ad74', roughness: 0.86 }),
    lots.length,
  );
  const caps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(WIDTH, 0.22, WIDTH),
    new THREE.MeshStandardMaterial({ color: '#d4a747', roughness: 0.48, metalness: 0.25 }),
    lots.length,
  );
  const matrix = new THREE.Matrix4();
  lots.forEach((lot, index) => {
    const point = world(interiorPoint(lot.polygon), SURFACE);
    posts.setMatrixAt(index, matrix.makeTranslation(point.x, point.y + HEIGHT / 2, point.z));
    caps.setMatrixAt(index, matrix.makeTranslation(point.x, point.y + HEIGHT - 0.11, point.z));
  });
  posts.castShadow = true;
  posts.receiveShadow = true;
  caps.receiveShadow = true;
  // The cap fits inside the post's silhouette for the shadow pass.
  // Keep only one instanced draw call for all reference-stake shadows.
  posts.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere(); caps.computeBoundingSphere();
  group.add(posts, caps);
  return group;
}
