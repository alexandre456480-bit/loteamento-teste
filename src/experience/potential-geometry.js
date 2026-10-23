// Read-only geometry operations in the supplied plan's pixel coordinates.
// They never edit, snap or replace the cadastral/source polygons.
const EPS = 0.0001;
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const signedArea = ring => ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
export const area = ring => Math.abs(signedArea(ring));
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return distance(p, [a[0] + dx * t, a[1] + dy * t]);
}
export function inside(p, ring, boundary = true) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (segmentDistance(p, a, b) < EPS) return boundary;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
export function bounds(ring) {
  return ring.reduce((box, p) => ({ minX: Math.min(box.minX, p[0]), maxX: Math.max(box.maxX, p[0]), minY: Math.min(box.minY, p[1]), maxY: Math.max(box.maxY, p[1]) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}
export function sharedLength(first, second) {
  let shared = 0;
  for (let i = 0; i < first.length; i++) {
    const a = first[i], b = first[(i + 1) % first.length], length = distance(a, b);
    if (length < EPS) continue;
    const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length;
    const intervals = [];
    for (let j = 0; j < second.length; j++) {
      const c = second[j], d = second[(j + 1) % second.length];
      if (Math.abs(cross(a, b, c)) / length > EPS || Math.abs(cross(a, b, d)) / length > EPS) continue;
      const t1 = (c[0] - a[0]) * ux + (c[1] - a[1]) * uy, t2 = (d[0] - a[0]) * ux + (d[1] - a[1]) * uy;
      const low = Math.max(0, Math.min(t1, t2)), high = Math.min(length, Math.max(t1, t2));
      if (high > low + EPS) intervals.push([low, high]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let end = 0;
    for (const [low, high] of intervals) { shared += Math.max(0, high - Math.max(low, end)); end = Math.max(end, high); }
  }
  return shared;
}

// Split collinear T junctions, cancel internal edges, then trace the exposed
// rings. Unlike a convex hull, this preserves concavities and enclosed holes.
export function unionOutline(polygons) {
  if (polygons.length === 1) return { outline: polygons[0].map(p => [...p]), holes: [] };
  const rings = polygons.map(ring => signedArea(ring) > 0 ? ring : [...ring].reverse());
  const vertices = rings.flat(), edges = new Map();
  const key = p => `${p[0].toFixed(4)}:${p[1].toFixed(4)}`;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], length = distance(a, b);
    if (length < EPS) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], cuts = [{ t: 0, point: a }, { t: 1, point: b }];
    for (const p of vertices) {
      if (Math.abs(cross(a, b, p)) / length > EPS) continue;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length);
      if (t > EPS && t < 1 - EPS) cuts.push({ t, point: p });
    }
    cuts.sort((a, b) => a.t - b.t);
    for (let j = 0; j < cuts.length - 1; j++) {
      const p = cuts[j].point, q = cuts[j + 1].point;
      if (distance(p, q) < EPS) continue;
      const start = key(p), end = key(q), reverse = `${end}>${start}`, forward = `${start}>${end}`;
      if (edges.has(reverse)) edges.delete(reverse); else edges.set(forward, { a: p, b: q, start, end });
    }
  }
  const outgoing = new Map();
  for (const edge of edges.values()) {
    if (outgoing.has(edge.start)) return null;
    outgoing.set(edge.start, edge);
  }
  const loops = [], visited = new Set();
  for (const edge of edges.values()) {
    if (visited.has(edge.start)) continue;
    const ring = []; let current = edge;
    while (current && !visited.has(current.start)) {
      visited.add(current.start); ring.push([...current.a]); current = outgoing.get(current.end);
    }
    if (!current || current.start !== edge.start || ring.length < 3) return null;
    loops.push(ring);
  }
  const outer = loops.filter(ring => signedArea(ring) > EPS), holes = loops.filter(ring => signedArea(ring) < -EPS);
  if (outer.length !== 1) return null;
  const expected = polygons.reduce((sum, ring) => sum + area(ring), 0);
  const actual = area(outer[0]) - holes.reduce((sum, ring) => sum + area(ring), 0);
  if (Math.abs(expected - actual) > Math.max(0.1, expected * 0.00001)) return null;
  return { outline: outer[0], holes };
}

export function frontFrame(lot) {
  let front = null, nearest = Infinity;
  lot.polygon.forEach((a, i) => {
    const b = lot.polygon[(i + 1) % lot.polygon.length];
    if (distance(a, b) < 1) return;
    const score = segmentDistance(lot.frontage, a, b);
    if (score < nearest) { nearest = score; front = [a, b]; }
  });
  const [a, b] = front || [lot.polygon[0], lot.polygon[1]], length = distance(a, b) || 1;
  let right = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  let inward = [-right[1], right[0]];
  const origin = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if ((lot.label[0] - origin[0]) * inward[0] + (lot.label[1] - origin[1]) * inward[1] < 0) { right = right.map(v => -v); inward = inward.map(v => -v); }
  return { origin, right, inward, front, frontLength: length };
}
export const localPoint = (point, frame) => { const dx = point[0] - frame.origin[0], dy = point[1] - frame.origin[1]; return [dx * frame.right[0] + dy * frame.right[1], dx * frame.inward[0] + dy * frame.inward[1]]; };
export const planPoint = (point, frame) => [frame.origin[0] + frame.right[0] * point[0] + frame.inward[0] * point[1], frame.origin[1] + frame.right[1] * point[0] + frame.inward[1] * point[1]];

export function containedRect(rect, outline, holes = []) {
  const corners = [[rect.x, rect.z], [rect.x + rect.w, rect.z], [rect.x + rect.w, rect.z + rect.d], [rect.x, rect.z + rect.d]];
  if (corners.some(p => !inside(p, outline) || holes.some(hole => inside(p, hole)))) return false;
  for (const ring of [outline, ...holes]) {
    if (holes.includes(ring) && ring.some(p => p[0] > rect.x && p[0] < rect.x + rect.w && p[1] > rect.z && p[1] < rect.z + rect.d)) return false;
    for (let i = 0; i < corners.length; i++) for (let j = 0; j < ring.length; j++) {
      const a = corners[i], b = corners[(i + 1) % corners.length], c = ring[j], d = ring[(j + 1) % ring.length];
      if (cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS) return false;
    }
  }
  return true;
}
export function fitEnvelope(outline, holes = []) {
  const box = bounds(outline), width = box.maxX - box.minX, depth = box.maxY - box.minY;
  let best = null;
  for (const wx of [0.88, 0.72, 0.56, 0.4]) for (const dz of [0.88, 0.72, 0.56, 0.4]) {
    const w = width * wx, d = depth * dz;
    if (best && w * d <= best.w * best.d) continue;
    for (const ox of [0, -0.08, 0.08]) for (const oz of [0, -0.08, 0.08]) {
      const rect = { x: (box.minX + box.maxX - w) / 2 + width * ox, z: (box.minY + box.maxY - d) / 2 + depth * oz, w, d };
      if (containedRect(rect, outline, holes)) best = rect;
    }
  }
  return best;
}
