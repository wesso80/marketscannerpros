"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminBoundaryBanner from "@/components/admin/AdminBoundaryBanner";
import AdminCommandPalette from "@/components/admin/AdminCommandPalette";
import { AdminModeProvider, AdminModeSwitcher } from "@/components/admin/AdminModeSwitcher";

// Admin auth context
const AdminContext = createContext<{
  secret: string;
  setSecret: (s: string) => void;
  isAuthed: boolean;
  setIsAuthed: (a: boolean) => void;
}>({
  secret: "",
  setSecret: () => {},
  isAuthed: false,
  setIsAuthed: () => {},
});

export const useAdmin = () => useContext(AdminContext);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [secret, setSecret] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [inputSecret, setInputSecret] = useState("");
  const pathname = usePathname();

  // Check auth on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("admin_secret") || "";
    verifyAuth(stored);
  }, []);

  const verifyAuth = async (key = "") => {
    try {
      const headers = key ? { Authorization: `Bearer ${key}` } : undefined;
      const res = await fetch("/api/admin/verify", { headers });
      if (res.ok) {
        setIsAuthed(true);
        setSecret(key);
        sessionStorage.removeItem("admin_secret");
      } else {
        setIsAuthed(false);
        sessionStorage.removeItem("admin_secret");
      }
    } catch {
      setIsAuthed(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    verifyAuth(inputSecret.trim());
  };

  const handleLogout = async () => {
    await fetch("/api/admin/verify", { method: "DELETE" }).catch(() => null);
    setSecret("");
    setIsAuthed(false);
    sessionStorage.removeItem("admin_secret");
  };

  const navSections = [
    {
      label: "Command",
      items: [
        { href: "/admin", label: "Command Center", code: "CC" },
        { href: "/admin/commander", label: "Commander", code: "CM" },
        { href: "/admin/morning-brief", label: "Morning Brief", code: "MB" },
        { href: "/admin/operator-terminal", label: "Operator Terminal", code: "OT" },
        { href: "/admin/symbol/ADA", label: "Symbol Research", code: "SR" },
        { href: "/admin/terminal/ADA", label: "Symbol Terminal (legacy)", code: "ST" },
        { href: "/operator/engine", label: "Operator Engine", code: "OE" },
      ],
    },
    {
      label: "Markets",
      items: [
        { href: "/admin/opportunity-board", label: "Opportunity Board", code: "OB" },
        { href: "/admin/live-scanner", label: "Live Scanner", code: "LS" },
        { href: "/admin/scalper", label: "Scalper", code: "SC" },
        { href: "/admin/quant", label: "Quant Terminal", code: "QT" },
        { href: "/admin/learning-engine", label: "Learning Engine", code: "LE" },
        { href: "/admin/outcomes", label: "Signal Outcomes", code: "SO" },
        { href: "/admin/priority-desk", label: "Priority Desk", code: "PD" },
        { href: "/admin/research-scheduler", label: "Research Scheduler", code: "RS" },
        { href: "/admin/journal-learning", label: "Journal Learning", code: "JL" },
        { href: "/admin/backtest-lab", label: "Backtest Lab", code: "BL" },
      ],
    },
    {
      label: "ARCA Portfolio Lab",
      items: [
        { href: "/admin/portfolio-lab", label: "ARCA Dashboard", code: "PL" },
        { href: "/admin/portfolio-lab/positions", label: "Open Positions", code: "PP" },
        { href: "/admin/portfolio-lab/orders", label: "Sim Orders", code: "PO" },
        { href: "/admin/portfolio-lab/trades", label: "Closed Trades", code: "PT" },
        { href: "/admin/portfolio-lab/journal", label: "ARCA Journal", code: "PJ" },
        { href: "/admin/portfolio-lab/performance", label: "Performance", code: "PF" },
        { href: "/admin/portfolio-lab/reports", label: "Reports", code: "PR" },
        { href: "/admin/portfolio-lab/edge-packets", label: "Edge Packets", code: "EI" },
      ],
    },
    {
      label: "Research",
      items: [
        { href: "/admin/daily-brief", label: "Daily Brief", code: "DB" },
        { href: "/admin/equity-research", label: "Equity Research", code: "ER" },
        { href: "/admin/earnings-analyzer", label: "Earnings Analyzer", code: "EA" },
        { href: "/admin/sector-rotation", label: "Sector Rotation", code: "SR" },
        { href: "/admin/macro-outlook", label: "Macro Outlook", code: "MO" },
        { href: "/admin/options-architect", label: "Options Architect", code: "OA" },
        { href: "/admin/quant-screener", label: "Quant Screener", code: "QS" },
        { href: "/admin/risk-assessment", label: "Risk Assessment", code: "RA" },
        { href: "/admin/macro-pulse", label: "Macro Pulse", code: "MP" },
        { href: "/admin/insider", label: "Insider Flow", code: "IF" },
        { href: "/admin/transcripts", label: "Transcripts", code: "TS" },
        { href: "/admin/cross-asset", label: "Cross-Asset", code: "CA" },
      ],
    },
    {
      label: "Reports",
      items: [
        { href: "/admin/daily-packet", label: "Daily Packet", code: "DP" },
        { href: "/admin/evening-packet", label: "Evening Packet", code: "EP" },
        { href: "/admin/edge-ledger", label: "Edge Ledger", code: "EL" },
        { href: "/admin/operator-health", label: "Operator Health", code: "OH" },
        { href: "/admin/playbooks", label: "Playbooks", code: "PB" },
        { href: "/admin/pre-trade-checklist", label: "Pre-Trade Checklist", code: "PT" },
        { href: "/admin/universe", label: "Universe", code: "UV" },
        { href: "/admin/analogues", label: "Analogues", code: "AN" },
        { href: "/admin/ml-scorer", label: "ML Scorer", code: "ML" },
        { href: "/admin/packet-replay", label: "Packet Replay", code: "PR" },
        { href: "/admin/engine-health", label: "Engine Health", code: "EH" },
      ],
    },
    {
      label: "Risk & Alerts",
      items: [
        { href: "/admin/risk", label: "Risk Governor", code: "RG" },
        { href: "/admin/alerts", label: "Alerts", code: "AL" },
        { href: "/admin/discord-bridge", label: "Discord Bridge", code: "DX" },
        { href: "/admin/reporting", label: "Nasdaq Reporting", code: "NR" },
      ],
    },
    {
      label: "Business",
      items: [
        { href: "/admin/growth-commander", label: "Growth Centre", code: "GC" },
        { href: "/admin/usage-analytics", label: "Usage Analytics", code: "UA" },
        { href: "/admin/income", label: "Income", code: "IN" },
        { href: "/admin/costs", label: "AI Costs", code: "AC" },
        { href: "/admin/subscriptions", label: "Subscriptions", code: "SB" },
        { href: "/admin/ai-usage", label: "AI Usage", code: "AI" },
        { href: "/admin/trials", label: "Trials", code: "TR" },
        { href: "/admin/delete-requests", label: "Delete Requests", code: "DR" },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/data-health", label: "Data Health", code: "DH" },
        { href: "/admin/model-diagnostics", label: "Model Diagnostics", code: "MD" },
        { href: "/admin/diagnostics", label: "Diagnostics (legacy)", code: "DX" },
        { href: "/admin/system", label: "System (legacy)", code: "SY" },
        { href: "/admin/logs", label: "Logs", code: "LG" },
        { href: "/admin/settings", label: "Settings", code: "SE" },
      ],
    },
  ];

  const isActiveRoute = (href: string) =>
    pathname === href ||
    (href !== "/admin" && pathname?.startsWith(href)) ||
    (href.startsWith("/admin/terminal/") && pathname?.startsWith("/admin/terminal/"));

  if (!isAuthed) {
    return (
      <main style={{
        minHeight: "100vh",
        background: "var(--msp-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}>
        <form onSubmit={handleLogin} style={{
          background: "rgba(17, 24, 39, 0.8)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          borderRadius: "1rem",
          padding: "2rem",
          maxWidth: "400px",
          width: "100%",
        }}>
          <h1 style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#10B981",
            marginBottom: "1.5rem",
            textAlign: "center",
          }}>Private Operator Login</h1>
          <input
            type="password"
            placeholder="Enter admin secret"
            value={inputSecret}
            onChange={(e) => setInputSecret(e.target.value)}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.5rem",
              color: "#E5E7EB",
              marginBottom: "1rem",
            }}
          />
          <button type="submit" style={{
            width: "100%",
            padding: "0.75rem",
            background: "var(--msp-accent)",
            border: "none",
            borderRadius: "0.5rem",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}>
            Login
          </button>
        </form>
      </main>
    );
  }

  return (
    <AdminContext.Provider value={{ secret, setSecret, isAuthed, setIsAuthed }}>
      <AdminModeProvider>
      <div style={{
        minHeight: "100vh",
        background: "var(--msp-bg)",
        display: "flex",
      }}>
        {/* Sidebar */}
        <aside style={{
          width: "268px",
          background: "rgba(17, 24, 39, 0.95)",
          borderRight: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "1.25rem 0.85rem",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}>
          <div style={{
            fontSize: "1.15rem",
            fontWeight: 700,
            color: "#E5E7EB",
            marginBottom: "1.5rem",
            padding: "0 0.5rem",
          }}>
            <div style={{ color: "#10B981" }}>MSP Operator</div>
            <div style={{ color: "#64748B", fontSize: "0.72rem", letterSpacing: "0.16em", textTransform: "uppercase", marginTop: "0.25rem" }}>
              Private desk
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <AdminModeSwitcher compact />
            </div>
          </div>
          
          <nav style={{ flex: 1 }}>
            {navSections.map((section) => (
              <div key={section.label} style={{ marginBottom: "1rem" }}>
                <div style={{
                  color: "#64748B",
                  fontSize: "0.68rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  padding: "0 0.6rem",
                  marginBottom: "0.4rem",
                  fontWeight: 800,
                }}>
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const active = isActiveRoute(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.65rem",
                        padding: "0.58rem 0.65rem",
                        borderRadius: "0.5rem",
                        color: active ? "#10B981" : "#9CA3AF",
                        background: active ? "rgba(16, 185, 129, 0.1)" : "transparent",
                        border: active ? "1px solid rgba(16,185,129,0.22)" : "1px solid transparent",
                        textDecoration: "none",
                        marginBottom: "0.18rem",
                        transition: "all 0.2s",
                        fontSize: "0.88rem",
                      }}
                    >
                      <span style={{
                        minWidth: 28,
                        textAlign: "center",
                        color: active ? "#0F172A" : "#94A3B8",
                        background: active ? "#10B981" : "rgba(148,163,184,0.12)",
                        borderRadius: 6,
                        padding: "0.16rem 0.22rem",
                        fontSize: "0.62rem",
                        fontWeight: 900,
                      }}>{item.code}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "0.5rem",
              color: "#F87171",
              cursor: "pointer",
              marginTop: "auto",
            }}
          >
              Logout
          </button>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
          <AdminBoundaryBanner />
          <div style={{ padding: "1.5rem 2rem 2rem", flex: 1 }}>
            {children}
          </div>
        </main>
      </div>
      <AdminCommandPalette />
      </AdminModeProvider>
    </AdminContext.Provider>
  );
}
