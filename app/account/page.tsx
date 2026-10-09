"use client";

import studio from '@/components/public-design/AccountStudio.module.css';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import ReferralCard from '@/components/account/ReferralCard';
import { getDailyAiLimit } from '@/lib/entitlements';
import { ALERT_LIMITS } from '@/lib/alerts/planLimits';
import { WATCHLIST_LIMITS } from '@/lib/tiers';
import { FREE_COPY } from '@/components/free/copy';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUserTier } from "@/lib/useUserTier";

interface NotificationPrefs {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  emailTo: string;
  discordEnabled: boolean;
  discordWebhookUrl: string;
  alertEmailMode: "digest" | "each" | "off";
}

type TierKey = "free" | "pro" | "pro_trader" | "anonymous";

type UsageMetric = {
  label: string;
  used: number | null;
  limit: number | null;
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
    alertEmailMode: "digest",
  });
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [realUsage, setRealUsage] = useState<{ aiUsed: number | null; alertCount: number | null; watchlistCount: number | null } | null>(null);

  const [aiPolicy, setAiPolicy] = useState<{label:string;limit:number|null}>({label:'MSP Copilot',limit:null});
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.email) setEmail(data.email);
      })
      .catch(() => {});
  }, []);

  // Fetch real usage data instead of hardcoded values
  useEffect(() => {
    if (!isLoggedIn) return;
    Promise.all([
      (async () => {
        // Read the active server policy; never show the old Analyst allowance for public Copilot.
        try {
          const response=await fetch('/api/public-usage',{credentials:'include',cache:'no-store'});
          if(!response.ok)return null;
          const policy=await response.json();
          if(policy.enabled===true && policy.bypass!==true){
            const quota=policy.quotas?.find((item:{kind:string})=>item.kind==='ai');
            const limit=typeof quota?.limit==='number'&&Number.isFinite(quota.limit)&&quota.limit>=0?quota.limit:null;
            const validCount=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0;
            const used=validCount(quota?.completed)&&validCount(quota?.pending)?quota.completed+quota.pending:null;
            setAiPolicy({label:'MSP Copilot',limit});return used;
          }
          if(policy.enabled!==false && policy.bypass!==true)return null;
          setAiPolicy({label:'MSP AI Analyst',limit:getDailyAiLimit(tier)});
        } catch {return null;}
        // Retain the legacy policy only when the server explicitly selects it.
        try {
          const res = await fetch("/api/entitlements", { credentials: "include" });
          if (res.ok) { const d = await res.json(); return typeof d?.aiUsedToday === "number" && Number.isFinite(d.aiUsedToday) && d.aiUsedToday >= 0 ? d.aiUsedToday : null; }
        } catch {}
        return null;
      })(),
      fetch("/api/alerts", { credentials: "include" }).then(async (res) => {
        if (res.ok) { const d = await res.json(); return typeof d?.quota?.used === "number" ? d.quota.used : null; }
        return null;
      }).catch(() => null),
      fetch("/api/watchlists", { credentials: "include" }).then(async (res) => {
        if (res.ok) {
          const d = await res.json();
          return Array.isArray(d?.watchlists) ? d.watchlists.length : null;
        }
        return null;
      }).catch(() => null),
    ]).then(([aiUsed, alertCount, watchlistCount]) => {
      setRealUsage({ aiUsed, alertCount, watchlistCount });
      setLoadedAt(new Date().toISOString());
    });
  }, [isLoggedIn, tier]);

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
          alertEmailMode: prefs.alert_email_mode === "each" || prefs.alert_email_mode === "off" ? prefs.alert_email_mode : "digest",
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

  // 2026 pricing simplification: legacy pro_trader tier is displayed as "Pro"
  // to match the single-Pro-plan customer-facing model; entitlements remain full.
  const tierDisplay: Record<TierKey, { name: string; statusTone: string; active: boolean }> = {
    free: { name: "Free", statusTone: "bg-white/10 border-white/20 text-white/80", active: true },
    pro: { name: "Pro", statusTone: "bg-emerald-500/15 border-emerald-400/30 text-emerald-200", active: true },
    pro_trader: { name: "Pro", statusTone: "bg-emerald-500/15 border-emerald-400/30 text-emerald-200", active: true },
    anonymous: { name: "Not Signed In", statusTone: "bg-white/10 border-white/20 text-white/80", active: false },
  };

  const normalizedTier: TierKey = (tier as TierKey) || "anonymous";
  const currentTier = tierDisplay[normalizedTier] ?? tierDisplay.anonymous;
  const isPaid = normalizedTier === "pro" || normalizedTier === "pro_trader";

  const aiLimit = aiPolicy.limit;
  const aiUsed = realUsage?.aiUsed ?? null;

  const usage: UsageMetric[] = [
    { label: aiPolicy.label, used: aiUsed, limit: aiLimit },
    { label: "Saved Alerts", used: realUsage?.alertCount ?? null, limit: isPaid ? ALERT_LIMITS.pro : ALERT_LIMITS.free },
    { label: "Watchlists", used: realUsage?.watchlistCount ?? null, limit: isPaid ? WATCHLIST_LIMITS.pro.watchlists : WATCHLIST_LIMITS.free.watchlists },
  ];

  const planFeatures = useMemo(() => {
    if (isPaid) {
      return [
        "Unlimited Symbol reports",
        "20 AI questions a day",
        "Macro liquidity research (Global M2, liquidity transmission, market fragility)",
        "Historical backtesting (hypothetical, for learning)",
        "Options and derivatives tools",
        "Unlimited open portfolio positions and journal entries",
        "Options research, exports, and stored M2 history",
      ];
    }
    return [
      FREE_COPY.pricing.scans,
      "Watchlists, markets and macro dashboards",
      FREE_COPY.pricing.macro,
      FREE_COPY.pricing.journal,
      "Educational content and platform guides",
    ];
  }, [isPaid]);


  if (isLoading) {
    return (
      <main className={studio.page}>
        <div className="mx-auto max-w-6xl px-4 py-20 text-center text-white/70">Loading account...</div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className={studio.page}>
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
    <main className={studio.page}>
      <div className="mx-auto max-w-4xl px-4 pb-8">
        <div className={studio.header}>
          <div>
            <p className={studio.eyebrow}>YOUR WORKSPACE / ACCOUNT</p><h1>Account settings</h1>
            <p className="text-sm text-white/60 mt-1">Manage your subscription, alerts, and intelligence access.</p>
            <p className="text-xs text-white/50 mt-2">{email || "Email not collected"}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void openBillingPortal()}
              disabled={billingLoading || normalizedTier === "free"}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {billingLoading ? "Opening..." : "Manage Billing"}
            </button>
            {!isPaid ? (
              <Link href="/pricing" className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-sm font-semibold hover:bg-emerald-500/30">
                Upgrade Plan
              </Link>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/';
              }}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 text-sm hover:bg-white/10"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
            <p data-account-verdict className="text-sm text-white/80">Your {currentTier.name} account settings.</p>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">


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

            <section aria-label="Account usage" className="rounded-xl border border-white/10 p-3">
              <div className={studio.usage}>
                {usage.map(metric => <UsageRing key={metric.label} {...metric} />)}
              </div>
              {realUsage && usage.some(metric => metric.used === null) ? <p className="mt-2 text-xs text-amber-300">Some usage counts were not collected.</p> : null}
              <p className="mt-2 text-xs text-white/60">{isPaid ? `${WATCHLIST_LIMITS.pro.watchlists} × ${WATCHLIST_LIMITS.pro.items}` : FREE_COPY.pricing.watchlists}</p>
            </section>
            <CollapsibleSection title="Plan Features" summary={`${planFeatures.length} features`}>
              <ul className="space-y-2 text-xs text-white/75">
                {planFeatures.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
            </CollapsibleSection>

            <CollapsibleSection title="Notifications" summary={prefsLoading ? "Loading settings" : "Email, app and Discord"}>

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

                    <label htmlFor="alert-email-mode" className="block text-xs text-white/70">Alert emails</label>
                    <select
                      id="alert-email-mode"
                      value={notificationPrefs.alertEmailMode}
                      onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, alertEmailMode: e.target.value as NotificationPrefs["alertEmailMode"] }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    >
                      <option value="digest">Daily summary</option>
                      <option value="each">Each alert (up to the daily cap)</option>
                      <option value="off">Off</option>
                    </select>
                    <p className="text-xs text-white/50">Daily summary is the default. Alerts still show in the app. Off stops alert and summary emails only.</p>

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
                    type="button"
                    onClick={() => void saveNotificationPrefs()}
                    disabled={prefsSaving}
                    className="mt-6 px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prefsSaving ? "Saving..." : "Save Settings"}
                  </button>
                </>
              )}
            </CollapsibleSection>
            {!isPaid ? (
            <CollapsibleSection title="Unlock More">

              <ul className="mt-4 space-y-2 text-xs text-white/70">
                <li>• AI-Triggered Smart Alerts</li>
                <li>• Full Derivatives Intelligence</li>
                <li>• Symbol Deep Analysis</li>
                <li>• Higher AI daily limits</li>
              </ul>

              {!isPaid ? (
                <Link href="/pricing" className="mt-6 block w-full px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-sm font-semibold hover:bg-emerald-500/30 text-center">
                  Upgrade to Pro
                </Link>
              ) : (
                <div className="mt-6 w-full px-4 py-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-sm text-center text-emerald-200">
                  You have full Pro access
                </div>
              )}
            </CollapsibleSection>
            ) : null}
            <ReferralCard />
            <CollapsibleSection title="Data Management" summary="Account data">
            <CollapsibleSection title="Danger zone">
              <p className="mt-2 text-xs text-white/60">Request deletion of your account and associated data.</p>

              <button
                type="button"
                onClick={() => void deleteDataRequest()}
                className="mt-4 w-full px-4 py-2 rounded-xl border border-red-400/40 text-red-300 text-sm hover:bg-red-500/10"
              >
                Request Data Deletion
              </button>
            </CollapsibleSection>
            </CollapsibleSection>
            <SourceLine source="Account and saved usage records" asOf={loadedAt} basis="Page load time; counts may arrive separately" />
        </div>
      </div>
    </main>
  );
}

function UsageRing({ label, used, limit }: UsageMetric) {
  const pct = used === null || limit === null ? 0 : Math.max(0, Math.min(100, used / Math.max(1, limit) * 100));
  return <div className="min-w-0 text-center" data-usage-ring>
    <svg viewBox="0 0 80 80" className="mx-auto h-16 w-16" aria-hidden="true">
      <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" className="text-white/10" strokeWidth="6" />
      {used !== null && <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" className={pct >= 90 ? 'text-amber-400' : 'text-white/60'} strokeWidth="6" pathLength="100" strokeDasharray={`${pct} 100`} transform="rotate(-90 40 40)" />}
    </svg>
    <p className="text-xs font-semibold">{label}</p>
    <p className="mt-1 text-xs text-white/70">{used === null || limit === null ? 'Not collected' : `${used.toLocaleString()} / ${limit.toLocaleString()}`}</p>
    {used === null && limit !== null && <p className="text-xs text-white/50">Limit {limit.toLocaleString()}</p>}
  </div>;
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
