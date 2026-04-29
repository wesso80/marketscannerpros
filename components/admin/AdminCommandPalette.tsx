"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ADMIN_COMMANDS,
  type AdminCommand,
  filterAdminCommands,
  groupAdminCommands,
  resolveShortcut,
} from "@/lib/admin/commandPaletteCommands";

/**
 * AdminCommandPalette — Cmd-K (or Ctrl-K) launcher for the admin terminal.
 *
 * Behaviour:
 *  - Cmd/Ctrl+K or `/` toggles open
 *  - Single-letter shortcut keys (S/O/G/T/V/A/D/J) navigate when the
 *    palette is closed AND no input is focused
 *  - Esc closes
 *  - Up/Down navigate the filtered list
 *  - Enter opens the highlighted command
 *
 * BOUNDARY: this is a navigation aid only. Every command resolves to an
 * admin research route. No execution, no order routing.
 */
export default function AdminCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => filterAdminCommands(query), [query]);
  const groups = useMemo(() => groupAdminCommands(filtered), [filtered]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }, []);

  const go = useCallback(
    (cmd: AdminCommand) => {
      close();
      router.push(cmd.href);
    },
    [router, close],
  );

  // Global keyboard handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          (target as HTMLElement).isContentEditable);

      // Cmd/Ctrl+K toggles
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // Esc closes
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
        return;
      }

      // When palette is closed AND user is not typing in a field,
      // accept `/` to open and single-letter shortcuts to navigate.
      if (!open && !inField) {
        if (e.key === "/") {
          e.preventDefault();
          setOpen(true);
          return;
        }
        if (e.key.length === 1) {
          const cmd = resolveShortcut(e.key);
          if (cmd) {
            e.preventDefault();
            router.push(cmd.href);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, router]);

  // Focus the input each time the palette opens; reset highlight when
  // the filtered list changes.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  if (!open) return null;

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[highlight];
      if (cmd) go(cmd);
    }
  };

  let cursor = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin command palette"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 8, 18, 0.72)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92vw)",
          background: "rgba(13, 22, 38, 0.98)",
          border: "1px solid rgba(16, 185, 129, 0.32)",
          borderRadius: 12,
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.55)",
          overflow: "hidden",
          color: "#E5E7EB",
        }}
      >
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Jump to symbol research, journal, alerts, data health…"
            spellCheck={false}
            autoComplete="off"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#F3F4F6",
              fontSize: "1rem",
              padding: "8px 4px",
            }}
          />
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
            ↑↓ navigate · Enter open · Esc close · Cmd/Ctrl-K toggle · single letters jump (S/O/G/T/V/A/D/J)
          </div>
        </div>

        <div style={{ maxHeight: "55vh", overflowY: "auto", padding: "6px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "16px", color: "#94A3B8", fontSize: 13 }}>
              No commands match. Try “symbol”, “alerts”, or “journal”.
            </div>
          ) : (
            groups.map(([category, items]) => (
              <div key={category} style={{ padding: "4px 0" }}>
                <div
                  style={{
                    padding: "6px 14px",
                    color: "#64748B",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    fontWeight: 800,
                  }}
                >
                  {category}
                </div>
                {items.map((cmd) => {
                  cursor += 1;
                  const isActive = cursor === highlight;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onMouseEnter={() => setHighlight(cursor)}
                      onClick={() => go(cmd)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 14px",
                        background: isActive ? "rgba(16, 185, 129, 0.14)" : "transparent",
                        border: "none",
                        color: "#E5E7EB",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 14, color: isActive ? "#10B981" : "#E5E7EB" }}>{cmd.label}</span>
                        {cmd.description && (
                          <span style={{ fontSize: 11, color: "#94A3B8" }}>{cmd.description}</span>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#0F172A",
                            background: "#10B981",
                            borderRadius: 4,
                            padding: "2px 6px",
                          }}
                        >
                          {cmd.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            color: "#64748B",
            fontSize: 11,
          }}
        >
          {ADMIN_COMMANDS.length} commands · research, analytics, alerts only
        </div>
      </div>
    </div>
  );
}
