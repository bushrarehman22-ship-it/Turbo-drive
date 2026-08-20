import * as THREE from "three";
import * as RAPIER from "@dimforge/rapier3d-compat";
import type { PhysicsWorld } from "./physics";
import { SPACING, ROAD_W, CITY_HALF } from "./city";

/**
 * Ambient AI traffic. Cars are kinematic rigid-bodies (they collide with and
 * block the player, but are driven by script). Kept in a radius around the
 * player by respawning any car that drifts too far away.
 */

interface TrafficCar {
  group: THREE.Group;
  wheels: THREE.Group[];
  body: RAPIER.RigidBody;
  axis: "x" | "z"; // travel axis
  lanePos: number; // absolute coordinate on the cross axis
  t: number; // position along the travel axis
  speed: number; // m/s
  dir: 1 | -1;
}

const BODY_COLORS = [
  0x8a2b2b, 0x2b4b8a, 0x2b8a4b, 0x8a7a2b, 0x6a2b8a, 0x2b8a8a, 0x333333,
  0xdddddd, 0x8a4b2b, 0x4b4b4b,
];

function buildTrafficCar(color: number): { group: THREE.Group; wheels: THREE.Group[] } {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.45,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a0d12,
    metalness: 0.8,
    roughness: 0.1,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.6), paint);
  body.position.y = 0.35;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.7), glass);
  cabin.position.set(0, 0.8, -0.15);
  cabin.castShadow = true;
  g.add(cabin);

  const hl = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff6cc,
    emissiveIntensity: 0.5,
  });
  const tl = new THREE.MeshStandardMaterial({
    color: 0x440000,
    emissive: 0xff2200,
    emissiveIntensity: 0.5,
  });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.06), hl);
    h.position.set(0.55 * s, 0.45, 1.8);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.06), tl);
    t.position.set(0.55 * s, 0.45, -1.8);
    g.add(t);
  }

  const tireGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 });
  const wheels: THREE.Group[] = [];
  for (const [x, z] of [
    [-0.82, 1.1],
    [0.82, 1.1],
    [-0.82, -1.1],
    [0.82, -1.1],
  ]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tireGeo, tireMat));
    w.position.set(x, 0.3, z);
    g.add(w);
    wheels.push(w);
  }

  return { group: g, wheels };
}

export class TrafficSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private cars: TrafficCar[] = [];
  private readonly count: number;
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, physics: PhysicsWorld, spawn: THREE.Vector3, count = 26) {
    this.scene = scene;
    this.physics = physics;
    this.count = count;
    for (let i = 0; i < this.count; i++) {
      this.cars.push(this.spawnCar(spawn, 600));
    }
  }

  private cross(axis: "x" | "z"): "x" | "z" {
    return axis === "x" ? "z" : "x";
  }

  private carPosition(car: TrafficCar, out: THREE.Vector3) {
    if (car.axis === "x") out.set(car.t, 0, car.lanePos);
    else out.set(car.lanePos, 0, car.t);
    return out;
  }

  private pickLane(center: number): number {
    const road = Math.round((Math.random() - 0.5) * 6);
    const laneOffset = (Math.random() > 0.5 ? 1 : -1) * (ROAD_W / 2 - 2);
    return (Math.round(center / SPACING) + road) * SPACING + laneOffset;
  }

  private spawnCar(center: THREE.Vector3, radius: number): TrafficCar {
    const color = BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)];
    const { group, wheels } = buildTrafficCar(color);

    const axis: "x" | "z" = Math.random() > 0.5 ? "x" : "z";
    const cross = this.cross(axis);
    const lanePos = this.pickLane(center[cross]);
    const t = center[axis] + (Math.random() - 0.5) * radius * 2;
    const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
    const speed = 8 + Math.random() * 8;

    const pos = new THREE.Vector3();
    if (axis === "x") pos.set(t, 0, lanePos);
    else pos.set(lanePos, 0, t);

    const body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, 0.4, pos.z),
    );
    this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.95, 0.55, 1.85).setTranslation(0, 0.15, 0).setFriction(0.6),
      body,
    );

    group.position.copy(pos);
    group.position.y = 0;
    group.rotation.y = axis === "x" ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.scene.add(group);

    return { group, wheels, body, axis, lanePos, t, speed, dir };
  }

  update(dt: number, playerPos: THREE.Vector3) {
    for (const car of this.cars) {
      car.t += car.speed * car.dir * dt;
      const half = CITY_HALF - 60;
      if (car.t > half) car.t = -half;
      if (car.t < -half) car.t = half;

      const pos = this.carPosition(car, this.tmp);

      const dist = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (dist > 520) {
        this.respawn(car, playerPos);
        continue;
      }

      car.body.setNextKinematicTranslation({ x: pos.x, y: 0.4, z: pos.z });
      car.group.position.set(pos.x, 0, pos.z);

      const spin = (car.speed * car.t) / 0.3;
      for (const w of car.wheels) w.rotation.x = -spin;
    }
  }

  private respawn(car: TrafficCar, playerPos: THREE.Vector3) {
    const cross = this.cross(car.axis);
    car.lanePos = this.pickLane(playerPos[cross]);
    car.dir = Math.random() > 0.5 ? 1 : -1;
    const ahead = (Math.random() * 200 + 60) * (Math.random() > 0.5 ? 1 : -1);
    car.t = playerPos[car.axis] + ahead;

    const pos = this.carPosition(car, this.tmp);
    car.body.setNextKinematicTranslation({ x: pos.x, y: 0.4, z: pos.z });
    car.group.position.set(pos.x, 0, pos.z);
    car.group.rotation.y =
      car.axis === "x" ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  dispose() {
    for (const car of this.cars) {
      this.scene.remove(car.group);
      this.physics.world.removeRigidBody(car.body);
    }
    this.cars = [];
  }
}
