'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   V2 Referrals — Standalone referral dashboard page
   Wraps the same /api/referral/dashboard data used in Workspace > Settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, SectionHeader } from '../_components/ui';
import { useUserTier } from '@/lib/useUserTier';

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

export default function ReferralsPage() {
  const { isLoggedIn, isLoading: tierLoading } = useUserTier();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/referral/dashboard', { credentials: 'include' });
      if (res.status === 401) { setError('sign-in'); return; }
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
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

  if (tierLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error === 'sign-in' || !isLoggedIn) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Refer & Earn" subtitle="Share your link — earn $20 credit for every friend who subscribes" />
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg text-white mb-4">Sign in to access your referral dashboard</p>
          <Link href="/auth" className="rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/30">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Refer & Earn" subtitle="Share your link — earn $20 credit for every friend who subscribes" />
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <SectionHeader title="Refer & Earn" subtitle="Share your link — earn $20 credit for every friend who subscribes. They get $20 off too!" />

      {/* ─── Referral Link ─── */}
      <Card>
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
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Share this link with friends. They get $20 off at checkout and you earn $20 credit.</p>
      </Card>

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Link Clicks', value: data.stats.clicks },
          { label: 'Signups', value: data.stats.signups },
          { label: 'Conversions', value: data.stats.conversions },
          { label: 'Credits Earned', value: `$${(data.stats.creditsEarned / 100).toFixed(0)}`, accent: true },
        ].map(s => (
          <Card key={s.label}>
            <div className={`text-2xl font-bold text-center ${s.accent ? 'text-emerald-400' : 'text-slate-100'}`}>{s.value}</div>
            <div className="mt-1 text-[11px] text-slate-500 text-center uppercase tracking-wider">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* ─── Contest Progress ─── */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold text-amber-400 mb-1">🏆 Monthly $500 Draw — {data.contest.period}</h2>
            <p className="text-xs text-slate-400">
              Every 5 qualifying referrals = 1 draw entry. Draw date:{' '}
              {new Date(data.contest.drawDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-amber-400">{data.contest.yourEntries}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Your Entries</div>
          </div>
        </div>
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
      </div>

      {/* ─── Leaderboard ─── */}
      {data.leaderboard.length > 0 && (
        <Card>
          <h2 className="text-sm font-bold text-slate-100 mb-3">🏅 This Month&apos;s Top Referrers</h2>
          <div className="space-y-2">
            {data.leaderboard.map(entry => (
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
                  {entry.isYou && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-500">(You)</span>}
                </span>
                <span className="font-semibold">{entry.referrals} referrals</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── Referral History ─── */}
      <Card>
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
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        row.status === 'rewarded' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
                        row.status === 'completed' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' :
                        row.status === 'expired' ? 'border-slate-600/30 bg-slate-700/20 text-slate-500' :
                        'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                      }`}>{row.status}</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="py-2 text-right text-xs">
                      {row.credit > 0 ? <span className="text-emerald-400">+${(row.credit / 100).toFixed(0)}</span> : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── How It Works ─── */}
      <Card>
        <h2 className="text-sm font-bold text-slate-100 mb-3">How It Works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { n: 1, title: 'Share Your Link', desc: 'Send your unique referral link to friends or post it on social media.' },
            { n: 2, title: 'Friend Subscribes', desc: 'They get $20 off their first month at checkout. You earn $20 credit on your next invoice.' },
            { n: 3, title: 'Enter the Draw', desc: 'Every 5 qualifying referrals earns 1 entry in the monthly $500 cash draw.' },
          ].map(s => (
            <div key={s.n} className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">{s.n}</div>
              <div>
                <div className="text-sm font-semibold text-slate-200">{s.title}</div>
                <div className="mt-0.5 text-xs text-slate-400">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
