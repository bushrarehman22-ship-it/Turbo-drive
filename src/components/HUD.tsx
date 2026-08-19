"use client";

import { useGameStore } from "@/game/store";

export default function HUD() {
  const speedKmh = useGameStore((s) => s.speedKmh);
  const rpm = useGameStore((s) => s.rpm);
  const gear = useGameStore((s) => s.gear);
  const clockLabel = useGameStore((s) => s.clockLabel);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const checkpoint = useGameStore((s) => s.checkpoint);
  const totalCheckpoints = useGameStore((s) => s.totalCheckpoints);
  const lapMs = useGameStore((s) => s.lapMs);
  const lastLapMs = useGameStore((s) => s.lastLapMs);
  const bestLapMs = useGameStore((s) => s.bestLapMs);

  const speed = Math.round(speedKmh);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Speedometer */}
      <div className="glass absolute bottom-6 left-6 flex items-end gap-4 rounded-2xl px-6 py-4">
        <div>
          <div className="led text-6xl font-black tabular-nums text-white">
            {speed}
          </div>
          <div className="text-xs font-medium uppercase tracking-widest text-white/50">
            km/h
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 pb-1">
          <div className="led text-3xl font-bold text-cyan-300">{gear}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            gear
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 pb-1">
          <div className="text-lg font-semibold tabular-nums text-white/80">
            {(rpm * 1000).toFixed(0)}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            rpm
          </div>
        </div>
      </div>

      {/* Clock / time-of-day */}
      <div className="glass absolute right-6 top-6 rounded-2xl px-5 py-3 text-right">
        <div className="led text-2xl font-bold tabular-nums text-white">
          {clockLabel}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-white/40">
          {isNight(timeOfDay) ? "🌙 Night" : "☀️ Day"}
        </div>
      </div>

      {/* Camera hint */}
      <div className="glass absolute bottom-6 right-6 rounded-2xl px-5 py-3 text-right">
        <div className="text-xs font-medium text-white/70">
          Camera: <span className="text-cyan-300">{cameraMode}</span>
        </div>
      </div>

      {/* Lap / checkpoint panel */}
      <div className="glass absolute right-6 top-24 w-44 rounded-2xl px-4 py-3 text-right">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-white/40">
            Checkpoint
          </span>
          <span className="led text-lg font-bold text-cyan-300">
            {checkpoint}/{totalCheckpoints}
          </span>
        </div>
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-white/40">Lap</span>
            <span className="led tabular-nums text-white">{formatLap(lapMs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Last</span>
            <span className="tabular-nums text-white/70">
              {lastLapMs ? formatLap(lastLapMs) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Best</span>
            <span className="led tabular-nums text-amber-300">
              {bestLapMs ? formatLap(bestLapMs) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Controls help */}
      <div className="glass absolute left-6 top-6 rounded-2xl px-5 py-3 text-xs leading-relaxed text-white/60">
        <div className="mb-1 font-semibold text-white/80">Controls</div>
        <div>W/↑ accelerate · S/↓ brake</div>
        <div>A/D or ←/→ steer · Space handbrake</div>
        <div>R reset · C camera</div>
      </div>
    </div>
  );
}

function isNight(t: number) {
  return t > 0.72 || t < 0.28;
}

function formatLap(ms: number) {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const msPart = Math.floor((total % 1000) / 10);
  return m > 0
    ? `${m}:${String(s).padStart(2, "0")}.${String(msPart).padStart(2, "0")}`
    : `${s}.${String(msPart).padStart(2, "0")}s`;
}
