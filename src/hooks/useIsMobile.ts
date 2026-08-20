"use client";

import { useEffect, useState } from "react";
import { isMobileDevice } from "@/game/device";

/** React-friendly mobile detection (coarse pointer OR small viewport). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const update = () => setMobile(isMobileDevice());
    update();
    const mq = window.matchMedia?.("(pointer: coarse)");
    mq?.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      mq?.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return mobile;
}
