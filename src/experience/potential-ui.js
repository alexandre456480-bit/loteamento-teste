import { money, number, statusNames } from './catalog.js';
import { POTENTIAL_NOTICE } from './potential.js';
import { bounds, localPoint } from './potential-geometry.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const approx = value => Number.isFinite(value) ? `≈ ${number(Math.round(value))}` : 'A confirmar';
const lotLabel = lot => `L${String(lot.number).padStart(2, '0')}`;
const names = profile => profile.lots.map(lotLabel).join(' + ');
const setKey = ids => [...ids].sort().join('|');
const quantity = option => `${option.unitCount} ${option.unitCount === 1 ? option.unitSingular || 'unidade' : option.unitPlural || 'unidades'}`;
const optionFacts = option => `${approx(option.unitCount > 1 ? option.unitArea : option.totalBuiltArea)} m² ${option.unitCount > 1 ? 'por ' + (option.unitSingular || 'unidade') : 'de construção'} · ${option.floors} ${option.floors === 1 ? 'pavimento' : 'pavimentos'}`;

function diagram(profile, option) {
  if (!profile.outline) return '';
  const box = bounds(profile.local), width = box.maxX - box.minX, depth = box.maxY - box.minY;
  const margin = Math.max(width, depth) * 0.065, stroke = Math.max(width, depth) / 180;
  const path = ring => `${ring.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')}Z`;
  const rect = (item, className) => item.corners
    ? `<path class="${className}" d="${path(item.corners)}"/>`
    : `<rect class="${className}" x="${item.x}" y="${item.z}" width="${item.w}" height="${item.d}"/>`;
  return `<figure class="potential-diagram"><svg viewBox="${box.minX - margin} ${box.minY - margin} ${width + margin * 2} ${depth + margin * 2}" role="img" aria-label="Contorno dos terrenos e organização conceitual${option ? `: ${escape(option.name)}` : ''}"><path class="potential-ground" fill-rule="evenodd" d="${[profile.local, ...profile.localHoles].map(path).join(' ')}" stroke-width="${stroke}"/>${profile.lots.map(lot => `<path class="potential-divisa" d="${path(lot.polygon.map(point => localPoint(point, profile.frame)))}" stroke-width="${stroke * 0.6}"/>`).join('')}${option ? [...option.gardens.map(item => rect(item, 'potential-garden')), ...option.paths.map(item => rect(item, 'potential-path')), ...option.parking.map(item => rect(item, 'potential-parking')), ...option.buildings.map(item => rect(item, 'potential-building'))].join('') : ''}</svg><figcaption>${option ? 'Organização ilustrativa no contorno da maquete' : 'Contorno combinado · divisas originais preservadas'}</figcaption></figure>`;
}

