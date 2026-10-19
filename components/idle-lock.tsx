"use client";

import { useEffect } from "react";

/**
 * Locks the kitchen screen after `idleMs` with no taps or keys, or at
 * `until` (epoch ms) at the latest. The server refuses an expired unlock
 * anyway; this just puts the screen back without waiting for a tap.
 */
export function IdleLock({ idleMs, until, lock }: { idleMs: number; until: number; lock: () => Promise<void> }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void lock(), Math.max(0, Math.min(idleMs, until - Date.now())));
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, restart, { passive: true }));
    restart();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, restart));
    };
  }, [idleMs, until, lock]);
  return null;
}
