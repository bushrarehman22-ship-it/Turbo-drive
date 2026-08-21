import * as THREE from "three";
import type { WheelInfo } from "./physics";

export interface CarVisuals {
  group: THREE.Group;
  wheels: THREE.Group[]; // outer groups: position at hardpoint
  wheelSpin: THREE.Group[]; // inner groups: rotation.x = spin
  wheelSteer: THREE.Group[]; // mid groups: rotation.y = steer
  headlights: THREE.SpotLight[];
  brakeLight: THREE.PointLight;
  taillightMat: THREE.MeshStandardMaterial;
  setBraking: (v: boolean) => void;
}

interface WheelRig {
  outer: THREE.Group;
  steer: THREE.Group;
  spin: THREE.Group;
}

function buildWheel(): WheelRig {
  const outer = new THREE.Group();
  const steer = new THREE.Group();
  const spin = new THREE.Group();
  outer.add(steer);
  steer.add(spin);

  // Geometry axis along X (axle direction)
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(
    tireGeo,
    new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9, metalness: 0 }),
  );
  spin.add(tire);

  const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.29, 18);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(
    rimGeo,
    new THREE.MeshStandardMaterial({ color: 0xcfd2d8, roughness: 0.3, metalness: 0.9 }),
  );
  spin.add(rim);

  // Rotor/disc visual
  const rotorGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.31, 8);
  rotorGeo.rotateZ(Math.PI / 2);
  const rotor = new THREE.Mesh(
    rotorGeo,
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 }),
  );
  spin.add(rotor);

  return { outer, steer, spin };
}

export function buildCar(color = 0x2f6fe4): CarVisuals {
  const group = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.85,
    roughness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const darkTrim = new THREE.MeshStandardMaterial({
    color: 0x16181c,
    metalness: 0.4,
    roughness: 0.6,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0d12,
    metalness: 0.9,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x550000,
    emissive: 0xff2200,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });

  // --- Chassis body ---
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.55, 4.4), paint);
  body.position.y = 0.05;
  body.castShadow = true;
  group.add(body);

  // Lower skirt / rocker
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.32, 4.5), darkTrim);
  skirt.position.y = -0.18;
  group.add(skirt);

  // Cabin / greenhouse
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.52, 1.9), glassMat);
  cabin.position.set(0, 0.55, -0.15);
  cabin.castShadow = true;
  group.add(cabin);

  // Cabin roof pillar tint (thin trim over glass)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 1.92), paint);
  roof.position.set(0, 0.82, -0.15);
  group.add(roof);

  // Hood scoop / nose wedge
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 1.0), paint);
  nose.position.set(0, 0.32, 1.85);
  nose.rotation.x = 0.06;
  group.add(nose);

  // Front + rear bumpers
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.34, 0.28), darkTrim);
  frontBumper.position.set(0, -0.05, 2.2);
  group.add(frontBumper);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.34, 0.28), darkTrim);
  rearBumper.position.set(0, -0.05, -2.2);
  group.add(rearBumper);

  // Headlights
  const hlGeo = new THREE.BoxGeometry(0.5, 0.18, 0.08);
  const hlL = new THREE.Mesh(hlGeo, headlightMat);
  hlL.position.set(-0.62, 0.28, 2.22);
  const hlR = new THREE.Mesh(hlGeo, headlightMat);
  hlR.position.set(0.62, 0.28, 2.22);
  group.add(hlL, hlR);

  // Taillights (glow strip)
  const tlGeo = new THREE.BoxGeometry(0.6, 0.14, 0.08);
  const tlL = new THREE.Mesh(tlGeo, taillightMat);
  tlL.position.set(-0.62, 0.28, -2.22);
  const tlR = new THREE.Mesh(tlGeo, taillightMat);
  tlR.position.set(0.62, 0.28, -2.22);
  group.add(tlL, tlR);

  // Wheels
  const wheelDefs = [
    { x: -0.82, z: 1.32 },
    { x: 0.82, z: 1.32 },
    { x: -0.82, z: -1.32 },
    { x: 0.82, z: -1.32 },
  ];
  const wheels: THREE.Group[] = [];
  const wheelSpin: THREE.Group[] = [];
  const wheelSteer: THREE.Group[] = [];
  for (const d of wheelDefs) {
    const rig = buildWheel();
    rig.outer.position.set(d.x, -0.05, d.z);
    group.add(rig.outer);
    wheels.push(rig.outer);
    wheelSpin.push(rig.spin);
    wheelSteer.push(rig.steer);
  }

  // Headlight spotlights (attached to car, pointing forward)
  const headlights: THREE.SpotLight[] = [];
  for (const side of [-1, 1]) {
    const spot = new THREE.SpotLight(0xfff3d6, 120, 60, Math.PI / 6, 0.5, 1.2);
    spot.position.set(0.6 * side, 0.3, 2.1);
    spot.target.position.set(0.6 * side, 0, 30);
    group.add(spot.target);
    group.add(spot);
    headlights.push(spot);
  }

  // Brake light
  const brakeLight = new THREE.PointLight(0xff2200, 0, 8, 1.8);
  brakeLight.position.set(0, 0.3, -2.3);
  group.add(brakeLight);

  return {
    group,
    wheels,
    wheelSpin,
    wheelSteer,
    headlights,
    brakeLight,
    taillightMat,
    setBraking(v) {
      this.brakeLight.intensity = v ? 25 : 0;
      this.taillightMat.emissiveIntensity = v ? 2.2 : 0.6;
      this.taillightMat.emissive.setHex(v ? 0xff3300 : 0xff2200);
    },
  };
}

/** Apply wheel transforms from physics to the visual wheels. */
export function syncWheelVisuals(
  wheelRigs: THREE.Group[],
  spinGroups: THREE.Group[],
  steerGroups: THREE.Group[],
  infos: WheelInfo[],
) {
  for (let i = 0; i < wheelRigs.length; i++) {
    const info = infos[i];
    wheelRigs[i].position.copy(info.hardPoint);
    spinGroups[i].rotation.x = -info.rotation;
    steerGroups[i].rotation.y = info.steerAngle;
  }
}
