"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

export default function EmailAlertSettingsSession() {
  const { data: session, status } = useSession();
  const userEmail = session?.user?.email || "";

  const [method, setMethod] = useState<"Email" | "In-App Notifications">("Email");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<null | { ok: boolean; text: string }>(null);

  const disabled = status !== "authenticated" || !userEmail || sending;

  async function sendTest() {
    try {
      setSending(true);
      setMsg(null);
      const res = await fetch("/api/alerts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Market Scanner Test Notification",
          html: `
            <h3>Hello!</h3>
            <p>This is a test notification from your Market Scanner dashboard.</p>
            <p>If you're reading this, your email notifications are configured correctly!</p>
          `,
        }),
      });
      setMsg(
        res.ok
          ? { ok: true, text: "Sent! Check your inbox." }
          : { ok: false, text: "Failed to send. Verify domain + env vars." }
      );
    } catch {
      setMsg({ ok: false, text: "Network error. Try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h4 className="text-base font-semibold mb-3">Price Alert Notifications</h4>

      <div className="space-y-3">
        <label className="block text-sm text-white/70">Your Account Email</label>
        <input
          value={
            status === "loading" ? "Loading…" : userEmail || "Sign in to enable email alerts"
          }
          readOnly
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-white/70 mb-1">Notification Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none"
            >
              <option>Email</option>
              <option>In-App Notifications</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={sendTest}
              disabled={disabled || method !== "Email"}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 text-sm font-medium w-full"
            >
              {sending ? "Sending…" : "Send Test"}
            </button>
          </div>
        </div>

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        )}

        <p className="text-xs text-white/60">
          We don’t store your email. Alerts are sent to your authenticated account email only.
        </p>
      </div>
    </div>
  );
}