export function createPotentialUI({ engine, store, actions, toast }) {
  const currentProfile = () => {
    const state = store.get();
    return engine.profile(state.potentialLotIds.length ? state.potentialLotIds : [state.selectedLotId]);
  };
  function metrics(option) {
    return `<div class="potential-metrics"><div><span>Exemplo conceitual</span><strong>${escape(quantity(option))}</strong></div><div><span>Pavimentos ilustrados</span><strong>${option.floors}</strong></div>${option.unitCount > 1 ? `<div><span>Área média por unidade</span><strong>${approx(option.unitArea)} m²</strong></div>` : ''}<div><span>Área construída ilustrada</span><strong>${approx(option.totalBuiltArea)} m²</strong></div><div><span>Ocupação no térreo</span><strong>${approx(option.footprintArea)} m²</strong></div><div><span>Área livre no térreo</span><strong>${approx(option.freeArea)} m²</strong></div><div><span>Circulação representada</span><strong>${approx(option.circulationArea)} m²</strong></div><div><span>Vagas representadas</span><strong>${option.parkingSpaces || 'Não representadas'}</strong></div></div><p class="potential-footnote">A área sem volume construído inclui circulação, jardins e vagas. Quantidades, áreas e alturas são ilustrativas, sem dimensionamento de acessibilidade, manobras ou aprovação.</p>`;
  }
  function render(lot, state) {
    const profile = currentProfile();
    if (!profile) return '<p class="muted">Selecione um terreno para explorar seu potencial.</p>';
    const expanded = state.potentialOpen;
    const root = engine.profile([lot.id]);
    const selected = profile.options.find(option => option.id === state.activeConcept);
    const neighbors = expanded ? engine.candidates(profile.ids) : [];
    return `<div class="terrain-potential ${profile.ids.length > 1 ? 'is-combined' : ''}"><p class="potential-eyebrow">O QUE ESTE TERRENO PODE OFERECER?</p><button type="button" class="potential-toggle" data-potential-action="toggle" aria-expanded="${expanded}" aria-controls="potential-body"><span><strong>${expanded ? 'Potencial do terreno' : 'Ver potencial deste terreno'}</strong><small>${profile.lots.length > 1 ? `${names(profile)} · ${number(profile.area)} m² no conjunto` : `${profile.options.length} ${profile.options.length === 1 ? 'possibilidade indicativa' : 'possibilidades indicativas'} para explorar`}</small></span><span aria-hidden="true">${expanded ? '−' : '+'}</span></button>
      <div id="potential-body" ${expanded ? '' : 'hidden'}>
      ${profile.lots.length > 1 ? `<div class="potential-combined"><strong>${names(profile)}</strong><span>${profile.area ? `${number(profile.area)} m² · soma das áreas informadas` : 'Área total a confirmar'}</span><p>${profile.combination === 'back' ? 'Fundos conectados: maior profundidade e frentes em lados diferentes.' : profile.combination === 'side' ? 'Lotes contíguos com frentes na mesma direção.' : 'Conjunto com mudanças de direção: o formato resultante foi considerado.'}</p><small>Valores e parcelamentos desta ficha continuam sendo do lote ${lotLabel(lot)}. A combinação é uma hipótese de análise; não altera as matrículas.</small></div>` : ''}
      <div class="potential-lot-pills">${profile.lots.map((item, index) => `<span>${lotLabel(item)}${index ? `<button type="button" data-potential-remove="${item.id}" aria-label="Remover ${lotLabel(item)} da combinação" ${engine.connected(profile.ids.filter(id => id !== item.id)) ? '' : 'disabled title="Remova primeiro os lotes que dependem desta conexão"'}>×</button>` : '<small>base</small>'}</span>`).join('')}</div>
      <div class="potential-dimensions"><div><span>${profile.frontage && profile.lots.length > 1 ? 'Frente somada · indicativa' : profile.widthPartial ? 'Trecho frontal informado' : profile.widthEstimated ? 'Largura estimada' : 'Frente informada'}</span><strong>${profile.width ? `${profile.widthEstimated || profile.lots.length > 1 ? '≈ ' : ''}${number(profile.width)} m` : 'A confirmar'}</strong></div><div><span>${profile.depthEstimated ? 'Profundidade estimada' : 'Laterais · média informada'}</span><strong>${profile.depth ? `≈ ${number(profile.depth)} m` : 'A confirmar'}</strong></div></div>
      ${profile.frontGroups.length > 1 ? `<p class="potential-footnote">${profile.frontGroups.length} direções de frente: ${profile.frontGroups.map(group => `${group.lots.map(id => lotLabel(profile.lots.find(lot => lot.id === id))).join(' + ')}${group.known ? ` · ${number(group.length)} m` : ' · medida a confirmar'}`).join(' / ')}. Essas frentes não formam uma fachada contínua.</p>` : ''}
      <details id="potential-neighbor-picker" class="potential-neighbors" ${state.potentialNeighborsOpen ? 'open' : ''}><summary>Amplie as possibilidades</summary><p>Lotes contíguos da mesma quadra. A posição e o contorno também entram na leitura.</p>${neighbors.map(({ lot: neighbor, label, allowed }) => `<button type="button" class="potential-neighbor" data-potential-add="${neighbor.id}" ${allowed ? '' : 'disabled'}><span><strong>+ ${lotLabel(neighbor)} <small>${label}</small></strong><small>${neighbor.area ? `${number(neighbor.area)} m²` : 'Área a confirmar'} · ${statusNames[neighbor.status]}</small></span><span aria-hidden="true">↗</span></button>`).join('') || '<p class="muted">Não há outros vizinhos com divisa compartilhada identificada neste contorno.</p>'}<p class="potential-footnote">A disponibilidade precisa ser confirmada. Lotes reservados, vendidos ou indisponíveis não podem ser adicionados. Vizinhança geométrica não confirma possibilidade de remembramento.</p></details>
      <h4>Possibilidades para ${profile.lots.length > 1 ? 'esta combinação' : 'este terreno'}</h4>
      <div class="potential-options">${profile.options.map(option => `<details class="potential-option ${state.activeConcept === option.id ? 'is-active' : ''}" data-potential-card="${option.id}" ${state.activeConcept === option.id ? 'open' : ''}><summary><span>${profile.lots.length > 1 && !root.options.some(base => base.id === option.id) ? '<span class="potential-new">Nova nesta combinação</span>' : ''}<strong class="potential-option-name">${escape(option.name)}</strong><span class="potential-option-facts">${escape(optionFacts(option))}</span></span><span class="potential-card-indicator" aria-hidden="true">+</span></summary><div class="potential-option-body"><p>${escape(option.reason)}</p><span class="potential-option-facts">${approx(option.freeArea)} m² livres no térreo</span><button type="button" data-potential-option="${option.id}" aria-pressed="${state.activeConcept === option.id}" ${state.conceptLoading ? 'disabled' : ''}>${state.activeConcept === option.id ? 'Visualizando na maquete' : 'Explorar na maquete'} <span aria-hidden="true">↗</span></button>${state.activeConcept === option.id && state.conceptLayout ? `<section class="potential-active"><div class="section-heading"><h4>Exemplo ilustrado</h4><button type="button" data-potential-action="clear-scene" aria-label="Remover organização da maquete">×</button></div>${metrics(option)}<div class="potential-map-key"><span><i class="key-built"></i>Volumes</span><span><i class="key-path"></i>Circulação</span><span><i class="key-parking"></i>Vagas</span><span><i class="key-garden"></i>Jardim</span></div></section>` : ''}</div></details>`).join('') || `<p class="muted">${profile.issues.length ? profile.issues.map(escape).join(' ') : 'As informações disponíveis ou o contorno não permitem compor um exemplo coerente. Confirme as medidas para aprofundar esta análise.'}</p>`}</div>
      ${state.conceptLoading ? '<p class="muted" role="status">Preparando a organização ilustrativa…</p>' : ''}
      <details class="potential-plan"><summary>Ver contorno e organização</summary>${diagram(profile, selected)}</details>
      <details class="potential-profile"><summary>Perfil deste ${profile.lots.length > 1 ? 'conjunto' : 'terreno'}</summary><div>${profile.features.map(feature => `<article><strong>${feature.title}</strong><p>${feature.text}</p></article>`).join('')}</div><p class="potential-footnote">O formato e a indicação de esquina vêm da planta raster. As dimensões combinadas são indicativas; medidas registradas de cada lote continuam na ficha.</p></details>
      ${profile.lots.length > 1 ? `<button type="button" class="potential-compare-set" data-potential-action="compare-set">Comparar este conjunto</button><button type="button" class="potential-reset" data-potential-action="reset">Voltar a analisar só ${lotLabel(lot)}</button>` : ''}
      </div><p class="potential-disclaimer">${POTENTIAL_NOTICE}</p></div>`;
  }
  function summary(ids) {
    const profile = engine.profile(ids);
    return profile ? `<section class="potential-comparison-summary"><h4>Potencial indicativo</h4><p>${profile.options.slice(0, 3).map(option => escape(option.name)).join(' · ') || 'Análise depende de informações complementares.'}</p>${profile.backToBack ? '<small>Profundidade ampliada · frentes opostas</small>' : profile.ids.length > 1 ? '<small>Geometria conjunta considerada</small>' : ''}</section>` : '';
  }
  function combinedCards(state) {
    return state.comparisonLotSets.map(ids => {
      const profile = engine.profile(ids); if (!profile) return '';
      return `<article class="potential-comparison-card"><div class="section-heading"><div><p class="eyebrow">QUADRA ${String(profile.lots[0].block).padStart(2, '0')}</p><h3>${names(profile)}</h3></div><button type="button" data-potential-uncompare="${setKey(ids)}" aria-label="Remover conjunto da comparação">×</button></div><strong>${profile.area ? `${number(profile.area)} m²` : 'Área a confirmar'}</strong><dl><div><dt>Soma dos valores individuais</dt><dd>${money(profile.totalPrice)}</dd></div><div><dt>Configuração</dt><dd>${profile.combination === 'back' ? 'Frentes opostas' : profile.combination === 'side' ? 'Frentes na mesma direção' : 'Contorno composto'}</dd></div></dl>${diagram(profile)}${summary(ids)}<p class="potential-footnote">Aquisição conjunta e disponibilidade a confirmar. Não há parcelamento conjunto calculado.</p><button type="button" class="buyer-primary" data-potential-view="${ids.join('|')}">Explorar este conjunto</button></article>`;
    }).join('');
  }
  function handleClick(button) {
    const state = store.get();
    if (button.dataset.potentialOption) { actions.showPotential(button.dataset.potentialOption); return true; }
    if (button.dataset.potentialAdd) {
      const candidate = engine.candidates(state.potentialLotIds).find(item => item.lot.id === button.dataset.potentialAdd);
      if (candidate?.allowed) actions.setPotentialLots([...state.potentialLotIds, candidate.lot.id]);
      return true;
    }
    if (button.dataset.potentialRemove) { actions.setPotentialLots(state.potentialLotIds.filter(id => id !== button.dataset.potentialRemove)); return true; }
    if (button.dataset.potentialUncompare) { store.set({ comparisonLotSets: state.comparisonLotSets.filter(ids => setKey(ids) !== button.dataset.potentialUncompare) }); return true; }
    if (button.dataset.potentialView) { actions.openPotentialSet(button.dataset.potentialView.split('|')); return true; }
    const action = button.dataset.potentialAction;
    if (!action) return false;
    if (action === 'toggle') store.set({ potentialOpen: !state.potentialOpen });
    if (action === 'clear-scene') actions.removeConcept();
    if (action === 'reset') actions.setPotentialLots([state.selectedLotId]);
    if (action === 'compare-set') {
      const ids = [...state.potentialLotIds];
      if (state.comparisonLotSets.some(set => setKey(set) === setKey(ids))) toast('Este conjunto já está na comparação.');
      else if (state.comparisonLotIds.length + state.comparisonLotSets.length >= 3) toast('Compare até três lotes ou conjuntos. Remova um para adicionar este.');
      else { store.set({ comparisonLotSets: [...state.comparisonLotSets, ids], collection: 'compare' }); toast('Conjunto adicionado à comparação.'); }
    }
    return true;
  }
  return { render, summary, combinedCards, handleClick };
}
