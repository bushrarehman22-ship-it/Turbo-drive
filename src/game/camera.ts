import * as THREE from "three";
import type { CameraMode } from "./store";

export class ChaseCamera {
  private camera: THREE.PerspectiveCamera;
  private current = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private init = false;

  private orbitAngle = 0;
  private baseFov = 62;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  update(
    dt: number,
    mode: CameraMode,
    carPos: THREE.Vector3,
    carQuat: THREE.Quaternion,
    speedMs: number,
  ) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(carQuat);

    let desired = new THREE.Vector3();
    let target = new THREE.Vector3();

    const speed = Math.min(speedMs, 60);

    switch (mode) {
      case "hood":
        desired.copy(carPos).addScaledVector(up, 0.95).addScaledVector(forward, 1.2);
        target.copy(desired).addScaledVector(forward, 20);
        break;
      case "cockpit":
        desired.copy(carPos).addScaledVector(up, 0.95).addScaledVector(forward, -0.2);
        target.copy(carPos).addScaledVector(up, 0.7).addScaledVector(forward, 20);
        break;
      case "orbit":
        this.orbitAngle += dt * 0.12;
        const r = 26;
        desired.set(
          carPos.x + Math.cos(this.orbitAngle) * r,
          carPos.y + 16,
          carPos.z + Math.sin(this.orbitAngle) * r,
        );
        target.copy(carPos);
        break;
      case "chase":
      default: {
        // Behind the car, pulled back with speed, slight lateral for feel
        const back = forward.clone().multiplyScalar(-1);
        const dist = 7.2 + speed * 0.12;
        const height = 2.8 + speed * 0.05;
        desired
          .copy(carPos)
          .addScaledVector(back, dist)
          .addScaledVector(up, height);
        // Look ahead of the car
        target.copy(carPos).addScaledVector(up, 1.1).addScaledVector(forward, 6);
        break;
      }
    }

    if (!this.init) {
      this.current.copy(desired);
      this.lookAt.copy(target);
      this.init = true;
    }

    const lerp = 1 - Math.exp(-dt * 8);
    this.current.lerp(desired, lerp);
    this.lookAt.lerp(target, 1 - Math.exp(-dt * 10));

    this.camera.position.copy(this.current);
    this.camera.lookAt(this.lookAt);

    // Speed-based FOV kick
    const targetFov = this.baseFov + (mode === "chase" ? speed * 0.25 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 6));
    this.camera.updateProjectionMatrix();
  }
}
