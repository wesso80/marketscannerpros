"use client";

/**
 * /admin/marketing-queue — review, edit, approve, publish Arca's drafted posts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Draft = {
  id: number;
  channel: string;
  topic: string | null;
  content: string;
  status: "pending" | "approved" | "rejected" | "published" | "failed";
  source: string | null;
  source_ref: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
};

const ACCENT = "#10B981";
const CHANNELS = ["x", "instagram", "discord", "email", "blog"] as const;

export default function MarketingQueuePage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState<string>("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeChannel, setComposeChannel] = useState<string>("discord");
  const [composeTopic, setComposeTopic] = useState("");
  const [composeNotes, setComposeNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [xStatus, setXStatus] = useState<{ connected: boolean; envOk: boolean; handle: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
      const res = await fetch(`/api/admin/marketing/drafts${qs}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Load failed");
      setDrafts(data.drafts || []);
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const loadXStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing/x/status", { credentials: "include", cache: "no-store" });
      if (res.ok) setXStatus(await res.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadXStatus(); }, [loadXStatus]);

  const updateStatus = async (id: number, status: Draft["status"]) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing/drafts", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      load();
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing/drafts", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingId, content: editingContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setEditingId(null);
      setEditingContent("");
      load();
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this draft?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing/drafts?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      load();
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (id: number) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing/drafts/publish", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Publish failed");
      load();
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setBusy(false);
    }
  };

  const compose = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/marketing/drafts", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: composeChannel,
          topic: composeTopic || undefined,
          notes: composeNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Generate failed");
      setComposeOpen(false);
      setComposeTopic("");
      setComposeNotes("");
      setFilter("pending");
      load();
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setBusy(false);
    }
  };

  const runSweep = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/arca-marketing-sweep?channels=discord,x,instagram,email", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sweep failed");
      setFilter("pending");
      load();
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const m: Record<string, Draft[]> = {};
    for (const d of drafts) (m[d.channel] ||= []).push(d);
    return m;
  }, [drafts]);

  return (
    <div style={{ color: "#E5E7EB" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#E5E7EB", margin: 0 }}>Marketing Queue</h1>
          <div style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>
            Arca drafts posts from live admin signals. Nothing publishes without your approval.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* X (Twitter) connection chip */}
          {xStatus && (
            xStatus.connected ? (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 999,
                background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.35)",
                color: "#A7F3D0", fontSize: 12,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "#10B981" }} />
                X linked {xStatus.handle ? `(${xStatus.handle})` : ""}
                <button
                  onClick={async () => {
                    if (!confirm("Disconnect X?")) return;
                    await fetch("/api/admin/marketing/x/status", { method: "DELETE", credentials: "include" });
                    loadXStatus();
                  }}
                  style={{ background: "transparent", border: 0, color: "#94A3B8", cursor: "pointer", padding: 0, fontSize: 11 }}
                >
                  disconnect
                </button>
              </div>
            ) : (
              <a
                href="/api/admin/marketing/x/connect"
                title={xStatus.envOk ? "Authorize X account" : "Set X_CLIENT_ID / X_CLIENT_SECRET / X_REDIRECT_URI in Render first"}
                style={{
                  ...btn("ghost"),
                  textDecoration: "none",
                  opacity: xStatus.envOk ? 1 : 0.5,
                  pointerEvents: xStatus.envOk ? "auto" : "none",
                }}
              >
                Connect X
              </a>
            )
          )}
          <button onClick={runSweep} disabled={busy} style={btn("ghost")}>
            Run sweep now
          </button>
          <button onClick={() => setComposeOpen(true)} disabled={busy} style={btn("primary")}>
            + New draft
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {["pending", "approved", "published", "rejected", "failed", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              ...btn("chip"),
              color: filter === s ? "#0F172A" : "#94A3B8",
              background: filter === s ? ACCENT : "transparent",
              borderColor: filter === s ? ACCENT : "rgba(148,163,184,0.25)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#FCA5A5", padding: "0.5rem 0.7rem", borderRadius: 8, marginBottom: 12, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: "#64748B" }}>Loading…</div>}
      {!loading && drafts.length === 0 && (
        <div style={{ color: "#64748B", padding: "2rem 0", textAlign: "center" }}>
          No drafts in this view. Run a sweep or create one.
        </div>
      )}

      {Object.entries(grouped).map(([channel, items]) => (
        <div key={channel} style={{ marginBottom: 24 }}>
          <div style={{ color: ACCENT, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
            {channel} · {items.length}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((d) => (
              <div key={d.id} style={{
                background: "rgba(17,24,39,0.7)",
                border: "1px solid rgba(148,163,184,0.15)",
                borderRadius: 10,
                padding: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <StatusPill status={d.status} />
                    <span style={{ color: "#94A3B8", fontSize: 12 }}>#{d.id}</span>
                    {d.topic && <span style={{ color: "#94A3B8", fontSize: 12 }}>· {d.topic}</span>}
                    {d.source && <span style={{ color: "#475569", fontSize: 11 }}>· {d.source}</span>}
                    <span style={{ color: "#475569", fontSize: 11 }}>· {new Date(d.created_at).toLocaleString()}</span>
                  </div>
                </div>

                {editingId === d.id ? (
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={6}
                    style={{
                      width: "100%", background: "rgba(15,23,42,0.8)", color: "#E5E7EB",
                      border: "1px solid rgba(148,163,184,0.22)", borderRadius: 8,
                      padding: "0.6rem 0.8rem", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical",
                    }}
                  />
                ) : (
                  <div style={{
                    color: "#E5E7EB", fontSize: 13, lineHeight: 1.55,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {d.content}
                  </div>
                )}

                {d.publish_error && (
                  <div style={{ color: "#FCA5A5", fontSize: 11, marginTop: 6 }}>
                    Publish error: {d.publish_error}
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {editingId === d.id ? (
                    <>
                      <button onClick={saveEdit} disabled={busy} style={btn("primary")}>Save</button>
                      <button onClick={() => { setEditingId(null); setEditingContent(""); }} style={btn("ghost")}>Cancel</button>
                    </>
                  ) : (
                    <>
                      {d.status === "pending" && (
                        <>
                          <button onClick={() => updateStatus(d.id, "approved")} disabled={busy} style={btn("primary")}>Approve</button>
                          <button onClick={() => updateStatus(d.id, "rejected")} disabled={busy} style={btn("danger")}>Reject</button>
                        </>
                      )}
                      {d.status === "approved" && (
                        <button onClick={() => publish(d.id)} disabled={busy} style={btn("primary")}>Publish</button>
                      )}
                      <button onClick={() => { setEditingId(d.id); setEditingContent(d.content); }} disabled={busy} style={btn("ghost")}>Edit</button>
                      <button onClick={() => navigator.clipboard.writeText(d.content)} style={btn("ghost")}>Copy</button>
                      <button onClick={() => remove(d.id)} disabled={busy} style={btn("danger-ghost")}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {composeOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }} onClick={() => setComposeOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "rgba(15,23,42,0.98)", border: `1px solid ${ACCENT}33`,
            borderRadius: 12, padding: 20, width: "min(520px, 90vw)",
          }}>
            <h2 style={{ margin: 0, marginBottom: 14, fontSize: 16, color: "#E5E7EB" }}>New draft</h2>
            <label style={lab()}>Channel</label>
            <select value={composeChannel} onChange={(e) => setComposeChannel(e.target.value)} style={inp()}>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={lab()}>Topic (optional)</label>
            <input value={composeTopic} onChange={(e) => setComposeTopic(e.target.value)} placeholder="e.g. AAPL setup forming, BTC regime shift" style={inp()} />
            <label style={lab()}>Notes / angle (optional)</label>
            <textarea value={composeNotes} onChange={(e) => setComposeNotes(e.target.value)} rows={3} placeholder="Any framing hint for Arca…" style={{ ...inp(), resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={() => setComposeOpen(false)} style={btn("ghost")}>Cancel</button>
              <button onClick={compose} disabled={busy} style={btn("primary")}>{busy ? "Generating…" : "Generate draft"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; bd: string }> = {
    pending:   { bg: "rgba(251,191,36,0.10)", fg: "#FBBF24", bd: "rgba(251,191,36,0.35)" },
    approved:  { bg: "rgba(16,185,129,0.10)", fg: ACCENT,    bd: ACCENT + "55" },
    published: { bg: "rgba(59,130,246,0.10)", fg: "#60A5FA", bd: "rgba(59,130,246,0.35)" },
    rejected:  { bg: "rgba(148,163,184,0.10)", fg: "#94A3B8", bd: "rgba(148,163,184,0.35)" },
    failed:    { bg: "rgba(239,68,68,0.10)",  fg: "#FCA5A5", bd: "rgba(239,68,68,0.35)" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      fontSize: 10, padding: "2px 7px", borderRadius: 4,
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, fontWeight: 700,
      letterSpacing: "0.05em", textTransform: "uppercase",
    }}>{status}</span>
  );
}

function btn(kind: "primary" | "ghost" | "danger" | "danger-ghost" | "chip"): React.CSSProperties {
  const base: React.CSSProperties = {
    border: "1px solid transparent", borderRadius: 7, padding: "0.4rem 0.75rem",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  };
  if (kind === "primary") return { ...base, background: ACCENT, color: "#0F172A" };
  if (kind === "danger")  return { ...base, background: "#EF4444", color: "#0F172A" };
  if (kind === "danger-ghost") return { ...base, background: "transparent", color: "#FCA5A5", borderColor: "rgba(239,68,68,0.4)" };
  if (kind === "chip")    return { ...base, background: "transparent", borderColor: "rgba(148,163,184,0.25)", color: "#94A3B8" };
  return { ...base, background: "transparent", color: "#94A3B8", borderColor: "rgba(148,163,184,0.25)" };
}
function lab(): React.CSSProperties {
  return { display: "block", color: "#94A3B8", fontSize: 11, marginTop: 10, marginBottom: 4, letterSpacing: "0.05em" };
}
function inp(): React.CSSProperties {
  return {
    width: "100%", background: "rgba(15,23,42,0.8)", color: "#E5E7EB",
    border: "1px solid rgba(148,163,184,0.22)", borderRadius: 7,
    padding: "0.5rem 0.7rem", fontSize: 13, fontFamily: "inherit", outline: "none",
  };
}
