"use client";

/**
 * Age label + "Rescan now" for pages that read the shared saved admin scan (lib/admin/sharedScan.ts).
 * The rescan goes to POST /api/admin/scan, which is rate-limited and refuses while a scan is running.
 */
import { useState } from "react";

export type SavedScanStatusData = {
  available: boolean;
  message?: string | null;
  market: string;
  timeframe: string;
  newestScannedAt: string | null;
  ageLabel: string;
  savedSymbols?: number;
  missingSymbols?: number;
  running?: { startedAt: string | null } | null;
  lastRun?: { status: string; finishedAt: string | null; symbolsScanned: number; symbolsFailed: number } | null;
};

function adminHeaders(): HeadersInit {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : null;
  return secret
    ? { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

/** POST a manual rescan. Resolves to a short human message (started / rate-limited / already running). */
export async function requestRescan(market: string, timeframe = "15m", symbols?: string[]): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/admin/scan", {
      method: "POST",
      credentials: "include",
      headers: adminHeaders(),
      body: JSON.stringify({ market, timeframe, symbols }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, message: `Rescan started (${json.symbolsRequested ?? "?"} symbols) — results appear as each symbol finishes.` };
    if (res.status === 429) return { ok: false, message: `${json.error ?? "Rate limited."} Try again in ${json.retryAfterSec ?? "a few"} s.` };
    return { ok: false, message: json.error ?? `Rescan failed (HTTP ${res.status}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Rescan failed." };
  }
}

export default function SavedScanStatus({
  status,
  onRescanStarted,
  compact = false,
}: {
  status: SavedScanStatusData | null | undefined;
  onRescanStarted?: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!status) return null;

  const label = !status.available
    ? status.message || "Saved scan unavailable"
    : status.newestScannedAt
      ? `Saved scan · ${status.ageLabel}`
      : "No saved scan yet";

  async function rescan() {
    if (!status) return;
    setBusy(true);
    const r = await requestRescan(status.market, status.timeframe);
    setNote(r.message);
    setBusy(false);
    if (r.ok) onRescanStarted?.();
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "text-[10px]" : "text-xs"} text-white/55`}>
      <span className="font-semibold text-white/70">{status.market}</span>
      <span className={status.available && status.newestScannedAt ? "" : "text-amber-300"}>{label}</span>
      {status.newestScannedAt && (
        <span className="text-white/35">({new Date(status.newestScannedAt).toLocaleTimeString()})</span>
      )}
      {status.running && <span className="text-cyan-300">scan running…</span>}
      {status.lastRun?.status === "failed" && <span className="text-red-300">last run failed</span>}
      {status.available && (
        <button
          type="button"
          onClick={rescan}
          disabled={busy || !!status.running}
          className="rounded border border-white/15 px-2 py-0.5 text-white/75 hover:bg-white/10 disabled:opacity-40"
        >
          {busy ? "Requesting…" : "Rescan now"}
        </button>
      )}
      {note && <span className="text-white/45">{note}</span>}
    </div>
  );
}
