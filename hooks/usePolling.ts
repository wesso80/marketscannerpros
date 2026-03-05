"use client";

import { useEffect, useRef } from "react";

/**
 * usePolling — setInterval with tab-visibility guard.
 *
 * Pauses the interval when the tab is hidden (`document.visibilityState === 'hidden'`),
 * and resumes immediately when the tab becomes visible again (fires the callback once
 * on re-focus if at least one full interval elapsed while hidden).
 *
 * @param callback  Function to invoke each tick.
 * @param intervalMs  Polling interval in milliseconds. Pass `null` to disable.
 * @param options.immediate  If true, invoke the callback immediately on mount (default false).
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number | null,
  options?: { immediate?: boolean },
) {
  const savedCallback = useRef(callback);
  const lastTickRef = useRef(0);

  // Keep callback ref fresh without restarting the interval.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (intervalMs == null || intervalMs <= 0) return;

    let id: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      lastTickRef.current = Date.now();
      savedCallback.current();
    };

    const start = () => {
      if (id != null) return; // already running
      id = setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // If we missed at least one tick while hidden, fire immediately
        if (Date.now() - lastTickRef.current >= intervalMs) {
          tick();
        }
        start();
      } else {
        stop();
      }
    };

    // Initial setup
    if (options?.immediate) tick();
    lastTickRef.current = Date.now();
    start();

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs, options?.immediate]);
}
