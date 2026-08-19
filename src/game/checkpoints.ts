import * as THREE from "three";
import { SPACING } from "./city";

/**
 * Timed checkpoint loop. Drive through the glowing gates in order to complete
 * a lap; the fastest lap is tracked and surfaced in the HUD.
 */

interface Marker {
  mesh: THREE.Mesh;
  geo: THREE.TorusGeometry;
  mat: THREE.MeshStandardMaterial;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
}

// A ~6-block loop on the road grid, in meters.
const ROUTE: [number, number][] = [
  [0, 0],
  [SPACING * 3, 0],
  [SPACING * 6, 0],
  [SPACING * 6, SPACING * 3],
  [SPACING * 6, SPACING * 6],
  [SPACING * 3, SPACING * 6],
  [0, SPACING * 6],
  [0, SPACING * 3],
  [0, 0],
];

const TRIGGER_RADIUS = 7;

export class CheckpointSystem {
  private markers: Marker[] = [];
  private current = 0;
  private lapStart = 0;
  private started = false;
  private scene: THREE.Scene;

  readonly total = ROUTE.length;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let i = 0; i < ROUTE.length; i++) {
      const [x, z] = ROUTE[i];
      const [px, pz] = ROUTE[(i - 1 + ROUTE.length) % ROUTE.length];
      const dir = new THREE.Vector3(x - px, 0, z - pz).normalize();

      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.2,
        roughness: 0.3,
        metalness: 0.2,
      });
      const geo = new THREE.TorusGeometry(6.5, 0.45, 12, 40);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 6.2, z);
      // Torus lies in the XY plane (normal +Z); rotate so its normal faces the
      // incoming travel direction, forming a vertical gate.
      mesh.rotation.y = Math.atan2(dir.x, dir.z);
      this.scene.add(mesh);

      this.markers.push({ mesh, geo, mat, pos: new THREE.Vector3(x, 0, z), dir });
    }
    this.updateMarkerColors();
  }

  private updateMarkerColors() {
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      if (i === this.current) {
        m.mat.emissive.setHex(0x22d3ee); // cyan = next target
        m.mat.emissiveIntensity = 1.4;
        m.mat.color.setHex(0xffffff);
      } else if (i < this.current) {
        m.mat.emissive.setHex(0x123348); // passed = faint
        m.mat.emissiveIntensity = 0.25;
      } else {
        m.mat.emissive.setHex(0x555566); // future = dim
        m.mat.emissiveIntensity = 0.4;
      }
    }
  }

  /** Returns ms if a lap was just completed, else null. */
  update(playerPos: THREE.Vector3, nowMs: number): number | null {
    if (!this.started) {
      this.lapStart = nowMs;
      this.started = true;
    }
    const m = this.markers[this.current];
    const dx = playerPos.x - m.pos.x;
    const dz = playerPos.z - m.pos.z;
    if (dx * dx + dz * dz < TRIGGER_RADIUS * TRIGGER_RADIUS) {
      this.current++;
      if (this.current >= this.markers.length) {
        const lapMs = nowMs - this.lapStart;
        this.current = 0;
        this.lapStart = nowMs;
        this.updateMarkerColors();
        return lapMs;
      }
      this.updateMarkerColors();
    }
    return null;
  }

  currentIndex() {
    return this.current;
  }

  elapsedMs(nowMs: number) {
    return this.started ? nowMs - this.lapStart : 0;
  }

  dispose() {
    for (const m of this.markers) {
      this.scene.remove(m.mesh);
      m.geo?.dispose();
      m.mat.dispose();
    }
  }
}
