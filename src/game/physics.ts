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

export interface Drivetrain {
  gear: string;
  rpm: number; // engine RPM (display value, ~900 idle .. ~7400 redline)
}

/**
 * Realistic vehicle dynamics tuning.
 *
 * Reference data (Bullet/Rapier ray-cast vehicle controllers):
 *  - Suspension stiffness: 10 = off-road buggy, 50 = sports car, 200 = F1.
 *  - Damping = k * 2 * sqrt(stiffness). k = 0.1–0.3 compression, 0.2–0.5
 *    rebound. Critically, rebound (relaxation) must be HIGHER than
 *    compression or the body bounces/overshoots after bumps and dips.
 *  - frictionSlip ~0.8 real tyre, higher for more grip.
 *  - Mass ~1500 kg for a typical car.
 *
 * On top of the controller we add a proper longitudinal model: a
 * torque-limited + power-limited engine curve (so launch is strong and the
 * car tapers toward a natural top speed), quadratic aerodynamic drag,
 * speed-proportional downforce, rolling resistance, speed-sensitive steering
 * and front-biased braking.
 */
const CAR = {
  mass: 1500, // kg

  // Engine / drivetrain (rear-wheel drive)
  engineMaxForce: 8000, // N — total torque-limited launch force
  engineMaxPower: 186000, // W (~250 hp) — power-limited at higher speed
  reverseForce: 2600, // N — total reverse force

  // Aerodynamics
  dragCoeff: 0.52, // N per (m/s)^2
  downforceCoeff: 0.7, // N per (m/s)^2
  rollingResistance: 160, // N — tyre rolling resistance

  // Suspension (per wheel)
  suspensionStiffness: 52, // sports car
  suspensionCompression: 3.2, // k≈0.22
  suspensionRelaxation: 6.6, // k≈0.46 (higher than compression — critical!)
  maxSuspensionForce: 40000,
  maxSuspensionTravel: 0.25,

  // Tyres
  frictionSlip: 3.4, // forward grip
  sideFrictionStiffness: 1.5, // lateral grip

  // Steering — speed sensitive
  maxSteer: 0.58, // rad (~33°) at standstill
  steerRefSpeed: 17, // m/s where steering halves

  // Brakes (front-biased, like a real car)
  brakeForceTotal: 13200, // N (~0.9g)
  brakeBiasFront: 0.62,
  handbrakeForce: 6500, // N per rear wheel (locks rears)

  // Body damping (keep low — we don't fight the physics)
  linearDamping: 0.01,
  angularDamping: 0.12,

  // Geometry
  wheelRadius: 0.34,
  suspensionRestLength: 0.4,
};

const REDLINE_RPM = 7400;
const IDLE_RPM = 900;
// Per-gear top speeds (m/s) — spaced for a 6-speed sports 'box.
const GEAR_TOPS = [11, 18, 27, 38, 51, 68];

export class PhysicsWorld {
  world!: RAPIER.World;
  private vehicle!: RAPIER.DynamicRayCastVehicleController;
  private chassis!: RAPIER.RigidBody;

  private accumulator = 0;
  readonly fixedDt = 1 / 120;

  private wheelDefs: { pos: THREE.Vector3; radius: number; isFront: boolean }[] =
    [];

  readonly chassisHalfExtents = new THREE.Vector3(1.0, 0.38, 2.1);

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.fixedDt;

