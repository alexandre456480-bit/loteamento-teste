import { brazilDate, clock, daylight, directionName, solarPosition } from './astronomy.js';

const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
export function createSolarPanel({ state, onChange, onOpen, onClose, getSelection }) {
  const root = document.createElement('section'); root.className = 'solar-system';
  root.innerHTML = `<button type="button" class="solar-launcher" aria-expanded="false" aria-controls="solar-panel">${sunIcon}<span>Sol e sombras<small>Explore os horários do dia</small></span></button>
    <section id="solar-panel" class="solar-panel" aria-label="Simulador de sol e sombras" hidden>
      <header class="solar-heading"><div><p class="solar-eyebrow">SOL EM GOIÂNIA · HORÁRIO DE BRASÍLIA</p><h2>${sunIcon} Sol e sombras</h2></div><button type="button" class="solar-close" aria-label="Fechar simulador">×</button></header>
      <div class="solar-body"><p class="solar-selection"></p>
      <div class="solar-date-row"><label for="solar-date">Dia da simulação<input type="date" id="solar-date" min="2020-01-01" max="2100-12-31"></label><div class="solar-seasons" role="group" aria-label="Época do ano"><button type="button" data-season="today">Hoje</button><button type="button" data-season="winter" title="21 de junho">Junho</button><button type="button" data-season="summer" title="21 de dezembro">Dezembro</button></div></div>
      <div class="solar-time-row"><button type="button" class="solar-step" data-step="-15" aria-label="Voltar quinze minutos">−15 min</button><label for="solar-time" class="solar-time-label"><output id="solar-time-value" for="solar-time">10:00</output><span>horário de Brasília</span></label><button type="button" class="solar-step" data-step="15" aria-label="Avançar quinze minutos">+15 min</button></div>
      <input type="range" id="solar-time" min="0" max="1439" step="1" value="600" aria-label="Horário da simulação">
      <div class="solar-ticks" aria-hidden="true"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
      <div class="solar-presets"><div role="group" aria-label="Horários rápidos"><button type="button" data-hour="480">08h</button><button type="button" data-hour="720">12h</button><button type="button" data-hour="960">16h</button><button type="button" data-hour="1080">18h</button></div><button type="button" class="solar-play" aria-pressed="false">▶ Percorrer o dia</button></div>
      <div class="solar-readout" aria-live="polite" aria-atomic="true"><span class="solar-condition"></span><span class="solar-position"></span></div>
      <div class="solar-daylight"><span>Nascer <strong class="solar-rise"></strong></span><span>Meio-dia solar <strong class="solar-noon"></strong></span><span>Pôr do sol <strong class="solar-set"></strong></span></div>
      <details class="solar-settings"><summary>Orientação e referências</summary><p>UFG ao sul · Av. Esperança a leste · norte no topo da planta, conforme orientação informada.</p><label class="solar-north-label" for="solar-north">Ajustar norte <output class="solar-north-value">0°</output><input id="solar-north" type="range" min="-180" max="180" step="1" value="0"></label><button type="button" class="solar-reset-north">Restaurar orientação informada</button><label class="solar-path-label"><input type="checkbox" id="solar-path" checked> Mostrar trajetória esquemática</label><p>Localização aproximada: região do Campus Samambaia, Goiânia. Cálculo solar por latitude, longitude, data e horário local.</p><p><a href="https://gml.noaa.gov/grad/solcalc/solareqns.PDF" target="_blank" rel="noopener noreferrer">Método de cálculo · NOAA ↗</a> · <a href="https://praksis.fef.ufg.br/p/19026-contato" target="_blank" rel="noopener noreferrer">Referência de localização · UFG ↗</a></p></details>
      <p class="solar-disclaimer">As estacas têm altura visual padronizada e aparecem somente neste modo. Suas sombras indicam a direção e a variação do sol; não representam construções futuras. Simulação ilustrativa das estruturas e árvores modeladas. Relevo, alturas e construções externas não foram levantados; a projeção não substitui um estudo técnico de insolação.</p></div>
    </section>`;
  document.body.appendChild(root);
  const panel = root.querySelector('#solar-panel'), launcher = root.querySelector('.solar-launcher'), time = root.querySelector('#solar-time'), date = root.querySelector('#solar-date');
  let playing = false, playTimer = null, playStart = 0, playMinute = 0, readoutTimer = null, lastReadout = 0, returnFocus = null;
  const play = root.querySelector('.solar-play');
  date.value = state.date;
  function stop() { playing = false; clearInterval(playTimer); playTimer = null; play.textContent = '▶ Percorrer o dia'; play.setAttribute('aria-pressed', 'false'); root.querySelector('.solar-readout').setAttribute('aria-live', 'polite'); }
  function updateSelection() {
    const lot = getSelection();
    root.querySelector('.solar-selection').textContent = lot ? `Quadra ${String(lot.block).padStart(2, '0')} · Lote ${String(lot.number).padStart(2, '0')} — mova o horário e observe a sombra da estaca.` : 'Cada lote tem uma estaca de referência. Mova o horário para acompanhar sua sombra ou toque em um lote.';
  }
  function updateReadout() {
    readoutTimer = null; lastReadout = performance.now();
    const p = solarPosition(state.date, state.minutes), day = daylight(state.date);
    root.querySelector('.solar-condition').textContent = p.elevation <= 0 ? 'Sol abaixo do horizonte · sem sol direto' : p.elevation < 12 ? 'Sol baixo · sombras mais longas' : 'Sol acima do horizonte';
    root.querySelector('.solar-position').textContent = p.elevation > 0 ? `${directionName(p.azimuth)} · altura ${Math.round(p.elevation)}°` : 'A iluminação da maquete foi reduzida';
    for (const [selector, minute] of [['.solar-rise', day.sunrise], ['.solar-noon', day.noon], ['.solar-set', day.sunset]]) root.querySelector(selector).textContent = `~${clock(minute)}`;
    time.style.setProperty('--day-start', `${day.sunrise / 1440 * 100}%`); time.style.setProperty('--day-end', `${day.sunset / 1440 * 100}%`);
    root.querySelectorAll('[data-hour]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.hour) === state.minutes)));
  }
  function update(patch, flush = false) {
    Object.assign(state, patch); time.value = state.minutes; date.value = state.date;
    root.querySelector('#solar-time-value').textContent = clock(state.minutes); time.setAttribute('aria-valuetext', `${clock(state.minutes)}, horário de Brasília`);
    root.querySelector('.solar-north-value').textContent = `${state.north}°`; root.querySelector('#solar-north').value = state.north;
    onChange(patch, flush);
    if (flush) { clearTimeout(readoutTimer); updateReadout(); }
    else if (readoutTimer === null) readoutTimer = setTimeout(updateReadout, Math.max(0, 180 - (performance.now() - lastReadout)));
  }
  function open() {
    if (!panel.hidden) return;
    returnFocus = document.activeElement;
    panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); document.body.classList.add('solar-mode-open'); updateSelection(); updateReadout(); onOpen(); root.querySelector('.solar-close').focus({ preventScroll: true });
  }
  function close() {
    if (panel.hidden) return;
    stop(); clearTimeout(readoutTimer); readoutTimer = null; panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); document.body.classList.remove('solar-mode-open'); onClose();
    const focus = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : launcher;
    focus.focus({ preventScroll: true });
  }
  launcher.addEventListener('click', () => panel.hidden ? open() : close()); root.querySelector('.solar-close').addEventListener('click', close);
  time.addEventListener('input', () => { stop(); update({ minutes: Number(time.value) }); }); time.addEventListener('change', () => update({ minutes: Number(time.value) }, true));
  date.addEventListener('change', () => { if (date.value && date.checkValidity()) { stop(); update({ date: date.value }, true); } else date.value = state.date; });
  root.querySelector('#solar-north').addEventListener('input', event => { stop(); update({ north: Number(event.target.value) }); });
  root.querySelector('#solar-north').addEventListener('change', event => update({ north: Number(event.target.value) }, true));
  root.querySelector('#solar-path').addEventListener('change', event => update({ trajectory: event.target.checked }, true));
  root.querySelector('.solar-reset-north').addEventListener('click', () => update({ north: 0 }, true));
  root.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => { stop(); update({ minutes: Math.max(0, Math.min(1439, state.minutes + Number(button.dataset.step))) }, true); }));
  root.querySelectorAll('[data-hour]').forEach(button => button.addEventListener('click', () => { stop(); update({ minutes: Number(button.dataset.hour) }, true); }));
  root.querySelectorAll('[data-season]').forEach(button => button.addEventListener('click', () => { stop(); const year = state.date.slice(0, 4); update({ date: button.dataset.season === 'today' ? brazilDate() : `${year}-${button.dataset.season === 'winter' ? '06-21' : '12-21'}` }, true); }));
  play.addEventListener('click', () => {
    if (playing) { stop(); return; }
    playing = true; play.textContent = 'Ⅱ Pausar'; play.setAttribute('aria-pressed', 'true');
    root.querySelector('.solar-readout').setAttribute('aria-live', 'off');
    playStart = performance.now(); playMinute = state.minutes < 300 || state.minutes >= 1140 ? 300 : state.minutes;
    playTimer = setInterval(() => { const minute = Math.min(1140, Math.round(playMinute + (performance.now() - playStart) * 0.035)); update({ minutes: minute }); if (minute >= 1140) stop(); }, 100);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden && !event.defaultPrevented) { event.stopPropagation(); close(); } });
  return { open, close, isOpen: () => !panel.hidden, updateSelection };
}
