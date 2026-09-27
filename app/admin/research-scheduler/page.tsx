"use client";

import { startVisiblePolling } from "@/lib/client/visiblePolling";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunSummary } from "@/lib/admin/sharedScanStore";
type SharedStatus = { market: string; timeframe: string; available: boolean; lastRun: RunSummary | null; running: RunSummary | null };

interface SchedulerRun {
  id: number;
  run_id: string;
  workspace_id: string;
  mode: string;
  market: string;
  timeframe: string;
  started_at: string;
  completed_at: string | null;
  symbols_scanned: number;
  stale_data: number;
  alerts_fired: number;
  alerts_suppressed: number;
  runtime_ms: number;
  errors: unknown;
  created_at: string;
}

// Phase 10: Ensure frontend modes exactly match backend SchedulerMode enum
const MODES = [
  "CRYPTO_CONTINUOUS",
  "EQUITIES_MARKET_HOURS",
  "PRE_MARKET",
  "POST_MARKET",
  "EARNINGS",
  "MACRO_EVENT",
  "NEWS",
  "OPTIONS",
  "WATCHLIST",
  "HIGH_PRIORITY_RESCAN",
];
const MARKETS = ["CRYPTO", "EQUITIES"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

function badge(val: number, warn: number, err: number, label: string) {
  const color = val >= err ? "#EF4444" : val >= warn ? "#F59E0B" : "#10B981";
  return (
    <span style={{ color, fontWeight: 600 }}>
      {val} {label}
    </span>
  );
}

export default function ResearchSchedulerPage() {
  const [sharedScans, setSharedScans] = useState<SharedStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<SchedulerRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [mode, setMode] = useState("WATCHLIST");
  const [market, setMarket] = useState("CRYPTO");
  const [timeframe, setTimeframe] = useState("15m");
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function fetchRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/research-scheduler?limit=100", { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Run history unavailable");
      setRuns(data.runs ?? []);
      setSharedScans(data.sharedScans ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run history unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function triggerRun() {
    setTriggering(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/research-scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode, market, timeframe }),
      });
      const data = await res.json();
      if (data.ok) {
        setLastResult(
          `Run complete — ${data.result.symbolsScanned} scanned, ${data.result.alertsEligible} eligible, ${data.result.alertsDispatched} delivered, ${data.result.runtimeMs}ms`
        );
        await fetchRuns();
      } else {
        setLastResult(`Error: ${data.error || "unknown"}`);
      }
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : "Manual run failed"}`);
    } finally {
      setTriggering(false);
    }
  }

  useEffect(() => {
    return startVisiblePolling(fetchRuns, 60_000);
  }, []);

  return (
    <div style={{ padding: "24px", color: "#E2E8F0", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#10B981", marginBottom: 6 }}>
        Research Scheduler
      </h1>
      <p style={{ color: "#94A3B8", fontSize: 13, marginBottom: 24 }}>
        Current shared scanner status and separate manual packet-check history · refreshes status every 60s
      </p>

      {error && <p role="alert" style={{ color: "#F59E0B" }}>{error} — previously loaded results may be outdated.</p>}
      <section className="mb-6 space-y-3" aria-label="Current shared scans">
        <h2 className="text-lg font-bold">Current shared scans</h2>
        <p className="text-sm text-slate-400">This is the scanner feeding the Opportunity Board and Priority Desk. Status reads do not start scans. Last-run age alone does not establish a missed schedule; equities follow market hours.</p>
        {sharedScans.map(scan => {
          const run = scan.running ?? scan.lastRun;
          return <div key={scan.market} className="rounded border border-slate-700 p-3 text-sm">
            <strong>{scan.market} · {scan.timeframe}</strong>
            {!scan.available ? <p>Status unavailable</p> : !run ? <p>No shared scan run recorded</p> : <>
              <p>{run.status} · trigger: {run.trigger} · started {run.startedAt ? new Date(run.startedAt).toLocaleString() : "Unavailable"}</p>
              <p>Completed: {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "Not completed"}</p>
              <p>{run.symbolsScanned} deep scans · {run.symbolsQuoted} quote refreshes · {run.symbolsFailed} failed · {run.avCalls} AV requests</p>
              {run.error && <p className="text-amber-300">{run.error}</p>}
            </>}
          </div>;
        })}
        <Link href="/admin/opportunity-board" className="text-emerald-300 underline">Open shared results and rescan controls</Link>
      </section>
      <h2 className="mb-2 text-lg font-bold">Manual packet checks</h2>
      <p className="mb-4 text-sm text-slate-400">This separate legacy workflow evaluates research packets and alert eligibility. It has no automatic schedule and does not send notifications. Modes label the requested run; they do not configure a recurring job.</p>
      {/* Manual Trigger */}
      <div
        style={{
          background: "#1E293B",
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
        }}
      >
        <div>
          <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 4 }}>MODE</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}
          >
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 4 }}>MARKET</label>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            style={{ background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}
          >
            {MARKETS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#94A3B8", display: "block", marginBottom: 4 }}>TIMEFRAME</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            style={{ background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 4, padding: "4px 8px", fontSize: 12 }}
          >
            {TIMEFRAMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          onClick={triggerRun}
          disabled={triggering}
          style={{
            background: triggering ? "#334155" : "#10B981",
            color: "#0F172A",
            fontWeight: 700,
            border: "none",
            borderRadius: 6,
            padding: "6px 18px",
            cursor: triggering ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          {triggering ? "Running…" : "▶ Trigger Run"}
        </button>
        {lastResult && (
          <span style={{ fontSize: 12, color: lastResult.startsWith("Error") ? "#EF4444" : "#10B981" }}>
            {lastResult}
          </span>
        )}
      </div>

      {/* Run History Table */}
      {loading ? (
        <p style={{ color: "#64748B" }}>Loading run history…</p>
      ) : runs.length === 0 ? (
        <p style={{ color: "#64748B" }}>No manual packet checks recorded. Shared scanner status is shown above.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#94A3B8", borderBottom: "1px solid #1E293B", textAlign: "left" }}>
                <th style={{ padding: "6px 10px" }}>Run ID</th>
                <th style={{ padding: "6px 10px" }}>Mode</th>
                <th style={{ padding: "6px 10px" }}>Market</th>
                <th style={{ padding: "6px 10px" }}>TF</th>
                <th style={{ padding: "6px 10px" }}>Started</th>
                <th style={{ padding: "6px 10px" }}>Runtime</th>
                <th style={{ padding: "6px 10px" }}>Scanned</th>
                <th style={{ padding: "6px 10px" }}>Alert eligible</th>
                <th style={{ padding: "6px 10px" }}>Suppressed</th>
                <th style={{ padding: "6px 10px" }}>Stale</th>
                <th style={{ padding: "6px 10px" }}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const hasErrors = r.errors && Object.keys(r.errors as object).length > 0;
                return (
                  <tr
                    key={r.run_id}
                    style={{
                      borderBottom: "1px solid #1E293B",
                      background: hasErrors ? "rgba(239,68,68,0.05)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "5px 10px", color: "#64748B", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.run_id.slice(-16)}
                    </td>
                    <td style={{ padding: "5px 10px" }}>{r.mode}</td>
                    <td style={{ padding: "5px 10px" }}>{r.market}</td>
                    <td style={{ padding: "5px 10px" }}>{r.timeframe}</td>
                    <td style={{ padding: "5px 10px", color: "#94A3B8" }}>
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "5px 10px" }}>
                      {r.runtime_ms > 0 ? `${(r.runtime_ms / 1000).toFixed(1)}s` : r.completed_at ? "—" : <span style={{ color: "#F59E0B" }}>running</span>}
                    </td>
                    <td style={{ padding: "5px 10px" }}>{r.symbols_scanned}</td>
                    <td style={{ padding: "5px 10px" }}>{badge(r.alerts_fired, 5, 15, "")}</td>
                    <td style={{ padding: "5px 10px", color: "#64748B" }}>{r.alerts_suppressed}</td>
                    <td style={{ padding: "5px 10px" }}>{badge(r.stale_data, 3, 7, "")}</td>
                    <td style={{ padding: "5px 10px" }}>
                      {hasErrors ? (
                        <span style={{ color: "#EF4444" }} title={JSON.stringify(r.errors, null, 2)}>
                          ⚠
                        </span>
                      ) : (
                        <span style={{ color: "#10B981" }}>✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
