"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
    const stored = sessionStorage.getItem("admin_secret");
    if (stored) {
      setSecret(stored);
      verifyAuth(stored);
    }
  }, []);

  const verifyAuth = async (key: string) => {
    try {
      const res = await fetch("/api/admin/verify", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        setIsAuthed(true);
        setSecret(key);
        sessionStorage.setItem("admin_secret", key);
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
    verifyAuth(inputSecret);
  };

  const handleLogout = () => {
    setSecret("");
    setIsAuthed(false);
    sessionStorage.removeItem("admin_secret");
  };

  const navItems = [
    { href: "/admin", label: "Overview", icon: "📊" },
    { href: "/admin/usage-analytics", label: "Usage Analytics", icon: "📈" },
    { href: "/admin/income", label: "Income", icon: "💵" },
    { href: "/admin/costs", label: "AI Costs", icon: "💰" },
    { href: "/admin/subscriptions", label: "Subscriptions", icon: "💳" },
    { href: "/admin/ai-usage", label: "AI Usage", icon: "🤖" },
    { href: "/admin/trials", label: "Trials", icon: "🎁" },
    { href: "/admin/delete-requests", label: "Delete Requests", icon: "🗑️" },
    { href: "/admin/reporting", label: "Nasdaq Reporting", icon: "📋" },
    { href: "/admin/quant", label: "Quant Terminal", icon: "🧠" },
    { href: "/operator/engine", label: "Operator Engine", icon: "⚡" },
    { href: "/admin/discord-bridge", label: "Discord Bridge", icon: "📡" },
    // ── Operator Terminal ──
    { href: "/admin/operator-terminal", label: "Operator Terminal", icon: "🖥️" },
    { href: "/admin/terminal/ADA", label: "Symbol Terminal", icon: "🔬" },
    { href: "/admin/live-scanner", label: "Live Scanner", icon: "📡" },
    { href: "/admin/risk", label: "Risk Governor", icon: "🛡️" },
    { href: "/admin/diagnostics", label: "Diagnostics", icon: "🩺" },
    { href: "/admin/system", label: "System", icon: "⚙️" },
    { href: "/admin/logs", label: "Logs", icon: "📜" },
    { href: "/admin/alerts", label: "Alerts", icon: "🔔" },
    { href: "/admin/settings", label: "Settings", icon: "🔧" },
  ];

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
          }}>🔐 Admin Login</h1>
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
      <div style={{
        minHeight: "100vh",
        background: "var(--msp-bg)",
        display: "flex",
      }}>
        {/* Sidebar */}
        <aside style={{
          width: "240px",
          background: "rgba(17, 24, 39, 0.95)",
          borderRight: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "1.5rem 1rem",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "#10B981",
            marginBottom: "2rem",
            padding: "0 0.5rem",
          }}>
            ⚙️ Admin Panel
          </div>
          
          <nav style={{ flex: 1 }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  color: (pathname === item.href || (item.href.startsWith("/admin/terminal/") && pathname?.startsWith("/admin/terminal/"))) ? "#10B981" : "#9CA3AF",
                  background: (pathname === item.href || (item.href.startsWith("/admin/terminal/") && pathname?.startsWith("/admin/terminal/"))) ? "rgba(16, 185, 129, 0.1)" : "transparent",
                  textDecoration: "none",
                  marginBottom: "0.25rem",
                  transition: "all 0.2s",
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
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
            🚪 Logout
          </button>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: "2rem", overflow: "auto" }}>
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
