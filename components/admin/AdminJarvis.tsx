"use client";

/**
 * AdminJarvis — floating operator assistant inside the admin terminal.
 *
 * - Bottom-right bubble; click to expand a chat panel.
 * - Cmd/Ctrl+J toggles open.
 * - Posts to /api/admin/jarvis (admin-gated, OpenAI-backed).
 * - Conversation kept in component state only (cleared on reload by design —
 *   admin caches stay isolated).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type ToolUse = { name: string; args: any; ok: boolean; status?: number };
type Msg = { role: "user" | "assistant"; content: string; tools?: ToolUse[] };

const ACCENT = "#10B981";

export default function AdminJarvis() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Cmd/Ctrl+J toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/jarvis", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          page: { path: pathname || "" },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.content || "(empty response)",
            tools: Array.isArray(data.tools) ? data.tools : undefined,
          },
        ]);
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, pathname]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Arca assistant"
        title="Arca assistant (Ctrl+J)"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: open ? "#0F172A" : ACCENT,
          color: open ? ACCENT : "#0F172A",
          border: `1px solid ${ACCENT}`,
          boxShadow: "0 8px 24px rgba(16,185,129,0.35)",
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 18,
          letterSpacing: "0.05em",
          zIndex: 9998,
        }}
      >
        {open ? "×" : "AI"}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Arca admin assistant"
          style={{
            position: "fixed",
            right: 20,
            bottom: 86,
            width: "min(420px, calc(100vw - 40px))",
            height: "min(620px, calc(100vh - 120px))",
            background: "rgba(15, 23, 42, 0.98)",
            border: `1px solid ${ACCENT}33`,
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "0.75rem 0.9rem",
              borderBottom: `1px solid ${ACCENT}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(16,185,129,0.06)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: ACCENT, fontWeight: 800, letterSpacing: "0.08em", fontSize: 13 }}>
                ARCA · OPERATOR ASSISTANT
              </span>
              <span style={{ color: "#64748B", fontSize: 11 }}>
                Private · research only · no execution
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={reset}
                title="Clear conversation"
                style={chipBtn()}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close (Esc)"
                style={chipBtn()}
              >
                Close
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              padding: "0.85rem",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
            }}
          >
            {messages.length === 0 && (
              <div style={{ color: "#64748B", fontSize: 13, lineHeight: 1.5 }}>
                Ask anything about the desk — interpret a panel, summarise a regime,
                draft a research note, or navigate the admin.
                <div style={{ marginTop: 8, color: "#475569", fontSize: 11 }}>
                  Shortcut: Ctrl/Cmd + J
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {m.tools && m.tools.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {m.tools.map((t, j) => (
                      <span
                        key={j}
                        title={t.ok ? "ok" : `failed${t.status ? ` (${t.status})` : ""}`}
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: t.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                          color: t.ok ? ACCENT : "#FCA5A5",
                          border: `1px solid ${t.ok ? ACCENT + "55" : "rgba(239,68,68,0.35)"}`,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  style={{
                    background: m.role === "user" ? "rgba(16,185,129,0.14)" : "rgba(30,41,59,0.85)",
                    border: `1px solid ${m.role === "user" ? ACCENT + "44" : "rgba(148,163,184,0.18)"}`,
                    color: "#E5E7EB",
                    padding: "0.55rem 0.7rem",
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div style={{ color: "#64748B", fontSize: 12, fontStyle: "italic" }}>
                Arca is observing… (calling tools)
              </div>
            )}
            {error && (
              <div
                style={{
                  color: "#FCA5A5",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  padding: "0.5rem 0.65rem",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ borderTop: `1px solid ${ACCENT}22`, padding: "0.6rem 0.7rem", background: "rgba(2,6,23,0.6)" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask Arca…  (Enter to send, Shift+Enter for newline)"
              rows={2}
              style={{
                width: "100%",
                resize: "none",
                background: "rgba(15,23,42,0.8)",
                color: "#E5E7EB",
                border: "1px solid rgba(148,163,184,0.22)",
                borderRadius: 8,
                padding: "0.55rem 0.7rem",
                fontSize: 13,
                lineHeight: 1.4,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <span style={{ color: "#475569", fontSize: 10 }}>
                Evidence-aware · flags stale/missing data · no order routing
              </span>
              <button
                type="button"
                onClick={send}
                disabled={busy || !input.trim()}
                style={{
                  background: busy || !input.trim() ? "rgba(16,185,129,0.3)" : ACCENT,
                  color: "#0F172A",
                  border: "none",
                  borderRadius: 7,
                  padding: "0.4rem 0.9rem",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Sending" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function chipBtn(): React.CSSProperties {
  return {
    background: "transparent",
    color: "#94A3B8",
    border: "1px solid rgba(148,163,184,0.25)",
    borderRadius: 6,
    padding: "0.2rem 0.55rem",
    fontSize: 11,
    cursor: "pointer",
  };
}
