import { fitEnvelope, localPoint, frontFrame, planPoint } from './potential-geometry.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function createPossibilities(profile) {
  if (!profile.outline || !profile.scale || !profile.area || profile.type === 'utility') return [];
  if (profile.type === 'mixed') return mixedPossibility(profile);
  if (!profile.fit) return [];
  const options = [], { area: total, fit, scale, type } = profile;
  const width = Math.min(profile.width || Infinity, fit.w * scale), depth = fit.d * scale;
  function add(config) {
    if (total < config.minArea || width < config.minWidth || depth < config.minDepth) return;
    const layout = arrange(profile, config);
    if (layout) options.push(describePossibility({ ...config, ...layout, id: config.id }));
  }
  if (type === 'residential') {
    add({ id: 'income', name: 'Kitnets térreas', minArea: 230, minWidth: 5.8, minDepth: 12, floors: 1, style: 'units', unitSingular: 'kitnet', unitPlural: 'kitnets' });
    add({ id: 'residential-set', name: 'Kitnets com corredor central', minArea: 450, minWidth: 8.5, minDepth: 12, floors: total >= 600 ? 2 : 1, style: 'cluster', unitSingular: 'kitnet', unitPlural: 'kitnets' });
    if (profile.backToBack || (profile.depth && profile.width && profile.depth / profile.width > 3)) add({ id: 'long-courtyard', name: 'Kitnets com pátio nos fundos', minArea: 350, minWidth: 5.8, minDepth: 20, floors: 1, style: 'long', unitSingular: 'kitnet', unitPlural: 'kitnets' });
    add({ id: 'home', name: 'Casa térrea com jardim', minArea: 100, minWidth: 3.6, minDepth: 5, floors: 1, style: 'home', unitSingular: 'casa', unitPlural: 'casas' });
    add({ id: 'two-floors', name: 'Sobrado', minArea: 120, minWidth: 4, minDepth: 6, floors: 2, style: 'home', unitSingular: 'sobrado', unitPlural: 'sobrados' });
    add({ id: 'garden-home', name: 'Casa com quintal maior', minArea: 280, minWidth: 5.5, minDepth: 11, floors: 1, style: 'garden', unitSingular: 'casa', unitPlural: 'casas' });
    add({ id: 'townhouses', name: 'Sobrados lado a lado', minArea: 550, minWidth: 14, minDepth: 12, floors: 2, style: 'row-homes', unitSingular: 'sobrado', unitPlural: 'sobrados' });
  } else if (type === 'commercial') {
    add({ id: 'warehouse-small', name: 'Galpão pequeno', minArea: 180, minWidth: 6, minDepth: 12, floors: 1, style: 'warehouse', unitSingular: 'galpão', unitPlural: 'galpões', floorHeight: 4.6, smallWarehouse: true });
    add({ id: 'warehouse', name: 'Galpão maior com pátio', minArea: 450, minWidth: 10, minDepth: 20, floors: 1, style: 'warehouse', unitSingular: 'galpão', unitPlural: 'galpões', floorHeight: 6, yardDepth: 6, minFootprint: 180 });
    add({ id: 'warehouse-trucks', name: 'Galpão com pátio para caminhões', minArea: 900, minWidth: 18, minDepth: 32, floors: 1, style: 'warehouse', unitSingular: 'galpão', unitPlural: 'galpões', floorHeight: 6, yardDepth: 12, truckStudy: true, minFootprint: 250 });
    add({ id: 'store', name: 'Loja de rua', minArea: 100, minWidth: 3.6, minDepth: 5, floors: 1, style: 'store', unitSingular: 'loja', unitPlural: 'lojas' });
    add({ id: 'services', name: 'Salas para atendimento', minArea: 180, minWidth: 5, minDepth: 8, floors: 1, style: 'shops', unitSingular: 'sala', unitPlural: 'salas' });
    add({ id: 'shops', name: 'Lojas lado a lado', minArea: 320, minWidth: 9, minDepth: 10, floors: 1, style: 'shops', unitSingular: 'loja', unitPlural: 'lojas' });
    add({ id: 'offices', name: 'Salas comerciais em dois pisos', minArea: 400, minWidth: 8, minDepth: 12, floors: 2, style: 'shops', unitSingular: 'sala', unitPlural: 'salas' });
    add({ id: 'small-center', name: 'Lojas com estacionamento', minArea: 600, minWidth: 14, minDepth: 14, floors: 1, style: 'center', unitSingular: 'loja', unitPlural: 'lojas' });
  }
  const order = type === 'residential'
    ? ['income', 'residential-set', 'long-courtyard', 'home', 'two-floors', 'garden-home', 'townhouses']
    : ['warehouse-trucks', 'warehouse', 'warehouse-small', 'store', 'shops', 'services', 'offices', 'small-center'];
  return options.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

