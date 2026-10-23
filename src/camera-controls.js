import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// A speed floor avoids distance-dependent sluggishness near the target.
// The protected pan helpers are those supplied by the installed Three r180.
export class MaquetteControls extends OrbitControls {
  _pan(deltaX, deltaY) {
    const height = Math.max(1, this.domElement.clientHeight);
    const unitsPerPixel = this.object.isPerspectiveCamera
      ? 2 * this.object.position.distanceTo(this.target) * Math.tan(THREE.MathUtils.degToRad(this.object.fov / 2)) / height
      : (this.object.top - this.object.bottom) / this.object.zoom / height;
    const speed = THREE.MathUtils.clamp(unitsPerPixel, 0.16, 1.8);
    this._panLeft(deltaX * speed, this.object.matrix);
    this._panUp(deltaY * speed, this.object.matrix);
  }
}
