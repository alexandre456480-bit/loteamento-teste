import * as THREE from 'three';
import { solarPosition, brazilDate } from './astronomy.js';
import { createSolarPanel } from './ui.js';
import { createSolarStakes } from './stakes.js';

export function createSolarSimulation({ scene, light, hemisphere, renderer, vegetation, data, model, world, requestRender, getSelection, onVisibilityChange }) {
  // North supplied by the owner: UFG south, Av. Esperança east.
  const state = { date: brazilDate(), minutes: 600, north: 0, trajectory: true };
  let enabled = false, timer = null, lastApply = 0, lastPath = '';
  const original = { position: light.position.clone(), target: light.target.position.clone(), intensity: light.intensity, color: light.color.clone(), sky: scene.background.clone(), hemiIntensity: hemisphere.intensity, hemiColor: hemisphere.color.clone(), groundColor: hemisphere.groundColor.clone(), bias: light.shadow.bias, normalBias: light.shadow.normalBias };
  const shadowCamera = light.shadow.camera;
  const originalFrustum = Object.fromEntries(['left', 'right', 'top', 'bottom', 'near', 'far'].map(key => [key, shadowCamera[key]]));
  scene.add(light.target);
  const helpers = new THREE.Group(); helpers.visible = false; helpers.name = 'Trajetória solar e orientação'; scene.add(helpers);
  const center = new THREE.Vector3(0, 0.6, 20);
  let stakes;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(4.3, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd178' })); helpers.add(sphere);
  const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#c39b48', transparent: true, opacity: 0.55 })); helpers.add(path);
  const compassCanvas = document.createElement('canvas'); compassCanvas.width = compassCanvas.height = 256;
  const c = compassCanvas.getContext('2d'); c.translate(128, 128);
  c.fillStyle = '#fbfaf0ee'; c.beginPath(); c.arc(0, 0, 119, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#b39555'; c.lineWidth = 3; c.stroke();
  c.fillStyle = '#244f68'; c.beginPath(); c.moveTo(0, -71); c.lineTo(-17, 34); c.lineTo(0, 16); c.lineTo(17, 34); c.closePath(); c.fill();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 30px Segoe UI'; c.fillText('N', 0, -94);
  c.font = '22px Segoe UI'; c.fillStyle = '#8d815c'; c.fillText('L', 94, 0); c.fillText('S', 0, 94); c.fillText('O', -94, 0);
  const texture = new THREE.CanvasTexture(compassCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  const compass = new THREE.Group(); compass.position.set(-494, 0.5, 32);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(39, 39).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })); compass.add(face); helpers.add(compass);

  function vector(position) {
    const azimuth = THREE.MathUtils.degToRad(position.azimuth + state.north), elevation = THREE.MathUtils.degToRad(position.elevation);
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
  }
  function fitShadows(direction) {
    // Fixed world bounds include all parcels, canopy, leisure areas and context.
    // They do not follow camera LOD, so shadows remain consistent while zooming.
    light.target.position.copy(center); light.position.copy(center).addScaledVector(direction, 1800);
    light.target.updateMatrixWorld(); light.updateMatrixWorld();
    shadowCamera.position.copy(light.position); shadowCamera.lookAt(light.target.position); shadowCamera.updateMatrixWorld();
    const bounds = new THREE.Box3();
    for (const x of [-530, 580]) for (const y of [-6, 90]) for (const z of [-285, 410]) bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(shadowCamera.matrixWorldInverse));
    Object.assign(shadowCamera, { left: bounds.min.x - 12, right: bounds.max.x + 12, top: bounds.max.y + 12, bottom: bounds.min.y - 12, near: Math.max(1, -bounds.max.z - 100), far: Math.max(100, -bounds.min.z + 100) });
    shadowCamera.updateProjectionMatrix();
  }
  function apply() {
    timer = null; if (!enabled) return;
    lastApply = performance.now();
    const position = solarPosition(state.date, state.minutes), direction = vector(position);
    const daylight = THREE.MathUtils.smoothstep(position.elevation, -7, 8);
    const highSun = THREE.MathUtils.smoothstep(position.elevation, 0, 30);
    light.intensity = position.elevation > 0 ? 2.65 * (0.25 + 0.75 * Math.sqrt(Math.sin(THREE.MathUtils.degToRad(position.elevation)))) : 0;
    light.color.set('#ffba77').lerp(new THREE.Color('#fff3dd'), highSun);
    hemisphere.intensity = 0.38 + 1.12 * daylight;
    hemisphere.color.set('#8195b0').lerp(original.hemiColor, daylight);
    hemisphere.groundColor.set('#384c44').lerp(original.groundColor, daylight);
    scene.background.set('#344458').lerp(original.sky, daylight);
    vegetation.setSolarBrightness(0.34 + 0.66 * daylight);
    light.shadow.normalBias = 0.025; light.shadow.bias = -0.00008;
    if (position.elevation > 0) { fitShadows(direction); renderer.shadowMap.needsUpdate = true; }
    sphere.position.copy(center).addScaledVector(direction, 235); sphere.visible = state.trajectory && position.elevation > 0;
    path.visible = state.trajectory;
    compass.rotation.y = -THREE.MathUtils.degToRad(state.north);
    const pathKey = `${state.date}:${state.north}`;
    if (pathKey !== lastPath) {
      const points = [];
      for (let minute = 0; minute <= 1440; minute += 10) {
        const p = solarPosition(state.date, minute);
        if (p.elevation >= 0) points.push(center.clone().addScaledVector(vector(p), 235));
      }
      path.geometry.dispose(); path.geometry = new THREE.BufferGeometry().setFromPoints(points); lastPath = pathKey;
    }
    requestRender();
  }
  function schedule(flush = false) {
    clearTimeout(timer);
    if (flush) apply(); else timer = setTimeout(apply, Math.max(0, 80 - (performance.now() - lastApply)));
  }
  const ui = createSolarPanel({ state, getSelection,
    onChange(patch, flush) { Object.assign(state, patch); schedule(flush); },
    onOpen() {
      if (!stakes) { stakes = createSolarStakes(data, world); model.add(stakes); }
      stakes.visible = true;
      enabled = true; helpers.visible = true; vegetation.setSolarMode(true); apply(); onVisibilityChange?.();
    },
    onClose() {
      enabled = false; clearTimeout(timer); timer = null; helpers.visible = false; stakes.visible = false;
      vegetation.setSolarMode(false); light.position.copy(original.position); light.target.position.copy(original.target);
      light.intensity = original.intensity; light.color.copy(original.color); light.shadow.bias = original.bias; light.shadow.normalBias = original.normalBias;
      hemisphere.intensity = original.hemiIntensity; hemisphere.color.copy(original.hemiColor); hemisphere.groundColor.copy(original.groundColor); scene.background.copy(original.sky);
      Object.assign(shadowCamera, originalFrustum); shadowCamera.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true; requestRender(); onVisibilityChange?.();
    },
  });
  return { open: ui.open, close: ui.close, isOpen: ui.isOpen, updateSelection: ui.updateSelection };
}
