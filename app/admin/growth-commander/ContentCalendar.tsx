"use client";

import { useMemo } from "react";
import type { SocialPost } from "./page";

export default function ContentCalendar({ posts }: { posts: SocialPost[] }) {
  const buckets = useMemo(() => groupByDay(posts), [posts]);

  if (buckets.length === 0) {
    return (
      <div style={emptyStyle()}>
        Nothing scheduled or recently posted. Generate drafts in <strong>Compose</strong>, approve them in the <strong>Approval queue</strong>, then come back here to see them on the calendar.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      {buckets.map(({ dayKey, label, items }) => (
        <section key={dayKey} style={dayBlock()}>
          <header style={dayHeader()}>{label}</header>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {items.map((p) => (
              <div key={p.id} style={row()}>
                <span style={pillStyle(p.platform === "x" ? "#0EA5E9" : "#EC4899")}>{p.platform}</span>
                <span style={pillStyle(statusColor(p.status))}>{p.status}</span>
                <span style={{ color: "#E5E7EB", fontSize: "0.85rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.hook || p.caption.slice(0, 80)}
                </span>
                <span style={{ color: "#64748B", fontSize: "0.78rem" }}>
                  {p.posted_at ? `posted ${shortTime(p.posted_at)}` : p.scheduled_for ? `scheduled ${shortTime(p.scheduled_for)}` : ""}
                </span>
                {p.external_url && (
                  <a href={p.external_url} target="_blank" rel="noreferrer" style={{ color: "#7DD3FC", fontSize: "0.78rem" }}>
                    ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupByDay(posts: SocialPost[]) {
  const eligible = posts.filter((p) => p.status === "approved" || p.status === "posted" || p.status === "review");
  const map = new Map<string, { dayKey: string; label: string; items: SocialPost[] }>();
  for (const p of eligible) {
    const refDate = p.posted_at ?? p.scheduled_for ?? p.created_at;
    const d = new Date(refDate);
    if (isNaN(d.getTime())) continue;
    const dayKey = d.toISOString().slice(0, 10);
    if (!map.has(dayKey)) {
      map.set(dayKey, {
        dayKey,
        label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
        items: [],
      });
    }
    map.get(dayKey)!.items.push(p);
  }
  return Array.from(map.values()).sort((a, b) => (a.dayKey > b.dayKey ? -1 : 1));
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

function dayBlock(): React.CSSProperties {
  return {
    background: "rgba(17, 24, 39, 0.55)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "0.65rem",
    overflow: "hidden",
  };
}

function dayHeader(): React.CSSProperties {
  return {
    padding: "0.65rem 1rem",
    background: "rgba(16, 185, 129, 0.08)",
    color: "#10B981",
    fontWeight: 700,
    fontSize: "0.84rem",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(16, 185, 129, 0.15)",
  };
}

function row(): React.CSSProperties {
  return {
    display: "flex",
    gap: "0.55rem",
    alignItems: "center",
    padding: "0.55rem 1rem",
  };
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
