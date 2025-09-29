"use client";
import { useSession } from "next-auth/react";
import { useState } from "react";

export default function EmailAlertSettingsSession() {
  const { data: session, status } = useSession();
  const userEmail = session?.user?.email || "";
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function sendTest() {
    setSending(true); setMsg("");
    try {
      const res = await fetch("/api/alerts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "MarketScanner Test",
          html: "<p>Your email alerts are working ✅</p>",
        }),
      });
      setMsg(res.ok ? "Sent! Check your inbox." : "Failed. Verify domain/env.");
    } catch { setMsg("Network error."); }
    finally { setSending(false); }
  }

  const disabled = status !== "authenticated" || !userEmail || sending;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h4 className="text-base font-semibold mb-3">Price Alert Notifications</h4>
      <label className="block text-sm text-white/70 mb-1">Your Account Email</label>
      <input
        readOnly
        value={status === "loading" ? "Loading…" : userEmail || "Sign in to enable email alerts"}
        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
      />
      <div className="mt-3">
        <button
          onClick={sendTest}
          disabled={disabled}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 text-sm font-medium"
        >
          {sending ? "Sending…" : "Send Test"}
        </button>
      </div>
      {msg && <p className="text-sm mt-2">{msg}</p>}
      <p className="text-xs text-white/60 mt-2">
        We don’t store emails. Alerts send to your authenticated account email only.
      </p>
    </div>
  );
}
