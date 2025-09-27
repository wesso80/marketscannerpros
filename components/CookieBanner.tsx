"use client";

import { useEffect, useState } from "react";

const KEY = "msp-consent-v1"; // localStorage key

export default function CookieBanner() {
  const [choice, setChoice] = useState<"accepted" | "declined" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "accepted" || saved === "declined") setChoice(saved);
    } catch {}
    setReady(true);
  }, []);

  function decide(v: "accepted" | "declined") {
    try { localStorage.setItem(KEY, v); } catch {}
    setChoice(v);
  }

  if (!ready || choice) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-4xl m-4 rounded-xl border border-neutral-800 bg-neutral-900/95 backdrop-blur px-4 py-3 shadow-lg">
        <p className="text-sm">
          We use essential cookies for core functionality. Optional analytics only run if you accept.
          See our <a className="underline" href="/privacy#cookies">Privacy Policy</a>.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => decide("declined")}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm"
          >
            Decline
          </button>
          <button
            onClick={() => decide("accepted")}
            className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-sm text-black"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

export function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(KEY) === "accepted"; } catch { return false; }
}
