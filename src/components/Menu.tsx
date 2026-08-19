"use client";

import { useState } from "react";
import { useGameStore } from "@/game/store";

export default function Menu() {
  const started = useGameStore((s) => s.started);
  const setStarted = useGameStore((s) => s.setStarted);
  const [visible, setVisible] = useState(!started);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass w-[min(92vw,460px)] rounded-3xl p-8 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
          WebGL · Three.js · Rapier
        </div>
        <h1 className="mt-2 bg-gradient-to-br from-white to-cyan-200 bg-clip-text text-5xl font-black text-transparent">
          TURBO&nbsp;DRIVE
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          A realistic open-city driving simulator. Procedural skyline, true
          suspension &amp; tire physics, dynamic day/night cycle.
        </p>

        <button
          onClick={() => {
            setStarted(true);
            setVisible(false);
          }}
          className="mt-7 w-full rounded-xl bg-cyan-400 px-6 py-3 text-base font-bold text-black transition hover:bg-cyan-300 active:scale-[0.98]"
        >
          Start Driving
        </button>

        <div className="mt-5 grid grid-cols-2 gap-2 text-left text-xs text-white/50">
          <div>🚗 W / ↑ — Accelerate</div>
          <div>🛑 S / ↓ — Brake</div>
          <div>↔️ A D — Steer</div>
          <div>🌀 Space — Handbrake</div>
          <div>🎥 C — Camera</div>
          <div>🔄 R — Reset</div>
        </div>
      </div>
    </div>
  );
}
