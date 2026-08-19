import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Post-processing chain: Render → SSAO (ambient occlusion) → Bloom → Output
 * (ACES tone mapping + sRGB). This is what pushes the scene from "clean 3D"
 * toward "photoreal": contact shadows from SSAO, glowing emissives from bloom.
 */
export class PostFX {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.composer.setSize(w, h);

    this.composer.addPass(new RenderPass(scene, camera));

    // Ambient occlusion — softens flat-lit surfaces, grounds objects.
    const ssao = new SSAOPass(scene, camera, w, h);
    ssao.kernelRadius = 8;
    ssao.minDistance = 0.05;
    ssao.maxDistance = 0.2;
    ssao.output = SSAOPass.OUTPUT.Default;
    this.composer.addPass(ssao);

    // Bloom — glow on headlights, taillights, sun, bright reflections.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.6);
    this.composer.addPass(this.bloom);

    // Final tone mapping + colour space conversion.
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}
