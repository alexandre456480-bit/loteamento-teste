import * as THREE from 'three';

// The budget applies to visible tree geometry, regardless of zoom distance.
const budgets = {
  high: { triangles: 150000, meshes: 192, detailed: 32 },
  medium: { triangles: 100000, meshes: 128, detailed: 0 },
  low: { triangles: 65000, meshes: 96, detailed: 0 },
};
const triangleCount = geometry => (geometry.index?.count ?? geometry.attributes.position.count) / 3;

export function createVegetationLOD({ records, assets, cards, atlas, group, foliageMaterial, barkMaterial, cardMaterial }) {
  const bins = [], visible = [];
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  const previousWorld = new THREE.Matrix4(), previousProjection = new THREE.Matrix4();
  const viewPoint = new THREE.Vector3(), tint = new THREE.Color();
  let previousQuality, previousPixelScale, initialized = false;

  function instanced(geometry, material, capacity, colored) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) {
      mesh.setColorAt(0, tint.set('#ffffff'));
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.count = 0; mesh.visible = false;
    // Culling is performed per tree below, before packing the instance buffers.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return mesh;
  }

  for (let type = 0; type < 6; type++) {
    const capacity = records.filter(record => record.type === type).length;
    if (!capacity) continue;
    bins[type] = assets[type].map(asset => ({
      crown: instanced(asset.crown, foliageMaterial, capacity, true),
      trunk: instanced(asset.trunk, barkMaterial, capacity, false),
      triangles: triangleCount(asset.crown) + triangleCount(asset.trunk),
      count: 0,
    }));
    bins[type].push({ crown: instanced(cards[type], cardMaterial, capacity, true), count: 0 });
  }
  for (const record of records) {
    const e = record.matrix.elements;
    const sy = Math.hypot(e[4], e[5], e[6]);
    const scale = Math.max(Math.hypot(e[0], e[1], e[2]), sy, Math.hypot(e[8], e[9], e[10]));
    record.sphere = new THREE.Sphere(record.position.clone().add(new THREE.Vector3(0, 3.3 * sy, 0)), 5 * scale);
    record.visualSize = 6 * scale;
    record.lod = 3;
    record.cardTint = new THREE.Color(
      THREE.MathUtils.clamp(record.color.r / atlas.colors[record.type].r, 0.75, 1.25),
      THREE.MathUtils.clamp(record.color.g / atlas.colors[record.type].g, 0.75, 1.25),
      THREE.MathUtils.clamp(record.color.b / atlas.colors[record.type].b, 0.75, 1.25),
    );
  }

  function upload(mesh, count) {
    mesh.count = count; mesh.visible = count > 0;
    if (!count) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, count * 3);
      mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    update({ camera, pixelScale, quality }) {
      if (initialized && previousWorld.equals(camera.matrixWorld) && previousProjection.equals(camera.projectionMatrix) && previousQuality === quality && previousPixelScale === pixelScale) return { animate: false };
      initialized = true; previousWorld.copy(camera.matrixWorld); previousProjection.copy(camera.projectionMatrix);
      previousQuality = quality; previousPixelScale = pixelScale;
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      visible.length = 0;
      for (const record of records) {
        if (!frustum.intersectsSphere(record.sphere)) continue;
        viewPoint.copy(record.sphere.center).applyMatrix4(camera.matrixWorldInverse);
        record.pixels = record.visualSize * pixelScale / (camera.isOrthographicCamera ? 1 : Math.max(1, -viewPoint.z));
        visible.push(record);
      }
      // Spend detail on the largest visible trees first; distant trees retain
      // their atlas representation rather than disappearing when budget is full.
      visible.sort((a, b) => b.pixels - a.pixels);
      for (const levels of bins) if (levels) for (const bin of levels) bin.count = 0;
      const budget = budgets[quality];
      let triangles = 0, meshes = 0, detailed = 0;
      for (const record of visible) {
        const levels = bins[record.type];
        const threshold = (quality === 'high' ? 28 : quality === 'medium' ? 32 : 38) + (record.secondary ? 8 : 0);
        const proxy = record.pixels < threshold + (record.lod === 3 ? 2 : -2);
        let level = proxy ? 3 : quality === 'high' && record.pixels > (record.lod === 2 ? 75 : 90) ? 2 : record.pixels > (record.lod === 1 || record.lod === 2 ? 38 : 45) ? 1 : 0;
        if (level === 2 && detailed >= budget.detailed) level = 1;
        while (level > 0 && level < 3 && triangles + levels[level].triangles > budget.triangles) level--;
        if (level !== 3 && (meshes >= budget.meshes || triangles + levels[level].triangles > budget.triangles)) level = 3;
        record.lod = level;
        const bin = levels[level], index = bin.count++;
        bin.crown.setMatrixAt(index, record.matrix);
        bin.crown.setColorAt(index, level === 3 ? record.cardTint : record.color);
        if (bin.trunk) bin.trunk.setMatrixAt(index, record.matrix);
        if (level !== 3) { triangles += bin.triangles; meshes++; if (level === 2) detailed++; }
      }
      for (const levels of bins) if (levels) for (const bin of levels) {
        upload(bin.crown, bin.count);
        if (bin.trunk) upload(bin.trunk, bin.count);
      }
      group.userData.visibleTrees = visible.length;
      group.userData.treeTriangles = triangles;
      return { animate: false };
    },
  };
}
