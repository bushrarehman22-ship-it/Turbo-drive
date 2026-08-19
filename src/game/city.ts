import * as THREE from "three";
import * as RAPIER from "@dimforge/rapier3d-compat";
import type { PhysicsWorld } from "./physics";
import {
  roadMarkingTexture,
  enhanceWithNormals,
  type TextureSet,
} from "./textures";

/**
 * Procedural city: a large bounded grid (~10km x 10km ≈ 99 km²).
 * Roads + sidewalks are generated once (cheap). Buildings are instanced and
 * streamed in/out by chunk based on the car's position, with matching static
 * physics colliders.
 */

export const BLOCK = 60; // building block footprint (m)
export const ROAD_W = 8; // drivable asphalt width (m)
export const SIDEWALK_W = 3; // sidewalk width per side (m)
export const SPACING = BLOCK + ROAD_W + SIDEWALK_W * 2; // 74m
export const CITY_HALF = 5000; // half-extent of the city (10km across)

const CHUNK_BLOCKS = 4;
const CHUNK_SIZE = CHUNK_BLOCKS * SPACING; // ~296m
const ACTIVE_RADIUS = CHUNK_SIZE * 2.5; // ~740m
const MAX_BUILDINGS = 6000;
const FACADE_VARIANTS = 4;

interface BuildingSlot {
  variant: number;
  index: number;
  collider?: RAPIER.Collider;
  chunkKey: string;
  cellKey: string;
}

