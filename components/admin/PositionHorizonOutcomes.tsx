"use client";

/**
 * 6-week / 12-week outcomes by setup type (Signal Outcomes, Backtest Lab). Data: lib/admin/positionHorizonStats via
 * /api/admin/signals/stats and /api/admin/backtest-lab (`positionHorizons`). Pending counts are always shown; figures
 * from fewer than `minSample` measured calls read "not enough data".
 */
import type { CSSProperties } from "react";
import type { HorizonBlock, HorizonSummary, PositionHorizonStats } from "@/lib/admin/positionHorizonStats";

const cell: CSSProperties = { padding: "0.35rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" };
const head: CSSProperties = { ...cell, color: "#6B7280", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.04em" };

const signed = (v: number, unit: string, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}${unit}`;
const tone = (v: number | null) => (v === null ? "#6B7280" : v > 0 ? "#10B981" : v < 0 ? "#EF4444" : "#9CA3AF");

function NotEnough({ n }: { n: number }) {
  return <span style={{ color: "#6B7280", fontStyle: "italic" }} title={`${n} measured`}>not enough data</span>;
}

function Row({ s, minSample, label }: { s: HorizonSummary; minSample: number; label?: string }) {
  const hits = s.targetFirst + s.stopFirst + s.neither;
  return (
    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <td style={{ ...cell, textAlign: "left", fontFamily: "monospace", color: label ? "#F9FAFB" : "#D1D5DB", fontWeight: label ? 700 : 400 }}>
        {label ?? s.setup}
      </td>
      <td style={cell}>{s.measured}</td>
      <td style={{ ...cell, color: "#FBBF24" }} title={`${s.waiting} waiting for the horizon, ${s.due} due (labelled on the next runs)`}>
        {s.pending}
        {s.due > 0 && <span style={{ color: "#9CA3AF" }}> ({s.due} due)</span>}
      </td>
      <td style={{ ...cell, color: "#10B981" }}>
        {s.directionalCount >= minSample ? (s.winRate !== null ? `${s.winRate}%` : "—") : <NotEnough n={s.directionalCount} />}
        <span style={{ color: "#6B7280" }}> n={s.directionalCount}</span>
        {s.enoughData && <span style={{ color: "#6B7280" }}> {s.correct}/{s.wrong}/{s.neutral}</span>}
      </td>
      <td style={{ ...cell, color: tone(s.avgReturnPct) }}>
        {s.returnCount >= minSample ? (s.avgReturnPct !== null ? signed(s.avgReturnPct, "%") : "—") : <NotEnough n={s.returnCount} />}
        <span style={{ color: "#6B7280" }}> n={s.returnCount}</span>
      </td>
      <td style={{ ...cell, color: tone(s.avgR) }}>
        {s.rCount >= minSample ? (s.avgR !== null ? signed(s.avgR, "R") : "—") : <NotEnough n={s.rCount} />}
        <span style={{ color: "#6B7280" }}> n={s.rCount}</span>
      </td>
      <td style={{ ...cell, color: "#9CA3AF" }} title="target first / stop first (incl. both on one day) / neither">
        {hits > 0 ? `${s.targetFirst} / ${s.stopFirst} / ${s.neither}` : "—"}
      </td>
      <td style={{ ...cell, color: "#6B7280" }}>{s.noData || ""}</td>
    </tr>
  );
}

function HorizonTable({ block, minSample }: { block: HorizonBlock; minSample: number }) {
  return (
    <div style={{ marginBottom: "1rem", overflowX: "auto" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#E5E7EB", margin: "0.25rem 0 0.4rem" }}>
        {block.horizon === "6w" ? "6 weeks" : "12 weeks"} <span style={{ color: "#6B7280", fontWeight: 400 }}>({block.days} calendar days after the call)</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", color: "#D1D5DB" }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: "left" }}>Setup</th>
            <th style={head}>Measured</th>
            <th style={head}>Pending</th>
            <th style={head}>Win rate (C/W/N)</th>
            <th style={head}>Avg return</th>
            <th style={head}>Avg R</th>
            <th style={head}>Target / stop / neither first</th>
            <th style={head}>No data</th>
          </tr>
        </thead>
        <tbody>
          <Row s={block.overall} minSample={minSample} label="All setups" />
          {block.bySetup.map((s) => <Row key={s.setup} s={s} minSample={minSample} />)}
        </tbody>
      </table>
    </div>
  );
}

export default function PositionHorizonOutcomes({ stats }: { stats: PositionHorizonStats | null | undefined }) {
  return (
    <div style={{
      background: "rgba(17, 24, 39, 0.6)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "0.75rem", padding: "1rem 1.25rem", marginBottom: "1.5rem",
    }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#F9FAFB", marginBottom: "0.4rem" }}>
        Position horizons: 6 and 12 weeks, by setup
      </div>
      {!stats ? (
        <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>6-week / 12-week results unavailable.</div>
      ) : !stats.available ? (
        <div style={{ fontSize: "0.75rem", color: "#FBBF24" }}>{stats.note}</div>
      ) : (
        <>
          <div style={{ fontSize: "0.7rem", color: "#9CA3AF", marginBottom: "0.6rem" }}>
            {stats.note} Each figure needs at least {stats.minSample} valid observations for its own denominator; below that they read &quot;not enough data&quot;.
          </div>
          {stats.horizons.map((b) => <HorizonTable key={b.horizon} block={b} minSample={stats.minSample} />)}
        </>
      )}
    </div>
  );
}
