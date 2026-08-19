import * as RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export interface VehicleInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  handbrake: boolean;
}

export interface WheelInfo {
  hardPoint: THREE.Vector3;
  radius: number;
  rotation: number;
  steerAngle: number;
  isFront: boolean;
}

const UP = { x: 0, y: 1, z: 0 };

export class PhysicsWorld {
  world!: RAPIER.World;
  private vehicle!: RAPIER.DynamicRayCastVehicleController;
  private chassis!: RAPIER.RigidBody;

  private accumulator = 0;
  readonly fixedDt = 1 / 120;

  // Wheel layout metadata (mirrors what we add to rapier)
  private wheelDefs: { pos: THREE.Vector3; radius: number; isFront: boolean }[] =
    [];

  readonly chassisHalfExtents = new THREE.Vector3(1.05, 0.42, 2.1);

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.fixedDt;

    // Ground plane — covers the entire city. Driving surface everywhere.
    const ground = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(6000, 0.5, 6000).setTranslation(0, -0.5, 0),
    );
    ground.setFriction(1.0);
    ground.setRestitution(0.0);

    // Chassis rigid body
    const start = { x: 0, y: 0.9, z: 0 };
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinearDamping(0.02)
      .setAngularDamping(0.4)
      .setCcdEnabled(true);
    this.chassis = this.world.createRigidBody(bodyDesc);

    const he = this.chassisHalfExtents;
    const collider = RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z)
      .setDensity(1.0)
      .setFriction(0.6)
      .setRestitution(0.05);
    this.world.createCollider(collider, this.chassis);

    // Lower the centre of mass for realistic, stable handling.
    const mass = 1350;
    const hx = he.x, hy = he.y, hz = he.z;
    this.chassis.setAdditionalMassProperties(
      mass,
      { x: 0, y: -0.18, z: 0 }, // CoM slightly below chassis centre
      {
        x: (mass * (hy * hy + hz * hz)) / 3,
        y: (mass * (hx * hx + hz * hz)) / 3,
        z: (mass * (hx * hx + hy * hy)) / 3,
      },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    // Vehicle controller (ray-cast wheels)
    this.vehicle = new RAPIER.DynamicRayCastVehicleController(
      this.chassis,
      this.world.bodies,
      this.world.colliders,
      this.world.queryPipeline,
    );
    // default up = Y, forward = Z. No need to change indices.

    const wheelRadius = 0.34;
    const restLen = 0.4;
    const axleX = 0.82;
    const frontZ = 1.32;
    const rearZ = -1.32;
    const connY = -0.05;

    const defs = [
      { x: -axleX, z: frontZ, front: true },
      { x: axleX, z: frontZ, front: true },
      { x: -axleX, z: rearZ, front: false },
      { x: axleX, z: rearZ, front: false },
    ];

    for (const d of defs) {
      this.vehicle.addWheel(
        { x: d.x, y: connY, z: d.z }, // chassis connection
        { x: 0, y: -1, z: 0 }, // suspension direction (down)
        { x: 1, y: 0, z: 0 }, // axle (along X)
        restLen,
        wheelRadius,
      );
      this.wheelDefs.push({
        pos: new THREE.Vector3(d.x, connY, d.z),
        radius: wheelRadius,
        isFront: d.front,
      });
    }

    // Suspension + tire tuning (per wheel)
    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelSuspensionStiffness(i, 38);
      this.vehicle.setWheelSuspensionCompression(i, 4.4);
      this.vehicle.setWheelSuspensionRelaxation(i, 2.6);
      this.vehicle.setWheelMaxSuspensionForce(i, 100000);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.3);
      this.vehicle.setWheelFrictionSlip(i, 2.4);
      this.vehicle.setWheelSideFrictionStiffness(i, 2.0);
    }

    return this;
  }

  /** Max engine force applied to driven wheels (rear). */
  private readonly engineForce = 1500;
  private readonly brakeForce = 900;
  private readonly handbrakeForce = 2200;
  private readonly maxSteer = 0.55; // rad (~31°)

  applyInput(input: VehicleInput) {
    const steer = input.steer * this.maxSteer;
    for (let i = 0; i < 4; i++) {
      const def = this.wheelDefs[i];
      if (def.isFront) {
        this.vehicle.setWheelSteering(i, steer);
        this.vehicle.setWheelEngineForce(i, 0);
        this.vehicle.setWheelBrake(i, input.handbrake ? this.handbrakeForce * 0.5 : input.brake * this.brakeForce);
      } else {
        this.vehicle.setWheelSteering(i, 0);
        this.vehicle.setWheelEngineForce(i, input.throttle * this.engineForce);
        this.vehicle.setWheelBrake(i, input.handbrake ? this.handbrakeForce : input.brake * this.brakeForce);
      }
    }
  }

  /** Advance physics by real dt (fixed-step with accumulation). */
  step(realDt: number, input: VehicleInput) {
    this.applyInput(input);
    this.accumulator += Math.min(realDt, 0.1);
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < 6) {
      this.vehicle.updateVehicle(this.fixedDt);
      this.world.step();
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === 6) this.accumulator = 0;
  }

  /** World transform of the chassis (interpolated by caller). */
  getChassisTransform(out: THREE.Vector3, outQuat: THREE.Quaternion) {
    const t = this.chassis.translation();
    const r = this.chassis.rotation();
    out.set(t.x, t.y, t.z);
    outQuat.set(r.x, r.y, r.z, r.w);
    return { pos: out, quat: outQuat };
  }

  speedMs(): number {
    const v = this.chassis.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** Recompute wheel world positions + rotations for visual sync. */
  syncWheels(out: WheelInfo[], chassisPos: THREE.Vector3, chassisQuat: THREE.Quaternion) {
    const m = new THREE.Matrix4().compose(chassisPos, chassisQuat, new THREE.Vector3(1, 1, 1));
    for (let i = 0; i < 4; i++) {
      const def = this.wheelDefs[i];
      const local = def.pos.clone();
      local.applyMatrix4(m);
      const rot = this.vehicle.wheelRotation(i) ?? 0;
      const info = out[i];
      info.hardPoint.copy(local);
      info.radius = def.radius;
      info.rotation = rot;
      info.steerAngle = def.isFront ? this.vehicle.wheelSteering(i) ?? 0 : 0;
      info.isFront = def.isFront;
    }
  }

  reset(pos: THREE.Vector3 = new THREE.Vector3(0, 1.2, 0), quat?: THREE.Quaternion) {
    this.chassis.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.chassis.setRotation(
      quat ? { x: quat.x, y: quat.y, z: quat.z, w: quat.w } : { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
