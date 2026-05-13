"use client";

import { useEffect, useState } from "react";

interface PerformanceRow {
  id: number;
  caption_preview: string;
  platform: "x" | "instagram";
  post_type: string;
  status: string;
  posted_at: string | null;
  external_url: string | null;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  engagement_rate: number | null;
  snapshot_at: string | null;
}

export default function PerformanceTable() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/growth/metrics", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setRows(data.rows ?? []);
        const haveMetrics = (data.rows ?? []).some((r: PerformanceRow) => r.snapshot_at);
        if (!haveMetrics) {
          setNote(
            "No metrics snapshots yet. Once X and Instagram are connected and posts are published, performance data populates here.",
          );
        }
      } catch (err: any) {
        if (!cancelled) setNote(err?.message ?? "failed to load metrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div style={emptyStyle()}>Loading…</div>;
  if (rows.length === 0) return <div style={emptyStyle()}>{note ?? "No published or approved posts to track yet."}</div>;

  return (
    <div>
      {note && <div style={{ ...emptyStyle(), marginBottom: "0.85rem", textAlign: "left" }}>{note}</div>}
      <div style={{ overflowX: "auto", background: "rgba(17,24,39,0.55)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "0.65rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ background: "rgba(16,185,129,0.06)" }}>
              <Th>Posted</Th>
              <Th>Plat</Th>
              <Th>Type</Th>
              <Th>Preview</Th>
              <Th align="right">Imp</Th>
              <Th align="right">Likes</Th>
              <Th align="right">Replies</Th>
              <Th align="right">Reposts</Th>
              <Th align="right">ER</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <Td>{r.posted_at ? new Date(r.posted_at).toLocaleString() : <span style={{ color: "#64748B" }}>—</span>}</Td>
                <Td><span style={pillStyle(r.platform === "x" ? "#0EA5E9" : "#EC4899")}>{r.platform}</span></Td>
                <Td>{r.post_type.replace(/_/g, " ")}</Td>
                <Td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.caption_preview}</Td>
                <Td align="right">{r.impressions.toLocaleString()}</Td>
                <Td align="right">{r.likes.toLocaleString()}</Td>
                <Td align="right">{r.replies.toLocaleString()}</Td>
                <Td align="right">{r.reposts.toLocaleString()}</Td>
                <Td align="right">{r.engagement_rate != null ? `${(r.engagement_rate * 100).toFixed(2)}%` : "—"}</Td>
                <Td>
                  {r.external_url && (
                    <a href={r.external_url} target="_blank" rel="noreferrer" style={{ color: "#7DD3FC" }}>
                      ↗
                    </a>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ textAlign: align, color: "#10B981", padding: "0.55rem 0.75rem", fontWeight: 700, fontSize: "0.74rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", style }: { children?: React.ReactNode; align?: "left" | "right"; style?: React.CSSProperties }) {
  return (
    <td style={{ textAlign: align, color: "#CBD5E1", padding: "0.5rem 0.75rem", ...style }}>
      {children}
    </td>
  );
}

function pillStyle(color: string): React.CSSProperties {
  return {
    padding: "0.1rem 0.45rem",
    background: `${color}22`,
    border: `1px solid ${color}55`,
    color,
    borderRadius: 4,
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
}

function emptyStyle(): React.CSSProperties {
  return {
    padding: "2rem",
    background: "rgba(17,24,39,0.4)",
    border: "1px dashed rgba(255,255,255,0.1)",
    color: "#94A3B8",
    borderRadius: "0.65rem",
    textAlign: "center",
    fontSize: "0.9rem",
    lineHeight: 1.6,
  };
}
