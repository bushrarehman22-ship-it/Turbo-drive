"use client";

import { useEffect, useRef } from "react";
import { GameEngine } from "@/game/engine";

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const engine = new GameEngine(mountRef.current);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
