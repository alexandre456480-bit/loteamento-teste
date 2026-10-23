export const compactLayout = window.matchMedia('(max-width: 960px)');
const touchInput = window.matchMedia('(pointer: coarse)');
const occluders = '.buyer-navigation,.buyer-results,.buyer-filters,.lot-panel,.solar-panel,.comparison-drawer';

export function syncVisualViewport() {
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0;
  const height = viewport?.height || innerHeight;
  const style = document.documentElement.style;
  style.setProperty('--app-height', `${height}px`);
  style.setProperty('--visible-top', `${top}px`);
  style.setProperty('--visible-bottom', `${Math.max(0, innerHeight - height - top)}px`);
}

export function getMapViewport() {
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop || 0;
  const bottom = Math.min(innerHeight, top + (viewport?.height || innerHeight));
  const identity = document.querySelector('.identity')?.getBoundingClientRect();
  const safeTop = Math.min(bottom - 24, Math.max(top + 8, (identity?.bottom || top) + 12));
  let spaces = [{ left: 8, right: innerWidth - 8, top: safeTop, bottom: bottom - 8 }];
  for (const element of document.querySelectorAll(occluders)) {
    if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
    const rect = element.getBoundingClientRect();
    const block = { left: rect.left - 10, right: rect.right + 10, top: rect.top - 10, bottom: rect.bottom + 10 };
    const next = [];
    for (const space of spaces) {
      if (block.left >= space.right || block.right <= space.left || block.top >= space.bottom || block.bottom <= space.top) { next.push(space); continue; }
      const candidates = [
        { ...space, right: Math.min(space.right, block.left) },
        { ...space, left: Math.max(space.left, block.right) },
        { ...space, bottom: Math.min(space.bottom, block.top) },
        { ...space, top: Math.max(space.top, block.bottom) },
      ];
      next.push(...candidates.filter(candidate => candidate.right - candidate.left >= 24 && candidate.bottom - candidate.top >= 24));
    }
    // A full-height sheet may leave no map area. Keep the last usable region
    // instead of forcing an extreme camera offset underneath a modal surface.
    if (next.length) spaces = next;
  }
  const best = spaces.reduce((largest, space) => (space.right - space.left) * (space.bottom - space.top) > (largest.right - largest.left) * (largest.bottom - largest.top) ? space : largest);
  return { ...best, width: Math.max(24, best.right - best.left), height: Math.max(24, best.bottom - best.top) };
}

export function watchResponsiveLayout(onChange) {
  syncVisualViewport();
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0; syncVisualViewport();
      const field = document.activeElement;
      if (field?.matches('input,textarea,select')) {
        const scroller = field.closest('.lot-panel-scroll,.buyer-navigation,.buyer-filters,.solar-body');
        if (scroller) {
          const input = field.getBoundingClientRect(), container = scroller.getBoundingClientRect();
          if (input.bottom > container.bottom - 12) scroller.scrollTop += input.bottom - container.bottom + 12;
          else if (input.top < container.top + 12) scroller.scrollTop -= container.top + 12 - input.top;
        }
      }
      onChange();
    });
  };
  const observer = new ResizeObserver(schedule);
  for (const element of document.querySelectorAll(`${occluders},.identity`)) observer.observe(element);
  // Open/close and explorer collapse do not always resize an observed ancestor.
  const mutations = new MutationObserver(schedule);
  for (const element of document.querySelectorAll(`${occluders},#explorer-body`)) mutations.observe(element, { attributes: true, attributeFilter: ['hidden', 'data-sheet'] });
  mutations.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('transitionend', event => { if (event.target.matches(occluders)) schedule(); });
  document.addEventListener('animationend', event => { if (event.target.matches(occluders)) schedule(); });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  compactLayout.addEventListener('change', schedule);
  const updateHelp = () => {
    const help = document.querySelector('.help');
    if (help) help.innerHTML = touchInput.matches
      ? '<span>Arraste com um dedo</span><b>·</b><span>Use dois dedos para aproximar</span>'
      : '<span>Arraste para mover</span><b>·</b><span>Scroll para aproximar</span><b>·</b><span>Botão direito para girar</span>';
  };
  touchInput.addEventListener('change', updateHelp); updateHelp();
  schedule();
}
