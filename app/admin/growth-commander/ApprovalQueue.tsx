"use client";

import { useMemo, useState } from "react";
import DraftCard from "./DraftCard";
import type { SocialPost } from "./page";

const STATUSES = ["review", "draft", "approved", "posted", "rejected"] as const;
const PLATFORMS = ["all", "x", "instagram"] as const;

export default function ApprovalQueue({
  posts,
  onPatch,
  onPublish,
  onDelete,
}: {
  posts: SocialPost[];
  onPatch: (id: number, body: Record<string, unknown>) => Promise<void>;
  onPublish: (id: number) => Promise<any>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("review");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("all");

  const filtered = useMemo(
    () =>
      posts
        .filter((p) => p.status === status)
        .filter((p) => platform === "all" || p.platform === platform),
    [posts, status, platform],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [posts]);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} style={chip(status === s)}>
            {s} <span style={{ color: status === s ? "#0F172A" : "#64748B" }}>{counts[s] ?? 0}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])} style={selectStyle()}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && (
        <div style={emptyStyle()}>No {status} posts{platform !== "all" ? ` for ${platform}` : ""}.</div>
      )}

      <div style={{ display: "grid", gap: "0.85rem" }}>
        {filtered.map((p) => (
          <DraftCard key={p.id} post={p} onPatch={onPatch} onPublish={onPublish} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "0.35rem 0.7rem",
    background: active ? "#10B981" : "rgba(17, 24, 39, 0.7)",
    border: active ? "1px solid #10B981" : "1px solid rgba(255,255,255,0.08)",
    color: active ? "#0F172A" : "#9CA3AF",
    borderRadius: "0.4rem",
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    cursor: "pointer",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    padding: "0.35rem 0.6rem",
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "0.4rem",
    color: "#E5E7EB",
    fontSize: "0.82rem",
  };
}

function emptyStyle(): React.CSSProperties {
  return {
    padding: "2rem",
    background: "rgba(17,24,39,0.4)",
    border: "1px dashed rgba(255,255,255,0.1)",
    color: "#64748B",
    borderRadius: "0.5rem",
    textAlign: "center",
    fontSize: "0.88rem",
  };
}
