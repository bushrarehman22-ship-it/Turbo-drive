import * as THREE from "three";

/**
 * Dynamic sky: gradient dome, sun + moon, and a full day/night cycle that
 * drives the directional/ambient lighting and fog colour.
 */

interface SkyPalette {
  top: THREE.Color;
  bottom: THREE.Color;
  sun: THREE.Color;
  ambient: THREE.Color;
  fog: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
}

const DAY: SkyPalette = {
  top: new THREE.Color("#2b6fd1"),
  bottom: new THREE.Color("#cfe6ff"),
  sun: new THREE.Color("#fff4e0"),
  ambient: new THREE.Color("#b8c8e8"),
  fog: new THREE.Color("#cfe0f0"),
  sunIntensity: 3.2,
  ambientIntensity: 0.55,
};

const SUNSET: SkyPalette = {
  top: new THREE.Color("#2a2a55"),
  bottom: new THREE.Color("#ff9a5a"),
  sun: new THREE.Color("#ff7a3c"),
  ambient: new THREE.Color("#8a6a8a"),
  fog: new THREE.Color("#7a6a7a"),
  sunIntensity: 1.6,
  ambientIntensity: 0.35,
};

const NIGHT: SkyPalette = {
  top: new THREE.Color("#05060f"),
  bottom: new THREE.Color("#0b1026"),
  sun: new THREE.Color("#bcd0ff"),
  ambient: new THREE.Color("#1a2440"),
  fog: new THREE.Color("#0a0e1c"),
  sunIntensity: 0.25,
  ambientIntensity: 0.18,
};

function lerpColor(a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color) {
  out.copy(a).lerp(b, t);
}

export class Sky {
  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.HemisphereLight;
  readonly moonLight: THREE.DirectionalLight;

  private dome: THREE.Mesh;
  private sunMesh: THREE.Mesh;
  private moonMesh: THREE.Mesh;
  private uniforms: {
    topColor: { value: THREE.Color };
    bottomColor: { value: THREE.Color };
  };
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Gradient dome
    this.uniforms = {
      topColor: { value: new THREE.Color(DAY.top) },
      bottomColor: { value: new THREE.Color(DAY.bottom) },
    };
    const domeGeo = new THREE.SphereGeometry(9000, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float t = clamp(h, 0.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(t, 0.7));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    // Sun (directional light). Positioned NEAR the car each frame so the
    // shadow frustum stays tight and crisp; only the visible disc sits far.
    this.sun = new THREE.DirectionalLight(0xffffff, DAY.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 400;
    const sc = 110;
    this.sun.shadow.camera.left = -sc;
    this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc;
    this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.ambient = new THREE.HemisphereLight(0xbfd0ff, 0x30343c, DAY.ambientIntensity);
    scene.add(this.ambient);

    this.moonLight = new THREE.DirectionalLight(0x8899cc, 0.0);
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(240, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, fog: false }),
    );
    this.sunMesh.frustumCulled = false;
    scene.add(this.sunMesh);

    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }),
    );
    this.moonMesh.frustumCulled = false;
    scene.add(this.moonMesh);
  }

  /** timeOfDay: 0..1 (0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset) */
  update(timeOfDay: number, carPos?: THREE.Vector3) {
    // Sun elevation angle
    const angle = (timeOfDay - 0.25) * Math.PI * 2; // 0 at sunrise
    const elev = Math.sin(angle);
    const azimuth = 0.6; // fixed azimuth for a nice long shadow direction

    // Unit sun direction (pointing FROM sun TO scene)
    const dirX = Math.cos(azimuth) * Math.cos(elev);
    const dirY = Math.sin(elev);
    const dirZ = Math.sin(azimuth) * Math.cos(elev);

    // Shadow-casting light sits near the car for crisp shadows.
    const origin = carPos ?? new THREE.Vector3(0, 0, 0);
    const lightDist = 180;
    this.sun.position.set(
      origin.x + dirX * lightDist,
      origin.y + dirY * lightDist,
      origin.z + dirZ * lightDist,
    );
    this.sun.target.position.copy(origin);

    // Visible disc at astronomical distance (visual only, fog-free).
    const astro = 7000;
    this.sunMesh.position.set(dirX * astro, dirY * astro, dirZ * astro);

    this.moonLight.position.set(-dirX * astro, -dirY * astro, -dirZ * astro);
    this.moonLight.target.position.copy(origin);
    this.moonMesh.position.set(-dirX * astro * 0.99, -dirY * astro * 0.99, -dirZ * astro * 0.99);

    // Palette interpolation across the day
    const daytime = Math.max(0, Math.min(1, elev * 2.5));
    const p = new THREE.Color();
    const top = new THREE.Color();
    const bottom = new THREE.Color();
    const sunCol = new THREE.Color();
    const ambCol = new THREE.Color();
    const fog = new THREE.Color();

    // day -> sunset -> night
    const sunHeight = elev;
    if (sunHeight > 0.1) {
      const t = Math.min(1, (sunHeight - 0.1) / 0.5);
      lerpColor(SUNSET.top, DAY.top, t, top);
      lerpColor(SUNSET.bottom, DAY.bottom, t, bottom);
      lerpColor(SUNSET.sun, DAY.sun, t, sunCol);
      lerpColor(SUNSET.ambient, DAY.ambient, t, ambCol);
      lerpColor(SUNSET.fog, DAY.fog, t, fog);
    } else {
      const t = Math.max(0, (sunHeight + 0.2) / 0.3);
      lerpColor(NIGHT.top, SUNSET.top, t, top);
      lerpColor(NIGHT.bottom, SUNSET.bottom, t, bottom);
      lerpColor(NIGHT.sun, SUNSET.sun, t, sunCol);
      lerpColor(NIGHT.ambient, SUNSET.ambient, t, ambCol);
      lerpColor(NIGHT.fog, SUNSET.fog, t, fog);
    }

    this.uniforms.topColor.value.copy(top);
    this.uniforms.bottomColor.value.copy(bottom);
    this.sun.color.copy(sunCol);
    this.ambient.color.copy(ambCol);

    const sunIntensity = Math.max(0, Math.sin(elev)) * 3.2;
    this.sun.intensity = sunIntensity;
    this.ambient.intensity = 0.12 + daytime * 0.45;
    this.moonLight.intensity = Math.max(0, -Math.sin(elev)) * 0.35;

    const fogColor = fog.clone();
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(fogColor);
    }
    (this.sunMesh.material as THREE.MeshBasicMaterial).color.copy(sunCol);
  }
}
