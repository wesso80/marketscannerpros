"use client";
import { useSession } from "next-auth/react";
import { useState } from "react";

export default function EmailAlertSettingsSession() {
  const { data, status } = useSession();
  const email = data?.user?.email || "";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function sendTest() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/alerts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "Test", html: "<p>Alerts working ✅</p>" }),
      });
      setMsg(r.ok ? "Sent! Check inbox." : "Failed. Verify domain/env.");
    } catch { setMsg("Network error."); }
    setBusy(false);
  }

  return (
    <div className="p-4 rounded-lg border border-white/10 bg-white/5">
      <div className="text-sm mb-2">Email: {status === "loading" ? "…" : (email || "Sign in")}</div>
      <button
        onClick={sendTest}
        disabled={busy || !email}
        className="px-4 py-2 text-sm rounded bg-emerald-600 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send Test"}
      </button>
      {msg && <div className="text-sm mt-2">{msg}</div>}
      <p className="text-xs text-white/60 mt-2">No emails are stored; sent to your session email only.</p>
    </div>
  );
}
