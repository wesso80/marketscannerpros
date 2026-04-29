'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import Link from 'next/link';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

interface ReferralDashboardData {
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

export default function ReferralsPage() {
  const { tier, isLoading: tierLoading, isLoggedIn } = useUserTier();
  const [data, setData] = useState<ReferralDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/referral/dashboard');
      if (res.status === 401) {
        setError('sign-in');
        return;
      }
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData(json);
    } catch {
      setError('Could not load referral data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tierLoading) fetchDashboard();
  }, [tierLoading, fetchDashboard]);

  const copyLink = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (tierLoading) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <ToolsPageHeader
        badge="REFERRAL PROGRAM"
        title="Refer & Earn"
        subtitle="Share your link — earn credit for every friend who subscribes. They get $5 off Pro or $10 off Pro Trader at checkout! 5 referrals = $500 draw entry."
        icon="REF"
        backHref="/tools"
      />

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
        <ComplianceDisclaimer compact />
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : error === 'sign-in' ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-lg text-white mb-4">Sign in to access your referral dashboard</p>
            <Link
              href="/auth"
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/30"
            >
              Sign In
            </Link>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">
            {error}
          </div>
        ) : data ? (
          <>
            {/* ─── Referral Link ─── */}
            <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
              <h2 className="text-sm font-bold text-slate-100 mb-3">Your Referral Link</h2>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={data.referralUrl}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 font-mono select-all"
                />
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Share this link with friends. They get $5 off Pro or $10 off Pro Trader at checkout and you earn matching credit.
              </p>
            </section>

            {/* ─── Stats Cards ─── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Link Clicks" value={data.stats.clicks} />
              <StatCard label="Signups" value={data.stats.signups} />
              <StatCard label="Conversions" value={data.stats.conversions} />
              <StatCard
                label="Credits Earned"
                value={`$${(data.stats.creditsEarned / 100).toFixed(0)}`}
                accent
              />
            </div>

            {/* ─── Contest Progress ─── */}
            <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-bold text-amber-400 mb-1">
                    Monthly $500 Draw — {data.contest.period}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Every 5 qualifying referrals = 1 draw entry. Draw date:{' '}
                    {new Date(data.contest.drawDate).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-amber-400">{data.contest.yourEntries}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Your Entries</div>
                </div>
              </div>

              {/* Progress bar toward next entry */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>Progress to next entry</span>
                  <span>{data.stats.nextEntryProgress}/5 referrals</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                    style={{ width: `${(data.stats.nextEntryProgress / 5) * 100}%` }}
                  />
                </div>
              </div>

              {data.contest.totalEntries > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {data.contest.totalEntries} total entries in this month&apos;s draw
                </p>
              )}
            </section>

            {/* ─── Leaderboard ─── */}
            {data.leaderboard.length > 0 && (
              <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
                <h2 className="text-sm font-bold text-slate-100 mb-3">This Month&apos;s Top Referrers</h2>
                <div className="space-y-2">
                  {data.leaderboard.map((entry) => (
                    <div
                      key={entry.rank}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                        entry.isYou
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <span>
                        <span className="font-bold mr-2">#{entry.rank}</span>
                        {entry.label}
                        {entry.isYou && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-500">
                            (You)
                          </span>
                        )}
                      </span>
                      <span className="font-semibold">{entry.referrals} referrals</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ─── Referral History ─── */}
            <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
              <h2 className="text-sm font-bold text-slate-100 mb-3">Referral History</h2>
              {data.history.length === 0 ? (
                <p className="text-sm text-slate-500">No referrals yet. Share your link to get started!</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wider">
                        <th className="pb-2 pr-4">Email</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {data.history.map((row, i) => (
                        <tr key={i} className="text-slate-300">
                          <td className="py-2 pr-4 font-mono text-xs">{row.email}</td>
                          <td className="py-2 pr-4">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-2 pr-4 text-xs text-slate-500">
                            {new Date(row.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 text-right text-xs">
                            {row.credit > 0 ? (
                              <span className="text-emerald-400">+${(row.credit / 100).toFixed(0)}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ─── How It Works ─── */}
            <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
              <h2 className="text-sm font-bold text-slate-100 mb-3">How It Works</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Step n={1} title="Share Your Link" desc="Send your unique referral link to friends or post it on social media." />
                <Step n={2} title="Friend Subscribes" desc="They get $5 off Pro or $10 off Pro Trader at checkout. You earn matching credit on your next invoice." />
                <Step n={3} title="Enter the Draw" desc="Every 5 qualifying referrals earns 1 entry in the monthly $500 cash draw." />
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-center">
      <div className={`text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-slate-100'}`}>{value}</div>
      <div className="mt-1 text-[11px] text-slate-500 uppercase tracking-wider">{label}</div>
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

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
        {n}
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <div className="mt-0.5 text-xs text-slate-400">{desc}</div>
      </div>
    </div>
  );
}
