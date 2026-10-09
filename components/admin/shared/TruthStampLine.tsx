"use client";

import type { Freshness, TruthEnvelope } from "@/lib/admin/truthLayer";

type TruthMeta = Partial<Omit<TruthEnvelope<unknown>, "data">> | null | undefined;

const FRESHNESS_LABEL: Record<Freshness, string> = {
  "real-time": "Live",
  delayed: "Stored",
  stale: "Stale",
  unknown: "Time not recorded",
};
const FRESHNESS_COLOR: Record<Freshness, string> = {
  "real-time": "#10B981",
  delayed: "#94A3B8",
  stale: "#F59E0B",
  unknown: "#F59E0B",
};

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleString();
}

/**
 * One line under an admin panel stating where its data came from, how old it is, whether it is simulated or
 * fallback, and what is missing (data-integrity rule). Renders an explicit "source not supplied" line when the API
 * sent no truth metadata, rather than nothing.
 */
export default function TruthStampLine({ truth, className }: { truth: TruthMeta; className?: string }) {
  if (!truth || !truth.source) {
    return (
      <p data-truth-stamp="missing" className={className} style={{ fontSize: "0.7rem", color: "#F59E0B" }}>
        Source and data time not supplied for this panel.
      </p>
    );
  }
  const freshness: Freshness = (truth.freshness as Freshness) ?? "unknown";
  const dataTime = when(truth.dataAsOf ?? null);
  const readTime = when(truth.fetchedAt ?? null);
  return (
    <p data-truth-stamp={freshness} className={className} style={{ fontSize: "0.7rem", color: "#94A3B8" }}>
      <span>Source: {truth.source}</span>
      <span> · Data as of: {dataTime ?? "not recorded"}</span>
      {readTime && <span> · Read: {readTime}</span>}
      <span style={{ color: FRESHNESS_COLOR[freshness], fontWeight: 700 }}> · {FRESHNESS_LABEL[freshness]}</span>
      {truth.simulated && <span style={{ color: "#F59E0B", fontWeight: 700 }}> · Simulated / derived</span>}
      {truth.missingFields && truth.missingFields.length > 0 && <span> · Missing: {truth.missingFields.join(", ")}</span>}
    </p>
  );
}
