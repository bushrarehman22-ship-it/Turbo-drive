"use client";

import dynamic from "next/dynamic";
import HUD from "@/components/HUD";
import Menu from "@/components/Menu";
import TouchControls from "@/components/TouchControls";

// The WebGL engine is client-only (Three.js + WASM physics).
const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <Game />
      <HUD />
      <Menu />
      <TouchControls />
    </main>
  );
}
