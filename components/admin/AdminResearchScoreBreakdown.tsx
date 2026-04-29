"use client";

import type { InternalResearchScore } from "@/lib/admin/adminTypes";

/**
 * AdminResearchScoreBreakdown — full audit trail of how the score
 * was computed: raw composite, penalties, boosts, hard-floor notes.
 */
export default function AdminResearchScoreBreakdown({ score }: { score: InternalResearchScore }) {
  const penaltyTotal = score.penalties.reduce((s, p) => s + p.weight, 0);
  const boostTotal = score.boosts.reduce((s, b) => s + b.weight, 0);

  return (
    <div style={{
      background: "rgba(17,24,39,0.6)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "0.75rem", padding: "1rem 1.25rem",
    }}>
      <div style={{
        fontSize: "0.7rem", color: "#9CA3AF", textTransform: "uppercase",
        letterSpacing: "0.06em", marginBottom: "0.75rem", fontWeight: 700,
      }}>
        Score Breakdown
      </div>

      {/* Math summary */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
        background: "rgba(0,0,0,0.2)", padding: "0.6rem 0.8rem", borderRadius: "0.5rem",
        fontSize: "0.75rem", marginBottom: "1rem",
      }}>
        <BreakdownStat label="Raw composite" value={`${score.rawScore}`} color="#9CA3AF" />
        <BreakdownStat label="Penalties" value={`-${penaltyTotal}`} color="#FCA5A5" />
        <BreakdownStat label="Boosts" value={`+${boostTotal}`} color="#86EFAC" />
        <BreakdownStat label="Final" value={`${score.score}`} color={score.score >= 70 ? "#10B981" : score.score >= 50 ? "#FBBF24" : "#9CA3AF"} bold />
      </div>

      {/* Penalties */}
      <Section title="Penalties" empty="No penalties applied.">
        {score.penalties.map((p, i) => (
          <Row key={i} label={p.label} weight={`-${p.weight}`} color="#FCA5A5" code={p.code} />
        ))}
      </Section>

      {/* Boosts */}
      <Section title="Boosts" empty="No boosts applied.">
        {score.boosts.map((b, i) => (
          <Row key={i} label={b.label} weight={`+${b.weight}`} color="#86EFAC" code={b.code} />
        ))}
      </Section>

      {/* Notes */}
      {score.notes.length > 0 && (
        <div style={{
          marginTop: "0.75rem", padding: "0.6rem 0.8rem", background: "rgba(0,0,0,0.2)",
          borderRadius: "0.5rem", fontSize: "0.7rem", color: "#9CA3AF",
        }}>
          <div style={{ fontWeight: 700, color: "#E5E7EB", marginBottom: 4 }}>Notes</div>
          {score.notes.map((n, i) => <div key={i}>· {n}</div>)}
        </div>
      )}
    </div>
  );
}

function BreakdownStat({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.6rem", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: bold ? "1rem" : "0.85rem", fontWeight: bold ? 800 : 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasItems = arr.filter(Boolean).length > 0;
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.65rem", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontWeight: 700 }}>
        {title}
      </div>
      {hasItems ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
      ) : (
        <div style={{ fontSize: "0.75rem", color: "#6B7280", fontStyle: "italic" }}>{empty}</div>
      )}
    </div>
  );
}

function Row({ label, weight, color, code }: { label: string; weight: string; color: string; code: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0.4rem 0.6rem", background: "rgba(0,0,0,0.15)", borderRadius: "0.4rem",
      fontSize: "0.75rem",
    }}>
      <div>
        <span style={{ color: "#E5E7EB" }}>{label}</span>
        <span style={{ color: "#6B7280", marginLeft: 6, fontSize: "0.65rem" }}>{code}</span>
      </div>
      <span style={{ color, fontWeight: 700 }}>{weight}</span>
    </div>
  );
}
