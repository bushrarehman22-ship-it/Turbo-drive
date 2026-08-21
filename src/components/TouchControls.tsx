"use client";

import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useGameStore } from "@/game/store";
import { touchState, queueReset, queueCamera } from "@/game/touch";

const STEER_MAX_PX = 80;

export default function TouchControls() {
  const mobile = useIsMobile();
  const started = useGameStore((s) => s.started);

  const thumbRef = useRef<HTMLDivElement>(null);
  const steer = useRef({ id: -1, startX: 0 });

  const [gas, setGas] = useState(false);
  const [brake, setBrake] = useState(false);
  const [handbrake, setHandbrake] = useState(false);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const update = () =>
      setPortrait(
        typeof window !== "undefined" && window.innerHeight > window.innerWidth,
      );
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  if (!mobile || !started) return null;

  // ---- Steering (horizontal joystick) ----
  const onSteerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    steer.current.id = e.pointerId;
    steer.current.startX = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSteerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (steer.current.id !== e.pointerId) return;
    const dx = e.clientX - steer.current.startX;
    const clamped = Math.max(-STEER_MAX_PX, Math.min(STEER_MAX_PX, dx));
    touchState.steer = clamped / STEER_MAX_PX;
    if (thumbRef.current) thumbRef.current.style.transform = `translateX(${clamped}px)`;
  };
  const onSteerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (steer.current.id !== e.pointerId) return;
    steer.current.id = -1;
    touchState.steer = 0;
    if (thumbRef.current) thumbRef.current.style.transform = "translateX(0px)";
  };

  // ---- Hold-to-activate button (gas / brake / handbrake) ----
  const hold = (
    setValue: (v: number) => void,
    setActive: (v: boolean) => void,
    on = 1,
  ) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setActive(true);
      setValue(on);
    },
    onPointerUp: () => {
      setActive(false);
      setValue(0);
    },
    onPointerCancel: () => {
      setActive(false);
      setValue(0);
    },
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Rotate-to-landscape hint (portrait touch devices only) */}
      {portrait && (
        <div className="glass absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-4 text-center">
          <div className="text-3xl">📱↻</div>
          <div className="mt-1 text-sm font-semibold text-white/80">
            Rotate your phone
          </div>
          <div className="text-xs text-white/50">Landscape is best for driving</div>
        </div>
      )}

      {/* Steering joystick (bottom-left) */}
      <div
        className="glass pointer-events-auto absolute bottom-5 left-5 flex h-40 w-40 touch-none items-center justify-center rounded-full"
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerEnd}
        onPointerCancel={onSteerEnd}
      >
        <div
          ref={thumbRef}
          className="h-14 w-14 rounded-full border border-white/40 bg-white/25 shadow-lg transition-transform duration-75"
        />
        <span className="absolute bottom-3 text-[9px] uppercase tracking-widest text-white/40">
          steer
        </span>
      </div>

      {/* Right control cluster (pedals + handbrake) */}
      <div className="pointer-events-auto absolute bottom-5 right-4 flex items-end gap-2.5">
        <button
          {...hold(
            (v) => (touchState.handbrake = v === 1),
            setHandbrake,
          )}
          className={`touch-none h-16 w-16 rounded-full border border-white/20 text-[10px] font-bold uppercase tracking-wide text-white/80 shadow-lg ${
            handbrake ? "bg-red-500/60" : "bg-black/40"
          }`}
        >
          HB
        </button>
        <button
          {...hold(
            (v) => (touchState.brake = v),
            setBrake,
          )}
          className={`touch-none h-24 w-24 rounded-full border border-white/20 text-sm font-bold uppercase tracking-wide text-white/80 shadow-lg ${
            brake ? "bg-red-500/60" : "bg-black/40"
          }`}
        >
          Brake
        </button>
        <button
          {...hold(
            (v) => (touchState.throttle = v),
            setGas,
          )}
          className={`touch-none h-28 w-28 rounded-full border border-white/20 text-base font-bold uppercase tracking-wide text-white/80 shadow-lg ${
            gas ? "bg-emerald-500/60" : "bg-black/40"
          }`}
        >
          Gas
        </button>
      </div>

      {/* Reset + camera (top-center) */}
      <div className="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 gap-2">
        <button
          onPointerDown={() => queueCamera()}
          className="touch-none glass h-11 w-11 rounded-full text-lg"
          aria-label="Change camera"
        >
          🎥
        </button>
        <button
          onPointerDown={() => queueReset()}
          className="touch-none glass h-11 w-11 rounded-full text-lg"
          aria-label="Reset car"
        >
          ↺
        </button>
      </div>
    </div>
  );
}
