'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';

const proTraderTools = [
  {
    href: '/tools/confluence-scanner',
    icon: '🔮',
    title: 'Time Confluence Scanner',
    description: 'Detect multi-timeframe decompression events and 50% magnet windows.',
    badge: 'Pro Trader',
  },
  {
    href: '/tools/options-confluence',
    icon: '🎯',
    title: 'Options Confluence Scanner',
    description: 'Strike and expiry recommendations with flow, structure, and Greeks context.',
    badge: 'Pro Trader',
  },
];

const platformTools = [
  { href: '/operator', icon: '🧭', title: 'Operator Dashboard', description: 'Unified execution surface for signal flow, risk command, and learning loop.' },
  { href: '/tools/scanner', icon: '📊', title: 'Multi-Market Scanner', description: 'Scan equities, crypto, and forex with structured filters.' },
  { href: '/tools/gainers-losers', icon: '🚀', title: 'Top Gainers & Losers', description: 'Track strongest movers, laggards, and active symbols.' },
  { href: '/tools/company-overview', icon: '🏢', title: 'Company Overview', description: 'Fundamentals, valuation, growth, and analyst context.' },
  { href: '/tools/news', icon: '📰', title: 'News & Sentiment', description: 'Headline flow and sentiment intelligence by symbol.' },
  { href: '/tools/heatmap', icon: '🗺️', title: 'Sector Heatmap', description: 'S&P sector rotation view across key time horizons.' },
  { href: '/tools/crypto-heatmap', icon: '🪙', title: 'Crypto Heatmap', description: 'Visual leadership map for major crypto assets.' },
  { href: '/tools/crypto-dashboard', icon: '₿', title: 'Crypto Derivatives', description: 'Funding, OI, and derivatives pressure diagnostics.' },
  { href: '/tools/commodities', icon: '🛢️', title: 'Commodities', description: 'Energy, metals, and agriculture price dashboard.' },
  { href: '/tools/market-movers', icon: '📈', title: 'Market Movers', description: 'Institutional watchlist of high-impact daily movers.' },
  { href: '/tools/macro', icon: '🏛️', title: 'Macro Dashboard', description: 'Rates, inflation, employment, and macro regime data.' },
  { href: '/tools/news?tab=earnings', icon: '📅', title: 'Earnings Calendar', description: 'Event-risk map for upcoming earnings windows.' },
  { href: '/tools/intraday-charts', icon: '⏱️', title: 'Intraday Charts', description: 'Fast intraday charting and session-level views.' },
  { href: '/tools/ai-analyst', icon: '🧠', title: 'AI Analyst', description: 'Structured AI decision support for active workflows.' },
  { href: '/tools/backtest', icon: '📈', title: 'Backtest', description: 'Validate strategy logic against historical data.' },
];

type HubStats = {
  activeAlerts: number;
  triggeredToday: number;
  openTrades: number;
  optionsSignals: number;
  timeWindows: number;
  journalReviews: number;
  aiConfidence: number;
  regime: 'neutral' | 'active' | 'high-vol';
  riskEnvironment: string;
};

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="text-[11px] font-semibold text-slate-100">{value}</span>
      <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
    </div>
  );
}

function ActionCard({ title, value, cta, href }: { title: string; value: string; cta: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 transition hover:bg-slate-900/80">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-2xl font-semibold text-slate-100">{value}</div>
        <div className="text-xs font-semibold text-slate-300">{cta} →</div>
      </div>
    </Link>
  );
}

function PrimaryToolCard({ href, icon, title, description, badge }: { href: string; icon: string; title: string; description: string; badge?: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 transition hover:bg-slate-900/80">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-300">
          <span>{icon}</span>
          <span>{badge}</span>
        </div>
        <span className="text-xs font-semibold text-slate-300">Open →</span>
      </div>
      <div className="mt-2 text-base font-semibold text-slate-100">{title}</div>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </Link>
  );
}

function ToolCard({ href, icon, title, description, locked }: { href: string; icon: string; title: string; description: string; locked?: boolean }) {
  return (
    <Link href={href} className="h-[110px] rounded-lg border border-slate-700 bg-slate-900/50 p-3 transition hover:bg-slate-900/80">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/40 text-base">{icon}</div>
        <div className="text-sm font-semibold text-slate-100">{locked ? '🔒 ' : ''}{title}</div>
      </div>
      <div className="mt-2 line-clamp-2 text-xs text-slate-400">{description}</div>
    </Link>
  );
}

