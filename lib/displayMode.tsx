"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// ────────────────────────────────────────────────────
// Display Mode — Retail vs Institutional
//
// One engine, two presentation layers.
// Mode only affects what is displayed and how.
// No change to backend logic, risk governor, or ACL scoring.
// ────────────────────────────────────────────────────

export type DisplayMode = "retail" | "institutional";

interface DisplayModeContext {
  mode: DisplayMode;
  setMode: (m: DisplayMode) => void;
  toggle: () => void;
  isRetail: boolean;
  isInstitutional: boolean;
}

const STORAGE_KEY = "msp_display_mode";
const DEFAULT_MODE: DisplayMode = "retail";

const Ctx = createContext<DisplayModeContext>({
  mode: DEFAULT_MODE,
  setMode: () => {},
  toggle: () => {},
  isRetail: true,
  isInstitutional: false,
});

export function DisplayModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DisplayMode>(DEFAULT_MODE);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "retail" || stored === "institutional") {
        setModeState(stored);
      }
    } catch {
      // SSR or localStorage unavailable
    }
  }, []);

  const setMode = useCallback((m: DisplayMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "retail" ? "institutional" : "retail");
  }, [mode, setMode]);

  const value: DisplayModeContext = {
    mode,
    setMode,
    toggle,
    isRetail: mode === "retail",
    isInstitutional: mode === "institutional",
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Hook to access current display mode. */
export function useDisplayMode(): DisplayModeContext {
  return useContext(Ctx);
}

// ────────────────────────────────────────────────────
// Retail Translation Helpers
//
// Convert internal engine states into retail-friendly language.
// These are pure functions — no side effects, no backend changes.
// ────────────────────────────────────────────────────

/** Map internal authorization status to a retail badge. */
export function retailAuthBadge(
  authorization?: string,
  ru?: number
): { label: string; color: "green" | "yellow" | "red" | "purple"; icon: string } {
  const auth = (authorization || "").toUpperCase();
  if (auth === "BLOCKED" || auth === "DENIED")
    return { label: "Not Recommended", color: "red", icon: "⛔" };
  if (auth === "CONDITIONAL")
    return { label: "Moderate Setup", color: "yellow", icon: "⚠️" };
  if (auth === "AUTHORIZED" || auth === "APPROVED")
    return { label: "Strong Setup", color: "green", icon: "✅" };
  return { label: "Analyzing…", color: "purple", icon: "🔍" };
}

/** Convert raw R-Unit number to a retail-friendly size label. */
export function retailSizeLabel(ru?: number): string {
  if (ru == null || ru <= 0) return "Pass — no allocation";
  if (ru < 0.3) return "Small position only";
  if (ru < 0.6) return "Moderate position";
  if (ru < 0.85) return "Standard position";
  return "Full conviction size";
}

/** Convert data quality score to retail label. */
export function retailDataQuality(score?: number): string {
  if (score == null) return "";
  if (score >= 8) return "High confidence data";
  if (score >= 5) return "Moderate confidence";
  return "Limited data — use caution";
}

/** Convert regime state to retail-friendly description. */
export function retailRegime(regime?: string): {
  label: string;
  description: string;
  color: "green" | "yellow" | "red" | "blue";
} {
  const r = (regime || "").toLowerCase();
  if (r.includes("trend") && r.includes("up"))
    return { label: "Trending Up", description: "Market is moving higher with momentum", color: "green" };
  if (r.includes("trend") && r.includes("down"))
    return { label: "Trending Down", description: "Market is moving lower with momentum", color: "red" };
  if (r.includes("range") || r.includes("neutral"))
    return { label: "Sideways", description: "Market is chopping within a range", color: "yellow" };
  if (r.includes("breakout"))
    return { label: "Breakout", description: "Market is testing new territory", color: "blue" };
  if (r.includes("volatile") || r.includes("expansion"))
    return { label: "High Volatility", description: "Large moves expected — manage size", color: "red" };
  return { label: "Assessing…", description: "Market state being evaluated", color: "yellow" };
}

/** Convert vol state to retail-friendly label. */
export function retailVolState(
  volState?: string
): { label: string; color: "green" | "yellow" | "red" | "blue" } {
  const v = (volState || "").toLowerCase();
  if (v.includes("low") || v.includes("compressed"))
    return { label: "Low", color: "green" };
  if (v.includes("normal") || v.includes("moderate"))
    return { label: "Normal", color: "green" };
  if (v.includes("elevated") || v.includes("expanding"))
    return { label: "Elevated", color: "yellow" };
  if (v.includes("extreme") || v.includes("high"))
    return { label: "Extreme", color: "red" };
  return { label: "Normal", color: "green" };
}

/** Convert session to retail label. */
export function retailSession(
  session?: string
): { label: string; color: "purple" | "green" | "yellow" } {
  const s = (session || "").toLowerCase();
  if (s.includes("pre")) return { label: "Pre-Market", color: "yellow" };
  if (s.includes("power") || s.includes("close"))
    return { label: "Power Hour", color: "purple" };
  if (s.includes("open"))
    return { label: "Market Open", color: "green" };
  if (s.includes("mid") || s.includes("lunch"))
    return { label: "Midday Session", color: "green" };
  if (s.includes("after") || s.includes("post"))
    return { label: "After Hours", color: "yellow" };
  if (s.includes("closed"))
    return { label: "Markets Closed", color: "yellow" };
  return { label: "Active Session", color: "green" };
}

/** Map continuation probability to strength label. */
export function retailSetupStrength(
  probability?: number
): { label: string; level: "weak" | "moderate" | "strong" | "high-conviction"; pct: number } {
  const p = probability ?? 0;
  if (p >= 70) return { label: "High Conviction", level: "high-conviction", pct: p };
  if (p >= 55) return { label: "Strong", level: "strong", pct: p };
  if (p >= 40) return { label: "Moderate", level: "moderate", pct: p };
  return { label: "Weak", level: "weak", pct: p };
}

/** COLOR MAP — consistent badge styling */
export const RETAIL_COLORS = {
  green: { bg: "bg-emerald-500/15", border: "border-emerald-500/40", text: "text-emerald-400", dot: "bg-emerald-400" },
  yellow: { bg: "bg-amber-500/15", border: "border-amber-500/40", text: "text-amber-400", dot: "bg-amber-400" },
  red: { bg: "bg-red-500/15", border: "border-red-500/40", text: "text-red-400", dot: "bg-red-400" },
  purple: { bg: "bg-purple-500/15", border: "border-purple-500/40", text: "text-purple-400", dot: "bg-purple-400" },
  blue: { bg: "bg-blue-500/15", border: "border-blue-500/40", text: "text-blue-400", dot: "bg-blue-400" },
} as const;
