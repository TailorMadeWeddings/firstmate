"use client";

import { useEffect } from "react";

/** Keeps the screen on (cooking, the gym), and asks again after the tab is hidden and shown. */
export function useStayAwake() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      void lock?.release();
    };
  }, []);
}

/** useStayAwake for a server-rendered page. */
export function StayAwake() {
  useStayAwake();
  return null;
}
