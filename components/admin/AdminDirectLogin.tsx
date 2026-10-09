"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type StatusState = { tone: "idle" | "loading" | "success" | "error"; text: string };

/** Same passphrase login the public auth page used to show. Posts to the existing admin-login route. */
export default function AdminDirectLogin() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [adminStatus, setAdminStatus] = useState<StatusState>({ tone: "idle", text: "" });
  const [adminLoading, setAdminLoading] = useState(false);

  const handleAdminLogin = async () => {
    if (!adminEmail || !passphrase) {
      setAdminStatus({ tone: "error", text: "Enter email and passphrase." });
      return;
    }
    setAdminLoading(true);
    setAdminStatus({ tone: "loading", text: "Authenticating..." });
    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: adminEmail, passphrase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminStatus({ tone: "error", text: data?.error || "Authentication failed." });
        return;
      }
      setAdminStatus({ tone: "success", text: "Admin access granted. Redirecting..." });
      setTimeout(() => router.push("/tools/command-center"), 600);
    } catch {
      setAdminStatus({ tone: "error", text: "Network error." });
    } finally {
      setAdminLoading(false);
    }
  };

  const toneClass =
    adminStatus.tone === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
      : adminStatus.tone === "success"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-white/70";

  return (
    <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
        <span>🛡️</span> Admin Direct Login
      </div>
      {adminStatus.tone !== "idle" && (
        <div className={`mt-3 rounded-2xl border p-3 text-xs ${toneClass}`}>{adminStatus.text}</div>
      )}
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => { e.preventDefault(); void handleAdminLogin(); }}
      >
        <input
          type="email"
          aria-label="Admin email"
          autoComplete="username"
          placeholder="Admin email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0B1222] px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40"
        />
        <input
          type="password"
          aria-label="Passphrase"
          autoComplete="current-password"
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0B1222] px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40"
        />
        <button
          type="submit"
          disabled={adminLoading}
          className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {adminLoading ? "Authenticating..." : "Admin Sign In"}
        </button>
      </form>
    </div>
  );
}
