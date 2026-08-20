import { touchState } from "./touch";

/**
 * Keyboard + gamepad + touch input with analog smoothing.
 * Exposes normalized control values consumed by the vehicle system.
 */
export interface ControlState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1 (left = negative)
  handbrake: boolean;
  reset: boolean;
  cameraNext: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private gamepadIndex = -1;
  private lastCamToggle = false;

  private state: ControlState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    reset: false,
    cameraNext: false,
  };

  // Smoothing factors
  private smoothThrottle = 0;
  private smoothBrake = 0;
  private smoothSteer = 0;

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("gamepadconnected", this.onGamepad);
    window.addEventListener("gamepaddisconnected", this.onGamepadLost);
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("gamepadconnected", this.onGamepad);
    window.removeEventListener("gamepaddisconnected", this.onGamepadLost);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Prevent page scroll / default actions for game keys.
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        " ",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyR",
        "KeyC",
      ].includes(e.code)
    ) {
      e.preventDefault();
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onGamepad = (e: GamepadEvent) => {
    this.gamepadIndex = e.gamepad.index;
  };

  private onGamepadLost = () => {
    this.gamepadIndex = -1;
  };

  private readGamepad(): Partial<ControlState> | null {
    if (this.gamepadIndex < 0) return null;
    const pad = navigator.getGamepads?.()[this.gamepadIndex];
    if (!pad) return null;
    const axis = (i: number, dead = 0.08) => {
      const v = pad.axes[i] ?? 0;
      return Math.abs(v) < dead ? 0 : v;
    };
    return {
      throttle: Math.max(0, -axis(5) || (pad.buttons[7]?.value ?? 0)),
      brake: Math.max(0, axis(5) || (pad.buttons[6]?.value ?? 0)),
      steer: axis(0),
      handbrake: pad.buttons[4]?.pressed || false,
      reset: pad.buttons[9]?.pressed || false,
    };
  }

  private keyDown = (...codes: string[]) => codes.some((c) => this.keys.has(c));

  update(dt: number): ControlState {
    let targetThrottle = 0;
    let targetBrake = 0;
    let targetSteer = 0;
    let handbrake = false;
    let reset = false;

    const gp = this.readGamepad();
    if (gp) {
      targetThrottle = gp.throttle ?? 0;
      targetBrake = gp.brake ?? 0;
      targetSteer = gp.steer ?? 0;
      handbrake = gp.handbrake ?? false;
      reset = gp.reset ?? false;
    }

    // Keyboard
    const kThrottle =
      this.keyDown("KeyW", "ArrowUp") ? 1 : 0;
    const kBrake = this.keyDown("KeyS", "ArrowDown") ? 1 : 0;
    let kSteer = 0;
    if (this.keyDown("KeyA", "ArrowLeft")) kSteer -= 1;
    if (this.keyDown("KeyD", "ArrowRight")) kSteer += 1;

    targetThrottle = Math.max(targetThrottle, kThrottle);
    targetBrake = Math.max(targetBrake, kBrake);
    if (Math.abs(kSteer) > Math.abs(targetSteer)) targetSteer = kSteer;
    handbrake = handbrake || this.keyDown("Space");
    reset = reset || this.keyDown("KeyR");

    // Touch (virtual controls) — merge, touch takes precedence via max/max-magnitude.
    if (touchState.throttle > 0) targetThrottle = Math.max(targetThrottle, touchState.throttle);
    if (touchState.brake > 0) targetBrake = Math.max(targetBrake, touchState.brake);
    if (Math.abs(touchState.steer) > Math.abs(targetSteer)) targetSteer = touchState.steer;
    handbrake = handbrake || touchState.handbrake;
    reset = reset || touchState.resetQueued;
    touchState.resetQueued = false;

    // Smooth toward targets for analog-feeling controls.
    const ts = 1 - Math.exp(-dt * 12);
    const rs = 1 - Math.exp(-dt * 8);
    this.smoothThrottle += (targetThrottle - this.smoothThrottle) * ts;
    this.smoothBrake += (targetBrake - this.smoothBrake) * ts;
    this.smoothSteer += (targetSteer - this.smoothSteer) * rs;

    this.state.throttle = this.smoothThrottle;
    this.state.brake = this.smoothBrake;
    this.state.steer = this.smoothSteer;
    this.state.handbrake = handbrake;
    this.state.reset = reset;

    // Edge-triggered camera toggle (keyboard C + touch button).
    const camNow = this.keyDown("KeyC");
    const camTouch = touchState.cameraQueued;
    touchState.cameraQueued = false;
    this.state.cameraNext = (camNow && !this.lastCamToggle) || camTouch;
    this.lastCamToggle = camNow;

    return this.state;
  }
}
