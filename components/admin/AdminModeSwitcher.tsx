"use client";

/**
 * AdminModeContext + AdminModeSwitcher
 *
 * Selects the active admin operating mode (see lib/admin/modes.ts).
 *
 * The selected mode determines whether personal portfolio exposure may
 * be used as a blocker (risk-desk only) vs displayed as context only.
 *
 * The mode is persisted in localStorage so reloads stay sticky.
 * Use the `useAdminMode()` hook from any client component beneath the
 * provider to read or update the current mode.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ADMIN_MODES, isAdminMode, type AdminMode } from "@/lib/admin";

const STORAGE_KEY = "msp_admin_mode";
const DEFAULT_MODE: AdminMode = "opportunity-scout";

type Ctx = {
  mode: AdminMode;
  setMode: (m: AdminMode) => void;
};

const AdminModeContext = createContext<Ctx>({
  mode: DEFAULT_MODE,
  setMode: () => {},
});

export function useAdminMode(): Ctx {
  return useContext(AdminModeContext);
}

export function AdminModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AdminMode>(DEFAULT_MODE);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && isAdminMode(raw)) setModeState(raw);
    } catch {
      // ignore — SSR or storage disabled
    }
  }, []);

  const setMode = useCallback((m: AdminMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <AdminModeContext.Provider value={value}>{children}</AdminModeContext.Provider>;
}

const MODE_LABELS: Record<AdminMode, string> = {
  "opportunity-scout": "Opportunity Scout",
  "research-desk": "Research Desk",
  "risk-desk": "Risk Desk",
  "data-integrity": "Data Integrity",
  "strategy-lab": "Strategy Lab",
  "alert-command": "Alert Command",
  "truth-layer": "Truth Layer",
};

export function AdminModeSwitcher({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useAdminMode();

  const isRiskDesk = mode === "risk-desk";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? "0.4rem" : "0.55rem",
        padding: compact ? "0.35rem 0.5rem" : "0.45rem 0.6rem",
        background: "rgba(15, 23, 42, 0.85)",
        border: `1px solid ${isRiskDesk ? "rgba(245, 158, 11, 0.55)" : "rgba(148, 163, 184, 0.25)"}`,
        borderRadius: "0.5rem",
      }}
      title={
        isRiskDesk
          ? "Risk Desk mode: personal portfolio exposure may gate execution decisions."
          : "Personal exposure is display-only in this mode."
      }
    >
      <span
        style={{
          color: "#64748B",
          fontSize: "0.62rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 800,
        }}
      >
        Mode
      </span>
      <select
        value={mode}
        onChange={(e) => {
          const next = e.target.value;
          if (isAdminMode(next)) setMode(next);
        }}
        aria-label="Admin operating mode"
        style={{
          background: "transparent",
          color: isRiskDesk ? "#F59E0B" : "#E5E7EB",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: "0.4rem",
          padding: "0.25rem 0.45rem",
          fontSize: "0.78rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {ADMIN_MODES.map((m) => (
          <option key={m} value={m} style={{ background: "#0F172A", color: "#E5E7EB" }}>
            {MODE_LABELS[m]}
          </option>
        ))}
      </select>
      {isRiskDesk && (
        <span
          style={{
            fontSize: "0.6rem",
            color: "#F59E0B",
            border: "1px solid #F59E0B",
            padding: "0.1rem 0.35rem",
            borderRadius: 4,
            letterSpacing: "0.1em",
            fontWeight: 700,
          }}
        >
          EXPOSURE GATING
        </span>
      )}
    </div>
  );
}