function describePossibility(option) {
  const area = value => Math.round(value).toLocaleString('pt-BR');
  const quantity = `${option.unitCount} ${option.unitCount === 1 ? option.unitSingular : option.unitPlural}`;
  const size = `cerca de ${area(option.unitArea)} m² ${option.unitCount > 1 ? 'por ' + option.unitSingular : 'de construção'}`;
  if (option.unitSingular === 'kitnet') {
    const arrangement = option.style === 'cluster' ? 'duas fileiras com corredor central' : option.style === 'long' ? 'uma fileira com corredor lateral e pátio nos fundos' : 'uma fileira com corredor lateral';
    option.name = `${option.unitCount} kitnets · ${option.style === 'cluster' ? option.floors > 1 ? 'dois pisos' : 'corredor central' : option.style === 'long' ? 'com pátio' : 'térreas'}`;
    option.reason = `Estudo com ${quantity}, ${size}, em ${arrangement}.${option.floors > 1 ? ' A área das unidades ainda precisa acomodar escada e circulação vertical no projeto.' : ''} A divisão interna de banheiro, cozinha e ambiente de estar precisa de projeto.`;
  } else if (option.style === 'warehouse') {
    option.reason = option.truckStudy
      ? `Galpão de cerca de ${area(option.totalBuiltArea)} m², com pátio frontal de ${area(option.yardDepth)} m de profundidade para estudar carga e descarga. O acesso e as manobras dependem do caminhão escolhido, do portão e da via; não estão validados nesta simulação.`
      : `Um galpão de cerca de ${area(option.totalBuiltArea)} m² para estudar depósito, estoque ou espaço de trabalho.${option.yardDepth ? ` Pátio frontal de ${area(option.yardDepth)} m de profundidade.` : ' Área frontal reservada para acesso.'} A atividade e os acessos precisam ser confirmados em projeto.`;
  } else {
    if (['shops', 'center'].includes(option.style)) option.name = `${quantity} · ${option.floors > 1 ? 'dois pisos' : option.style === 'center' ? 'com estacionamento' : option.unitSingular === 'sala' ? 'para atendimento' : 'lado a lado'}`;
    const outside = option.style === 'garden' ? 'quintal ampliado' : option.style === 'row-homes' ? 'acessos pela frente' : ['store', 'shops', 'center'].includes(option.style) ? 'acesso frontal às unidades' : 'jardim e acesso pela frente';
    option.reason = `Estudo com ${quantity}, ${size}, em ${option.floors === 1 ? 'um pavimento' : 'dois pavimentos'}, com ${outside}.`;
  }
  return option;
}

