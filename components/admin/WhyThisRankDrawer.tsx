"use client";

import { useEffect, useRef } from "react";
import type { AdminOpportunityRow } from "@/lib/admin/adminTypes";

function lifecycleColor(lc: string): string {
  switch (lc) {
    case "READY": return "#10B981";
    case "FRESH": return "#3B82F6";
    case "TRIGGERED": return "#8B5CF6";
    case "DEVELOPING": return "#FBBF24";
    case "EXHAUSTED":
    case "TRAPPED": return "#F97316";
    case "INVALIDATED":
    case "NO_EDGE": return "#EF4444";
    case "DATA_DEGRADED": return "#6B7280";
    default: return "#9CA3AF";
  }
}

function biasColor(b: string): string {
  if (b === "LONG") return "#10B981";
  if (b === "SHORT") return "#EF4444";
  return "#9CA3AF";
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 60 ? "#10B981" : pct >= 35 ? "#FBBF24" : "#6B7280";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/60">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

type Props = {
  row: AdminOpportunityRow | null;
  onClose: () => void;
};

export default function WhyThisRankDrawer({ row, onClose }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!row) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [row, onClose]);

  // Trap focus and restore on close
  useEffect(() => {
    if (row && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [row]);

  if (!row) return null;

  const { score, dataTruth, setup, bias } = row;

  const axisEntries = Object.entries(score.axes) as [string, number][];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Why This Rank — ${row.symbol}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-[#0B1120] shadow-2xl outline-none"
        style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] bg-slate-950/90 px-5 py-4">
          <div>
            <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Why This Rank — Research Audit
            </div>
            <h2 className="mt-0.5 text-xl font-black text-white">{row.symbol}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className="rounded border px-1.5 py-0.5 text-[10px] font-black uppercase"
                style={{ color: biasColor(bias), borderColor: `${biasColor(bias)}40`, background: `${biasColor(bias)}12` }}
              >
                {bias}
              </span>
              <span
                className="rounded border px-1.5 py-0.5 text-[10px] font-black uppercase"
                style={{ color: lifecycleColor(score.lifecycle), borderColor: `${lifecycleColor(score.lifecycle)}40`, background: `${lifecycleColor(score.lifecycle)}12` }}
              >
                {score.lifecycle}
              </span>
              <span className="text-[10px] text-slate-500">
                Rank #{row.rank} · {row.market} · {row.timeframe}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="mt-1 rounded border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:bg-white/10"
          >
            ESC
          </button>
        </div>

        {/* Internal disclaimer */}
        <div className="border-b border-white/[0.07] bg-red-950/20 px-5 py-2.5">
          <p className="text-[10px] leading-5 text-red-300/70">
            Internal research terminal only. No broker execution, no order routing, no client recommendation.
            For private analytical review only.
          </p>
        </div>

        <div className="flex-1 space-y-4 px-5 py-4">

          {/* Composite score */}
          <section>
            <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Composite Research Score</div>
            <div className="flex items-end gap-3">
              <span
                className="text-4xl font-black tabular-nums"
                style={{ color: score.score >= 70 ? "#10B981" : score.score >= 45 ? "#FBBF24" : "#9CA3AF" }}
              >
                {score.score}
              </span>
              <span className="mb-1 text-sm text-slate-500">/ 100</span>
              <span className="mb-1 text-[10px] text-slate-600">(raw {score.rawScore})</span>
            </div>
            <ScoreBar value={score.score} />
            <p className="mt-1.5 text-[10px] leading-5 text-slate-600">
              Heuristic evidence-alignment score. Not calibrated to outcome probabilities.
              Do not treat this number as a win-rate estimate.
            </p>
          </section>

          {/* Setup */}
          <section>
            <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Setup Classification</div>
            <div className="rounded-lg border border-white/[0.07] bg-slate-900/40 px-3 py-2.5">
              <div className="text-sm font-bold text-white">{setup.label}</div>
              <div className="mt-0.5 text-xs text-slate-400">{setup.description}</div>
              <div className="mt-1 text-[10px] text-slate-600">Polarity: {setup.polarity}</div>
            </div>
          </section>

          {/* Axis sub-scores */}
          <section>
            <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Score Axis Breakdown</div>
            <div className="space-y-2">
              {axisEntries.map(([axis, val]) => (
                <div key={axis}>
                  <div className="mb-0.5 flex items-center justify-between text-[11px]">
                    <span className={`font-bold capitalize ${score.dominantAxis === axis ? "text-emerald-300" : "text-slate-300"}`}>
                      {axis}{score.dominantAxis === axis ? " *dominant*" : ""}
                    </span>
                    <span className="tabular-nums text-slate-400">{Math.round(val)}</span>
                  </div>
                  <ScoreBar value={val} />
                </div>
              ))}
            </div>
          </section>

          {/* Boosts */}
          {score.boosts.length > 0 && (
            <section>
              <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Score Boosts</div>
              <div className="space-y-1">
                {score.boosts.map((b) => (
                  <div key={b.code} className="flex items-center justify-between rounded-md border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1.5 text-xs">
                    <span className="font-bold text-emerald-200">{b.label}</span>
                    <span className="tabular-nums text-emerald-300">+{b.weight}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Penalties */}
          {score.penalties.length > 0 && (
            <section>
              <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Score Penalties</div>
              <div className="space-y-1">
                {score.penalties.map((p) => (
                  <div key={p.code} className="flex items-center justify-between rounded-md border border-red-500/20 bg-red-500/[0.07] px-2.5 py-1.5 text-xs">
                    <span className="font-bold text-red-200">{p.label}</span>
                    <span className="tabular-nums text-red-300">−{p.weight}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Data Trust */}
          <section>
            <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Data Trust</div>
            <div className="rounded-lg border border-white/[0.07] bg-slate-900/40 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{dataTruth.status}</span>
                <span
                  className="text-sm font-black tabular-nums"
                  style={{ color: dataTruth.trustScore >= 70 ? "#10B981" : dataTruth.trustScore >= 40 ? "#FBBF24" : "#EF4444" }}
                >
                  {dataTruth.trustScore}/100
                </span>
              </div>
              <ScoreBar value={dataTruth.trustScore} />
              {dataTruth.notes.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {dataTruth.notes.map((n, i) => (
                    <div key={i} className="text-[10px] text-slate-500">{n}</div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Score notes */}
          {score.notes.length > 0 && (
            <section>
              <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Engine Notes</div>
              <div className="space-y-1">
                {score.notes.map((n, i) => (
                  <div key={i} className="rounded-md border border-white/[0.06] bg-slate-900/30 px-2.5 py-1.5 text-[11px] text-slate-400">{n}</div>
                ))}
              </div>
            </section>
          )}

          {/* Alert state */}
          {row.alertState && row.alertState !== "NONE" && (
            <section>
              <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Alert State</div>
              <div
                className="rounded-md border px-3 py-2 text-xs font-bold uppercase"
                style={{
                  color: row.alertState === "FIRED" ? "#F59E0B" : row.alertState === "PENDING" ? "#60A5FA" : "#6B7280",
                  borderColor: row.alertState === "FIRED" ? "#F59E0B40" : "#ffffff12",
                  background: row.alertState === "FIRED" ? "#F59E0B0F" : "#ffffff08",
                }}
              >
                Alert: {row.alertState}
              </div>
            </section>
          )}

          {/* Next research step */}
          <section>
            <div className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">Next Research Step</div>
            <div className="grid gap-2">
              <a
                href={`/admin/symbol/${row.symbol}?market=${row.market}&timeframe=${row.timeframe}`}
                className="block rounded-lg border border-blue-500/25 bg-blue-500/[0.08] px-3 py-2 text-xs font-bold text-blue-300 no-underline hover:bg-blue-500/12"
              >
                Open Private Symbol Terminal &#x203A;
              </a>
              <a
                href={`/tools/golden-egg?symbol=${encodeURIComponent(row.symbol)}`}
                className="block rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-xs font-bold text-emerald-300 no-underline hover:bg-emerald-500/12"
              >
                Review Public Evidence Packet &#x203A;
              </a>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.07] px-5 py-3">
          <div className="text-[10px] text-slate-600">
            Classification: PRIVATE_RESEARCH. Internal use only.
            Score change since last scan: {row.changeSinceLastScan >= 0 ? '+' : ''}{row.changeSinceLastScan} pts.
          </div>
        </div>
      </div>
    </>
  );
}