    const ground = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(6000, 0.5, 6000).setTranslation(0, -0.5, 0),
    );
    ground.setFriction(1.0);
    ground.setRestitution(0.0);

    // Chassis
    const start = { x: 0, y: 0.9, z: 0 };
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinearDamping(CAR.linearDamping)
      .setAngularDamping(CAR.angularDamping)
      .setCcdEnabled(true);
    this.chassis = this.world.createRigidBody(bodyDesc);

    const he = this.chassisHalfExtents;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z)
        .setDensity(1.0)
        .setFriction(0.55)
        .setRestitution(0.02),
      this.chassis,
    );

    // Mass properties — CoM low for stability, realistic inertia tensor.
    const m = CAR.mass;
    this.chassis.setAdditionalMassProperties(
      m,
      { x: 0, y: -0.22, z: 0 },
      {
        x: (m * (he.y * he.y + he.z * he.z)) / 3,
        y: (m * (he.x * he.x + he.z * he.z)) / 3,
        z: (m * (he.x * he.x + he.y * he.y)) / 3,
      },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    // Vehicle controller
    this.vehicle = new RAPIER.DynamicRayCastVehicleController(
      this.chassis,
      this.world.bodies,
      this.world.colliders,
      this.world.queryPipeline,
    );

    const r = CAR.wheelRadius;
    const restLen = CAR.suspensionRestLength;
    const axleX = 0.82;
    const frontZ = 1.32;
    const rearZ = -1.32;
    const connY = -0.02;

    const defs = [
      { x: -axleX, z: frontZ, front: true },
      { x: axleX, z: frontZ, front: true },
      { x: -axleX, z: rearZ, front: false },
      { x: axleX, z: rearZ, front: false },
    ];

    for (const d of defs) {
      this.vehicle.addWheel(
        { x: d.x, y: connY, z: d.z },
        { x: 0, y: -1, z: 0 }, // suspension ray points down
        { x: 1, y: 0, z: 0 }, // axle along X
        restLen,
        r,
      );
      this.wheelDefs.push({
        pos: new THREE.Vector3(d.x, connY, d.z),
        radius: r,
        isFront: d.front,
      });
    }

    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelSuspensionStiffness(i, CAR.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(i, CAR.suspensionCompression);
      this.vehicle.setWheelSuspensionRelaxation(i, CAR.suspensionRelaxation);
      this.vehicle.setWheelMaxSuspensionForce(i, CAR.maxSuspensionForce);
      this.vehicle.setWheelMaxSuspensionTravel(i, CAR.maxSuspensionTravel);
      this.vehicle.setWheelFrictionSlip(i, CAR.frictionSlip);
      this.vehicle.setWheelSideFrictionStiffness(i, CAR.sideFrictionStiffness);
    }

    return this;
  }

  private lastSpeed = 0;

  /** Compute per-wheel forces and feed the controller. */
  private applyInput(input: VehicleInput) {
    const speed = this.lastSpeed;

    // --- Speed-sensitive steering ---
    const t = speed / CAR.steerRefSpeed;
    const steerFactor = 1 / (1 + Math.pow(t, 1.6));
    const steer = input.steer * CAR.maxSteer * steerFactor;

    // --- Longitudinal forces ---
    const perWheelMaxForce = CAR.engineMaxForce / 2;
    const perWheelMaxPower = CAR.engineMaxPower / 2;
    const v = Math.max(speed, 1.2);

    let engineForce = 0;
    let brakeForce = 0;
    const reverse = input.brake > 0 && speed < 2.0;

    if (input.handbrake) {
      // Lock rears, no engine, no normal braking.
      brakeForce = CAR.handbrakeForce;
    } else if (input.throttle > 0) {
      engineForce =
        input.throttle *
        Math.min(perWheelMaxForce, perWheelMaxPower / v);
      brakeForce = 0;
    } else if (reverse) {
      // Reverse from (near) standstill on brake.
      engineForce = -input.brake * (CAR.reverseForce / 2);
      brakeForce = 0;
    } else if (input.brake > 0) {
      engineForce = 0;
      brakeForce = input.brake * CAR.brakeForceTotal;
    } else {
      engineForce = 0;
      brakeForce = 0;
    }

    // Front / rear brake split.
    const frontBrake = input.handbrake ? 0 : brakeForce * CAR.brakeBiasFront;
    const rearBrake = input.handbrake
      ? CAR.handbrakeForce
      : brakeForce * (1 - CAR.brakeBiasFront);

    for (let i = 0; i < 4; i++) {
      const def = this.wheelDefs[i];
      if (def.isFront) {
        this.vehicle.setWheelSteering(i, steer);
        this.vehicle.setWheelEngineForce(i, 0);
        this.vehicle.setWheelBrake(i, frontBrake / 2);
      } else {
        this.vehicle.setWheelSteering(i, 0);
        this.vehicle.setWheelEngineForce(i, engineForce);
        this.vehicle.setWheelBrake(i, rearBrake / 2);
      }
    }
  }

  /** Aerodynamic drag (quadratic) + rolling resistance + downforce. */
  private applyAero() {
    const lin = this.chassis.linvel();
    const speed = Math.hypot(lin.x, lin.y, lin.z);
    if (speed < 0.01) return;
    const dt = this.fixedDt;
    const inv = 1 / speed;

    // Drag + rolling resistance oppose the velocity vector.
    const drag = CAR.dragCoeff * speed * speed + CAR.rollingResistance;
    this.chassis.applyImpulse(
      { x: -lin.x * inv * drag * dt, y: -lin.y * inv * drag * dt, z: -lin.z * inv * drag * dt },
      true,
    );

    // Downforce pushes the chassis into the ground at speed.
    const df = CAR.downforceCoeff * speed * speed;
    this.chassis.applyImpulse({ x: 0, y: -df * dt, z: 0 }, true);
  }

  step(realDt: number, input: VehicleInput) {
    this.lastSpeed = this.speedMs();
    this.applyInput(input);
    this.accumulator += Math.min(realDt, 0.1);
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < 8) {
      this.vehicle.updateVehicle(this.fixedDt);
      this.applyAero();
      this.world.step();
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === 8) this.accumulator = 0;
  }

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

  /** Forward speed (signed) along the car's facing direction. */
  forwardSpeedMs(quat: THREE.Quaternion): number {
    const v = this.chassis.linvel();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    return v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
  }

  /** Gear + RPM for HUD and audio, from actual speed. */
  getDrivetrain(speedMs: number): Drivetrain {
    const s = Math.abs(speedMs);
    if (s < 1.0) return { gear: "N", rpm: IDLE_RPM };
    let gear = 1;
    for (let i = 0; i < GEAR_TOPS.length; i++) {
      if (s <= GEAR_TOPS[i]) {
        gear = i + 1;
        break;
      }
      gear = GEAR_TOPS.length;
    }
    const top = GEAR_TOPS[gear - 1] ?? GEAR_TOPS[GEAR_TOPS.length - 1];
    // RPM rises linearly across the gear's speed band.
    const rpm = IDLE_RPM + (Math.min(s, top) / top) * (REDLINE_RPM - IDLE_RPM);
    return { gear: String(gear), rpm };
  }

  syncWheels(
    out: WheelInfo[],
    chassisPos: THREE.Vector3,
    chassisQuat: THREE.Quaternion,
  ) {
    const m = new THREE.Matrix4().compose(
      chassisPos,
      chassisQuat,
      new THREE.Vector3(1, 1, 1),
    );
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

  reset(
    pos: THREE.Vector3 = new THREE.Vector3(0, 1.2, 0),
    quat?: THREE.Quaternion,
  ) {
    this.chassis.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.chassis.setRotation(
      quat
        ? { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
        : { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
