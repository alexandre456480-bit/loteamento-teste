import { lotMatches, money, normalizeLotQuery, number, statusNames, typeNames } from './catalog.js';
import { registerInterest } from './lead-service.js';
import { compactLayout } from '../responsive.js';
import { createPotentialUI } from './potential-ui.js';
import { renderLotPanel, lotPanelTabs } from './lot-panel.js';

const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  compare: '<path d="M8 3v18M16 3v18M3 7h10M11 17h10M4 3v5M20 16v5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3M9 14l6 3"/>',
  house: '<path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/>',
  units: '<path d="M3 21V7l6-4 6 4v14M15 9h6v12M6 9h1M11 9h1M6 13h1M11 13h1M6 17h1M11 17h1M18 13h1M18 17h1M2 21h20"/>',
  shop: '<path d="m4 3-2 6v3a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2V9l-2-6ZM4 15v6h16v-6M9 21v-5h6v5M2 9h20M8 3 7 9M16 3l1 6"/>',
  warehouse: '<path d="m3 9 9-6 9 6v12H3ZM7 21V11h10v10M7 15h10M7 18h10"/>',
  building: '<path d="M5 21V3h14v18M3 21h18M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.house}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const lotName = lot => `Q${String(lot.block).padStart(2, '0')} · L${String(lot.number).padStart(2, '0')}`;
const areaText = lot => lot.area ? `${number(lot.area)} m²` : 'Área a confirmar';
const dimensionText = lot => lot.boundaryMeasurements?.length ? `Divisas: ${lot.boundaryMeasurements.map(value => `${number(value)} m`).join(' · ')}` : Object.values(lot.dimensions).some(Boolean) ? ['front', 'back', 'left', 'right'].map((side, i) => `${['Frente', 'Fundos', 'Esquerda', 'Direita'][i]}: ${lot.dimensions[side] ? `${number(lot.dimensions[side])} m` : 'a confirmar'}`).join(' · ') : 'Dimensões a confirmar';

