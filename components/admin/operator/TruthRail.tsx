"use client";

import type { TruthObject } from "@/lib/admin/truth-layer";

/* ═════════════════════════════════════════════════════
   COLOR / LABEL HELPERS
   ═════════════════════════════════════════════════════ */

function verdictColor(v: string) {
  switch (v) {
    case "ALLOW": return "#10B981";
    case "ALLOW_REDUCED": return "#FBBF24";
    case "WAIT": return "#6B7280";
    case "BLOCK": return "#EF4444";
    default: return "#6B7280";
  }
}

function actionLabel(a: string) {
  switch (a) {
    case "EXECUTE": return "Execute now";
    case "WATCH": return "Watch — setup valid";
    case "WAIT_FOR_TRIGGER": return "Wait for trigger";
    case "IGNORE": return "Ignore — no trade";
    case "MANUAL_REVIEW": return "Manual review required";
    case "NO_ACTION": return "No action";
    default: return a;
  }
}

function actionColor(a: string) {
  switch (a) {
    case "EXECUTE": return "#10B981";
    case "WATCH": return "#3B82F6";
    case "WAIT_FOR_TRIGGER": return "#FBBF24";
    case "IGNORE": return "#EF4444";
    case "MANUAL_REVIEW": return "#F59E0B";
    default: return "#6B7280";
  }
}

function confColor(c: string) {
  switch (c) {
    case "HIGH": return "#10B981";
    case "MODERATE": return "#3B82F6";
    case "WEAK": return "#FBBF24";
    case "INVALID": return "#EF4444";
    default: return "#6B7280";
  }
}

function dataStateLabel(d: string) {
  switch (d) {
    case "LIVE": return "Live";
    case "DELAYED": return "Delayed";
    case "STALE": return "⚠ Stale";
    case "PARTIAL": return "⚠ Partial";
    case "UNAVAILABLE": return "✕ Unavailable";
    default: return d;
  }
}

function dataStateColor(d: string) {
  switch (d) {
    case "LIVE": return "#10B981";
    case "DELAYED": return "#FBBF24";
    default: return "#EF4444";
  }
}

function ageFmt(sec: number) {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function evidenceBar(value: number) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "#10B981" : pct >= 45 ? "#FBBF24" : "#EF4444";
  return { pct, color };
}

/* ═════════════════════════════════════════════════════
   CARD SHELL
   ═════════════════════════════════════════════════════ */

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: "rgba(17, 24, 39, 0.6)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "0.75rem",
        padding: "0.875rem 1rem",
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.6rem", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
      {children}
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   BLOCK 1 — FINAL DECISION
   ═════════════════════════════════════════════════════ */

