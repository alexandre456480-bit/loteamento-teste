import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// A speed floor avoids distance-dependent sluggishness near the target.
// The protected pan helpers are those supplied by the installed Three r180.
export class MaquetteControls extends OrbitControls {
  _touchPairAngle() {
    if (this._pointers.length !== 2) return null;
    const a = this._pointerPositions[this._pointers[0]];
    const b = this._pointerPositions[this._pointers[1]];
    if (!a || !b || a.distanceToSquared(b) < 144) return null;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  _handleTouchStartDollyRotate(event) {
    super._handleTouchStartDollyRotate(event);
    this._twistStart = this._touchPairAngle();
  }

  _handleTouchMoveDollyRotate(event) {
    // Two-finger drag orbits/tilts; pinch keeps the existing zoom behavior.
    super._handleTouchMoveDollyRotate(event);
    const angle = this._touchPairAngle();
    if (this.enableRotate && angle !== null && this._twistStart != null) {
      const delta = angle - this._twistStart;
      // Wrap the angle so crossing +/-180 degrees never jumps the camera.
      this._rotateLeft(Math.atan2(Math.sin(delta), Math.cos(delta)) * this.rotateSpeed);
    }
    this._twistStart = angle;
  }

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