export function createExperienceUI({ catalog, potentialEngine, store, actions }) {
  const root = document.createElement('div');
  root.id = 'buyer-experience';
  root.innerHTML = `
    <section class="buyer-navigation" aria-label="Explorar o loteamento">
      <header class="explorer-heading"><div><p>SEU PRÓXIMO ENDEREÇO</p><h2>Encontre seu lote</h2></div><button data-action="toggle-explorer" aria-label="Recolher busca" aria-expanded="true" aria-controls="explorer-body"><span>Recolher</span>${icon('arrow')}</button></header>
      <div id="explorer-body"><form class="lot-search" role="search">
        <label class="block-navigation" for="block-navigation">Quadra<select id="block-navigation"><option value="">Escolha a quadra</option>${[...catalog.blocks.values()].map(b => `<option value="${b.id}">Quadra ${String(b.number).padStart(2, '0')}</option>`).join('')}</select></label>
        <label for="lot-query">Lote <span>opcional</span><input id="lot-query" name="query" autocomplete="off" placeholder="Número do lote" aria-controls="lot-results"></label>
        <button type="submit" class="explorer-search-button">${icon('search')}Encontrar lote</button>
      </form><div class="buyer-actions"><button data-action="filters" aria-expanded="false">${icon('filter')}<span>Filtrar</span></button><button data-action="favorites">${icon('heart')}<span>Salvos</span><b id="favorite-count" hidden>0</b></button><button data-action="comparison">${icon('compare')}<span>Comparar</span><b id="comparison-count" hidden>0</b></button></div>
      <div class="explorer-footer"><button data-action="overview">Ver loteamento inteiro ${icon('arrow')}</button><button data-action="clear-search" aria-label="Limpar busca">Limpar</button></div><p class="explorer-hint">Escolha uma quadra ou toque diretamente em um lote na maquete.</p></div>
    </section>
    <section class="buyer-results" id="lot-results" hidden aria-label="Lotes encontrados"></section>
    <section class="buyer-filters" hidden aria-label="Filtrar lotes"><div class="section-heading"><h2>Encontre seu lote</h2><button data-action="close-filters" aria-label="Fechar filtros">${icon('close')}</button></div>
      <form id="lot-filters"><fieldset><legend>Tipo</legend>${Object.entries(typeNames).map(([id, name]) => `<label><input type="checkbox" name="type" value="${id}">${name}</label>`).join('')}</fieldset>
      ${[...catalog.byId.values()].some(lot => lot.status !== 'unknown') ? `<fieldset><legend>Disponibilidade</legend>${Object.entries(statusNames).map(([id, name]) => `<label><input type="checkbox" name="status" value="${id}">${name}</label>`).join('')}</fieldset>` : ''}
      <label>Quadra<select name="block"><option value="">Todas as quadras</option>${[...catalog.blocks.values()].map(b => `<option value="${b.id}">${b.id}</option>`).join('')}</select></label>
      ${[['area', 'Área (m²)'], ['price', 'Valor total (R$)'], ['unit', 'Valor por m² (R$)']].map(([id, name]) => `${id === 'unit' ? '<details><summary>Mais filtros</summary>' : ''}<fieldset><legend>${name}</legend><div class="range-inputs"><label><span class="sr-only">${name}, mínimo</span><input type="number" min="0" step="any" name="${id}Min" placeholder="Mínimo"></label><span>até</span><label><span class="sr-only">${name}, máximo</span><input type="number" min="0" step="any" name="${id}Max" placeholder="Máximo"></label></div></fieldset>${id === 'unit' ? '</details>' : ''}`).join('')}
      <p class="muted">Dados ainda não confirmados não entram nas faixas de área e preço.</p><div class="filter-footer"><button type="reset">Limpar</button><button class="buyer-primary" type="submit">Ver resultados</button></div></form></section>
    <aside id="lot-panel" class="lot-panel" hidden aria-label="Informações do lote"></aside>
    <section class="comparison-drawer" hidden aria-label="Comparação de lotes"></section>
    <div class="lot-tooltip" role="tooltip" hidden></div><div class="buyer-toast" role="status" aria-live="polite" hidden></div>
  `;
  document.body.appendChild(root);
  const panel = root.querySelector('#lot-panel'), results = root.querySelector('.buyer-results');
  const filterPanel = root.querySelector('.buyer-filters'), comparison = root.querySelector('.comparison-drawer');
  const tooltip = root.querySelector('.lot-tooltip');
  let toastTimer, ignoreSheetClick = false;
  let resultLimit = 24;
  const navigation = root.querySelector('.buyer-navigation');
  function setExplorerExpanded(expanded) {
    const body = root.querySelector('#explorer-body');
    const button = root.querySelector('[data-action="toggle-explorer"]');
    body.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? 'Recolher busca' : 'Abrir busca');
    button.querySelector('span').textContent = expanded ? 'Recolher' : 'Abrir';
  }
  setExplorerExpanded(!compactLayout.matches);
  const positionResults = () => root.style.setProperty('--buyer-results-top', `${Math.round(navigation.getBoundingClientRect().bottom + 10)}px`);
  new ResizeObserver(positionResults).observe(navigation);
  window.addEventListener('resize', positionResults);
  compactLayout.addEventListener('change', () => { setExplorerExpanded(!compactLayout.matches); positionResults(); });
  const leadDrafts = new Map();
  const paymentSelections = new Map();
  const paymentModes = new Map();
  const potentialUI = createPotentialUI({ engine: potentialEngine, store, actions, toast });
  let lastPanelLotId = null;
  let lastPanelView = 'overview';
  let lastPotentialSet = '';
  const panelPositions = new Map(), panelDisclosures = new Map();
  const disclosureKey = (element, index) => element.id || element.dataset.potentialCard || `${element.className}:${index}`;
  function toast(message) {
    const element = root.querySelector('.buyer-toast');
    element.textContent = message; element.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; }, 5000);
  }
  function matchingLots() {
    const state = store.get();
    return [...catalog.byId.values()].filter(lot => lotMatches(lot, state.filters));
  }
  function resultCard(lot) {
    const favorite = store.get().favoriteLotIds.includes(lot.id);
    const compared = store.get().comparisonLotIds.includes(lot.id);
    return `<article class="lot-result"><button data-lot="${lot.id}"><strong>${lotName(lot)}</strong><span>${areaText(lot)} · ${typeNames[lot.type] || 'Outro'}</span><small>${money(lot.totalPrice)}</small></button><div class="result-shortcuts"><button data-favorite="${lot.id}" class="icon-button ${favorite ? 'is-favorite' : ''}" aria-label="${favorite ? 'Remover dos' : 'Adicionar aos'} favoritos: ${lotName(lot)}" aria-pressed="${favorite}" title="Salvar lote">${icon('heart')}</button><button data-compare="${lot.id}" class="icon-button ${compared ? 'is-compared' : ''}" aria-label="${compared ? 'Remover da comparação' : 'Comparar'}: ${lotName(lot)}" aria-pressed="${compared}" title="Comparar lote">${icon('compare')}</button></div></article>`;
  }
  function renderResults() {
    const state = store.get();
    if (!['favorites', 'results', 'search', 'browse'].includes(state.collection)) { results.hidden = true; return; }
    let lots = matchingLots(), heading = 'Lotes encontrados';
    if (state.collection === 'favorites') { lots = lots.filter(lot => state.favoriteLotIds.includes(lot.id)); heading = 'Seus favoritos'; }
    if (state.collection === 'search') {
      const block = root.querySelector('#block-navigation').value;
      if (block && !normalizeLotQuery(state.searchQuery)) lots = lots.filter(lot => lot.blockId === block);
      const exact = normalizeLotQuery(state.searchQuery);
      const compact = state.searchQuery.toUpperCase().replace(/QUADRA/g, 'Q').replace(/LOTE/g, 'L').replace(/\s/g, '');
      lots = lots.filter(lot => exact ? lot.id === exact : /^\d+$/.test(compact) ? String(lot.number).startsWith(String(Number(compact))) : lot.id.includes(compact) || `Q${lot.block}` === compact);
    }
    if (state.collection === 'browse') { const block = root.querySelector('#block-navigation').value; lots = lots.filter(lot => !block || lot.blockId === block); heading = block ? `Quadra ${Number(block.slice(1))}` : 'Explorar lotes'; }
    results.innerHTML = `<div class="section-heading"><h2>${heading} <small>${lots.length} ${lots.length === 1 ? 'lote' : 'lotes'}</small></h2><button data-action="close-results" aria-label="Fechar resultados">${icon('close')}</button></div>${lots.length ? lots.slice(0, resultLimit).map(resultCard).join('') : `<p class="empty-state">${state.collection === 'favorites' ? 'Toque no coração de um lote para guardá-lo aqui.' : 'Nenhum lote encontrado. Experimente outra quadra ou limpe os filtros.'}</p>`}${lots.length > resultLimit ? '<button class="more-results" data-action="more-results">Mostrar mais lotes ↓</button>' : ''}`;
    if (compactLayout.matches) setExplorerExpanded(false);
    results.hidden = false;
  }
  function renderPayments(lot) {
    if (lot.financingPlans.length || lot.withoutBalloon?.plans.length) return `<div data-payment-container="${lot.id}">${renderPaymentContent(lot)}</div>`;
    if (!lot.paymentOptions.length) return '<p class="muted">Consulte condições comerciais.</p>';
    return ['entry', 'installments'].map(stage => {
      const plans = lot.paymentOptions.filter(plan => plan.stage === stage);
      return plans.length ? `<h4>${stage === 'entry' ? 'Entrada' : 'Parcelamento'}</h4>${plans.slice(0, 3).map(plan => `<div class="payment-option"><span>${escape(plan.label)}</span><strong>${plan.installments ? `${number(plan.installments)} × ` : ''}${money(plan.amount)}</strong></div>`).join('')}${plans.length > 3 ? `<details><summary>Ver todas as condições</summary>${plans.slice(3).map(plan => `<div class="payment-option"><span>${escape(plan.label)}</span><strong>${plan.installments ? `${number(plan.installments)} × ` : ''}${money(plan.amount)}</strong></div>`).join('')}</details>` : ''}` : '';
    }).join('');
  }
  function paymentVariant(lot) {
    const mode = paymentModes.get(lot.id) || (lot.financingPlans.length ? 'with' : 'without');
    return mode === 'without'
      ? { mode, plans: lot.withoutBalloon?.plans || [], entry: lot.withoutBalloon?.entry, source: lot.withoutBalloon?.source }
      : { mode, plans: lot.financingPlans, entry: lot.entry, source: lot.source };
  }
  function renderPaymentContent(lot) {
    const variant = paymentVariant(lot), without = variant.mode === 'without';
    const selected = paymentSelections.get(`${lot.id}:${variant.mode}`);
    const available = variant.plans.filter(p => p.available !== false && p.monthlyAmount > 0);
    const plan = available.find(p => p.months === selected) || available[0];
    const entry = variant.entry;
    return `<div class="payment-modes" role="group" aria-label="Tipo de parcelamento"><button type="button" data-payment-id="${lot.id}" data-payment-mode="with" aria-pressed="${!without}" ${lot.financingPlans.length ? '' : 'disabled'}>Com balão</button><button type="button" data-payment-id="${lot.id}" data-payment-mode="without" aria-pressed="${without}" ${lot.withoutBalloon?.plans.length ? '' : 'disabled'}>Sem balão</button></div><p class="payment-mode-description">${without ? 'Parcelas mensais, sem balões anuais.' : 'Parcelas mensais com balões anuais.'}</p>${entry ? `<div class="payment-entry"><div><span>Pix</span><strong>${money(entry.pix)}</strong></div><div><span>No ato</span><strong>${money(entry.act)}</strong></div><div><span>Entrada parcelada</span><strong>${entry.installments} × ${money(entry.installmentAmount)}</strong></div></div>` : ''}${plan ? `<label class="plan-selector">Escolha o parcelamento<select data-payment-lot="${lot.id}">${variant.plans.map(p => `<option value="${p.months}" ${p.months === plan.months ? 'selected' : ''} ${p.available === false || !(p.monthlyAmount > 0) ? 'disabled' : ''}>${p.months} ${without ? 'parcelas mensais' : `mensais + ${p.annualPayments} balões anuais`}${p.available === false || !(p.monthlyAmount > 0) ? ' · sob consulta' : ''}</option>`).join('')}</select></label>` : ''}<div class="payment-plan" data-payment-summary="${lot.id}">${paymentSummary(plan, variant.mode)}</div>${variant.plans.some(p => p.available === false) ? '<p class="payment-source">Alguns prazos estão sob consulta.</p>' : ''}<p class="payment-source">Tabela ${without ? 'sem' : 'com'} balão${variant.source?.page ? ` · página ${variant.source.page}` : ''}. Confirme a vigência e as condições no atendimento.</p>`;
  }
  function paymentSummary(plan, mode = 'with') {
    if (!plan) return '<p>Parcelamento sob consulta.</p>';
    return `<div><strong>${money(plan.monthlyAmount)}</strong><span>cada uma das ${plan.months} parcelas mensais</span></div>${mode === 'without' ? '<p>Sem balões ou parcelas anuais neste plano.</p>' : `<div><strong>${money(plan.annualAmount)}</strong><span>cada um dos ${plan.annualPayments} balões anuais</span></div><p>As parcelas mensais e os balões anuais fazem parte do mesmo plano.</p>`}`;
  }
  function renderDimensions(lot) {
    const dimensions = Object.entries(lot.dimensions);
    const plan = lot.measurementSource?.planImage ? `<details class="lot-plan"><summary>Ver cotas na planta</summary><img src="${escape(lot.measurementSource.planImage)}" alt="Recorte da planta original: quadra ${lot.block}, lote ${lot.number}" loading="lazy" decoding="async"></details>` : '';
    if (lot.boundaryMeasurements?.length) return `<div class="dimension-grid">${lot.boundaryMeasurements.map((value, i) => `<div><span>Divisa ${i + 1}</span><strong>${number(value)} m</strong></div>`).join('')}</div><p class="muted">${escape(lot.measurementNote)}</p>${plan}`;
    if (!dimensions.some(([, value]) => value)) return `<p class="muted">Largura e comprimento a confirmar na planta.</p>${plan}`;
    const width = lot.dimensions.front || lot.dimensions.back;
    const lengths = [lot.dimensions.left, lot.dimensions.right].filter(Boolean);
    const length = lengths.length === 2 && lengths[0] !== lengths[1] ? `${number(Math.min(...lengths))} a ${number(Math.max(...lengths))}` : number(lengths[0]);
    const widthLabel = lot.dimensions.front ? lot.measurementSegments?.length ? 'Frente · trecho reto' : 'Largura na frente' : 'Largura nos fundos';
    return `<div class="dimension-grid"><div><span>${widthLabel}</span><strong>${number(width)} m</strong></div><div><span>${lengths.length === 2 && lengths[0] !== lengths[1] ? 'Comprimentos laterais' : 'Comprimento lateral'}</span><strong>${length} m</strong></div></div><details class="lot-dimension-details"><summary>Divisas e planta de referência</summary><div class="dimension-grid">${dimensions.map(([side, value]) => `<div><span>${{front:'Frente',back:'Fundos',left:'Lateral esquerda',right:'Lateral direita'}[side]}</span><strong>${value ? `${number(value)} m` : 'A confirmar'}</strong></div>`).join('')}</div>${lot.measurementSegments?.length ? `<p class="muted">Trechos adicionais de divisa: ${lot.measurementSegments.map(value => `${number(value)} m`).join(' + ')}. Consulte o contorno na planta.</p>` : ''}${lot.measurementNote ? `<p class="muted">${escape(lot.measurementNote)}</p>` : ''}${plan}<p class="payment-source">Cotas da planta de referência. Em lotes irregulares, as laterais podem ter medidas diferentes.</p></details>`;
  }
  function renderPanel() {
    const state = store.get(), lot = catalog.byId.get(state.selectedLotId);
    const sameLot = lastPanelLotId === lot?.id;
    const active = document.activeElement;
    const attribute = panel.contains(active) ? [...active.attributes].find(item => item.name.startsWith('data-') || item.name === 'name') : null;
    const focusKey = attribute ? { name: attribute.name, value: attribute.value } : null;
    if (sameLot) {
      panelPositions.set(lastPanelView, panel.querySelector('.lot-panel-scroll')?.scrollTop || 0);
      panelDisclosures.set(lastPanelView, new Map([...panel.querySelectorAll('details')].map((element, index) => [disclosureKey(element, index), element.open])));
    } else { panelPositions.clear(); panelDisclosures.clear(); }
    const potentialSet = state.potentialLotIds.join('|');
    if (sameLot && lastPotentialSet !== potentialSet) { panelPositions.set('potential', 0); panelDisclosures.delete('potential'); }
    lastPotentialSet = potentialSet;
    panel.hidden = !lot || !state.panelOpen;
    document.body.classList.toggle('lot-panel-open', !panel.hidden);
    if (panel.hidden) { lastPanelLotId = null; return; }
    if (compactLayout.matches) setExplorerExpanded(false);
    const tab = lotPanelTabs.some(item => item.id === state.lotPanelTab) && !(state.lotPanelTab === 'potential' && lot.type === 'utility') ? state.lotPanelTab : 'overview';
    panel.dataset.sheet = state.sheet; panel.dataset.tab = tab; panel.dataset.contact = String(state.leadOpen);
    lastPanelLotId = lot.id; lastPanelView = state.leadOpen ? 'contact' : tab;
    panel.innerHTML = renderLotPanel({ lot, state, tab, icon, catalog, renderDimensions, renderPayments, renderPotential: potentialUI.render });
    for (const [name, value] of Object.entries(leadDrafts.get(lot.id) || {})) {
      const input = panel.querySelector(`#interest-form [name="${name}"]`);
      if (input) input.value = value;
    }
    const disclosures = panelDisclosures.get(lastPanelView);
    panel.querySelectorAll('details').forEach((element, index) => {
      const key = disclosureKey(element, index);
      if (disclosures?.has(key)) element.open = disclosures.get(key);
    });
    panel.querySelector('.lot-panel-scroll').scrollTop = panelPositions.get(lastPanelView) || 0;
    if (sameLot && focusKey) {
      const element = panel.querySelector(`[${focusKey.name}="${focusKey.value}"]`);
      if (element?.getClientRects().length) element.focus({ preventScroll: true });
    }
  }
  function selectPanelTab(tab) {
    const state = store.get(), lot = catalog.byId.get(state.selectedLotId);
    if (!lot || !lotPanelTabs.some(item => item.id === tab) || (tab === 'potential' && lot.type === 'utility')) return;
    store.set({ lotPanelTab: tab, leadOpen: false, potentialOpen: tab === 'potential' || state.potentialOpen,
      sheet: compactLayout.matches && state.sheet === 'collapsed' ? 'half' : state.sheet });
    panel.querySelector(`#lot-tab-${tab}`)?.focus({ preventScroll: true });
  }
  function renderComparison() {
    const state = store.get();
    comparison.hidden = state.collection !== 'compare';
    if (comparison.hidden) return;
    const count = state.comparisonLotIds.length + state.comparisonLotSets.length;
    comparison.innerHTML = `<div class="section-heading"><div><p class="eyebrow">SUA ESCOLHA, LADO A LADO</p><h2>Comparar terrenos <small>${count}/3</small></h2></div><button data-action="close-results" aria-label="Fechar comparação">${icon('close')}</button></div><div class="comparison-cards">${state.comparisonLotIds.map(id => {
      const lot = catalog.byId.get(id);
      return `<article><div class="section-heading"><h3>${lotName(lot)}</h3><button data-uncompare="${id}" aria-label="Remover lote da comparação">${icon('close')}</button></div><strong>${areaText(lot)}</strong><dl><div><dt>Valor total</dt><dd>${money(lot.totalPrice)}</dd></div><div><dt>Valor por m²</dt><dd>${money(lot.pricePerM2)}</dd></div><div><dt>Disponibilidade</dt><dd>${statusNames[lot.status]}</dd></div><div><dt>Tipo</dt><dd>${typeNames[lot.type]}</dd></div></dl><p class="muted">${escape(dimensionText(lot))}</p>${potentialUI.summary([id])}<details><summary>Condições</summary>${renderPayments(lot)}</details><button class="buyer-primary" data-lot="${id}">Ver na maquete</button></article>`;
    }).join('')}${potentialUI.combinedCards(state)}${count ? '' : '<p class="empty-state">Selecione um lote ou conjunto e use “Comparar”. Você pode adicionar até três.</p>'}</div><p class="potential-disclaimer">As possibilidades são conceituais e dependem de legislação, recuos, zoneamento e projeto técnico. Não representam aprovação ou garantia de uso.</p>`;
  }
  function renderCounts() {
    for (const [id, count] of [['favorite-count', store.get().favoriteLotIds.length], ['comparison-count', store.get().comparisonLotIds.length + store.get().comparisonLotSets.length]]) {
      const badge = root.querySelector(`#${id}`); badge.textContent = count; badge.hidden = count === 0;
    }
    root.querySelector('[data-action="favorites"]').setAttribute('aria-pressed', String(store.get().collection === 'favorites'));
    root.querySelector('[data-action="comparison"]').setAttribute('aria-pressed', String(store.get().collection === 'compare'));
  }
  function toggleFavorite(id) {
    store.set(state => ({ favoriteLotIds: state.favoriteLotIds.includes(id) ? state.favoriteLotIds.filter(value => value !== id) : [...state.favoriteLotIds, id] }));
  }
  function addComparison(id) {
    const ids = store.get().comparisonLotIds;
    if (ids.includes(id)) store.set({ comparisonLotIds: ids.filter(value => value !== id) });
    else if (ids.length + store.get().comparisonLotSets.length >= 3) toast('Você pode comparar até três lotes ou conjuntos. Remova um para adicionar outro.');
    else { store.set({ comparisonLotIds: [...ids, id] }); toast('Lote adicionado à comparação.'); }
  }
  async function shareLot() {
    const lot = catalog.byId.get(store.get().selectedLotId);
    const url = new URL(`/lote/${lot.id}`, location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: `Parque Universitário · ${lotName(lot)}`, url });
      else { await navigator.clipboard.writeText(url); toast('Link do lote copiado.'); }
    } catch (error) {
      if (error.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(url); toast('Link do lote copiado.'); }
      catch { toast(`Link deste lote: ${url}`); }
    }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.lotTab) { selectPanelTab(button.dataset.lotTab); return; }
    if (potentialUI.handleClick(button)) return;
    if (button.dataset.action === 'sheet' && ignoreSheetClick) return;
    if (button.dataset.paymentMode) {
      const id = button.dataset.paymentId, lot = catalog.byId.get(id), mode = button.dataset.paymentMode;
      if (!lot || (mode === 'without' ? !lot.withoutBalloon?.plans.length : !lot.financingPlans.length)) return;
      const activeContainer = button.closest('[data-payment-container]');
      const previous = paymentVariant(lot);
      const previousMonth = paymentSelections.get(`${id}:${previous.mode}`) || previous.plans.find(p => p.available !== false && p.monthlyAmount > 0)?.months;
      paymentModes.set(id, mode);
      const next = paymentVariant(lot);
      if (!paymentSelections.has(`${id}:${mode}`) && next.plans.some(p => p.months === previousMonth && p.available !== false && p.monthlyAmount > 0)) paymentSelections.set(`${id}:${mode}`, previousMonth);
      root.querySelectorAll(`[data-payment-container="${id}"]`).forEach(element => { element.innerHTML = renderPaymentContent(lot); });
      activeContainer?.querySelector(`[data-payment-mode="${mode}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.lot) { store.set({ collection: null }); actions.selectLot(button.dataset.lot); return; }
    if (button.dataset.favorite) { toggleFavorite(button.dataset.favorite); return; }
    if (button.dataset.uncompare) { addComparison(button.dataset.uncompare); return; }
    if (button.dataset.compare) { addComparison(button.dataset.compare); return; }
    const action = button.dataset.action, state = store.get();
    if (compactLayout.matches && ['filters', 'favorites', 'comparison'].includes(action)) setExplorerExpanded(false);
    if (['favorites', 'comparison', 'close-results', 'overview', 'clear-search', 'toggle-explorer'].includes(action)) { filterPanel.hidden = true; root.querySelector('[data-action="filters"]').setAttribute('aria-expanded', 'false'); }
    if (action === 'more-results') { resultLimit += 24; renderResults(); }
    if (action === 'overview') { store.set({ collection: null }); actions.selectLot(null, { focus: false }); actions.overview(); }
    if (action === 'toggle-explorer') {
      setExplorerExpanded(root.querySelector('#explorer-body').hidden);
      store.set({ collection: null }); filterPanel.hidden = true;
    }
    if (action === 'clear-search') {
      root.querySelector('#lot-query').value = ''; root.querySelector('#block-navigation').value = '';
      store.set({ searchQuery: '', filters: {}, collection: null }); root.querySelector('#lot-filters').reset();
      store.set({ collection: null }); actions.selectLot(null, { focus: false }); actions.overview();
    }
    if (action === 'close-lot') actions.selectLot(null);
    if (action === 'filters') { store.set({ collection: null }); filterPanel.hidden = !filterPanel.hidden; button.setAttribute('aria-expanded', String(!filterPanel.hidden)); }
    if (action === 'close-filters') { filterPanel.hidden = true; root.querySelector('[data-action="filters"]').setAttribute('aria-expanded', 'false'); }
    if (action === 'favorites') store.set({ collection: state.collection === 'favorites' ? null : 'favorites' });
    if (action === 'comparison') store.set({ collection: state.collection === 'compare' ? null : 'compare' });
    if (action === 'close-results') store.set({ collection: null });
    if (action === 'compare-lot') {
      const wasCompared = state.comparisonLotIds.includes(state.selectedLotId);
      addComparison(state.selectedLotId);
      if (!wasCompared) store.set({ collection: 'compare' });
    }
    if (action === 'solar') actions.simulateSun?.();
    if (action === 'share') shareLot();
    if (action === 'interest') { store.set({ leadOpen: true, sheet: 'full' }); panel.querySelector('.lot-panel-scroll').scrollTop = 0; panel.querySelector('[name="name"]')?.focus({ preventScroll: true }); }
    if (action === 'close-contact') { store.set({ leadOpen: false }); panel.querySelector(`#lot-tab-${store.get().lotPanelTab}`)?.focus({ preventScroll: true }); }
    if (action === 'remove-concept') actions.removeConcept();
    if (action === 'sheet') store.set({ sheet: state.sheet === 'collapsed' ? 'half' : state.sheet === 'half' ? 'full' : 'collapsed' });
    if (action === 'previous-lot' || action === 'next-lot') {
      const current = catalog.byId.get(state.selectedLotId), siblings = [...catalog.byId.values()].filter(lot => lot.block === current.block);
      const index = siblings.findIndex(lot => lot.id === current.id), next = siblings[(index + (action === 'next-lot' ? 1 : -1) + siblings.length) % siblings.length];
      actions.selectLot(next.id);
    }
  });
  root.addEventListener('toggle', event => {
    if (event.target.matches('details.potential-option') && event.target.open) panel.querySelectorAll('details.potential-option[open]').forEach(element => { if (element !== event.target) element.open = false; });
    if (event.target.id === 'potential-neighbor-picker' && store.get().potentialNeighborsOpen !== event.target.open) store.set({ potentialNeighborsOpen: event.target.open });
  }, true);
  panel.addEventListener('keydown', event => {
    if (event.target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...panel.querySelectorAll('[role="tab"]:not(:disabled)')];
    const index = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectPanelTab(tabs[next].dataset.lotTab);
  });
  root.querySelector('#lot-query').addEventListener('input', event => { resultLimit = 24; filterPanel.hidden = true; store.set({ searchQuery: event.target.value, collection: event.target.value.trim() ? 'search' : 'browse' }); });
  root.querySelector('.lot-search').addEventListener('submit', event => {
    event.preventDefault(); const query = store.get().searchQuery.trim(), block = root.querySelector('#block-navigation').value;
    const id = normalizeLotQuery(query) || (block && /^\d{1,2}$/.test(query) ? `${block}-L${query.padStart(2, '0')}` : null);
    if (id && catalog.byId.has(id)) { store.set({ collection: null }); actions.selectLot(id); }
    else { store.set({ collection: query ? 'search' : 'browse' }); renderResults(); }
  });
  root.querySelector('#block-navigation').addEventListener('change', event => { resultLimit = 24; filterPanel.hidden = true; if (event.target.value) actions.focusBlock(event.target.value); store.set({ collection: root.querySelector('#lot-query').value.trim() ? 'search' : 'browse' }); });
  root.addEventListener('change', event => {
    const id = event.target.dataset.paymentLot;
    if (!id) return;
    const lot = catalog.byId.get(id), months = Number(event.target.value);
    if (!lot) return;
    const variant = paymentVariant(lot), plan = variant.plans.find(p => p.months === months && p.available !== false && p.monthlyAmount > 0);
    if (!plan) return;
    paymentSelections.set(`${id}:${variant.mode}`, months);
    root.querySelectorAll(`[data-payment-summary="${id}"]`).forEach(element => { element.innerHTML = paymentSummary(plan, variant.mode); });
    root.querySelectorAll(`[data-payment-lot="${id}"]`).forEach(select => { select.value = String(months); });
  });
  const filtersForm = root.querySelector('#lot-filters');
  filtersForm.addEventListener('submit', event => {
    event.preventDefault(); const values = new FormData(filtersForm), filters = { type: values.getAll('type'), status: values.getAll('status'), block: values.get('block') };
    for (const field of ['areaMin', 'areaMax', 'priceMin', 'priceMax', 'unitMin', 'unitMax']) filters[field] = values.get(field) === '' ? null : Number(values.get(field));
    for (const prefix of ['area', 'price', 'unit']) if (filters[`${prefix}Min`] != null && filters[`${prefix}Max`] != null && filters[`${prefix}Min`] > filters[`${prefix}Max`]) { toast('O mínimo deve ser menor ou igual ao máximo.'); return; }
    store.set({ filters, collection: 'results' }); filterPanel.hidden = true; root.querySelector('[data-action="filters"]').setAttribute('aria-expanded', 'false');
  });
  filtersForm.addEventListener('reset', () => store.set({ filters: {}, collection: 'results' }));
  root.addEventListener('input', event => {
    if (event.target.closest('#interest-form') && ['name', 'whatsapp'].includes(event.target.name)) {
      const id = store.get().selectedLotId;
      leadDrafts.set(id, { ...leadDrafts.get(id), [event.target.name]: event.target.value });
    }
  });
  root.addEventListener('submit', async event => {
    if (event.target.id !== 'interest-form') return;
    event.preventDefault(); const form = event.target, values = new FormData(form), button = form.querySelector('[type="submit"]'), message = form.querySelector('.lead-message'), lotId = store.get().selectedLotId;
    button.disabled = true;
    try {
      const result = await registerInterest({ lotId, name: String(values.get('name')), whatsapp: String(values.get('whatsapp')) }, catalog.contact);
      leadDrafts.delete(lotId);
      message.textContent = result.sent ? 'Interesse enviado. Obrigado!' : 'Interesse salvo neste navegador. Nenhum dado foi enviado.';
      form.querySelectorAll('input').forEach(input => { input.value = ''; });
    } catch (error) { message.textContent = error.message; } finally { button.disabled = false; }
  });
  let sheetDrag;
  panel.addEventListener('pointerdown', event => {
    if (event.target.closest('.sheet-handle')) { sheetDrag = event.clientY; panel.setPointerCapture(event.pointerId); }
  });
  panel.addEventListener('pointercancel', () => { sheetDrag = null; });
  panel.addEventListener('pointerup', event => {
    if (sheetDrag == null) return;
    const distance = event.clientY - sheetDrag; sheetDrag = null;
    if (Math.abs(distance) > 35) {
      ignoreSheetClick = true; setTimeout(() => { ignoreSheetClick = false; }, 0);
      store.set({ sheet: distance > 0 ? 'collapsed' : 'full' });
    }
  });
  store.subscribe(state => [state.selectedLotId, state.panelOpen, state.sheet, state.leadOpen, state.activeConcept, state.activeConceptVariant, state.conceptLoading, state.favoriteLotIds.join(','), state.comparisonLotIds.join(','), state.potentialOpen, state.potentialLotIds.join(','), state.lotPanelTab].join('|'), renderPanel);
  for (const key of ['favoriteLotIds', 'comparisonLotIds']) store.subscribe(state => state[key], () => { renderCounts(); renderResults(); renderComparison(); });
  store.subscribe(state => state.comparisonLotSets, () => { renderCounts(); renderComparison(); });
  for (const key of ['collection', 'filters', 'searchQuery']) store.subscribe(state => state[key], () => { renderCounts(); renderResults(); renderComparison(); });
  store.subscribe(state => state.hoveredLotId, id => {
    const lot = catalog.byId.get(id); tooltip.hidden = !lot;
    if (lot) tooltip.textContent = `${lotName(lot)} · ${areaText(lot)}`;
  });
  renderCounts();
  return { toast, updateTooltip(x, y) { tooltip.style.left = `${Math.min(innerWidth - 230, Math.max(12, x + 16))}px`; tooltip.style.top = `${Math.max(12, y - 42)}px`; } };
}
