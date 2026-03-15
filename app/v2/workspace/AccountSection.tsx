'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   V2 Account Section — Embedded in Workspace Settings tab
   Combines: Subscription, Usage, Notifications, Billing, Referrals, Data Mgmt
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Card, Badge, SectionHeader, ScoreBar } from '../_components/ui';
import { useUserTier } from '@/lib/useUserTier';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPrefs {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  emailTo: string;
  discordEnabled: boolean;
  discordWebhookUrl: string;
}

type TierKey = 'free' | 'pro' | 'pro_trader' | 'anonymous';

interface ReferralDashboard {
  referralCode: string;
  referralUrl: string;
  stats: {
    clicks: number;
    signups: number;
    conversions: number;
    creditsEarned: number;
    contestEntries: number;
    nextEntryProgress: number;
  };
  history: {
    email: string;
    status: string;
    date: string;
    convertedAt: string | null;
    plan: string | null;
    credit: number;
  }[];
  leaderboard: {
    rank: number;
    label: string;
    referrals: number;
    isYou: boolean;
  }[];
  contest: {
    period: string;
    drawDate: string;
    prizePool: string;
    yourEntries: number;
    totalEntries: number;
  };
}

// ─── Sub-tab navigation ──────────────────────────────────────────────────────

const SUB_TABS = ['Overview', 'Notifications', 'Referrals'] as const;
type SubTab = typeof SUB_TABS[number];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AccountSection() {
  const { tier, isLoading, isLoggedIn, email: tierEmail } = useUserTier();
  const [subTab, setSubTab] = useState<SubTab>('Overview');
  const [email, setEmail] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  // Notification state
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    inAppEnabled: true,
    emailEnabled: false,
    emailTo: '',
    discordEnabled: false,
    discordWebhookUrl: '',
  });
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  // Usage state
  const [realUsage, setRealUsage] = useState<{ aiUsed: number; alertCount: number; watchlistCount: number } | null>(null);

  // Referral state
  const [referralData, setReferralData] = useState<ReferralDashboard | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const normalizedTier: TierKey = (tier as TierKey) || 'anonymous';

  // ─── Fetch email ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (tierEmail) { setEmail(tierEmail); return; }
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d?.email) setEmail(d.email); })
      .catch(() => {});
  }, [tierEmail]);

  // ─── Fetch usage ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    Promise.all([
      fetch('/api/entitlements', { credentials: 'include' })
        .then(async r => { if (r.ok) { const d = await r.json(); return d?.aiUsedToday ?? 0; } return 0; })
        .catch(() => 0),
      fetch('/api/alerts', { credentials: 'include' })
        .then(async r => { if (r.ok) { const d = await r.json(); return Array.isArray(d?.alerts) ? d.alerts.length : 0; } return 0; })
        .catch(() => 0),
      fetch('/api/watchlists', { credentials: 'include' })
        .then(async r => {
          if (r.ok) {
            const d = await r.json();
            const lists = Array.isArray(d?.watchlists) ? d.watchlists : [];
            return lists.reduce((sum: number, w: { items?: unknown[] }) => sum + (Array.isArray(w?.items) ? w.items.length : 0), 0);
          }
          return 0;
        })
        .catch(() => 0),
    ]).then(([aiUsed, alertCount, watchlistCount]) => {
      setRealUsage({ aiUsed: aiUsed as number, alertCount: alertCount as number, watchlistCount: watchlistCount as number });
    });
  }, [isLoggedIn]);

  // ─── Fetch notification prefs ────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    setPrefsLoading(true);
    fetch('/api/notifications/prefs', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const prefs = data?.prefs || {};
        setNotificationPrefs({
          inAppEnabled: prefs.in_app_enabled !== false,
          emailEnabled: prefs.email_enabled === true,
          emailTo: typeof prefs.email_to === 'string' ? prefs.email_to : '',
          discordEnabled: prefs.discord_enabled === true,
          discordWebhookUrl: typeof prefs.discord_webhook_url === 'string' ? prefs.discord_webhook_url : '',
        });
      })
      .catch(() => setPrefsError('Unable to load notification settings'))
      .finally(() => setPrefsLoading(false));
  }, [isLoggedIn]);

  // ─── Fetch referral dashboard ────────────────────────────────────────────
  const fetchReferrals = useCallback(async () => {
    setReferralLoading(true);
    setReferralError(null);
    try {
      const res = await fetch('/api/referral/dashboard', { credentials: 'include' });
      if (res.status === 401) { setReferralError('sign-in'); return; }
      if (!res.ok) throw new Error('Failed');
      setReferralData(await res.json());
    } catch {
      setReferralError('Could not load referral data');
    } finally {
      setReferralLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && !isLoading) void fetchReferrals();
  }, [isLoggedIn, isLoading, fetchReferrals]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const saveNotificationPrefs = async () => {
    setPrefsSaving(true);
    setPrefsMessage(null);
    setPrefsError(null);
    try {
      const res = await fetch('/api/notifications/prefs', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPrefs),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPrefsError(data?.error || 'Failed to save'); return; }
      setPrefsMessage('Settings saved.');
      setTimeout(() => setPrefsMessage(null), 2500);
    } catch {
      setPrefsError('Failed to save notification settings');
    } finally {
      setPrefsSaving(false);
    }
  };

  const openBillingPortal = async () => {
    setBillingLoading(true);
    try {
      const res = await fetch('/api/payments/portal', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else alert(data?.error || 'Unable to open billing portal');
    } catch {
      alert('Failed to open billing portal.');
    } finally {
      setBillingLoading(false);
    }
  };

  const deleteDataRequest = async () => {
    const confirmed = confirm('Are you sure you want to request deletion of all your data? This cannot be undone.');
    if (!confirmed) return;
    try {
      const res = await fetch('/api/auth/delete-request', { method: 'POST', credentials: 'include' });
      if (res.ok) alert('Data deletion request submitted. Confirmation email within 48 hours.');
      else alert('Failed. Please email support@marketscannerpros.app');
    } catch {
      alert('Failed. Please email support@marketscannerpros.app');
    }
  };

  const copyReferralLink = () => {
    if (!referralData) return;
    navigator.clipboard.writeText(referralData.referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Derived values ──────────────────────────────────────────────────────

  const tierDisplay: Record<TierKey, { name: string; color: string }> = {
    free: { name: 'Free', color: '#64748B' },
    pro: { name: 'Pro', color: '#3B82F6' },
    pro_trader: { name: 'Pro Trader', color: '#F59E0B' },
    anonymous: { name: 'Not Signed In', color: '#64748B' },
  };

  const currentTier = tierDisplay[normalizedTier];
  const aiLimit = normalizedTier === 'pro_trader' ? 50 : normalizedTier === 'pro' ? 50 : 10;
  const aiUsed = realUsage?.aiUsed ?? 0;

  const usage = [
    { label: 'MSP AI Analyst', used: aiUsed, limit: aiLimit },
    { label: 'Saved Alerts', used: realUsage?.alertCount ?? 0, limit: normalizedTier === 'pro_trader' ? 25 : 10 },
    { label: 'Watchlist Symbols', used: realUsage?.watchlistCount ?? 0, limit: normalizedTier === 'pro_trader' ? 100 : normalizedTier === 'pro' ? 50 : 20 },
  ];

  const planFeatures = useMemo(() => {
    if (normalizedTier === 'pro_trader') return ['Everything in Pro', 'ARCA AI Analyst — GPT-4.1 (50/day)', 'Brain / Permission Engine', 'AI + Derivatives Intelligence', 'Golden Egg Deep Analysis'];
    if (normalizedTier === 'pro') return ['Everything in Free', 'Unlimited symbol scanning', 'MSP AI Analyst (50/day)', 'Market Movers + Intelligence', 'Portfolio / Journal insights'];
    return ['Top 10 equities + Top 10 crypto', 'MSP AI Analyst (10/day)', 'Basic portfolio tracker', 'Basic journal logging', 'Community support'];
  }, [normalizedTier]);

  // ─── Loading / Auth guard ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (!isLoggedIn) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-2xl mb-3">🔒</div>
          <div className="text-sm font-semibold text-white mb-1">Sign In Required</div>
          <div className="text-xs text-slate-500 mb-4">Sign in to manage your account settings.</div>
          <Link href="/auth" className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
            Sign In →
          </Link>
        </div>
      </Card>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Account</span>
              <Badge label={currentTier.name} color={currentTier.color} small />
            </div>
            <div className="text-xs text-slate-500 mt-1">{email || 'Email unavailable'}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              AI Remaining: {Math.max(0, aiLimit - aiUsed)} / {aiLimit} today
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void openBillingPortal()}
              disabled={billingLoading || normalizedTier === 'free'}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 text-xs text-slate-300 hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {billingLoading ? 'Opening...' : 'Manage Billing'}
            </button>
            {normalizedTier !== 'pro_trader' && (
              <Link href="/v2/pricing" className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                Upgrade
              </Link>
            )}
            <button
              onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/'; }}
              className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </Card>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SUB_TABS.map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
              subTab === t
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {subTab === 'Overview' && (
        <div className="space-y-4">
          {/* Subscription */}
          <Card>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Subscription</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{currentTier.name}</div>
                <div className="text-[11px] text-slate-500">
                  {normalizedTier === 'free' ? 'Free tier · Upgrade any time' : 'Active · Renewal in billing portal'}
                </div>
              </div>
              <Badge label="Active" color={currentTier.color} small />
            </div>
          </Card>

          {/* Usage */}
          <Card>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Usage</h3>
            <div className="space-y-3">
              {usage.map(m => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{m.label}</span>
                    <span className="text-slate-500">{m.used}/{m.limit}</span>
                  </div>
                  <ScoreBar value={m.used} max={m.limit} color={m.used >= m.limit ? '#EF4444' : '#10B981'} />
                </div>
              ))}
            </div>
          </Card>

          {/* Plan Features */}
          <Card>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Plan Features</h3>
            <ul className="space-y-1.5">
              {planFeatures.map(f => (
                <li key={f} className="text-xs text-slate-400 flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">•</span> {f}
                </li>
              ))}
            </ul>
          </Card>

          {/* Data Management */}
          <Card>
            <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Data Management</h3>
            <p className="text-xs text-slate-500 mb-3">Request deletion of your account and all associated data.</p>
            <button
              onClick={() => void deleteDataRequest()}
              className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors"
            >
              Request Data Deletion
            </button>
          </Card>
        </div>
      )}

      {/* ═══════════════ NOTIFICATIONS TAB ═══════════════ */}
      {subTab === 'Notifications' && (
        <Card>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Notification Settings</h3>

          {prefsLoading ? (
            <div className="text-xs text-slate-500 py-6 text-center">Loading settings...</div>
          ) : (
            <div className="space-y-4">
              <ToggleRow label="In-App Notifications" checked={notificationPrefs.inAppEnabled} onChange={v => setNotificationPrefs(p => ({ ...p, inAppEnabled: v }))} />
              <ToggleRow label="Email Notifications" checked={notificationPrefs.emailEnabled} onChange={v => setNotificationPrefs(p => ({ ...p, emailEnabled: v }))} />
              {notificationPrefs.emailEnabled && (
                <input
                  type="email"
                  value={notificationPrefs.emailTo}
                  onChange={e => setNotificationPrefs(p => ({ ...p, emailTo: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-white placeholder:text-slate-600"
                />
              )}
              <ToggleRow label="Discord Webhook Alerts" checked={notificationPrefs.discordEnabled} onChange={v => setNotificationPrefs(p => ({ ...p, discordEnabled: v }))} />
              {notificationPrefs.discordEnabled && (
                <input
                  type="url"
                  value={notificationPrefs.discordWebhookUrl}
                  onChange={e => setNotificationPrefs(p => ({ ...p, discordWebhookUrl: e.target.value }))}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-white placeholder:text-slate-600"
                />
              )}

              {prefsError && <p className="text-xs text-rose-400">{prefsError}</p>}
              {prefsMessage && <p className="text-xs text-emerald-400">{prefsMessage}</p>}

              <button
                onClick={() => void saveNotificationPrefs()}
                disabled={prefsSaving}
                className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
              >
                {prefsSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* ═══════════════ REFERRALS TAB ═══════════════ */}
      {subTab === 'Referrals' && (
        <div className="space-y-4">
          {referralLoading ? (
            <Card>
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            </Card>
          ) : referralError ? (
            <Card>
              <div className="text-center py-8 text-xs text-red-400">{referralError === 'sign-in' ? 'Sign in to access referrals' : referralError}</div>
            </Card>
          ) : referralData ? (
            <>
              {/* Referral Link */}
              <Card>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Your Referral Link</h3>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={referralData.referralUrl}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 font-mono select-all"
                  />
                  <button
                    onClick={copyReferralLink}
                    className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Friends get $20 off at checkout. You earn $20 credit per conversion.
                </p>
              </Card>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: 'Link Clicks', value: referralData.stats.clicks },
                  { label: 'Signups', value: referralData.stats.signups },
                  { label: 'Conversions', value: referralData.stats.conversions },
                  { label: 'Credits Earned', value: `$${(referralData.stats.creditsEarned / 100).toFixed(0)}`, accent: true },
                ].map(s => (
                  <Card key={s.label}>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${s.accent ? 'text-emerald-400' : 'text-white'}`}>{s.value}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{s.label}</div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Monthly Draw */}
              <Card>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-bold text-amber-400">🏆 Monthly $500 Draw — {referralData.contest.period}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      5 qualifying referrals = 1 draw entry. Draw:{' '}
                      {new Date(referralData.contest.drawDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-amber-400">{referralData.contest.yourEntries}</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Your Entries</div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>Progress to next entry</span>
                    <span>{referralData.stats.nextEntryProgress}/5</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all"
                      style={{ width: `${(referralData.stats.nextEntryProgress / 5) * 100}%` }}
                    />
                  </div>
                </div>
                {referralData.contest.totalEntries > 0 && (
                  <p className="mt-2 text-[10px] text-slate-500">{referralData.contest.totalEntries} total entries this month</p>
                )}
              </Card>

              {/* Leaderboard */}
              {referralData.leaderboard.length > 0 && (
                <Card>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">🏅 Top Referrers This Month</h3>
                  <div className="space-y-1.5">
                    {referralData.leaderboard.map(entry => (
                      <div
                        key={entry.rank}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                          entry.isYou
                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <span>
                          <span className="font-bold mr-2">#{entry.rank}</span>
                          {entry.label}
                          {entry.isYou && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-500">(You)</span>}
                        </span>
                        <span className="font-semibold">{entry.referrals} referrals</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* History */}
              <Card>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Referral History</h3>
                {referralData.history.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No referrals yet. Share your link above!</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700 text-left text-[10px] text-slate-500 uppercase tracking-wider">
                          <th className="pb-2 pr-3">Email</th>
                          <th className="pb-2 pr-3">Status</th>
                          <th className="pb-2 pr-3">Date</th>
                          <th className="pb-2 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {referralData.history.map((row, i) => (
                          <tr key={i} className="text-slate-300">
                            <td className="py-2 pr-3 font-mono text-[11px]">{row.email}</td>
                            <td className="py-2 pr-3"><StatusBadge status={row.status} /></td>
                            <td className="py-2 pr-3 text-slate-500">{new Date(row.date).toLocaleDateString()}</td>
                            <td className="py-2 text-right">
                              {row.credit > 0
                                ? <span className="text-emerald-400">+${(row.credit / 100).toFixed(0)}</span>
                                : <span className="text-slate-600">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* How It Works */}
              <Card>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">How It Works</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { n: 1, title: 'Share Your Link', desc: 'Send your unique referral link to friends or post on social media.' },
                    { n: 2, title: 'Friend Subscribes', desc: 'They get $20 off their first month. You earn $20 credit.' },
                    { n: 3, title: 'Enter the Draw', desc: 'Every 5 qualifying referrals = 1 entry in the monthly $500 cash draw.' },
                  ].map(s => (
                    <div key={s.n} className="flex items-start gap-3">
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                        {s.n}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">{s.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-300">{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-emerald-400" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    completed: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    rewarded: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    expired: 'border-slate-600/30 bg-slate-700/20 text-slate-500',
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}
