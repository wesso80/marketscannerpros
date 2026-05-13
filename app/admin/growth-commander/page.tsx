"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CampaignBrief, { type BriefFormState } from "./CampaignBrief";
import DraftCard from "./DraftCard";
import ApprovalQueue from "./ApprovalQueue";
import ContentCalendar from "./ContentCalendar";
import PerformanceTable from "./PerformanceTable";

type PostStatus = "draft" | "review" | "approved" | "posted" | "rejected";

export interface SocialPost {
  id: number;
  platform: "x" | "instagram";
  post_type: string;
  hook: string | null;
  caption: string;
  hashtags: string[];
  visual_suggestion: string | null;
  cta: string | null;
  disclaimer: string;
  status: PostStatus;
  compliance_score: number;
  compliance_notes: Array<{ category: string; phrase: string; severity: string; suggestion: string }>;
  risk_flags: string[];
  scheduled_for: string | null;
  posted_at: string | null;
  external_url: string | null;
  carousel_slides: Array<{ title: string; body: string; visual?: string }> | null;
  created_at: string;
}

type Tab = "compose" | "queue" | "calendar" | "performance";

export default function GrowthCommanderPage() {
  const [tab, setTab] = useState<Tab>("compose");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastGeneratedIds, setLastGeneratedIds] = useState<Set<number>>(new Set());
  const [postsApiMessage, setPostsApiMessage] = useState<string | null>(null);
  const [postsApiError, setPostsApiError] = useState<string | null>(null);

  const refreshPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/growth/posts?limit=300", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPostsApiError(data?.error ?? `HTTP ${res.status}`);
        setPostsApiMessage(null);
        setPosts([]);
        return;
      }
      setPostsApiError(null);
      setPostsApiMessage(typeof data.message === "string" ? data.message : null);
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (err: any) {
      setPostsApiError(err?.message ?? "network error");
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    void refreshPosts();
  }, [refreshPosts]);

  const handleGenerate = async (brief: BriefFormState) => {
    setLoading(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/admin/growth/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "generation failed");
        return;
      }
      const generated: SocialPost[] = data.posts ?? [];
      if (generated.length === 0) {
        setGenerateError(data.message ?? "Claude returned no drafts for that brief.");
      }
      setLastGeneratedIds(new Set(generated.map((p) => p.id)));
      await refreshPosts();
    } catch (err: any) {
      setGenerateError(err?.message ?? "network error");
    } finally {
      setLoading(false);
    }
  };

  const handlePatch = async (id: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/growth/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "update failed");
    await refreshPosts();
  };

  const handlePublish = async (id: number) => {
    const res = await fetch(`/api/admin/growth/posts/${id}/publish`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "publish failed");
    await refreshPosts();
    return data;
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/admin/growth/posts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "delete failed");
    }
    await refreshPosts();
  };

  const recentDrafts = useMemo(
    () => posts.filter((p) => lastGeneratedIds.has(p.id)),
    [posts, lastGeneratedIds],
  );

  return (
    <div>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ color: "#E5E7EB", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          Growth Command Centre
        </h1>
        <p style={{ color: "#94A3B8", marginTop: "0.35rem", fontSize: "0.88rem" }}>
          Claude-drafted social content. Compliance-gated, human-approved, never auto-posted.
        </p>
      </header>

      {postsApiError && (
        <div style={{ marginBottom: "0.85rem", padding: "0.7rem 0.9rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", color: "#FCA5A5", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
          API error: {postsApiError}
        </div>
      )}
      {postsApiMessage && (
        <div style={{ marginBottom: "0.85rem", padding: "0.7rem 0.9rem", background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.3)", color: "#FBBF24", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
          {postsApiMessage}
        </div>
      )}

      <nav style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {(["compose", "queue", "calendar", "performance"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={tabButton(tab === t)}
          >
            {tabLabel(t)}
          </button>
        ))}
      </nav>

      {tab === "compose" && (
        <section style={panel()}>
          <CampaignBrief onSubmit={handleGenerate} loading={loading} />
          {generateError && (
            <div style={errorBox()}>{generateError}</div>
          )}
          {recentDrafts.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <h2 style={sectionHeading()}>Latest drafts</h2>
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {recentDrafts.map((p) => (
                  <DraftCard
                    key={p.id}
                    post={p}
                    onPatch={handlePatch}
                    onPublish={handlePublish}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "queue" && (
        <ApprovalQueue
          posts={posts}
          onPatch={handlePatch}
          onPublish={handlePublish}
          onDelete={handleDelete}
        />
      )}

      {tab === "calendar" && <ContentCalendar posts={posts} />}

      {tab === "performance" && <PerformanceTable />}
    </div>
  );
}

function tabLabel(t: Tab): string {
  return (
    {
      compose: "Compose",
      queue: "Approval queue",
      calendar: "Content calendar",
      performance: "Performance",
    } as Record<Tab, string>
  )[t];
}

function tabButton(active: boolean): React.CSSProperties {
  return {
    padding: "0.5rem 0.9rem",
    background: active ? "rgba(16, 185, 129, 0.14)" : "rgba(17, 24, 39, 0.6)",
    border: active ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "0.5rem",
    color: active ? "#10B981" : "#9CA3AF",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
  };
}

function panel(): React.CSSProperties {
  return {
    background: "rgba(17, 24, 39, 0.6)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "0.75rem",
    padding: "1.25rem",
  };
}

function errorBox(): React.CSSProperties {
  return {
    marginTop: "1rem",
    padding: "0.75rem 1rem",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#FCA5A5",
    borderRadius: "0.5rem",
    fontSize: "0.85rem",
  };
}

function sectionHeading(): React.CSSProperties {
  return { color: "#E5E7EB", fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" };
}