export default function ToolsPage() {
  const { isLocked: riskLocked } = useRiskPermission();
  const lockSensitiveTools = new Set([
    '/operator',
    '/tools/scanner',
    '/tools/watchlists',
    '/tools/portfolio',
    '/tools/backtest',
    '/tools/journal',
    '/tools/alerts',
  ]);
  const [stats, setStats] = useState<HubStats>({
    activeAlerts: 0,
    triggeredToday: 0,
    openTrades: 0,
    optionsSignals: 0,
    timeWindows: 0,
    journalReviews: 0,
    aiConfidence: 64,
    regime: 'neutral',
    riskEnvironment: 'normal',
  });

  const fetchHubState = async () => {
    try {
      const summaryRes = await fetch('/api/command-hub/summary', { cache: 'no-store' });
      const summaryJson = await summaryRes.json().catch(() => ({}));
      const summary = summaryJson?.summary || {};

      setStats({
        activeAlerts: Number(summary.activeAlerts || 0),
        triggeredToday: Number(summary.triggeredToday || 0),
        openTrades: Number(summary.openTrades || 0),
        optionsSignals: Number(summary.optionsSignals || 0),
        timeWindows: Number(summary.timeWindows || 0),
        journalReviews: Number(summary.journalReviews || 0),
        aiConfidence: Number(summary.aiConfidence || 64),
        regime: summary.regime === 'high-vol' ? 'high-vol' : summary.regime === 'active' ? 'active' : 'neutral',
        riskEnvironment: String(summary.riskEnvironment || 'normal'),
      });
    } catch {
      setStats((prev) => ({ ...prev }));
    }
  };

  useEffect(() => {
    void fetchHubState();
  }, []);

  const regime = useMemo(() => {
    if (stats.regime === 'high-vol') return 'High Vol';
    if (stats.regime === 'active') return 'Active';
    return 'Neutral';
  }, [stats.regime]);

  const risk = useMemo(() => {
    const normalized = stats.riskEnvironment.toLowerCase();
    if (normalized === 'overloaded' || normalized === 'high') return 'High';
    if (normalized === 'elevated' || normalized === 'medium') return 'Medium';
    if (stats.openTrades >= 5) return 'High';
    if (stats.openTrades >= 2) return 'Medium';
    return 'Low';
  }, [stats.riskEnvironment, stats.openTrades]);

  const primaryFocus = useMemo(() => {
    if (stats.triggeredToday > 0) {
      return {
        title: 'Alert cluster requires review',
        ctaLabel: 'Open Alerts',
        ctaHref: '/tools/alerts',
        metrics: [
          { label: 'Direction', value: 'Event Driven' },
          { label: 'Confidence', value: `${stats.aiConfidence}%` },
          { label: 'Target', value: 'Validate triggers' },
          { label: 'Time Window', value: 'Now' },
        ],
      };
    }

    if (stats.openTrades > 0) {
      return {
        title: 'Open trades need management pass',
        ctaLabel: 'Open Portfolio',
        ctaHref: '/tools/portfolio',
        metrics: [
          { label: 'Direction', value: 'Mixed' },
          { label: 'Confidence', value: `${stats.aiConfidence}%` },
          { label: 'Target', value: 'Risk alignment' },
          { label: 'Time Window', value: 'Session' },
        ],
      };
    }

    return {
      title: 'BTC • Time Confluence setup active',
      ctaLabel: 'Open Scanner',
      ctaHref: '/tools/confluence-scanner',
      metrics: [
        { label: 'Direction', value: 'Neutral' },
        { label: 'Confidence', value: `${stats.aiConfidence}%` },
        { label: 'Target', value: '$66,800' },
        { label: 'Time Window', value: '1H close' },
      ],
    };
  }, [stats]);

  return (
    <main className="min-h-screen bg-[#0F172A] text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1220]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Regime" value={regime} />
            <StatusPill label="Risk" value={risk} />
            <StatusPill label="Alerts" value={`${stats.triggeredToday}`} />
            <StatusPill label="Open Trades" value={`${stats.openTrades}`} />
            <StatusPill label="AI Conf" value={`${stats.aiConfidence}%`} />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => void fetchHubState()} className="h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white/80 hover:bg-white/10">
              Refresh
            </button>
            <Link
              href="/tools/markets"
              className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-95"
            >
              Open Markets Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1280px] space-y-4 px-4 pb-16 pt-6 md:px-6">
        <section>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Tools</div>
              <h1 className="mt-1 text-2xl font-semibold">MSP Tooling Command Hub</h1>
              <p className="mt-1 text-sm text-slate-400">Institutional workflow surfaces for observe → decide → validate.</p>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-900/90">
                Workspace
              </Link>
              <Link href="/tools/settings" className="h-9 rounded-lg border border-slate-700 bg-slate-900/60 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-900/90">
                Settings
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Primary Focus</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{primaryFocus.title}</div>
            </div>
            <Link href={primaryFocus.ctaHref} className="h-9 rounded-lg border border-slate-700 bg-black/20 px-4 text-sm font-semibold text-slate-100 hover:bg-white/10">
              {primaryFocus.ctaLabel}
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {primaryFocus.metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                <div className="text-[11px] text-slate-400">{metric.label}</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{metric.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <ActionCard title="Options Signals" value={`${stats.optionsSignals}`} cta="Review" href="/tools/options-confluence" />
            <ActionCard title="Time Windows" value={`${stats.timeWindows}`} cta="Open" href="/tools/confluence-scanner" />
            <ActionCard title="Triggered Alerts" value={`${stats.triggeredToday}`} cta="Validate" href="/tools/alerts" />
            <ActionCard title="Journal Reviews" value={`${stats.journalReviews}`} cta="Log" href="/tools/journal" />
          </div>
        </section>

        <section>
          <div className="mb-2 text-sm font-semibold text-slate-100">Pro Trader Scanners</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {proTraderTools.map((tool) => (
              <PrimaryToolCard key={tool.href} {...tool} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 text-sm font-semibold text-slate-100">Platform Tools</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {platformTools.map((tool) => (
              <ToolCard key={tool.href} {...tool} locked={riskLocked && lockSensitiveTools.has(tool.href)} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="text-sm font-semibold text-slate-100">Workflow Tip</div>
          <p className="mt-1 text-sm text-slate-400">Start with global state, confirm primary focus, clear active tasks, then scan. Educational use only.</p>
        </section>
      </div>
    </main>
  );
}
