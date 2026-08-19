"use client";

import { useGameStore } from "@/game/store";

export default function HUD() {
  const speedKmh = useGameStore((s) => s.speedKmh);
  const rpm = useGameStore((s) => s.rpm);
  const gear = useGameStore((s) => s.gear);
  const clockLabel = useGameStore((s) => s.clockLabel);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const cameraMode = useGameStore((s) => s.cameraMode);

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
