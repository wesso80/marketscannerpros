"use client";

/**
 * app/admin/doctrine/page.tsx
 *
 * Doctrine Engine UI — read + propose + approve.
 * Admin-only.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  DoctrineRule,
  DoctrineReview,
  DoctrineProposedAction,
} from "@/lib/admin/arca-brain/types";

const BG = "#0F172A";
const CARD = "#111827";
const BORDER = "#1F2937";
const TEXT = "#F8FAFC";
const MUTED = "#94A3B8";
const GREEN = "#10B981";
const AMBER = "#F59E0B";
const RED = "#EF4444";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: GREEN,
  PROMOTED: GREEN,
  EXPERIMENTAL: AMBER,
  UNDER_REVIEW: AMBER,
  DOWNGRADED: RED,
  RETIRED: MUTED,
};

export default function DoctrinePage() {
  const [rules, setRules] = useState<DoctrineRule[]>([]);
  const [reviews, setReviews] = useState<DoctrineReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newRule, setNewRule] = useState({ name: "", category: "ENTRY_TIMING", ruleText: "" });
  const [reviewDraft, setReviewDraft] = useState({
    ruleId: "",
    proposedAction: "MODIFY" as DoctrineProposedAction,
    finding: "",
    arcaReasoning: "",
    newRuleText: "",
  });

  async function load() {
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/doctrine", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/doctrine/reviews", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!r1.ok) throw new Error(r1.error ?? "rules load failed");
      if (!r2.ok) throw new Error(r2.error ?? "reviews load failed");
      setRules(r1.rules);
      setReviews(r2.reviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  useEffect(() => { load(); }, []);

  async function createRule() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/doctrine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newRule),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error ?? "create failed");
      setNewRule({ name: "", category: "ENTRY_TIMING", ruleText: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function proposeReview() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/doctrine/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...reviewDraft, reviewType: "MANUAL" }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error ?? "propose failed");
      setReviewDraft({ ruleId: "", proposedAction: "MODIFY", finding: "", arcaReasoning: "", newRuleText: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function approveReview(reviewId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/doctrine/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve", reviewId }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error ?? "approve failed");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  const pending = useMemo(() => reviews.filter((r) => !r.approved), [reviews]);

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>DOCTRINE ENGINE</h1>
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 24 }}>
        Versioned, evidence-backed trading rules. Every change goes through a review. Admin-only.
      </p>

      {error && (
        <div style={{ background: "#3F1D1D", border: `1px solid ${RED}`, color: RED, padding: 12, marginBottom: 16, borderRadius: 6 }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Active rules</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {rules.map((r) => (
            <div key={r.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${STATUS_COLOR[r.status] ?? MUTED}`, padding: 12, borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>{r.name}</strong>
                <span style={{ fontSize: 11, color: STATUS_COLOR[r.status] ?? MUTED }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{r.ruleText}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                Category {r.category} · evidence {r.evidence.sampleSize} trades · WR {r.evidence.winRate ?? "—"} · {r.evidence.confidence}
                {r.proposedChange && (
                  <span style={{ color: AMBER, marginLeft: 8 }}>· proposed change pending</span>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: MUTED, fontFamily: "monospace" }}>id={r.id}</div>
            </div>
          ))}
          {!rules.length && <span style={{ color: MUTED }}>no rules yet</span>}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Pending reviews</h2>
        {pending.length === 0 && <span style={{ color: MUTED }}>nothing pending</span>}
        <div style={{ display: "grid", gap: 8 }}>
          {pending.map((rev) => (
            <div key={rev.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${AMBER}`, padding: 12, borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>rule <code>{rev.ruleId}</code> · {rev.proposedAction} · {rev.reviewType}</span>
                <button disabled={busy} onClick={() => approveReview(rev.id)} style={btn(GREEN)}>Approve</button>
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>{rev.finding}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}><em>{rev.arcaReasoning}</em></div>
              {rev.newRuleText && <div style={{ fontSize: 12, marginTop: 6 }}>→ <Mono>{rev.newRuleText}</Mono></div>}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 6 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Create rule</h3>
          <input placeholder="name" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} style={input()} />
          <input placeholder="category" value={newRule.category} onChange={(e) => setNewRule({ ...newRule, category: e.target.value })} style={input()} />
          <textarea placeholder="rule text" value={newRule.ruleText} onChange={(e) => setNewRule({ ...newRule, ruleText: e.target.value })} style={{ ...input(), height: 80 }} />
          <button disabled={busy || !newRule.name || !newRule.ruleText} onClick={createRule} style={btn(GREEN)}>Create</button>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 6 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Propose review</h3>
          <select value={reviewDraft.ruleId} onChange={(e) => setReviewDraft({ ...reviewDraft, ruleId: e.target.value })} style={input()}>
            <option value="">-- pick rule --</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={reviewDraft.proposedAction} onChange={(e) => setReviewDraft({ ...reviewDraft, proposedAction: e.target.value as DoctrineProposedAction })} style={input()}>
            {["KEEP","PROMOTE","DOWNGRADE","RETIRE","MODIFY"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input placeholder="finding" value={reviewDraft.finding} onChange={(e) => setReviewDraft({ ...reviewDraft, finding: e.target.value })} style={input()} />
          <input placeholder="arca reasoning" value={reviewDraft.arcaReasoning} onChange={(e) => setReviewDraft({ ...reviewDraft, arcaReasoning: e.target.value })} style={input()} />
          <textarea placeholder="new rule text (if MODIFY)" value={reviewDraft.newRuleText} onChange={(e) => setReviewDraft({ ...reviewDraft, newRuleText: e.target.value })} style={{ ...input(), height: 60 }} />
          <button disabled={busy || !reviewDraft.ruleId || !reviewDraft.finding} onClick={proposeReview} style={btn(AMBER)}>Propose</button>
        </div>
      </section>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) { return <span style={{ fontFamily: "monospace" }}>{children}</span>; }

function input(): React.CSSProperties {
  return { width: "100%", padding: "8px 10px", marginBottom: 8, background: "#0B1220", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 4, fontSize: 13 };
}
function btn(color: string): React.CSSProperties {
  return { background: color, color: "#0F172A", border: "none", padding: "8px 14px", borderRadius: 4, fontWeight: 600, cursor: "pointer", fontSize: 13 };
}
