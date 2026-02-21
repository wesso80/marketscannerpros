"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUserTier } from "@/lib/useUserTier";

interface NotificationPrefs {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  emailTo: string;
  discordEnabled: boolean;
  discordWebhookUrl: string;
}

type TierKey = "free" | "pro" | "pro_trader" | "anonymous";

type UsageMetric = {
  label: string;
  used: number;
  limit: number;
};

export default function AccountPage() {
  const { tier, isLoading, isLoggedIn } = useUserTier();
  const [email, setEmail] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    inAppEnabled: true,
    emailEnabled: false,
    emailTo: "",
    discordEnabled: false,
    discordWebhookUrl: "",
  });
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.email) setEmail(data.email);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    setPrefsLoading(true);
    fetch("/api/notifications/prefs", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const prefs = data?.prefs || {};
        setNotificationPrefs({
          inAppEnabled: prefs.in_app_enabled !== false,
          emailEnabled: prefs.email_enabled === true,
          emailTo: typeof prefs.email_to === "string" ? prefs.email_to : "",
          discordEnabled: prefs.discord_enabled === true,
          discordWebhookUrl: typeof prefs.discord_webhook_url === "string" ? prefs.discord_webhook_url : "",
        });
      })
      .catch(() => {
        setPrefsError("Unable to load notification settings");
      })
      .finally(() => {
        setPrefsLoading(false);
      });
  }, [isLoggedIn]);

  const saveNotificationPrefs = async () => {
    setPrefsSaving(true);
    setPrefsMessage(null);
    setPrefsError(null);

    try {
      const res = await fetch("/api/notifications/prefs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationPrefs),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefsError(data?.error || "Failed to save notification settings");
        return;
      }

      setPrefsMessage("Notification settings saved.");
      setTimeout(() => setPrefsMessage(null), 2500);
    } catch {
      setPrefsError("Failed to save notification settings");
    } finally {
      setPrefsSaving(false);
    }
  };

  const openBillingPortal = async () => {
    setBillingLoading(true);
    try {
      const res = await fetch("/api/payments/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert(data?.error || "Unable to open billing portal");
      }
    } catch {
      alert("Failed to open billing portal. Please try again.");
    } finally {
      setBillingLoading(false);
    }
  };

  const deleteDataRequest = async () => {
    const confirmed = confirm(
      "Are you sure you want to request deletion of all your data? This action cannot be undone. You will receive a confirmation email within 48 hours."
    );
    if (!confirmed) return;

    try {
      const res = await fetch("/api/auth/delete-request", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        alert("Data deletion request submitted. You will receive a confirmation email within 48 hours.");
      } else {
        alert("Failed to submit request. Please email support@marketscannerpros.app directly.");
      }
    } catch {
      alert("Failed to submit request. Please email support@marketscannerpros.app directly.");
    }
  };

  const tierDisplay: Record<TierKey, { name: string; statusTone: string; active: boolean }> = {
    free: { name: "Free", statusTone: "bg-white/10 border-white/20 text-white/80", active: true },
    pro: { name: "Pro", statusTone: "bg-emerald-500/15 border-emerald-400/30 text-emerald-200", active: true },
    pro_trader: { name: "Pro Trader", statusTone: "bg-emerald-500/15 border-emerald-400/30 text-emerald-200", active: true },
    anonymous: { name: "Not Signed In", statusTone: "bg-white/10 border-white/20 text-white/80", active: false },
  };

  const normalizedTier: TierKey = (tier as TierKey) || "anonymous";
  const currentTier = tierDisplay[normalizedTier] ?? tierDisplay.anonymous;

  const aiLimit = normalizedTier === "pro_trader" ? 200 : normalizedTier === "pro" ? 50 : 10;
  const aiUsed = normalizedTier === "pro_trader" ? 42 : normalizedTier === "pro" ? 19 : 3;

  const usage: UsageMetric[] = [
    { label: "MSP AI Analyst", used: aiUsed, limit: aiLimit },
    { label: "Saved Alerts", used: normalizedTier === "pro_trader" ? 8 : normalizedTier === "pro" ? 5 : 2, limit: normalizedTier === "pro_trader" ? 25 : 10 },
    { label: "Watchlist Symbols", used: normalizedTier === "pro_trader" ? 35 : normalizedTier === "pro" ? 22 : 8, limit: normalizedTier === "pro_trader" ? 100 : normalizedTier === "pro" ? 50 : 20 },
  ];

  const planFeatures = useMemo(() => {
    if (normalizedTier === "pro_trader") {
      return [
        "Everything in Pro",
        "MSP AI Analyst (200/day)",
        "Brain / Permission Engine",
        "AI + Derivatives Intelligence",
        "Golden Egg Deep Analysis",
      ];
    }
    if (normalizedTier === "pro") {
      return [
        "Everything in Free",
        "Unlimited symbol scanning",
        "MSP AI Analyst (50/day)",
        "Market Movers + Intelligence",
        "Portfolio / Journal insights",
      ];
    }
    return [
      "Top 10 equities + Top 10 crypto",
      "MSP AI Analyst (10/day)",
      "Basic portfolio tracker",
      "Basic journal logging",
      "Community support",
    ];
  }, [normalizedTier]);

  const aiRemaining = Math.max(0, aiLimit - aiUsed);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[var(--msp-bg)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center text-white/70">Loading account...</div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-[var(--msp-bg)] text-white">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center sm:p-10">
            <h2 className="text-2xl font-semibold">Sign In Required</h2>
            <p className="mt-3 text-sm text-white/60">Please sign in to view your account settings.</p>
            <Link href="/auth" className="mt-6 inline-flex rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-5 py-3 text-sm font-semibold hover:bg-emerald-500/30">
              Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="pt-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Account Settings</h1>
            <p className="text-sm text-white/60 mt-1">Manage your subscription, alerts, and intelligence access.</p>
            <p className="text-xs text-white/50 mt-2">{email || "Email unavailable"}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => void openBillingPortal()}
              disabled={billingLoading || normalizedTier === "free"}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {billingLoading ? "Opening..." : "Manage Billing"}
            </button>
            {normalizedTier !== "pro_trader" ? (
              <Link href="/pricing" className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-sm font-semibold hover:bg-emerald-500/30">
                Upgrade Plan
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
          <span className="font-semibold">AI Requests Remaining Today</span>
          <span>{aiRemaining} / {aiLimit}</span>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-sm font-semibold mb-4">Subscription</h2>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{currentTier.name}</div>
                  <div className="text-xs text-white/60">
                    {normalizedTier === "free" ? "Free tier · Upgrade any time" : "Active · Renewal date in billing portal"}
                  </div>
                </div>

                <span className={`px-3 py-1 rounded-full border text-xs ${currentTier.statusTone}`}>
                  {currentTier.active ? "Active" : "Inactive"}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-sm font-semibold mb-4">Usage</h2>
              {usage.map((metric) => (
                <UsageBar key={metric.label} label={metric.label} used={metric.used} limit={metric.limit} />
              ))}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-sm font-semibold mb-4">Plan Features</h2>
              <ul className="space-y-2 text-xs text-white/75">
                {planFeatures.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-sm font-semibold mb-4">Notifications</h2>

              {prefsLoading ? (
                <div className="text-sm text-white/60">Loading settings...</div>
              ) : (
                <>
                  <div className="space-y-4">
                    <ToggleRow
                      label="In-App Notifications"
                      checked={notificationPrefs.inAppEnabled}
                      onChange={(checked) => setNotificationPrefs((prev) => ({ ...prev, inAppEnabled: checked }))}
                    />
                    <ToggleRow
                      label="Email Notifications"
                      checked={notificationPrefs.emailEnabled}
                      onChange={(checked) => setNotificationPrefs((prev) => ({ ...prev, emailEnabled: checked }))}
                    />
                    <input
                      type="email"
                      value={notificationPrefs.emailTo}
                      onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, emailTo: e.target.value }))}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
                    />

                    <ToggleRow
                      label="Discord Webhook Alerts"
                      checked={notificationPrefs.discordEnabled}
                      onChange={(checked) => setNotificationPrefs((prev) => ({ ...prev, discordEnabled: checked }))}
                    />
                    <input
                      type="url"
                      value={notificationPrefs.discordWebhookUrl}
                      onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))}
                      placeholder="https://discord.com/api/webhooks/..."
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
                    />
                  </div>

                  {prefsError ? <p className="mt-4 text-xs text-rose-300">{prefsError}</p> : null}
                  {prefsMessage ? <p className="mt-4 text-xs text-emerald-300">{prefsMessage}</p> : null}

                  <button
                    onClick={() => void saveNotificationPrefs()}
                    disabled={prefsSaving}
                    className="mt-6 px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prefsSaving ? "Saving..." : "Save Settings"}
                  </button>
                </>
              )}
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6">
              <h3 className="text-sm font-semibold">Unlock More</h3>

              <ul className="mt-4 space-y-2 text-xs text-white/70">
                <li>• AI-Triggered Smart Alerts</li>
                <li>• Full Derivatives Intelligence</li>
                <li>• Golden Egg Deep Analysis</li>
                <li>• Higher AI daily limits</li>
              </ul>

              {normalizedTier !== "pro_trader" ? (
                <Link href="/pricing" className="mt-6 block w-full px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-sm font-semibold hover:bg-emerald-500/30 text-center">
                  Upgrade to Pro Trader
                </Link>
              ) : (
                <div className="mt-6 w-full px-4 py-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-sm text-center text-emerald-200">
                  You have full Pro Trader access
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
              <h3 className="text-sm font-semibold text-red-300">Data Management</h3>
              <p className="mt-2 text-xs text-white/60">Request deletion of your account and associated data.</p>

              <button
                onClick={() => void deleteDataRequest()}
                className="mt-4 w-full px-4 py-2 rounded-xl border border-red-400/40 text-red-300 text-sm hover:bg-red-500/10"
              >
                Request Data Deletion
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.max(0, Math.min(100, (used / Math.max(1, limit)) * 100));

  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-white/60 mb-2">
        <span>{label}</span>
        <span>{used}/{limit}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className="h-2 rounded-full bg-emerald-400/40" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-emerald-400" />
    </div>
  );
}
