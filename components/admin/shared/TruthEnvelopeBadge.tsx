/**
 * components/admin/shared/TruthEnvelopeBadge.tsx
 *
 * Renders the standard truth-layer header for any admin AI response.
 * Shows source · freshness · confidence · simulated/missing-fields warnings.
 *
 * Usage:
 *   import { toTruthEnvelope } from "@/lib/admin/truthEnvelope";
 *   const env = toTruthEnvelope(rawApiJson);
 *   <TruthEnvelopeBadge envelope={env} />
 */

import type { TruthEnvelope } from "@/lib/admin/truthEnvelope";

const CONF_COLOR: Record<string, string> = {
  high: "#10B981",
  medium: "#F59E0B",
  low: "#EF4444",
  unknown: "#94A3B8",
};

const FRESH_COLOR: Record<string, string> = {
  "real-time": "#10B981",
  realtime: "#10B981",
  delayed: "#F59E0B",
  cached: "#F59E0B",
  stale: "#EF4444",
  unknown: "#94A3B8",
};

function pill(label: string, color: string) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: `${color}22`,
        color,
        fontSize: 11,
        fontWeight: 600,
        marginRight: 6,
      }}
    >
      {label}
    </span>
  );
}

export default function TruthEnvelopeBadge({ envelope }: { envelope: TruthEnvelope<unknown> }) {
  const m = envelope.meta;
  const confColor = CONF_COLOR[m.confidence?.toLowerCase()] ?? CONF_COLOR.unknown;
  const freshColor = FRESH_COLOR[m.freshness?.toLowerCase()] ?? FRESH_COLOR.unknown;
  const fetchedAt = (() => {
    try { return new Date(m.fetchedAt).toLocaleTimeString(); } catch { return m.fetchedAt; }
  })();

  return (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
      <div style={{ marginBottom: 4 }}>
        {pill(`source · ${m.source}`, "#64748B")}
        {pill(`freshness · ${m.freshness}`, freshColor)}
        {pill(`confidence · ${m.confidence}`, confColor)}
        {m.simulated && pill("SIMULATED", "#F59E0B")}
        {m.missingFields.length > 0 && pill(`missing · ${m.missingFields.length}`, "#EF4444")}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
        Fetched {fetchedAt} · {m.confidenceReason}
        {m.missingFields.length > 0 && (
          <> · missing fields: <code style={{ color: "#FCA5A5" }}>{m.missingFields.join(", ")}</code></>
        )}
      </div>
    </div>
  );
}
