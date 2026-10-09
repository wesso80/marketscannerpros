"use client";

import { useEffect, useState } from "react";
import TruthStampLine from "@/components/admin/shared/TruthStampLine";

type Verdict = "insufficient_sample" | "no_edge_after_costs" | "inconsistent" | "positive_after_costs";
interface Half { n: number; from: string | null; to: string | null; avgMoveAfterCost: number | null }
interface Group {
  group: string; n: number; wins: number; losses: number; neutral: number;
  hitRate: number | null; hitRateLow: number | null; hitRateHigh: number | null;
  avgMove: number | null; avgMoveAfterCost: number | null; moveLow: number | null; moveHigh: number | null;
  earlier: Half; later: Half; verdict: Verdict;
}
interface Response {
  ok: boolean; error?: string; by?: string; days?: number;
  overall?: Group; groups?: Group[];
  definition?: { outcome: string; costs: string; intervals: string; split: string; minSample: number; minHalfSample: number; caveats: string[]; labelledSince: string };
  truth?: Record<string, unknown>;
}

const BY_OPTIONS = [
  { value: "playbook_direction", label: "Playbook × direction" },
  { value: "playbook", label: "Playbook" },
  { value: "direction", label: "Direction" },
  { value: "asset", label: "Asset class" },
  { value: "regime", label: "Regime" },
  { value: "timeframe", label: "Timeframe" },
];

const VERDICT: Record<Verdict, { label: string; color: string }> = {
  positive_after_costs: { label: "Positive after costs (in-sample, not validated)", color: "#10B981" },
  inconsistent: { label: "Inconsistent: later half not positive", color: "#FBBF24" },
  no_edge_after_costs: { label: "Positive after-cost mean not established", color: "#F87171" },
  insufficient_sample: { label: "Too few signals", color: "#94A3B8" },
};

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n}%`);
const day = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

function Row({ g }: { g: Group }) {
  const v = VERDICT[g.verdict];
  return (
    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <td style={{ padding: "6px 8px", color: "#E5E7EB" }}>{g.group}</td>
      <td style={{ padding: "6px 8px", textAlign: "right" }}>{g.n}</td>
      <td style={{ padding: "6px 8px", textAlign: "right" }}>
        {g.hitRate === null ? "—" : `${g.hitRate}%`}
        <div style={{ color: "#64748B", fontSize: 11 }}>{g.hitRateLow !== null ? `${g.hitRateLow}–${g.hitRateHigh}%` : ""} · {g.wins}W/{g.losses}L/{g.neutral}N</div>
      </td>
      <td style={{ padding: "6px 8px", textAlign: "right" }}>
        {pct(g.avgMoveAfterCost)}
        <div style={{ color: "#64748B", fontSize: 11 }}>{g.moveLow !== null ? `${pct(g.moveLow)} to ${pct(g.moveHigh)}` : ""} · before cost {pct(g.avgMove)}</div>
      </td>
      <td style={{ padding: "6px 8px", textAlign: "right" }}>
        {pct(g.earlier.avgMoveAfterCost)} → {pct(g.later.avgMoveAfterCost)}
        <div style={{ color: "#64748B", fontSize: 11 }}>Earlier: {g.earlier.n} · {day(g.earlier.from)} to {day(g.earlier.to)}<br />Later: {g.later.n} · {day(g.later.from)} to {day(g.later.to)}</div>
      </td>
      <td data-verdict={g.verdict} style={{ padding: "6px 8px", color: v.color, fontWeight: 600 }}>{v.label}</td>
    </tr>
  );
}

export default function EdgeCheckPage() {
  const [by, setBy] = useState("playbook_direction");
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/edge-check?by=${encodeURIComponent(by)}&days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setData({ ok: false, error: "Request failed" }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [by, days]);

  return (
    <div style={{ padding: "1rem", color: "#CBD5E1" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#E5E7EB" }}>Edge Check</h1>
      <p style={{ fontSize: 13, color: "#94A3B8", maxWidth: 860 }}>
        Compare historical scanner observations after an assumed cost across earlier and later periods.
        These in-sample comparisons do not establish a reliable trading edge.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "0.75rem 0" }}>
        <label style={{ fontSize: 13 }}>Group by{" "}
          <select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value)} style={{ background: "#0F172A", color: "#E5E7EB" }}>
            {BY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>Window{" "}
          <select aria-label="Window" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ background: "#0F172A", color: "#E5E7EB" }}>
            {[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
      </div>
      {data?.truth && <TruthStampLine truth={data.truth as never} />}
      {loading && <p>Loading…</p>}
      {!loading && data && !data.ok && <p style={{ color: "#F87171" }}>{data.error ?? "Unavailable"}</p>}
      {!loading && data?.ok && data.overall && (
        <>
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ color: "#94A3B8", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px" }}>Group</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Signals</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Hit rate (95%)</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Avg 24h move after cost (95%)</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Earlier → later period</th>
                  <th style={{ padding: "6px 8px" }}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                <Row g={data.overall} />
                {(data.groups ?? []).map((g) => <Row key={g.group} g={g} />)}
              </tbody>
            </table>
          </div>
          {data.definition && (
            <section data-edge-definition style={{ marginTop: "1rem", fontSize: 12, color: "#94A3B8", maxWidth: 900 }}>
              <div style={{ color: "#E5E7EB", fontWeight: 700 }}>How to read this</div>
              <ul style={{ paddingLeft: "1rem", display: "grid", gap: 2 }}>
                <li>Outcome: {data.definition.outcome}. Labelled since {new Date(data.definition.labelledSince).toLocaleString()}.</li>
                <li>{data.definition.costs}</li>
                <li>{data.definition.intervals}</li>
                <li>{data.definition.split} Groups need {data.definition.minSample} signals and {data.definition.minHalfSample} per period.</li>
                {data.definition.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
