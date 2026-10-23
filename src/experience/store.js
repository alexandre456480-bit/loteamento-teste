const FAVORITES_KEY = 'parque-universitario:favorites:v2';

export function createExperienceStore(validIds, identityMap = new Map()) {
  let saved = [];
  try {
    const current = localStorage.getItem(FAVORITES_KEY);
    saved = JSON.parse(current ?? localStorage.getItem('parque-universitario:favorites:v1') ?? '[]');
    if (current === null && Array.isArray(saved)) saved = saved.map(id => identityMap.get(id) || id);
    if (Array.isArray(saved)) localStorage.setItem(FAVORITES_KEY, JSON.stringify(saved.filter(id => validIds.has(id))));
  } catch { /* Private storage may be unavailable. */ }
  let state = {
    selectedLotId: null, hoveredLotId: null, selectedBlock: null,
    favoriteLotIds: Array.isArray(saved) ? saved.filter(id => validIds.has(id)) : [],
    comparisonLotIds: [], comparisonLotSets: [], activeConcept: null, activeConceptVariant: null, conceptLayout: null,
    potentialOpen: false, potentialNeighborsOpen: false, potentialLotIds: [],
    filters: {}, panelOpen: false, searchQuery: '', cameraMode: 'perspective',
    collection: null, sheet: 'half', lotPanelTab: 'overview', leadOpen: false, conceptLoading: false,
  };
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      const previous = state;
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      if (previous.favoriteLotIds !== state.favoriteLotIds) {
        try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favoriteLotIds)); } catch { /* Favorites still work for this visit. */ }
      }
      for (const entry of subscribers) {
        const next = entry.selector(state);
        if (!Object.is(next, entry.value)) { const before = entry.value; entry.value = next; entry.callback(next, before); }
      }
    },
    subscribe(selector, callback) {
      const entry = { selector, callback, value: selector(state) };
      subscribers.add(entry);
      return () => subscribers.delete(entry);
    },
  };
}
