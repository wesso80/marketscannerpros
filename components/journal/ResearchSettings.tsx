"use client";
import { useEffect, useState } from "react";
import {
  isResearchAutoLogEnabled,
  setResearchAutoLogEnabled,
} from "@/lib/researchAutoLogSetting";
export default function ResearchSettings() {
  const [enabled, setEnabled] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => setEnabled(isResearchAutoLogEnabled()), []);
  return (
    <div className="space-y-2 text-sm">
      <label className="flex min-h-10 items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            const next = event.target.checked;
            if (setResearchAutoLogEnabled(next)) {
              setEnabled(next);
              setError(false);
            } else setError(true);
          }}
        />
        Auto-log research records
      </label>
      <p className="text-xs text-slate-400">
        Off by default. This browser setting controls tools that support
        research auto-logging; background writers have separate controls.
      </p>
      {error && (
        <p role="status" className="text-amber-300">
          The setting could not be saved on this device.
        </p>
      )}
    </div>
  );
}
