import { create } from "zustand";

export type CameraMode = "chase" | "hood" | "orbit" | "cockpit";

export interface GameState {
  // Runtime telemetry (updated every frame, no React re-render churn)
  speedKmh: number;
  rpm: number;
  gear: string;
  timeOfDay: number; // 0..1 (0 = midnight, 0.5 = noon)
  clockLabel: string;

  // Gameplay
  running: boolean;
  started: boolean;
  cameraMode: CameraMode;
  paused: boolean;

  // Checkpoints
  checkpoint: number;
  totalCheckpoints: number;
  bestLapMs: number;
  lastLapMs: number;

  // Actions (mostly used by HUD/UI)
  setRunning: (v: boolean) => void;
  setStarted: (v: boolean) => void;
  setCameraMode: (m: CameraMode) => void;
  setPaused: (v: boolean) => void;
  setCheckpoint: (n: number) => void;
  resetRun: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  speedKmh: 0,
  rpm: 0,
  gear: "N",
  timeOfDay: 0.55,
  clockLabel: "12:00",

  running: false,
  started: false,
  cameraMode: "chase",
  paused: false,

  checkpoint: 0,
  totalCheckpoints: 8,
  bestLapMs: 0,
  lastLapMs: 0,

  setRunning: (v) => set({ running: v }),
  setStarted: (v) => set({ started: v }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setPaused: (v) => set({ paused: v }),
  setCheckpoint: (n) => set({ checkpoint: n }),
  resetRun: () =>
    set({ checkpoint: 0, lastLapMs: 0, started: false, running: false }),
}));

/**
 * High-frequency telemetry is written through this mutator to avoid
 * triggering a React re-render on every physics tick. Zustand's set() with
 * primitives is cheap, but we batch via the engine's telemetry object.
 */
export const telemetry = {
  speedKmh: 0,
  rpm: 0,
  gear: "N",
  timeOfDay: 0.55,
  clockLabel: "12:00",
};

let lastHudPush = 0;
export function pushTelemetry(t: typeof telemetry, nowMs: number) {
  Object.assign(telemetry, t);
  // Push to React at most ~20Hz to keep the HUD responsive without churn.
  if (nowMs - lastHudPush > 50) {
    lastHudPush = nowMs;
    useGameStore.setState({
      speedKmh: t.speedKmh,
      rpm: t.rpm,
      gear: t.gear,
      timeOfDay: t.timeOfDay,
      clockLabel: t.clockLabel,
    });
  }
}
