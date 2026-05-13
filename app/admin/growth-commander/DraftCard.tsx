"use client";

import { useState } from "react";
import type { SocialPost } from "./page";

export default function DraftCard({
  post,
  onPatch,
  onPublish,
  onDelete,
}: {
  post: SocialPost;
  onPatch: (id: number, body: Record<string, unknown>) => Promise<void>;
  onPublish: (id: number) => Promise<any>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message ?? "operation failed");
    } finally {
      setBusy(null);
    }
  };

  const isApproved = post.status === "approved";
  const isPosted = post.status === "posted";
  const isRejected = post.status === "rejected";
  const belowThreshold = post.compliance_score < 85;

  return (
    <article style={cardStyle(post.status)}>
      <header style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.6rem" }}>
        <Pill text={post.platform === "x" ? "X" : "Instagram"} color="#0EA5E9" />
        <Pill text={post.post_type.replace(/_/g, " ")} color="#A78BFA" />
        <ScorePill score={post.compliance_score} />
        <Pill text={post.status} color={statusColor(post.status)} />
        <span style={{ color: "#64748B", fontSize: "0.72rem", marginLeft: "auto" }}>
          {new Date(post.created_at).toLocaleString()}
        </span>
      </header>

      {post.hook && (
        <div style={{ color: "#10B981", fontWeight: 600, fontSize: "0.92rem", marginBottom: "0.4rem" }}>
          {post.hook}
        </div>
      )}

      <div style={captionBlock()}>{post.caption}</div>

      {post.carousel_slides && post.carousel_slides.length > 0 && (
        <div style={{ marginTop: "0.6rem" }}>
          <SectionLabel>Carousel slides</SectionLabel>
          <ol style={{ paddingLeft: "1.2rem", color: "#CBD5E1", fontSize: "0.85rem", margin: 0 }}>
            {post.carousel_slides.map((s, i) => (
              <li key={i} style={{ marginBottom: "0.3rem" }}>
                <strong style={{ color: "#E5E7EB" }}>{s.title}</strong> — {s.body}
                {s.visual && <em style={{ color: "#64748B" }}> ({s.visual})</em>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {post.hashtags.length > 0 && (
        <div style={{ marginTop: "0.55rem", color: "#64748B", fontSize: "0.8rem" }}>
          {post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
        </div>
      )}

      {post.cta && (
        <div style={{ marginTop: "0.45rem", color: "#FBBF24", fontSize: "0.85rem" }}>
          CTA: {post.cta}
        </div>
      )}

      <div style={{ marginTop: "0.55rem", color: "#94A3B8", fontSize: "0.78rem", fontStyle: "italic" }}>
        {post.disclaimer || <span style={{ color: "#F87171" }}>(no disclaimer — fix before approval)</span>}
      </div>

      {post.visual_suggestion && (
        <div style={{ marginTop: "0.5rem", color: "#94A3B8", fontSize: "0.8rem" }}>
          <SectionLabel>Visual</SectionLabel> {post.visual_suggestion}
        </div>
      )}

      {post.compliance_notes.length > 0 && (
        <details style={{ marginTop: "0.7rem" }}>
          <summary style={{ color: "#FBBF24", cursor: "pointer", fontSize: "0.82rem" }}>
            Compliance notes ({post.compliance_notes.length})
          </summary>
          <ul style={{ marginTop: "0.4rem", paddingLeft: "1.1rem", color: "#CBD5E1", fontSize: "0.8rem" }}>
            {post.compliance_notes.map((n, i) => (
              <li key={i} style={{ marginBottom: "0.2rem" }}>
                <Pill text={n.severity} color={severityColor(n.severity)} compact /> <code style={{ color: "#FCA5A5" }}>{n.phrase}</code> — {n.suggestion}{" "}
                <span style={{ color: "#64748B" }}>({n.category})</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {post.risk_flags.length > 0 && (
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          {post.risk_flags.map((f) => (
            <Pill key={f} text={f} color="#F87171" compact />
          ))}
        </div>
      )}

      {err && <div style={inlineErr()}>{err}</div>}

      <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {!isPosted && !isRejected && !isApproved && (
          <>
            <button
              onClick={() => run("approve", () => onPatch(post.id, { status: "approved" }))}
              disabled={busy !== null || belowThreshold}
              title={belowThreshold ? `compliance score ${post.compliance_score} is below 85 — cannot approve` : ""}
              style={btn("ok", belowThreshold)}
            >
              {busy === "approve" ? "…" : "Approve"}
            </button>
            <button
              onClick={() => setShowRejectInput(true)}
              disabled={busy !== null}
              style={btn("danger")}
            >
              Reject
            </button>
          </>
        )}
        {isApproved && (
          <button onClick={() => run("publish", () => onPublish(post.id))} disabled={busy !== null} style={btn("primary")}>
            {busy === "publish" ? "Publishing…" : `Publish to ${post.platform === "x" ? "X" : "Instagram"}`}
          </button>
        )}
        {isPosted && post.external_url && (
          <a href={post.external_url} target="_blank" rel="noreferrer" style={linkBtn()}>
            View on {post.platform === "x" ? "X" : "Instagram"} ↗
          </a>
        )}
        {!isPosted && (
          <button onClick={() => run("delete", () => onDelete(post.id))} disabled={busy !== null} style={btn("ghost-danger")}>
            Delete
          </button>
        )}
      </div>

      {showRejectInput && (
        <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.4rem" }}>
          <input
            placeholder="rejection reason (saved to audit log)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            style={{ flex: 1, padding: "0.5rem 0.65rem", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.4rem", color: "#E5E7EB", fontSize: "0.85rem" }}
          />
          <button
            onClick={() => {
              if (!rejectReason.trim()) return;
              void run("reject", async () => {
                await onPatch(post.id, { status: "rejected", rejectedReason: rejectReason.trim() });
                setShowRejectInput(false);
                setRejectReason("");
              });
            }}
            style={btn("danger")}
          >
            Confirm reject
          </button>
        </div>
      )}
    </article>
  );
}

function Pill({ text, color, compact }: { text: string; color: string; compact?: boolean }) {
  return (
    <span
      style={{
        padding: compact ? "0.08rem 0.4rem" : "0.18rem 0.55rem",
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        borderRadius: 4,
        fontSize: compact ? "0.68rem" : "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {text}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 90 ? "#10B981" : score >= 85 ? "#84CC16" : score >= 70 ? "#FBBF24" : "#F87171";
  return <Pill text={`compliance ${score}`} color={color} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#64748B", fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{children}</span>;
}

function statusColor(s: string): string {
  return (
    {
      draft: "#64748B",
      review: "#FBBF24",
      approved: "#10B981",
      posted: "#0EA5E9",
      rejected: "#F87171",
    } as Record<string, string>
  )[s] ?? "#94A3B8";
}

function severityColor(s: string): string {
  return (
    {
      low: "#94A3B8",
      medium: "#FBBF24",
      high: "#FB923C",
      block: "#F87171",
    } as Record<string, string>
  )[s] ?? "#94A3B8";
}

function cardStyle(status: string): React.CSSProperties {
  const border =
    status === "rejected"
      ? "rgba(239, 68, 68, 0.35)"
      : status === "posted"
        ? "rgba(14, 165, 233, 0.35)"
        : status === "approved"
          ? "rgba(16, 185, 129, 0.35)"
          : "rgba(255, 255, 255, 0.08)";
  return {
    background: "rgba(17, 24, 39, 0.65)",
    border: `1px solid ${border}`,
    borderRadius: "0.65rem",
    padding: "0.95rem 1.05rem",
  };
}

function captionBlock(): React.CSSProperties {
  return {
    color: "#E5E7EB",
    fontSize: "0.92rem",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    background: "rgba(0,0,0,0.25)",
    padding: "0.6rem 0.75rem",
    borderRadius: "0.5rem",
    border: "1px solid rgba(255,255,255,0.04)",
  };
}

function btn(variant: "ok" | "primary" | "danger" | "ghost-danger", disabled?: boolean): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string; border: string }> = {
    ok: { bg: "rgba(16,185,129,0.18)", fg: "#10B981", border: "rgba(16,185,129,0.45)" },
    primary: { bg: "var(--msp-accent)", fg: "white", border: "transparent" },
    danger: { bg: "rgba(239,68,68,0.15)", fg: "#FCA5A5", border: "rgba(239,68,68,0.4)" },
    "ghost-danger": { bg: "transparent", fg: "#94A3B8", border: "rgba(148,163,184,0.2)" },
  };
  const c = map[variant];
  return {
    padding: "0.5rem 0.9rem",
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.fg,
    borderRadius: "0.45rem",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    fontSize: "0.83rem",
  };
}

function linkBtn(): React.CSSProperties {
  return {
    padding: "0.5rem 0.9rem",
    background: "rgba(14,165,233,0.1)",
    border: "1px solid rgba(14,165,233,0.4)",
    color: "#7DD3FC",
    borderRadius: "0.45rem",
    textDecoration: "none",
    fontSize: "0.83rem",
    fontWeight: 600,
  };
}

function inlineErr(): React.CSSProperties {
  return {
    marginTop: "0.6rem",
    padding: "0.5rem 0.7rem",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#FCA5A5",
    fontSize: "0.78rem",
    borderRadius: "0.4rem",
  };
}