function arrange(profile, config) {
  const { x, z, w, d } = profile.fit, buildings = [], paths = [], parking = [], gardens = [];
  const meters2 = profile.scale * profile.scale, meter = 1 / profile.scale;
  const item = (rx, rz, rw, rd) => ({ x: x + w * rx, z: z + d * rz, w: w * rw, d: d * rd });
  let count = 1, floors = config.floors, yardDepth = 0;
  const put = (rect, units = 1) => buildings.push({ ...rect, floors, units, style: config.style, floorHeight: config.floorHeight });
  if (['home', 'garden'].includes(config.style)) {
    put(item(config.style === 'garden' ? 0.08 : 0.05, 0.4, config.style === 'garden' ? 0.58 : 0.78, config.style === 'garden' ? 0.46 : 0.54));
    paths.push(item(0.47, 0.02, 0.13, 0.35));
    gardens.push(item(config.style === 'garden' ? 0.69 : 0.65, 0.06, config.style === 'garden' ? 0.27 : 0.31, config.style === 'garden' ? 0.87 : 0.27));
  } else if (['units', 'long'].includes(config.style)) {
    const longitudinal = config.style === 'long';
    const width = w * (longitudinal ? 0.56 : 0.62), availableDepth = d * (longitudinal ? 0.60 : 0.69);
    const perFloor = Math.min(8, Math.floor(availableDepth * profile.scale / 3.4), Math.floor(width * availableDepth * meters2 * 0.94 / 23));
    if (perFloor < 2) return null;
    count = perFloor * floors;
    for (let i = 0; i < perFloor; i++) put({ x: x + w * 0.04, z: z + d * 0.25 + i * availableDepth / perFloor, w: width, d: availableDepth / perFloor * 0.94 });
    paths.push(item(longitudinal ? 0.63 : 0.68, 0.23, 0.16, longitudinal ? 0.62 : 0.72));
    gardens.push(item(0.87, 0.25, 0.1, longitudinal ? 0.57 : 0.69));
    if (longitudinal) gardens.push(item(0.04, 0.87, 0.92, 0.10));
  } else if (config.style === 'cluster') {
    const walkway = Math.max(w * 0.12, 1.2 * meter), unitWidth = (w * 0.88 - walkway) / 2, totalDepth = d * 0.62;
    const rows = Math.min(5, Math.floor(totalDepth * profile.scale / 3.6), Math.floor(unitWidth * totalDepth * meters2 * 0.93 / 25));
    if (rows < 2 || unitWidth * profile.scale < 3) return null;
    count = rows * 2 * floors;
    for (const bx of [x + w * 0.04, x + w * 0.96 - unitWidth]) for (let row = 0; row < rows; row++) put({ x: bx, z: z + d * 0.30 + row * totalDepth / rows, w: unitWidth, d: totalDepth / rows * 0.93 });
    paths.push({ x: x + w / 2 - walkway / 2, z: z + d * 0.26, w: walkway, d: d * 0.68 });
    gardens.push(item(0.04, 0.95, 0.92, 0.03));
  } else if (config.style === 'row-homes') {
    const perFloor = clamp(Math.floor(w * profile.scale / 4.7), 2, 6);
    count = perFloor;
    for (let i = 0; i < perFloor; i++) put(item(0.04 + i * 0.92 / perFloor, 0.39, 0.92 / perFloor * 0.92, 0.53));
    paths.push(item(0.04, 0.27, 0.92, 0.08)); gardens.push(item(0.04, 0.94, 0.92, 0.04));
  } else if (config.style === 'warehouse') {
    const yard = Math.max(d * 0.25, (config.yardDepth || 0) * meter);
    const buildingDepth = Math.min(d * 0.94 - yard, config.smallWarehouse ? 15 * meter : Infinity);
    const buildingWidth = Math.min(w * 0.92, config.smallWarehouse ? 12 * meter : Infinity);
    if (buildingDepth * profile.scale < (config.truckStudy ? 12 : 6)) return null;
    if (buildingWidth * buildingDepth * meters2 < (config.minFootprint || 0)) return null;
    yardDepth = yard * profile.scale;
    put({ x: x + w * 0.04, z: z + yard, w: buildingWidth, d: buildingDepth });
    // The yard is a study area, not a validated turning envelope or truck bay.
    paths.push({ x: x + w * 0.04, z: z + d * 0.01, w: w * 0.92, d: yard - d * 0.01 });
  } else {
    const perFloor = ['store', 'warehouse'].includes(config.style) ? 1 : clamp(Math.floor(w * profile.scale / 3.7), 1, 8);
    count = perFloor * floors;
    const center = config.style === 'center';
    for (let i = 0; i < perFloor; i++) put(item(0.04 + i * 0.92 / perFloor, center ? 0.50 : 0.38, 0.92 / perFloor * 0.97, center ? 0.44 : 0.56));
    paths.push(item(0.04, center ? 0.38 : 0.26, 0.92, 0.08)); gardens.push(item(0.85, 0.04, 0.11, 0.18));
  }
  // Spaces use metric minima only when the registered total area supplies a
  // scale. No undersized decorative rectangle is counted as a parking space.
  const frontDepth = d * (['units', 'long'].includes(config.style) ? 0.2 : 0.23);
  const availableWidth = w * (['home', 'garden'].includes(config.style) ? 0.4 : 0.78);
  if (config.style !== 'warehouse' && frontDepth * profile.scale >= 4.5 && availableWidth * profile.scale >= 2.3) {
    const slots = Math.min(config.style === 'warehouse' ? 2 : 8, Math.floor(availableWidth * profile.scale / 2.3));
    for (let i = 0; i < slots; i++) parking.push({ x: x + w * 0.04 + i * 2.3 * meter, z: z + d * 0.01, w: 2.15 * meter, d: 4.5 * meter });
  }
  const footprint = buildings.reduce((sum, rect) => sum + rect.w * rect.d, 0) * meters2;
  const built = footprint * floors;
  const circulation = paths.reduce((sum, rect) => sum + rect.w * rect.d, 0) * meters2;
  const parkingArea = parking.reduce((sum, rect) => sum + rect.w * rect.d, 0) * meters2;
  const gardenArea = gardens.reduce((sum, rect) => sum + rect.w * rect.d, 0) * meters2;
  return { buildings, paths, parking, gardens, floors, unitCount: count, yardDepth,
    footprintArea: footprint, totalBuiltArea: built, unitArea: built / count,
    circulationArea: circulation, parkingArea, gardenArea,
    freeArea: Math.max(0, profile.area - footprint), parkingSpaces: parking.length,
    occupancyRatio: footprint / profile.area,
  };
}

