/**
 * Synthesized engine sound via WebAudio — no audio assets required.
 * A detuned sawtooth pair drives a low-pass filter whose cutoff tracks RPM,
 * with a filtered-noise exhaust component. Created lazily on the first user
 * gesture (browser autoplay policy).
 */
class EngineAudio {
  private ctx: AudioContext | null = null;
  private started = false;

  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private sub!: OscillatorNode;
  private engineGain!: GainNode;
  private filter!: BiquadFilterNode;
  private noiseGain!: GainNode;

  private currentRpm = 0.9;
  private currentThrottle = 0;

  ensureStarted() {
    if (this.started) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.setup();
      this.ctx.resume();
      this.started = true;
    } catch {
      // Audio unsupported — degrade silently.
    }
  }

  private setup() {
    const ctx = this.ctx!;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 400;
    this.filter.Q.value = 2;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.osc1 = ctx.createOscillator();
    this.osc1.type = "sawtooth";
    this.osc2 = ctx.createOscillator();
    this.osc2.type = "sawtooth";
    this.osc2.detune.value = 12;

    this.sub = ctx.createOscillator();
    this.sub.type = "triangle";
    this.sub.frequency.value = 40;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;

    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.sub.connect(subGain).connect(this.engineGain);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);

    // Exhaust noise
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 220;
    bp.Q.value = 0.6;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(bp).connect(this.noiseGain).connect(ctx.destination);

    this.osc1.start();
    this.osc2.start();
    this.sub.start();
    noise.start();
  }

  /** rpm in thousands (0.9 idle .. ~7 redline), throttle 0..1 */
  update(rpm: number, throttle: number, dt: number) {
    if (!this.ctx || !this.started) return;
    this.currentRpm += (rpm - this.currentRpm) * (1 - Math.exp(-dt * 10));
    this.currentThrottle += (throttle - this.currentThrottle) * (1 - Math.exp(-dt * 8));

    const firing = 28 + this.currentRpm * 26; // Hz
    this.osc1.frequency.value = firing;
    this.osc2.frequency.value = firing;
    this.sub.frequency.value = firing * 0.5;
    this.filter.frequency.value = 300 + this.currentRpm * 220;

    const vol = 0.05 + this.currentThrottle * 0.12;
    this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    this.noiseGain.gain.setTargetAtTime(this.currentThrottle * 0.05, this.ctx.currentTime, 0.05);
  }

  dispose() {
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.started = false;
    this.ctx = null;
  }
}

let instance: EngineAudio | null = null;
export function getAudio(): EngineAudio {
  if (!instance) instance = new EngineAudio();
  return instance;
}
