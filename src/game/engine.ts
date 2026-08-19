import * as THREE from "three";
import { PhysicsWorld, type WheelInfo } from "./physics";
import { buildCar, syncWheelVisuals, type CarVisuals } from "./car";
import { City } from "./city";
import { Sky } from "./sky";
import { PostFX } from "./postfx";
import { TrafficSystem } from "./traffic";
import { CheckpointSystem } from "./checkpoints";
import { ChaseCamera } from "./camera";
import { InputManager } from "./input";
import { getAudio } from "./audio";
import { loadTextureSet, type TextureSet } from "./textures";
import { pushTelemetry, useGameStore } from "./store";
import type { CameraMode } from "./store";

const CAMERA_MODES: CameraMode[] = ["chase", "hood", "cockpit", "orbit"];

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private physics!: PhysicsWorld;
  private textures!: TextureSet;
  private city!: City;
  private sky!: Sky;
  private postfx!: PostFX;
  private traffic!: TrafficSystem;
  private checkpoints!: CheckpointSystem;
  private car!: CarVisuals;
  private chaseCam!: ChaseCamera;
  private input = new InputManager();

  private wheelsInfo: WheelInfo[] = Array.from({ length: 4 }, () => ({
    hardPoint: new THREE.Vector3(),
    radius: 0.34,
    rotation: 0,
    steerAngle: 0,
    isFront: false,
  }));

  private chassisPos = new THREE.Vector3();
  private chassisQuat = new THREE.Quaternion();

  private timeOfDay = 0.55; // start late morning
  private dayLengthSec = 240; // 4-minute full day (fast for demo)

  private cameraMode: CameraMode = "chase";
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xcfe0f0, 0.0004);

    this.camera = new THREE.PerspectiveCamera(
      62,
      container.clientWidth / container.clientHeight,
      0.1,
      20000,
    );

    this.chaseCam = new ChaseCamera(this.camera);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKey);
  }

  private buildGround(textures: TextureSet) {
    const grassTex = textures.grass;
    grassTex.repeat.set(400, 400);
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(30000, 30000),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(10100, 10100),
      new THREE.MeshStandardMaterial({ color: 0x565a60, roughness: 0.95 }),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = -0.005;
    slab.receiveShadow = true;
    this.scene.add(slab);
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx?.setSize(w, h);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code === "KeyC") {
      this.cycleCamera();
    }
  };

  private cycleCamera() {
    const idx = CAMERA_MODES.indexOf(this.cameraMode);
    this.cameraMode = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
  }

  async start() {
    this.physics = await new PhysicsWorld().init();
    this.textures = await loadTextureSet();
    this.buildGround(this.textures);
    this.sky = new Sky(this.scene);
    this.city = new City(this.scene, this.physics, this.textures);
    this.car = buildCar(0x2f6fe4);
    this.scene.add(this.car.group);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.traffic = new TrafficSystem(this.scene, this.physics, new THREE.Vector3(0, 0, 0));
    this.checkpoints = new CheckpointSystem(this.scene);
    useGameStore.setState({ totalCheckpoints: this.checkpoints.total });

    this.input.attach();
    this.loop();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Advance day/night
    this.timeOfDay = (this.timeOfDay + dt / this.dayLengthSec) % 1;
    this.sky.update(this.timeOfDay, this.chassisPos);

    // Input
    const controls = this.input.update(dt);

    // Physics
    this.physics.step(dt, {
      throttle: controls.throttle,
      brake: controls.brake,
      steer: controls.steer,
      handbrake: controls.handbrake,
    });

    this.physics.getChassisTransform(this.chassisPos, this.chassisQuat);
    this.car.group.position.copy(this.chassisPos);
    this.car.group.quaternion.copy(this.chassisQuat);

    this.physics.syncWheels(this.wheelsInfo, this.chassisPos, this.chassisQuat);
    syncWheelVisuals(this.car.wheels, this.car.wheelSpin, this.car.wheelSteer, this.wheelsInfo);
    this.car.setBraking(controls.brake > 0.05 || controls.handbrake);

    // Reset if flipped or requested
    if (controls.reset || this.isFlipped()) {
      this.physics.reset(new THREE.Vector3(0, 1.5, 0));
    }

    // Stream city chunks around the car
    this.city.update(this.chassisPos);

    // Traffic
    this.traffic.update(dt, this.chassisPos);

    // Checkpoints + lap timing
    const nowMs = performance.now();
    const lap = this.checkpoints.update(this.chassisPos, nowMs);
    if (lap !== null) {
      const st = useGameStore.getState();
      const best = st.bestLapMs === 0 || lap < st.bestLapMs ? lap : st.bestLapMs;
      useGameStore.setState({
        lastLapMs: lap,
        bestLapMs: best,
        checkpoint: 0,
      });
    } else {
      useGameStore.setState({ checkpoint: this.checkpoints.currentIndex() });
    }

    // Camera
    this.chaseCam.update(
      dt,
      this.cameraMode,
      this.chassisPos,
      this.chassisQuat,
      this.physics.speedMs(),
    );

    // Headlight toggle at night
    const night = this.timeOfDay > 0.72 || this.timeOfDay < 0.28;
    for (const hl of this.car.headlights) hl.intensity = night ? 140 : 0;

    // Telemetry -> HUD
    const speedKmh = this.physics.speedMs() * 3.6;
    const gear = this.computeGear(speedKmh);
    const rpm = this.computeRpm(speedKmh);
    pushTelemetry(
      {
        speedKmh,
        rpm,
        gear,
        timeOfDay: this.timeOfDay,
        clockLabel: this.clockLabel(this.timeOfDay),
        lapMs: this.checkpoints.elapsedMs(nowMs),
      },
      performance.now(),
    );

    // Engine audio (synthesized)
    if (controls.throttle > 0.01 || controls.brake > 0.01) getAudio().ensureStarted();
    getAudio().update(rpm, controls.throttle, dt);

    this.postfx.render(dt);
  };

  private isFlipped() {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.chassisQuat);
    return up.y < 0.2;
  }

  private computeGear(speedKmh: number) {
    if (speedKmh < 2) return "N";
    const gears = [0, 12, 28, 48, 74, 105, 140, 185, 240];
    for (let i = gears.length - 1; i >= 1; i--) {
      if (speedKmh >= gears[i]) return String(i);
    }
    return "1";
  }

  private computeRpm(speedKmh: number) {
    // Rough rev simulation for the HUD needle (returns thousands of RPM)
    const maxSpeed = 240;
    const idle = 0.9;
    const redline = 7.2;
    const g = Math.min(1, speedKmh / maxSpeed);
    return idle + g * (redline - idle) + Math.sin(speedKmh * 0.8) * 0.12;
  }

  private clockLabel(t: number) {
    const hours = (t * 24 + 6) % 24; // 6am at t=0
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKey);
    this.input.detach();
    this.city?.dispose();
    this.traffic?.dispose();
    this.checkpoints?.dispose();
    this.postfx?.composer.dispose();
    getAudio().dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