function mixedPossibility(profile) {
  const buildings = [], paths = [], parking = [], gardens = [];
  let footprint = 0, built = 0;
  for (const lot of profile.lots) {
    if (!['residential', 'commercial'].includes(lot.type)) return [];
    const frame = frontFrame(lot), outline = lot.polygon.map(point => localPoint(point, frame));
    const fit = fitEnvelope(outline);
    if (!fit) return [];
    const localRect = { x: fit.x + fit.w * 0.08, z: fit.z + fit.d * 0.35, w: fit.w * 0.84, d: fit.d * 0.56 };
    const corners = [[localRect.x, localRect.z], [localRect.x + localRect.w, localRect.z], [localRect.x + localRect.w, localRect.z + localRect.d], [localRect.x, localRect.z + localRect.d]].map(point => localPoint(planPoint(point, frame), profile.frame));
    const floors = lot.type === 'residential' ? 2 : 1;
    buildings.push({ corners, floors, units: 1, style: lot.type === 'commercial' ? 'store' : 'home' });
    const size = localRect.w * localRect.d * profile.scale ** 2;
    footprint += size; built += size * floors;
  }
  const homes = profile.lots.filter(lot => lot.type === 'residential').length;
  const stores = profile.lots.length - homes;
  return [{ id: 'separate-uses', name: 'Casas e lojas em lotes separados', reason: `Estudo com ${homes} ${homes === 1 ? 'sobrado' : 'sobrados'} nos lotes residenciais e ${stores} ${stores === 1 ? 'loja' : 'lojas'} nos lotes comerciais. Cada construção permanece no seu terreno; uma integração depende de análise técnica.`, buildings, paths, parking, gardens,
    floors: 2, unitCount: buildings.length, footprintArea: footprint, totalBuiltArea: built, unitArea: built / buildings.length,
    circulationArea: 0, parkingArea: 0, gardenArea: 0, freeArea: Math.max(0, profile.area - footprint), parkingSpaces: 0, occupancyRatio: footprint / profile.area,
  }];
}