function FinalDecisionBlock({ truth }: { truth: TruthObject }) {
  return (
    <Card>
      {/* Verdict */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{
          fontSize: "1.5rem", fontWeight: 800, letterSpacing: "0.02em",
          color: verdictColor(truth.finalVerdict),
        }}>
          {truth.finalVerdict}
        </span>
        <span style={{
          fontSize: "0.7rem", fontWeight: 600,
          color: dataStateColor(truth.freshness.dataState),
        }}>
          {dataStateLabel(truth.freshness.dataState)} · {ageFmt(truth.freshness.verdictAgeSec)}
        </span>
      </div>

      {/* Action */}
      <div style={{
        background: `${actionColor(truth.operatorAction)}15`,
        border: `1px solid ${actionColor(truth.operatorAction)}30`,
        borderRadius: "0.5rem",
        padding: "0.4rem 0.75rem",
        marginBottom: 8,
      }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: actionColor(truth.operatorAction) }}>
          {actionLabel(truth.operatorAction)}
        </span>
      </div>

      {/* Confidence + Size */}
      <div style={{ display: "flex", gap: 16, fontSize: "0.7rem" }}>
        <span>
          <span style={{ color: "#6B7280" }}>Confidence: </span>
          <span style={{ color: confColor(truth.confidenceClass), fontWeight: 600 }}>{truth.confidenceClass}</span>
        </span>
        <span>
          <span style={{ color: "#6B7280" }}>Size: </span>
          <span style={{ color: truth.effectiveSize > 0 ? "#D1D5DB" : "#EF4444", fontWeight: 600 }}>{truth.effectiveSize}x</span>
        </span>
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════
   BLOCK 2 — PRIMARY REASON
   ═════════════════════════════════════════════════════ */

function PrimaryReasonBlock({ truth }: { truth: TruthObject }) {
  const r = truth.primaryReason;
  return (
    <Card>
      <Label>Primary Reason</Label>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#F9FAFB", lineHeight: 1.4 }}>
        {r.label}
      </div>
      <div style={{ fontSize: "0.6rem", color: "#4B5563", marginTop: 4, fontFamily: "monospace" }}>
        {r.code} · impact {r.impact}
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════
   BLOCK 3 — REASON STACK
   ═════════════════════════════════════════════════════ */

function ReasonStackBlock({ truth }: { truth: TruthObject }) {
  if (truth.reasonStack.length === 0) return null;
  return (
    <Card>
      <Label>Reason Stack</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {truth.reasonStack.slice(0, 5).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: r.direction === "POSITIVE" ? "#10B981" : "#EF4444",
            }} />
            <span style={{ fontSize: "0.73rem", color: "#D1D5DB", lineHeight: 1.3 }}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════
   BLOCK 4 — UPGRADE / KILL
   ═════════════════════════════════════════════════════ */

function UpgradeKillBlock({ truth }: { truth: TruthObject }) {
  return (
    <Card>
      <div style={{ marginBottom: 8 }}>
        <Label>Upgrade Trigger</Label>
        <div style={{ fontSize: "0.73rem", color: "#10B981", fontWeight: 500, lineHeight: 1.3 }}>
          ↑ {truth.upgradeTrigger.label}
        </div>
      </div>
      <div>
        <Label>Kill Trigger</Label>
        <div style={{ fontSize: "0.73rem", color: "#EF4444", fontWeight: 500, lineHeight: 1.3 }}>
          ✕ {truth.killTrigger.label}
        </div>
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════
   BLOCK 5 — WHY NOW / WHY NOT STRONGER
   ═════════════════════════════════════════════════════ */

function WhyBlock({ truth }: { truth: TruthObject }) {
  return (
    <Card>
      <div style={{ marginBottom: 8 }}>
        <Label>Why Now</Label>
        <div style={{ fontSize: "0.73rem", color: "#D1D5DB", lineHeight: 1.35 }}>
          {truth.whyNow}
        </div>
      </div>
      <div>
        <Label>Why Not Stronger</Label>
        <div style={{ fontSize: "0.73rem", color: "#9CA3AF", lineHeight: 1.35 }}>
          {truth.whyNotStronger}
        </div>
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════
   BLOCK 6 — EVIDENCE STACK
   ═════════════════════════════════════════════════════ */

const EVIDENCE_LABELS: [keyof TruthObject["evidence"], string][] = [
  ["regimeFit", "Regime Fit"],
  ["structureQuality", "Structure"],
  ["timeConfluence", "Time Confluence"],
  ["volatilityAlignment", "Volatility"],
  ["participationFlow", "Participation"],
  ["crossMarketConfirmation", "Cross-Market"],
  ["eventSafety", "Event Safety"],
  ["extensionSafety", "Extension Safety"],
  ["symbolTrust", "Symbol Trust"],
  ["modelHealth", "Model Health"],
];

function EvidenceStackBlock({ truth }: { truth: TruthObject }) {
  return (
    <Card>
      <Label>Evidence Stack</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {EVIDENCE_LABELS.map(([key, label]) => {
          const val = truth.evidence[key];
          const { pct, color } = evidenceBar(val);
          return (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "90px 1fr 32px", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.65rem", color: "#9CA3AF" }}>{label}</span>
              <div style={{ height: 5, background: "#1F2937", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: "0.6rem", color: "#6B7280", textAlign: "right" }}>{pct}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════
   BLOCK 7 — FRESHNESS
   ═════════════════════════════════════════════════════ */

function FreshnessBlock({ truth }: { truth: TruthObject }) {
  const f = truth.freshness;
  const r = truth.readiness;
  const items: [string, string, string][] = [
    ["Data", ageFmt(f.marketDataAgeSec), dataStateColor(f.dataState)],
    ["Verdict", ageFmt(f.verdictAgeSec), f.verdictAgeSec < 30 ? "#10B981" : "#FBBF24"],
    ["Governance", ageFmt(f.governanceAgeSec), f.governanceAgeSec < 30 ? "#10B981" : "#FBBF24"],
  ];

  return (
    <Card>
      <Label>Freshness &amp; Readiness</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", marginBottom: 8 }}>
        {items.map(([label, age, color]) => (
          <span key={label} style={{ fontSize: "0.65rem" }}>
            <span style={{ color: "#6B7280" }}>{label}: </span>
            <span style={{ color, fontWeight: 600 }}>{age}</span>
          </span>
        ))}
        <span style={{ fontSize: "0.65rem" }}>
          <span style={{ color: "#6B7280" }}>Status: </span>
          <span style={{ color: dataStateColor(f.dataState), fontWeight: 600 }}>{dataStateLabel(f.dataState)}</span>
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: 4 }}>
        {[
          ["Setup", r.setupValid],
          ["Exec Ready", r.executionReady],
          ["Trigger", r.triggerHit],
        ].map(([label, ok]) => (
          <span
            key={label as string}
            style={{
              fontSize: "0.6rem",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 10,
              background: ok ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.15)",
              color: ok ? "#10B981" : "#6B7280",
            }}
          >
            {label as string}: {ok ? "✓" : "✕"}
          </span>
        ))}
        <span
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 10,
            background: r.thesisState === "STRONG" ? "rgba(16,185,129,0.15)" :
                        r.thesisState === "DEGRADED" ? "rgba(251,191,36,0.15)" : "rgba(239,68,68,0.15)",
            color: r.thesisState === "STRONG" ? "#10B981" :
                   r.thesisState === "DEGRADED" ? "#FBBF24" : "#EF4444",
          }}
        >
          Thesis: {r.thesisState}
        </span>
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════
   MAIN EXPORT — TRUTH RAIL
   ═════════════════════════════════════════════════════ */

export default function TruthRail({ truth }: { truth: TruthObject | null | undefined }) {
  if (!truth) {
    return (
      <div style={{
        padding: "2rem 1rem", textAlign: "center", color: "#4B5563", fontSize: "0.8rem",
      }}>
        Awaiting scan data…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <FinalDecisionBlock truth={truth} />
      <PrimaryReasonBlock truth={truth} />
      <ReasonStackBlock truth={truth} />
      <UpgradeKillBlock truth={truth} />
      <WhyBlock truth={truth} />
      <EvidenceStackBlock truth={truth} />
      <FreshnessBlock truth={truth} />
    </div>
  );
}
