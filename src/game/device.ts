/** Runtime device capability detection (client-only). */

export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(pointer: coarse)").matches
  );
}

export function isMobileDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    (isCoarsePointer() || window.innerWidth < 820)
  );
}
