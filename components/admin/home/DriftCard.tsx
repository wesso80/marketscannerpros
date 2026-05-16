/**
 * components/admin/home/DriftCard.tsx
 *
 * Surfaces the operator's behavioural-drift signals on the admin home.
 * Pulls /api/admin/behavioral-drift, ranks signals critical-first, and
 * shows a compact summary card. Read-only.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Severity = "low" | "medium" | "high";

interface DriftSignal {
  key: string;
  label: string;
  severity: Severity;
  value?: number | null;
  detail?: string;
}
interface DriftReport {
  generatedAt: string;
  windowDays: number;
  signals: DriftSignal[];
}

const sevColor: Record<Severity, string> = {
  high: "#F87171",
  medium: "#F59E0B",
  low: "#10B981",
};
const sevRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export default function DriftCard() {
  const [report, setReport] = useState<DriftReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/behavioral-drift?days=30", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; report?: DriftReport; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setError(json?.error ?? `HTTP ${res.status}`);
        } else if (json.report) {
          setReport(json.report);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ranked = (report?.signals ?? []).slice().sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  const highCount = ranked.filter((s) => s.severity === "high").length;
  const headlineColor = highCount > 0 ? sevColor.high : ranked.some((s) => s.severity === "medium") ? sevColor.medium : sevColor.low;

  return (
    <section
      style={{
        background: "#0F172A",
        border: `1px solid ${highCount > 0 ? "#7F1D1D" : "#1F2937"}`,
        borderLeft: `4px solid ${headlineColor}`,
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: "#F9FAFB" }}>Behavioural drift</h3>
          <div style={{ fontSize: 11, color: "#9CA3AF" }}>
            Last 30 days · {highCount > 0 ? `${highCount} high-severity signal(s)` : "no critical signals"}
          </div>
        </div>
        <Link href="/admin/behavioral-drift" style={{ fontSize: 11, color: "#60A5FA", textDecoration: "none" }}>
          full view →
        </Link>
      </div>

      {loading && <div style={{ fontSize: 12, color: "#9CA3AF" }}>Loading drift signals…</div>}
      {error && (
        <div style={{ fontSize: 12, color: "#FCA5A5" }}>
          Drift unavailable: {error}
        </div>
      )}
      {!loading && !error && ranked.length === 0 && (
        <div style={{ fontSize: 12, color: "#9CA3AF" }}>No drift signals recorded yet.</div>
      )}
      {!loading && !error && ranked.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {ranked.slice(0, 5).map((s) => (
            <li
              key={s.key}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 12,
                color: "#E5E7EB",
              }}
            >
              <span
                style={{
                  background: sevColor[s.severity],
                  color: "#0F172A",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 999,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  minWidth: 50,
                  textAlign: "center",
                }}
              >
                {s.severity}
              </span>
              <span style={{ flex: 1 }}>
                <strong>{s.label}</strong>
                {s.detail ? <span style={{ color: "#9CA3AF" }}> — {s.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