// Deterministic hash for stable procedural layout.
function hash2(ix: number, iz: number, seed = 0) {
  let h = ix * 374761393 + iz * 668265263 + seed * 974634;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

export class City {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private textures: TextureSet;

  private roadGeo!: THREE.BufferGeometry;
  private roadMaterial!: THREE.MeshStandardMaterial;

  private pools: THREE.InstancedMesh[] = [];
  private freeLists: number[][] = [];
  private slots: BuildingSlot[] = [];
  private loadedChunks = new Set<string>();

  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, physics: PhysicsWorld, textures: TextureSet) {
    this.scene = scene;
    this.physics = physics;
    this.textures = textures;
    this.buildRoads();
    this.buildPools();
  }

  // ---- Roads & sidewalks (built once) ----
  private buildRoads() {
    const normals = enhanceWithNormals(this.textures);
    const marking = roadMarkingTexture();

    const roadMat = new THREE.MeshStandardMaterial({
      map: this.textures.asphalt,
      roughness: 0.95,
      metalness: 0.0,
    });
    if (normals.asphaltNormal) {
      roadMat.normalMap = normals.asphaltNormal;
      roadMat.normalScale.set(0.6, 0.6);
    }
    const sideMat = new THREE.MeshStandardMaterial({
      map: this.textures.sidewalk,
      roughness: 0.9,
      metalness: 0.0,
    });
    if (normals.sidewalkNormal) {
      sideMat.normalMap = normals.sidewalkNormal;
      sideMat.normalScale.set(0.4, 0.4);
    }
    const markMat = new THREE.MeshStandardMaterial({
      map: marking,
      roughness: 0.8,
      transparent: true,
      depthWrite: false,
    });

    this.roadMaterial = roadMat;

    const roadGeos: THREE.BufferGeometry[] = [];
    const sideGeos: THREE.BufferGeometry[] = [];
    const markGeos: THREE.BufferGeometry[] = [];

    const nRoads = Math.ceil(CITY_HALF / SPACING);
    const len = CITY_HALF * 2;

    for (let k = -nRoads; k <= nRoads; k++) {
      const c = k * SPACING;
      // Vertical road (along Z) and horizontal road (along X)
      roadGeos.push(this.stripGeometry(len, ROAD_W, true, c, ROAD_W));
      roadGeos.push(this.stripGeometry(len, ROAD_W, false, c, ROAD_W));
      markGeos.push(this.markingGeometry(len, true, c));
      markGeos.push(this.markingGeometry(len, false, c));

      // Sidewalks flanking each road
      sideGeos.push(this.sidewalkGeometry(len, true, c - ROAD_W / 2 - SIDEWALK_W, SIDEWALK_W));
      sideGeos.push(this.sidewalkGeometry(len, true, c + ROAD_W / 2, SIDEWALK_W));
      sideGeos.push(this.sidewalkGeometry(len, false, c - ROAD_W / 2 - SIDEWALK_W, SIDEWALK_W));
      sideGeos.push(this.sidewalkGeometry(len, false, c + ROAD_W / 2, SIDEWALK_W));
    }

    const mergedRoad = this.merge(roadGeos);
    const mergedSide = this.merge(sideGeos);
    const mergedMark = this.merge(markGeos);

    const roadMesh = new THREE.Mesh(mergedRoad, roadMat);
    roadMesh.position.y = 0.02;
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    const sideMesh = new THREE.Mesh(mergedSide, sideMat);
    sideMesh.position.y = 0.06;
    sideMesh.receiveShadow = true;
    this.scene.add(sideMesh);

    const markMesh = new THREE.Mesh(mergedMark, markMat);
    markMesh.position.y = 0.07;
    markMesh.renderOrder = 1;
    this.scene.add(markMesh);
  }

  private stripGeometry(length: number, width: number, vertical: boolean, center: number, _w: number) {
    const g = new THREE.PlaneGeometry(width, length);
    g.rotateX(-Math.PI / 2);
    // UV repeat every 8m
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (width / 8), uv.getY(i) * (length / 8));
    }
    if (vertical) {
      g.translate(center, 0, 0);
    } else {
      g.rotateY(Math.PI / 2);
      g.translate(0, 0, center);
    }
    return g;
  }

  private sidewalkGeometry(length: number, vertical: boolean, center: number, width: number) {
    const g = new THREE.PlaneGeometry(width, length);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (width / 1.5), uv.getY(i) * (length / 1.5));
    }
    if (vertical) {
      g.translate(center, 0, 0);
    } else {
      g.rotateY(Math.PI / 2);
      g.translate(0, 0, center);
    }
    return g;
  }

  private markingGeometry(length: number, vertical: boolean, center: number) {
    const g = new THREE.PlaneGeometry(0.25, length);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i), uv.getY(i) * (length / 8));
    }
    if (vertical) {
      g.translate(center, 0, 0);
    } else {
      g.rotateY(Math.PI / 2);
      g.translate(0, 0, center);
    }
    return g;
  }

  private merge(geos: THREE.BufferGeometry[]) {
    const merged = new THREE.BufferGeometry();
    // Manual merge: accumulate positions/normals/uvs
    let positions: number[] = [];
    let normals: number[] = [];
    let uvs: number[] = [];
    for (const g of geos) {
      g.applyMatrix4(new THREE.Matrix4()); // bake (identity, kept for clarity)
      const p = Array.from(g.attributes.position.array as Float32Array);
      const n = Array.from(g.attributes.normal.array as Float32Array);
      const u = Array.from(g.attributes.uv.array as Float32Array);
      for (const v of p) positions.push(v);
      for (const v of n) normals.push(v);
      for (const v of u) uvs.push(v);
      g.dispose();
    }
    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    return merged;
  }

  // ---- Building pools ----
  private buildPools() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origin at base
    const normals = enhanceWithNormals(this.textures);

    for (let v = 0; v < FACADE_VARIANTS; v++) {
      const tex = this.textures.facades[v % this.textures.facades.length];
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.85,
        metalness: 0.15,
      });
      const n = normals.facadesNormal[v % normals.facadesNormal.length];
      if (n) {
        mat.normalMap = n;
        mat.normalScale.set(0.5, 0.5);
      }
      const mesh = new THREE.InstancedMesh(geo, mat, Math.ceil(MAX_BUILDINGS / FACADE_VARIANTS));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.pools.push(mesh);
      this.freeLists.push(
        Array.from({ length: Math.ceil(MAX_BUILDINGS / FACADE_VARIANTS) }, (_, i) => i),
      );
    }
  }

  private chunkKey(bx: number, bz: number) {
    return `${bx},${bz}`;
  }

  private cellKey(bx: number, bz: number) {
    return `${bx},${bz}`;
  }

  update(carPos: THREE.Vector3) {
    const cbx = Math.floor(carPos.x / SPACING);
    const cbz = Math.floor(carPos.z / SPACING);
    const ccx = Math.floor(cbx / CHUNK_BLOCKS);
    const ccz = Math.floor(cbz / CHUNK_BLOCKS);
    const radiusChunks = Math.ceil(ACTIVE_RADIUS / CHUNK_SIZE);

    // Unload far chunks
    for (const key of Array.from(this.loadedChunks)) {
      const [x, z] = key.split(",").map(Number);
      if (Math.abs(x - ccx) > radiusChunks + 1 || Math.abs(z - ccz) > radiusChunks + 1) {
        this.unloadChunk(key);
      }
    }

    // Load nearby chunks
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = this.chunkKey(cx, cz);
        if (!this.loadedChunks.has(key)) this.loadChunk(cx, cz, key);
      }
    }
  }

  private loadChunk(cx: number, cz: number, key: string) {
    this.loadedChunks.add(key);
    for (let lx = 0; lx < CHUNK_BLOCKS; lx++) {
      for (let lz = 0; lz < CHUNK_BLOCKS; lz++) {
        const bx = cx * CHUNK_BLOCKS + lx;
        const bz = cz * CHUNK_BLOCKS + lz;
        this.addBuilding(bx, bz, key);
      }
    }
  }

  private unloadChunk(key: string) {
    this.loadedChunks.delete(key);
    const remaining: BuildingSlot[] = [];
    for (const slot of this.slots) {
      if (slot.chunkKey === key) {
        this.freeSlot(slot);
      } else {
        remaining.push(slot);
      }
    }
    this.slots = remaining;
  }

  private freeSlot(slot: BuildingSlot) {
    if (slot.collider) {
      this.physics.world.removeCollider(slot.collider, true);
      slot.collider = undefined;
    }
    this.freeLists[slot.variant].push(slot.index);
    // Hide instance
    this.dummy.position.set(0, -1000, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.pools[slot.variant].setMatrixAt(slot.index, this.dummy.matrix);
    this.pools[slot.variant].instanceMatrix.needsUpdate = true;
  }

  private addBuilding(bx: number, bz: number, key: string) {
    const cell = this.cellKey(bx, bz);
    // Skip if already present
    if (this.slots.some((s) => s.cellKey === cell)) return;

    // Building footprint origin (block corner + sidewalk + margin)
    const margin = 4;
    const ox = bx * SPACING + ROAD_W / 2 + SIDEWALK_W + margin;
    const oz = bz * SPACING + ROAD_W / 2 + SIDEWALK_W + margin;
    const footprint = BLOCK - margin * 2; // 52

    // Keep buildings inside the paved city extent.
    const edge = CITY_HALF - BLOCK;
    if (Math.abs(ox) > edge || Math.abs(oz) > edge) return;

    // Height: downtown towers near centre, tapering outward + noise
    const dist = Math.hypot(bx * SPACING, bz * SPACING) / CITY_HALF; // 0..1
    const downtown = Math.max(0, 1 - dist * 2.2); // 1 near centre
    const h1 = hash2(bx, bz, 1);
    const h2 = hash2(bx, bz, 2);

    let height: number;
    if (h1 < 0.12) {
      height = 6 + h2 * 8; // low-rise
    } else if (downtown > 0.55 && h1 < 0.35) {
      height = 60 + downtown * 120 * (0.4 + h2 * 0.6); // tower
    } else {
      height = 14 + h2 * 42; // mid-rise
    }
    height = Math.max(5, height);

    // Footprint variation
    const fw = footprint * (0.6 + h1 * 0.4);
    const fd = footprint * (0.6 + h2 * 0.4);

    const variant = Math.floor(hash2(bx, bz, 3) * FACADE_VARIANTS) % FACADE_VARIANTS;
    const pool = this.pools[variant];
    const free = this.freeLists[variant];

    if (free.length === 0) return; // pool exhausted
    const index = free.pop()!;

    this.dummy.position.set(ox + fw / 2, 0, oz + fd / 2);
    this.dummy.scale.set(fw, height, fd);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    pool.setMatrixAt(index, this.dummy.matrix);
    // subtle tint variation
    const tint = 0.85 + hash2(bx, bz, 4) * 0.3;
    pool.setColorAt(index, new THREE.Color(tint, tint, tint));
    pool.instanceMatrix.needsUpdate = true;
    if (pool.instanceColor) pool.instanceColor.needsUpdate = true;

    // Physics collider
    const collider = this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(fw / 2, height / 2, fd / 2)
        .setTranslation(ox + fw / 2, height / 2, oz + fd / 2)
        .setFriction(0.6),
    );

    this.slots.push({ variant, index, collider, chunkKey: key, cellKey: cell });
  }

  dispose() {
    for (const slot of this.slots) {
      if (slot.collider) this.physics.world.removeCollider(slot.collider, true);
    }
  }
}
