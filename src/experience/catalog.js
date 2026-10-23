export const statusNames = { available: 'Disponível', reserved: 'Reservado', sold: 'Vendido', unavailable: 'Indisponível', unknown: 'Consultar disponibilidade' };
export const typeNames = { residential: 'Residencial', commercial: 'Comercial', utility: 'Elevatória' };
export const money = value => Number.isFinite(value) && value > 0 ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }) : 'Sob consulta';
export const number = value => Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'A confirmar';

export function positiveNumber(value) {
  if (typeof value === 'string') {
    let text = value.replace(/[^\d,.-]/g, '');
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
    value = Number(text);
  }
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizeLotQuery(query) {
  const match = query.trim().match(/^(?:quadra\s*|q\s*)?0*(\d{1,2})\s*(?:[-·/]|\s|lote\s*|l\s*)+0*(\d{1,2})$/i);
  return match ? `Q${match[1].padStart(2, '0')}-L${match[2].padStart(2, '0')}` : null;
}

// The existing raster geometry used a cyclic seed order starting one parcel
// late in Q03 and Q07. Reconcile cadastral identity only; every vertex stays put.
export function alignParcelIdentities(geometry) {
  for (const block of geometry.blocks) {
    if (![3, 7].includes(block.number)) continue;
    for (const lot of block.lots) {
      if (lot.geometryId) continue;
      lot.geometryId = lot.id;
      lot.number = lot.number % block.lots.length + 1;
      lot.id = `${block.id}-L${String(lot.number).padStart(2, '0')}`;
    }
  }
}

export async function createCatalog(geometry) {
  let commercial = {};
  try { const response = await fetch('/catalog.json'); if (response.ok) commercial = await response.json(); } catch { /* Geometry remains usable without a commercial service. */ }
  const byId = new Map(), blocks = new Map();
  for (const block of geometry.blocks) {
    blocks.set(block.id, block);
    for (const source of block.lots) {
      const supplied = commercial.lots?.[source.id] || {};
      const area = positiveNumber(supplied.area) ?? positiveNumber(source.area);
      const pricePerM2 = positiveNumber(supplied.pricePerM2);
      const totalPrice = positiveNumber(supplied.totalPrice) ?? (area && pricePerM2 ? area * pricePerM2 : null);
      const dimensions = Object.fromEntries(['front', 'back', 'left', 'right'].map(side => [side, positiveNumber(supplied.dimensions?.[side])]));
      const paymentOptions = (Array.isArray(supplied.paymentOptions) ? supplied.paymentOptions : []).map(option => ({
        label: String(option.label || ''), stage: option.stage === 'entry' ? 'entry' : 'installments',
        amount: positiveNumber(option.amount), installments: positiveNumber(option.installments),
      })).filter(option => option.amount && option.label);
      byId.set(source.id, { ...source, block: block.number, blockId: block.id, type: source.category, area, dimensions, pricePerM2, totalPrice,
        status: ['available', 'reserved', 'sold', 'unavailable'].includes(supplied.status) ? supplied.status : 'unknown',
        paymentOptions, description: typeof supplied.description === 'string' ? supplied.description : '',
        entry: supplied.entry || null,
        financingPlans: (supplied.financingPlans || []).filter(plan => positiveNumber(plan.months) && positiveNumber(plan.annualPayments) && positiveNumber(plan.monthlyAmount) && positiveNumber(plan.annualAmount)),
        withoutBalloon: supplied.withoutBalloon ? {
          totalPrice: positiveNumber(supplied.withoutBalloon.totalPrice),
          pricePerM2: positiveNumber(supplied.withoutBalloon.pricePerM2),
          entry: supplied.withoutBalloon.entry || null,
          source: supplied.withoutBalloon.source || null,
          plans: (supplied.withoutBalloon.plans || []).filter(plan => positiveNumber(plan.months)).map(plan => ({
            months: positiveNumber(plan.months), monthlyAmount: positiveNumber(plan.monthlyAmount),
            available: plan.available !== false && Boolean(positiveNumber(plan.monthlyAmount)),
          })),
        } : null,
        source: supplied.source || null,
        measurementSource: supplied.measurementSource || null,
        measurementSegments: supplied.measurementSegments || null,
        boundaryMeasurements: supplied.boundaryMeasurements || null,
        measurementNote: supplied.measurementNote || '',
      });
    }
  }
  return { byId, blocks, contact: commercial.contact || {} };
}

export function lotMatches(lot, filters) {
  if (filters.status?.length && !filters.status.includes(lot.status)) return false;
  if (filters.type?.length && !filters.type.includes(lot.type)) return false;
  if (filters.block && lot.blockId !== filters.block) return false;
  for (const [key, minimum, maximum] of [['area', filters.areaMin, filters.areaMax], ['totalPrice', filters.priceMin, filters.priceMax], ['pricePerM2', filters.unitMin, filters.unitMax]]) {
    if ((minimum != null || maximum != null) && (!Number.isFinite(lot[key]) || (minimum != null && lot[key] < minimum) || (maximum != null && lot[key] > maximum))) return false;
  }
  return true;
}
