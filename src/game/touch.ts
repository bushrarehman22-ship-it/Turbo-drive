/**
 * Plain mutable singleton for virtual touch controls. Written by the React
 * touch-control components, read every frame by the InputManager. No React
 * re-render churn on continuous values.
 */
export const touchState = {
  steer: 0, // -1..1
  throttle: 0, // 0..1
  brake: 0, // 0..1
  handbrake: false,
  resetQueued: false,
  cameraQueued: false,
};

export function queueReset() {
  touchState.resetQueued = true;
}

export function queueCamera() {
  touchState.cameraQueued = true;
}
