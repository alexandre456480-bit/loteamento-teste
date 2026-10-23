import * as THREE from 'three';

// Illustrative aerial context, traced in the supplied street-map image space.
// Roofs and vegetation are texture marks, not surveyed buildings or new POIs.
export function createAerialContext(data, world) {
  const size = 2048, margin = 3900;
  const xs = data.perimeter.map(p => p[0]), ys = data.perimeter.map(p => p[1]);
  const left = Math.min(...xs) - margin, top = Math.min(...ys) - margin;
  const width = Math.max(...xs) - left + margin, height = Math.max(...ys) - top + margin;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const c = canvas.getContext('2d');
  const texturePoint = p => [(p[0] - left) / width * size, (p[1] - top) / height * size];
  // AB-21 / northern tip / Esperança-Flamboyant junction are alignment anchors.
  // This is a relative placement from a screenshot, not georeferencing.
  const source = [[365, 345], [638, 235], [758, 374]];
  const target = [data.perimeter[0], data.perimeter[1], data.perimeter[2]].map(texturePoint);
  const [a, b, d] = source;
  const determinant = (b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1]);
  const coefficients = axis => {
    const u = ((target[1][axis] - target[0][axis]) * (d[1] - a[1]) - (target[2][axis] - target[0][axis]) * (b[1] - a[1])) / determinant;
    const v = ((b[0] - a[0]) * (target[2][axis] - target[0][axis]) - (d[0] - a[0]) * (target[1][axis] - target[0][axis])) / determinant;
    return [u, v, target[0][axis] - u * a[0] - v * a[1]];
  };
  const tx = coefficients(0), ty = coefficients(1);
  c.fillStyle = '#7f8967'; c.fillRect(0, 0, size, size);
  c.setTransform(tx[0], ty[0], tx[1], ty[1], tx[2], ty[2]);
  let seed = 73105;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  function polygon(points) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  }
  function patch(points, color) { polygon(points); c.fillStyle = color; c.fill(); }
  function road(points, width = 3.5, color = '#7e827c') {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.lineJoin = c.lineCap = 'round';
    c.strokeStyle = '#b7b09b'; c.lineWidth = width + 1.5; c.stroke();
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  function grove(points, density, colors = ['#526b46', '#657d4e', '#3e6044', '#7b8856']) {
    c.save(); polygon(points); c.clip();
    const x0 = Math.min(...points.map(p => p[0])), x1 = Math.max(...points.map(p => p[0]));
    const y0 = Math.min(...points.map(p => p[1])), y1 = Math.max(...points.map(p => p[1]));
    for (let i = 0; i < density; i++) {
      const x = x0 + random() * (x1 - x0), y = y0 + random() * (y1 - y0), radius = 1.1 + random() * 3.7;
      c.fillStyle = colors[Math.floor(random() * colors.length)];
      c.beginPath(); c.ellipse(x, y, radius * 1.3, radius, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  function neighborhood(points, angle, spacing = 23) {
    patch(points, '#9b987e');
    c.save(); polygon(points); c.clip();
    c.translate(points[0][0], points[0][1]); c.rotate(angle);
    const local = points.map(([x, y]) => {
      const dx = x - points[0][0], dy = y - points[0][1];
      return [dx * Math.cos(angle) + dy * Math.sin(angle), -dx * Math.sin(angle) + dy * Math.cos(angle)];
    });
    const x0 = Math.floor(Math.min(...local.map(p => p[0])) / 8) * 8;
    const x1 = Math.max(...local.map(p => p[0]));
    const y0 = Math.floor(Math.min(...local.map(p => p[1])) / 7) * 7;
    const y1 = Math.max(...local.map(p => p[1]));
    // Broad roof/yard color clusters give aerial context without 3D geometry.
    const roofs = ['#aa8870', '#957766', '#b49e86', '#c0ba9e', '#817f76', '#a1a497'];
    for (let y = y0; y < y1; y += 7) for (let x = x0; x < x1; x += 8) {
      if (random() < .14) continue;
      c.fillStyle = random() < .3 ? '#71815b' : '#a69d7f'; c.fillRect(x, y, 7, 6);
      c.fillStyle = '#626b584d'; c.fillRect(x + 1.4, y + 1.7, 4.5, 3.8);
      c.fillStyle = roofs[Math.floor(random() * roofs.length)];
      c.fillRect(x + .8, y + .7, 3 + random() * 2.4, 2.5 + random() * 1.5);
    }
    for (let y = Math.floor(y0 / spacing) * spacing; y < y1; y += spacing) road([[x0, y], [x1, y]], 3);
    for (let x = Math.floor(x0 / (spacing * 2.2)) * spacing * 2.2; x < x1; x += spacing * 2.2) road([[x, y0], [x, y1]], 3.4);
    c.restore();
    grove(points, 700);
  }

  // Green land dominates the west and northwest; denser blocks lie north/east.
  patch([[0, 0], [510, 0], [335, 325], [180, 700], [0, 800]], '#73845a');
  grove([[0, 0], [500, 0], [330, 345], [135, 760], [0, 800]], 4100);
  patch([[180, 380], [365, 346], [483, 430], [551, 575], [330, 625], [200, 580]], '#849265');
  grove([[180, 380], [365, 346], [483, 430], [520, 565], [330, 625], [200, 580]], 1300);
  patch([[773, 78], [1136, 182], [1148, 610], [870, 684], [798, 550]], '#a69e79');
  grove([[782, 0], [1215, 0], [1215, 180], [1020, 155]], 1500);
  neighborhood([[487, -30], [613, -20], [671, 112], [560, 241], [365, 346], [381, 211]], -.76, 23);
  neighborhood([[615, -40], [808, 76], [897, 226], [762, 321], [649, 239], [565, 152]], -.67, 24);
  neighborhood([[755, 285], [849, 237], [978, 359], [1086, 569], [950, 613], [836, 484]], -.60, 24);
  neighborhood([[338, 621], [458, 568], [553, 612], [623, 750], [494, 814], [305, 774]], -.52, 31);
  neighborhood([[808, 699], [1038, 632], [1215, 620], [1230, 820], [737, 820]], -.23, 24);

  // Campus ground and roof masses are deliberately soft and unlabelled.
  const campus = [[515, 416], [720, 376], [790, 467], [840, 601], [732, 638], [588, 625], [477, 565]];
  patch(campus, '#7e8b66'); grove(campus, 900);
  c.save(); polygon(campus); c.clip();
  for (const [x, y, w, h, angle] of [[581, 449, 42, 9, -.23], [631, 422, 40, 10, -.23], [688, 449, 40, 12, -.23], [659, 490, 47, 11, -.23], [733, 508, 36, 9, -.23], [608, 552, 33, 12, -.23], [733, 569, 42, 10, -.23]]) {
    c.save(); c.translate(x, y); c.rotate(angle);
    c.fillStyle = '#596452'; c.fillRect(1, 2, w, h);
    c.fillStyle = '#b1ad93'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#a49279'; c.fillRect(0, 0, w, h * .45); c.restore();
  }
  c.restore();
  road([[0, 110], [158, 224], [275, 310], [365, 345]], 4);
  road([[499, -20], [429, 104], [337, 253], [238, 408], [167, 538], [145, 800]], 7, '#737e7e');
  road([[1163, -20], [1160, 255], [1168, 480], [1171, 620], [1215, 800]], 8, '#737e7e');
  road([[638, 235], [759, 374], [838, 498], [947, 630], [1050, 754]], 6);
  road([[365, 345], [416, 403], [557, 388], [689, 359], [723, 359], [759, 374]], 5);
  road([[516, 415], [500, 447], [478, 514], [497, 563], [580, 591], [731, 637], [797, 638], [838, 601], [838, 555], [794, 467], [759, 374]], 4.5);
  road([[524, 454], [659, 416], [739, 399]], 3);
  road([[554, 515], [721, 470], [795, 467]], 3);
  road([[580, 591], [612, 540], [594, 473], [581, 400]], 3);
  road([[838, 601], [830, 661], [889, 685], [1001, 663], [1171, 620]], 5);
  road([[365, 345], [489, 294], [638, 235]], 4.5);
  road([[88, 415], [128, 452], [114, 501], [158, 577], [151, 654], [233, 704], [299, 723], [302, 766]], 2, '#658b81');

  // Bake blur and muted color once. No postprocessing or work during movement.
  c.resetTransform();
  const softened = document.createElement('canvas'); softened.width = softened.height = size;
  const out = softened.getContext('2d');
  out.filter = 'blur(1.8px) saturate(0.78)'; out.drawImage(canvas, 0, 0); out.filter = 'none';
  out.fillStyle = '#d5d9be'; out.globalAlpha = .13; out.fillRect(0, 0, size, size); out.globalAlpha = 1;
  // Exact original perimeter is a transparent hole: context never paints lots.
  out.globalCompositeOperation = 'destination-out'; out.beginPath();
  data.perimeter.map(texturePoint).forEach(([x, y], i) => i ? out.lineTo(x, y) : out.moveTo(x, y)); out.closePath(); out.fill();
  out.globalCompositeOperation = 'destination-in';
  for (const [x0, y0, x1, y1] of [[0, 0, size, 0], [size, 0, 0, 0], [0, 0, 0, size], [0, size, 0, 0]]) {
    const fade = out.createLinearGradient(x0, y0, x1, y1);
    fade.addColorStop(0, 'transparent'); fade.addColorStop(.10, '#fff'); fade.addColorStop(1, '#fff');
    out.fillStyle = fade; out.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(softened); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  const start = world([left, top]), end = world([left + width, top + height]);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(end.x - start.x, end.z - start.z), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.name = 'Entorno aéreo ilustrativo sem marcadores';
  mesh.rotation.x = -Math.PI / 2; mesh.position.set((start.x + end.x) / 2, -3.20, (start.z + end.z) / 2);
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.raycast = () => {}; // This layer has no interaction or additional POIs.
  return mesh;
}
