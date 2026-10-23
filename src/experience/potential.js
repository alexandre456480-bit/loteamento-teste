import { area, bounds, distance, sharedLength, unionOutline, frontFrame, localPoint, fitEnvelope, segmentDistance } from './potential-geometry.js';
import { createPossibilities } from './potential-layouts.js';

export const POTENTIAL_NOTICE = 'As possibilidades apresentadas são conceituais. A viabilidade construtiva depende da legislação aplicável, recuos, zoneamento, aprovação e desenvolvimento de projeto técnico.';
const sumKnown = (lots, key) => lots.every(lot => Number.isFinite(lot[key]) && lot[key] > 0) ? lots.reduce((sum, lot) => sum + lot[key], 0) : null;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

export function createPotentialEngine(catalog) {
  const adjacency = new Map(), cache = new Map(), frames = new Map(), corners = new Map();
  const frameFor = lot => {
    if (!frames.has(lot.id)) frames.set(lot.id, frontFrame(lot));
    return frames.get(lot.id);
  };
  function cornerFor(lot) {
    if (corners.has(lot.id)) return corners.get(lot.id);
    const frame = frameFor(lot), blockRing = catalog.blocks.get(lot.blockId).polygon;
    const exterior = lot.polygon.map((a, i) => {
      const b = lot.polygon[(i + 1) % lot.polygon.length], length = distance(a, b);
      const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const gap = Math.min(...blockRing.map((p, j) => segmentDistance(midpoint, p, blockRing[(j + 1) % blockRing.length])));
      return { length, gap, direction: [(b[0] - a[0]) / (length || 1), (b[1] - a[1]) / (length || 1)] };
    }).filter(edge => edge.gap < 12 && edge.length > frame.frontLength * 0.22);
    const result = exterior.some((a, i) => exterior.slice(i + 1).some(b => Math.abs(dot(a.direction, b.direction)) < 0.6));
    corners.set(lot.id, result); return result;
  }
  function graph(blockId) {
    if (adjacency.has(blockId)) return adjacency.get(blockId);
    const lots = [...catalog.byId.values()].filter(lot => lot.blockId === blockId);
    const edges = new Map(lots.map(lot => [lot.id, new Map()]));
    const boxes = lots.map(lot => bounds(lot.polygon));
    for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;
      const shared = sharedLength(lots[i].polygon, lots[j].polygon);
      if (shared > 4) { edges.get(lots[i].id).set(lots[j].id, shared); edges.get(lots[j].id).set(lots[i].id, shared); }
    }
    adjacency.set(blockId, edges); return edges;
  }
  function connected(ids) {
    if (!ids.length || ids.some(id => !catalog.byId.has(id))) return false;
    const first = catalog.byId.get(ids[0]);
    if (ids.some(id => catalog.byId.get(id).blockId !== first.blockId)) return false;
    const edges = graph(first.blockId), allowed = new Set(ids), visited = new Set([ids[0]]), queue = [ids[0]];
    for (let index = 0; index < queue.length; index++) for (const next of edges.get(queue[index]).keys()) if (allowed.has(next) && !visited.has(next)) { visited.add(next); queue.push(next); }
    return visited.size === allowed.size;
  }
  function relationship(first, second) {
    const alignment = dot(frameFor(first).inward, frameFor(second).inward);
    return alignment < -0.65 ? 'back' : alignment > 0.7 ? 'side' : 'angled';
  }
  function candidates(ids) {
    if (!ids.length) return [];
    const lots = ids.map(id => catalog.byId.get(id)).filter(Boolean), selected = new Set(ids), neighbors = new Map();
    for (const lot of lots) for (const id of graph(lot.blockId).get(lot.id).keys()) {
      const next = catalog.byId.get(id);
      if (selected.has(id) || next.type === 'utility') continue;
      const relation = relationship(lot, next);
      const allowed = [...lots, next].every(item => ['available', 'unknown'].includes(item.status));
      neighbors.set(id, { lot: next, relation, allowed, label: relation === 'back' ? 'Ao fundo' : relation === 'side' ? 'Ao lado' : 'Contíguo' });
    }
    return [...neighbors.values()].sort((a, b) => Number(b.allowed) - Number(a.allowed) || Number(b.lot.status === 'available') - Number(a.lot.status === 'available') || a.lot.number - b.lot.number);
  }
  function profile(ids) {
    ids = [...new Set(ids)];
    if (!connected(ids)) return null;
    const key = `${ids[0]}:${ids.slice(1).sort().join(',')}`;
    if (cache.has(key)) return cache.get(key);
    const lots = ids.map(id => catalog.byId.get(id)), first = lots[0], frame = frameFor(first);
    const union = unionOutline(lots.map(lot => lot.polygon));
    const allPoints = lots.flatMap(lot => lot.polygon);
    const local = (union?.outline || allPoints).map(point => localPoint(point, frame));
    const holes = (union?.holes || []).map(ring => ring.map(point => localPoint(point, frame)));
    const box = bounds(local), rawWidth = box.maxX - box.minX, rawDepth = box.maxY - box.minY;
    const totalArea = sumKnown(lots, 'area'), rawArea = lots.reduce((sum, lot) => sum + area(lot.polygon), 0);
    const scale = totalArea && rawArea > 0 ? Math.sqrt(totalArea / rawArea) : null;
    const classifications = new Set(lots.map(lot => lot.type));
    const type = classifications.size === 1 ? first.type : 'mixed';
    const frontGroups = [];
    for (const lot of lots) {
      const direction = frameFor(lot).inward;
      let group = frontGroups.find(group => dot(group.direction, direction) > 0.97);
      if (!group) { group = { direction, lots: [], length: 0, known: true }; frontGroups.push(group); }
      group.lots.push(lot.id);
      if (lot.dimensions.front && !lot.measurementSegments?.length) group.length += lot.dimensions.front;
      else group.known = false;
    }
    const backToBack = lots.some((lot, i) => lots.slice(i + 1).some(other => graph(first.blockId).get(lot.id).has(other.id) && relationship(lot, other) === 'back'));
    const sideBySide = lots.length > 1 && frontGroups.length === 1;
    const frontage = frontGroups.length === 1 && frontGroups[0].known ? frontGroups[0].length : null;
    const width = lots.length === 1 ? first.dimensions.front || (scale ? rawWidth * scale : null) : frontage || (scale ? rawWidth * scale : null);
    const sides = [first.dimensions.left, first.dimensions.right].filter(Boolean);
    const depth = lots.length === 1 && sides.length ? sides.reduce((a, b) => a + b, 0) / sides.length : scale ? rawDepth * scale : null;
    const regularity = rawWidth * rawDepth > 0 ? rawArea / (rawWidth * rawDepth) : 0;
    // Corner is an explicit indication from the raster, not an approved access.
    const corner = lots.some(cornerFor);
    const fit = union ? fitEnvelope(local, holes) : null;
    const result = {
      key, ids, lots, type, area: totalArea, totalPrice: sumKnown(lots, 'totalPrice'), frame, scale,
      outline: union?.outline || null, holes: union?.holes || [], local, localHoles: holes, fit,
      width, depth, frontage, frontGroups, rawWidth, rawDepth, regularity, corner, backToBack, sideBySide,
      widthPartial: lots.length === 1 && Boolean(first.measurementSegments?.length),
      widthEstimated: lots.length > 1 ? !frontage : !first.dimensions.front,
      depthEstimated: lots.length > 1 || !sides.length,
      combination: lots.length === 1 ? 'single' : backToBack && frontGroups.length === 2 ? 'back' : sideBySide ? 'side' : 'irregular',
      issues: !union ? ['Não foi possível compor um contorno único confiável. As divisas precisam ser confirmadas antes de uma implantação conjunta.'] : [],
    };
    result.features = [
      { title: type === 'residential' ? 'Perfil residencial' : type === 'commercial' ? 'Perfil comercial' : type === 'utility' ? 'Infraestrutura' : 'Classificações diferentes', text: type === 'residential' ? 'Leitura voltada a moradia e exemplos residenciais para renda.' : type === 'commercial' ? 'Fachada, acesso, serviços e organização das atividades.' : type === 'mixed' ? 'Cada parte mantém sua classificação. Integrar os usos exige análise específica.' : 'Área destinada à infraestrutura, sem sugestões de ocupação privada.' },
      { title: regularity >= 0.84 ? 'Contorno aproximadamente regular' : 'Contorno com particularidades', text: regularity >= 0.84 ? 'A geometria permite explorar organizações mais diretas.' : 'Recortes e mudanças de largura influenciam a implantação; a área não é tratada como um retângulo cheio.' },
      { title: backToBack ? 'Frentes em lados diferentes' : width >= 15 ? 'Frente mais ampla' : depth && width && depth / width > 3 ? 'Perfil longitudinal' : 'Escala do terreno', text: backToBack ? 'Combinar os fundos amplia a profundidade. As frentes opostas não são somadas como uma fachada única.' : sideBySide ? 'Lotes contíguos voltados à mesma direção ampliam a leitura de fachada.' : !totalArea ? 'Confirme a área e as medidas para aprofundar esta leitura.' : totalArea < 250 ? 'A área favorece priorizar organizações compactas.' : totalArea >= 500 ? 'A área permite explorar mais distribuição, pátios e espaços comuns.' : 'Equilíbrio conceitual entre ocupação e áreas abertas.' },
      ...(corner ? [{ title: 'Indício de esquina na planta', text: 'O contorno se aproxima de duas direções do perímetro da quadra. A condição e os acessos devem ser confirmados.' }] : []),
    ];
    result.options = createPossibilities(result);
    if (cache.size >= 80) cache.delete(cache.keys().next().value);
    cache.set(key, result); return result;
  }
  return { profile, candidates, connected, frameFor };
}
