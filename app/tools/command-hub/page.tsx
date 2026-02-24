'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRegime, regimeLabel } from '@/lib/useRegime';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import { useUserTier } from '@/lib/useUserTier';
import { useDisplayMode } from '@/lib/displayMode';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Permission, Direction, StrategyTag, Regime } from '@/lib/risk-governor-hard';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HubSummary {
  activeAlerts: number;
  triggeredToday: number;
  openTrades: number;
  optionsSignals: number;
  timeWindows: number;
  journalReviews: number;
  aiConfidence: number;
  regime: string;
  riskEnvironment: string;
  cognitiveLoad: number;
}

interface PortfolioPosition {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pl: number;
  plPercent: number;
  entryDate: string;
}

interface DailyPick {
  symbol: string;
  score: number;
  direction: 'LONG' | 'SHORT';
  setup: string;
  confidence: number;
  entry: number;
  stop: number;
  target: number;
  rMultiple: number;
}

// ─── Data Hook ──────────────────────────────────────────────────────────────

function useCommandHubData() {
  const [summary, setSummary] = useState<HubSummary | null>(null);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [picks, setPicks] = useState<DailyPick[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [sumRes, portRes, picksRes] = await Promise.allSettled([
        fetch('/api/command-hub/summary').then(r => r.ok ? r.json() : null),
        fetch('/api/portfolio').then(r => r.ok ? r.json() : null),
        fetch('/api/scanner/daily-picks?limit=6&type=top').then(r => r.ok ? r.json() : null),
      ]);
      if (sumRes.status === 'fulfilled' && sumRes.value?.summary) setSummary(sumRes.value.summary);
      if (portRes.status === 'fulfilled' && portRes.value?.positions) setPositions(portRes.value.positions);
      if (picksRes.status === 'fulfilled') {
        const picksData = picksRes.value?.picks ?? picksRes.value?.data ?? picksRes.value ?? [];
        setPicks(Array.isArray(picksData) ? picksData.slice(0, 6) : []);
      }
    } catch { /* silently fail, show placeholders */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { summary, positions, picks, loading };
}

// ─── Tone Helpers ───────────────────────────────────────────────────────────

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

function toneCls(tone: Tone) {
  switch (tone) {
    case 'ok': return 'border-emerald-600/30 bg-emerald-600/10 text-emerald-300';
    case 'warn': return 'border-yellow-600/30 bg-yellow-600/10 text-yellow-300';
    case 'bad': return 'border-red-600/30 bg-red-600/10 text-red-300';
    case 'info': return 'border-indigo-600/30 bg-indigo-600/10 text-indigo-300';
    default: return 'border-zinc-800 bg-zinc-900 text-zinc-200';
  }
}

function toneFromValue(value: string): Tone {
  const v = value.toUpperCase();
  if (['OK', 'NORMAL', 'ALLOW', 'TREND_UP', 'ALIGNED', 'LOW'].includes(v)) return 'ok';
  if (['WARN', 'THROTTLED', 'CONDITIONAL', 'EXPANDING', 'MEDIUM', 'TIGHTENED', 'DEGRADED'].includes(v)) return 'warn';
  if (['BAD', 'LOCKED', 'DEFENSIVE', 'BLOCK', 'STRESS', 'HIGH', 'DOWN'].includes(v)) return 'bad';
  if (['INFO', 'NY OPEN', 'LONDON', 'ASIA'].includes(v)) return 'info';
  return 'neutral';
}

// ─── Shared Components ─────────────────────────────────────────────────────

function StatePill({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneCls(tone)}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function HubCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow-lg">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-zinc-400">{right}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone ? toneCls(tone).split(' ').pop() : ''}`}>{value}</div>
    </div>
  );
}

// ─── 1️⃣ Global State Strip ────────────────────────────────────────────────

function GlobalStateStrip() {
  const { data: regime, loading: regimeLoading } = useRegime();
  const { snapshot, loading: riskLoading } = useRiskPermission();

  const loading = regimeLoading || riskLoading;

  // Derive values from real providers
  const regimeValue = regime?.regime ? regimeLabel(regime.regime).toUpperCase().replace(/ /g, '_') : '—';
  const regimeTone: Tone = !regime ? 'neutral'
    : regime.regime === 'TREND_UP' ? 'ok'
    : regime.regime === 'TREND_DOWN' ? 'warn'
    : regime.regime === 'VOL_EXPANSION' || regime.regime === 'RISK_OFF_STRESS' ? 'bad'
    : regime.regime === 'VOL_CONTRACTION' ? 'info'
    : 'neutral';

  const volState = regime?.regime === 'VOL_EXPANSION' ? 'EXPANDING'
    : regime?.regime === 'VOL_CONTRACTION' ? 'CONTRACTING'
    : regime?.regime === 'RISK_OFF_STRESS' ? 'STRESS' : 'NORMAL';
  const volTone: Tone = volState === 'EXPANDING' || volState === 'STRESS' ? 'warn'
    : volState === 'CONTRACTING' ? 'info' : 'ok';

  const liquidity = snapshot?.data_health?.status === 'OK' ? 'NORMAL'
    : snapshot?.data_health?.status === 'DEGRADED' ? 'DEGRADED' : 'UNKNOWN';
  const liqTone: Tone = liquidity === 'NORMAL' ? 'ok' : liquidity === 'DEGRADED' ? 'warn' : 'bad';

  const riskMode = snapshot?.risk_mode ?? 'NORMAL';
  const riskTone: Tone = riskMode === 'NORMAL' ? 'ok'
    : riskMode === 'THROTTLED' ? 'warn'
    : 'bad';

  const remainingR = snapshot?.session?.remaining_daily_R ?? 0;
  const maxR = snapshot?.session?.max_daily_R ?? 6;
  const ruPct = maxR > 0 ? remainingR / maxR : 0;
  const ruTone: Tone = ruPct > 0.5 ? 'ok' : ruPct > 0.25 ? 'warn' : 'bad';

  // Session phase — simple time-based
  const hour = new Date().getUTCHours();
  const sessionPhase = hour >= 13 && hour < 20 ? 'NY OPEN'
    : hour >= 8 && hour < 16 ? 'LONDON'
    : hour >= 0 && hour < 8 ? 'ASIA'
    : 'AFTER HOURS';
  const sessionTone: Tone = 'info';

  if (loading) {
    return (
      <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-6 py-3">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2 animate-pulse">
                <div className="h-3 w-12 bg-zinc-800 rounded mb-1" />
                <div className="h-4 w-20 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-6 py-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatePill label="Regime" value={regimeValue} tone={regimeTone} />
          <StatePill label="Volatility" value={volState} tone={volTone} />
          <StatePill label="Liquidity" value={liquidity} tone={liqTone} />
          <StatePill label="Risk Mode" value={riskMode} tone={riskTone} />
          <StatePill label="RU Utilization" value={ruPct.toFixed(2)} tone={ruTone} />
          <StatePill label="Session" value={sessionPhase} tone={sessionTone} />
        </div>
      </div>
    </div>
  );
}

// ─── 2️⃣ Hub Header Row ────────────────────────────────────────────────────

function HubHeaderRow({ onSearchSubmit }: { onSearchSubmit: (q: string) => void }) {
  const { snapshot } = useRiskPermission();
  const riskMode = snapshot?.risk_mode ?? 'NORMAL';
  const dataOk = snapshot?.data_health?.status ?? 'UNKNOWN';

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Command Hub</h1>
        <p className="text-sm text-zinc-400">
          State → Permission → Opportunity → Execution → Review
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <form className="w-full md:w-[320px]" onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value; if (v) onSearchSubmit(v); }}>
          <input
            name="q"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-zinc-600"
            placeholder="Search ticker…"
          />
        </form>

        {/* Session Filter */}
        <select className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none">
          <option>All Sessions</option>
          <option>NY</option>
          <option>London</option>
          <option>Asia</option>
        </select>

        {/* Risk Mode */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <span className="text-zinc-400">Risk:</span>{' '}
          <span className={`font-semibold ${riskMode === 'NORMAL' ? 'text-emerald-300' : riskMode === 'THROTTLED' ? 'text-yellow-300' : 'text-red-300'}`}>
            {riskMode}
          </span>
        </div>

        {/* Data Feed */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
          <span className="text-zinc-400">Feed:</span>{' '}
          <span className={`font-semibold ${dataOk === 'OK' ? 'text-emerald-300' : dataOk === 'DEGRADED' ? 'text-yellow-300' : 'text-red-300'}`}>
            {dataOk}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── A) Bias Engine Card ───────────────────────────────────────────────────

function BiasEngineCard() {
  const { data: regime } = useRegime();
  const { snapshot } = useRiskPermission();

  const trendStrength = (() => {
    if (!regime?.signals?.length) return '—';
    const trendSignals = regime.signals.filter(s => ['ADX', 'trend', 'momentum'].some(k => s.source.toLowerCase().includes(k)));
    if (trendSignals.length === 0) {
      // Derive from regime
      if (regime.regime === 'TREND_UP' || regime.regime === 'TREND_DOWN') return '74';
      if (regime.regime === 'RANGE_NEUTRAL') return '32';
      return '50';
    }
    return String(Math.round(trendSignals.reduce((s, sig) => s + sig.weight, 0) / trendSignals.length * 100));
  })();

  const confidence = regime?.signals?.length
    ? String((regime.signals.filter(s => !s.stale).length / Math.max(regime.signals.length, 1)).toFixed(2))
    : '—';

  const breadth = regime?.permission === 'YES' ? 'Aligned'
    : regime?.permission === 'CONDITIONAL' ? 'Mixed'
    : 'Weak';

  const shiftRisk = (() => {
    const staleCount = regime?.signals?.filter(s => s.stale).length ?? 0;
    if (staleCount >= 3) return 'High';
    if (staleCount >= 1) return 'Medium';
    return 'Low';
  })();

  // Desk read — regime-aware guidance
  const deskRead = regime?.regime === 'TREND_UP'
    ? 'Trend continuation favored. Breakouts allowed. Avoid momentum reversal.'
    : regime?.regime === 'TREND_DOWN'
    ? 'Bearish trend active. Short-side pullbacks favored. Avoid long breakouts.'
    : regime?.regime === 'VOL_EXPANSION'
    ? 'Volatility expanding. Reduce size. Tighten stops. Prefer mean reversion.'
    : regime?.regime === 'VOL_CONTRACTION'
    ? 'Low volatility compression. Prepare for breakout. Reduce intraday noise trades.'
    : regime?.regime === 'RISK_OFF_STRESS'
    ? 'Risk-off environment. Defensive posture only. No new breakouts.'
    : 'Range-bound. Fade extremes. Avoid breakout continuation.';

  return (
    <HubCard title="Bias & Regime Engine" right="live">
      <div className="grid grid-cols-2 gap-4">
        <Metric label="Trend Strength" value={trendStrength} />
        <Metric label="Regime Confidence" value={confidence} />
        <Metric label="Breadth" value={breadth} tone={breadth === 'Aligned' ? 'ok' : breadth === 'Mixed' ? 'warn' : 'bad'} />
        <Metric label="Shift Risk" value={shiftRisk} tone={shiftRisk === 'Low' ? 'ok' : shiftRisk === 'Medium' ? 'warn' : 'bad'} />
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-xs text-zinc-400">Desk Read</div>
        <div className="mt-1 text-sm font-semibold">{deskRead}</div>
      </div>
    </HubCard>
  );
}

// ─── B) Trade Permission Matrix Card ───────────────────────────────────────

const STRATEGY_LABELS: Record<StrategyTag, string> = {
  BREAKOUT_CONTINUATION: 'Breakout Cont.',
  TREND_PULLBACK: 'Trend Pullback',
  RANGE_FADE: 'Range Fade',
  MEAN_REVERSION: 'Mean Reversion',
  MOMENTUM_REVERSAL: 'Momentum Reversal',
  EVENT_STRATEGY: 'Event Strategy',
};

function MatrixCell({ label, head, status }: { label?: string; head?: boolean; status?: 'allow' | 'tight' | 'block' }) {
  const cls = status === 'allow'
    ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-300'
    : status === 'tight'
    ? 'border-yellow-600/30 bg-yellow-600/10 text-yellow-300'
    : status === 'block'
    ? 'border-red-600/30 bg-red-600/10 text-red-300'
    : 'border-zinc-800 bg-zinc-950/40 text-zinc-200';

  const display = head ? (label ?? '') : label ?? (status === 'allow' ? 'ALLOW' : status === 'tight' ? 'TIGHTENED' : 'BLOCK');

  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className={`text-xs ${head ? 'font-semibold' : ''}`}>{display}</div>
    </div>
  );
}

function permissionToStatus(p: Permission | undefined): 'allow' | 'tight' | 'block' {
  if (p === 'ALLOW') return 'allow';
  if (p === 'ALLOW_REDUCED' || p === 'ALLOW_TIGHTENED') return 'tight';
  return 'block';
}

function TradePermissionMatrixCard() {
  const { snapshot } = useRiskPermission();
  const matrix = snapshot?.matrix;

  const strategies: StrategyTag[] = [
    'BREAKOUT_CONTINUATION',
    'TREND_PULLBACK',
    'MEAN_REVERSION',
    'MOMENTUM_REVERSAL',
    'RANGE_FADE',
    'EVENT_STRATEGY',
  ];

  return (
    <HubCard title="Trade Permission Matrix" right="regime-linked">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MatrixCell head />
        <MatrixCell head label="Long" />
        <MatrixCell head label="Short" />

        {strategies.map(strat => (
          <React.Fragment key={strat}>
            <MatrixCell label={STRATEGY_LABELS[strat]} head />
            <MatrixCell status={matrix ? permissionToStatus(matrix[strat]?.LONG) : 'block'} />
            <MatrixCell status={matrix ? permissionToStatus(matrix[strat]?.SHORT) : 'block'} />
          </React.Fragment>
        ))}
      </div>

      <div className="mt-4 text-xs text-zinc-400">
        &ldquo;TIGHTENED&rdquo; = smaller size + tighter invalidation + no adds.
      </div>
    </HubCard>
  );
}

// ─── C) Opportunity Scanner Card ───────────────────────────────────────────

function OpportunityScannerCard({ picks }: { picks: DailyPick[] }) {
  const { snapshot } = useRiskPermission();
  const matrix = snapshot?.matrix;

  const getAuth = (pick: DailyPick): { label: string; cls: string } => {
    if (!matrix) return { label: 'PENDING', cls: 'text-zinc-400' };

    // Map setup string to strategy tag (best effort)
    const setupLower = pick.setup.toLowerCase();
    let tag: StrategyTag = 'BREAKOUT_CONTINUATION';
    if (setupLower.includes('pullback')) tag = 'TREND_PULLBACK';
    else if (setupLower.includes('reversion') || setupLower.includes('fade')) tag = 'MEAN_REVERSION';
    else if (setupLower.includes('reversal')) tag = 'MOMENTUM_REVERSAL';
    else if (setupLower.includes('range')) tag = 'RANGE_FADE';

    const perm = matrix[tag]?.[pick.direction];
    if (perm === 'ALLOW') return { label: 'AUTHORIZED', cls: 'text-emerald-300' };
    if (perm === 'ALLOW_REDUCED' || perm === 'ALLOW_TIGHTENED') return { label: 'CONDITIONAL', cls: 'text-yellow-300' };
    return { label: 'BLOCKED', cls: 'text-red-300' };
  };

  return (
    <HubCard title="Opportunity Scanner" right="filtered by permissions">
      {picks.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">No signals yet. Scanner runs on cron.</div>
      ) : (
        <div className="space-y-3">
          {picks.map((p, i) => {
            const auth = getAuth(p);
            return (
              <Link key={i} href={`/tools/markets?symbol=${p.symbol}&type=equities`} className="block">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 hover:bg-zinc-900 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{p.symbol}</div>
                      <div className="text-xs text-zinc-400">{p.setup}</div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className={`text-xs font-semibold ${auth.cls}`}>{auth.label}</div>
                      <div className="text-xs text-zinc-400">R {p.rMultiple?.toFixed(1) ?? '—'}</div>
                      <div className="text-xs text-zinc-400">Score {p.score}</div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href="/tools/markets"
        className="mt-4 block w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-center text-sm font-semibold hover:bg-zinc-800 transition"
      >
        Open Markets
      </Link>
    </HubCard>
  );
}

// ─── D) Capital Flow Card ──────────────────────────────────────────────────

function CapitalFlowPanelCard() {
  const [flow, setFlow] = useState<{
    leaders: string;
    laggards: string;
    optionsFlow: string;
    breadth: string;
    note: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sectors/heatmap');
        if (!res.ok) return;
        const data = await res.json();
        const sectors = data?.sectors ?? data ?? [];
        if (!Array.isArray(sectors) || sectors.length === 0) return;

        // Sort by performance
        const sorted = [...sectors].sort((a, b) => (b.changePercent ?? b.change ?? 0) - (a.changePercent ?? a.change ?? 0));
        const top2 = sorted.slice(0, 2).map(s => s.name ?? s.symbol ?? '').join(', ');
        const bottom2 = sorted.slice(-2).map(s => s.name ?? s.symbol ?? '').join(', ');
        const avgChange = sorted.reduce((s, sec) => s + (sec.changePercent ?? sec.change ?? 0), 0) / sorted.length;
        const breadthVal = avgChange > 0.3 ? 'Improving' : avgChange < -0.3 ? 'Deteriorating' : 'Neutral';
        const note = avgChange > 0.5 ? 'Broad-based rally; watch for rotation into laggards.'
          : avgChange < -0.5 ? 'Risk-off pressure. Defensive sector rotation underway.'
          : 'Concentration risk rising; avoid chasing late expansion.';

        if (!cancelled) setFlow({ leaders: top2, laggards: bottom2, optionsFlow: 'See Markets', breadth: breadthVal, note });
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <HubCard title="Capital Flow" right="rotation + flow">
      <div className="grid grid-cols-2 gap-4">
        <Metric label="Leaders" value={flow?.leaders ?? '—'} />
        <Metric label="Laggards" value={flow?.laggards ?? '—'} />
        <Metric label="Options Flow" value={flow?.optionsFlow ?? '—'} />
        <Metric label="Breadth" value={flow?.breadth ?? '—'} tone={flow?.breadth === 'Improving' ? 'ok' : flow?.breadth === 'Deteriorating' ? 'bad' : 'neutral'} />
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-xs text-zinc-400">Rotation Note</div>
        <div className="mt-1 text-sm font-semibold">
          {flow?.note ?? 'Loading capital flow data…'}
        </div>
      </div>
    </HubCard>
  );
}

// ─── E) Event Risk Card ───────────────────────────────────────────────────

function EventRiskCard({ summary }: { summary: HubSummary | null }) {
  const [events, setEvents] = useState<Array<{ label: string; when: string; tone: Tone }>>([]);
  const { snapshot } = useRiskPermission();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/earnings-calendar?symbol=SPY');
        if (!res.ok) return;
        const data = await res.json();
        const earnings = data?.earnings ?? data ?? [];
        const items: Array<{ label: string; when: string; tone: Tone }> = [];

        for (const e of (Array.isArray(earnings) ? earnings : []).slice(0, 3)) {
          const name = e.symbol ?? e.name ?? 'Earnings';
          items.push({ label: `Earnings: ${name}`, when: e.reportDate ?? 'today', tone: 'warn' });
        }
        if (!cancelled) setEvents(items);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Derive governor guidance from blocks
  const blocks = snapshot?.global_blocks ?? [];
  const hasBlocks = blocks.length > 0;
  const governorNote = hasBlocks
    ? blocks[0].msg
    : summary && (summary.triggeredToday >= 3)
    ? 'Elevated alert activity. Event cap likely active. Tighten stops.'
    : 'No active event caps. Normal operations.';

  const allEvents = [
    ...(summary && summary.triggeredToday >= 2 ? [{ label: `${summary.triggeredToday} alerts triggered`, when: 'today', tone: 'warn' as Tone }] : []),
    ...events,
    ...(summary && summary.optionsSignals > 0 ? [{ label: `${summary.optionsSignals} options signals`, when: 'active', tone: 'info' as Tone }] : []),
  ];

  return (
    <HubCard title="Event & Catalyst Risk" right="calendar + filings">
      {allEvents.length === 0 ? (
        <div className="py-6 text-center text-sm text-zinc-500">No major events detected.</div>
      ) : (
        <div className="space-y-3">
          {allEvents.slice(0, 4).map((ev, i) => (
            <div key={i} className={`rounded-xl border p-3 ${toneCls(ev.tone)}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-semibold">{ev.label}</div>
                <div className="text-xs opacity-80">{ev.when}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-xs text-zinc-400">Governor Guidance</div>
        <div className="mt-1 text-sm font-semibold">{governorNote}</div>
      </div>
    </HubCard>
  );
}

// ─── F) System Integrity Card ──────────────────────────────────────────────

function SystemIntegrityCard({ summary }: { summary: HubSummary | null }) {
  const { snapshot } = useRiskPermission();

  const dataFeed = snapshot?.data_health?.status ?? 'UNKNOWN';
  const dataAge = snapshot?.data_health?.age_s ?? 0;
  const dataFeedTone: Tone = dataFeed === 'OK' ? 'ok' : dataFeed === 'DEGRADED' ? 'warn' : 'bad';

  // Rate limit — estimated from session data
  const tradesToday = snapshot?.session?.trades_today ?? 0;
  const maxTrades = snapshot?.session?.max_trades_per_day ?? 20;
  const ratePct = maxTrades > 0 ? tradesToday / maxTrades : 0;
  const rateTone: Tone = ratePct > 0.9 ? 'bad' : ratePct > 0.7 ? 'warn' : 'ok';
  const rateLabel = ratePct > 0.9 ? 'Near Limit' : ratePct > 0.7 ? 'Elevated' : 'Normal';

  const cogLoad = summary?.cognitiveLoad ?? 0;
  const cogTone: Tone = cogLoad > 70 ? 'bad' : cogLoad > 40 ? 'warn' : 'ok';

  const cacheAge = dataAge > 120 ? 'Stale' : dataAge > 60 ? 'Aging' : 'Good';
  const cacheTone: Tone = cacheAge === 'Stale' ? 'bad' : cacheAge === 'Aging' ? 'warn' : 'ok';

  return (
    <HubCard title="System Integrity" right="ops">
      <div className="space-y-3">
        <IntegrityRow label="Data Feed" value={dataFeed} tone={dataFeedTone} />
        <IntegrityRow label="Rate Limit" value={rateLabel} tone={rateTone} />
        <IntegrityRow label="Cognitive Load" value={cogLoad > 0 ? `${cogLoad}%` : '—'} tone={cogTone} />
        <IntegrityRow label="Cache Health" value={cacheAge} tone={cacheTone} />
      </div>

      <Link
        href="/tools/settings"
        className="mt-4 block w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-2 text-center text-sm font-semibold hover:bg-zinc-800 transition"
      >
        View Ops
      </Link>
    </HubCard>
  );
}

function IntegrityRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const vCls = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-yellow-300' : tone === 'bad' ? 'text-red-300' : 'text-indigo-300';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 flex items-center justify-between">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-xs font-semibold ${vCls}`}>{value}</div>
    </div>
  );
}

// ─── 3️⃣ Lower Grid — Active Positions + Performance ──────────────────────

function ActivePositionsCard({ positions }: { positions: PortfolioPosition[] }) {
  return (
    <HubCard title="Active Positions" right="live P&L">
      {positions.length === 0 ? (
        <div className="py-6 text-center text-sm text-zinc-500">No open positions.</div>
      ) : (
        <div className="space-y-3">
          {positions.slice(0, 5).map(pos => {
            const rNow = pos.entryPrice !== 0 ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice * (pos.side === 'SHORT' ? -1 : 1)).toFixed(1) + 'R' : '—';
            return (
              <div key={pos.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{pos.symbol}</div>
                    <div className="text-xs text-zinc-400">{pos.side} · ${pos.entryPrice.toFixed(2)}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className={`text-xs font-semibold ${pos.pl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {pos.pl >= 0 ? '+' : ''}{pos.plPercent.toFixed(1)}%
                    </div>
                    <div className="text-xs text-zinc-400">R: {rNow}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <Link
          href="/tools/journal"
          className="flex-1 rounded-xl bg-zinc-950/40 border border-zinc-800 px-4 py-2 text-center text-sm font-semibold hover:bg-zinc-800 transition"
        >
          Open Journal
        </Link>
        <Link
          href="/tools/portfolio"
          className="flex-1 rounded-xl bg-zinc-950/40 border border-zinc-800 px-4 py-2 text-center text-sm font-semibold hover:bg-zinc-800 transition"
        >
          Portfolio
        </Link>
      </div>
    </HubCard>
  );
}

function PerformanceSnapshotCard({ summary }: { summary: HubSummary | null }) {
  const [stats, setStats] = useState<{
    winRate: string;
    avgR: string;
    bestSetup: string;
    leak: string;
    note: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/journal?limit=50');
        if (!res.ok) return;
        const data = await res.json();
        const entries = data?.entries ?? data ?? [];
        if (!Array.isArray(entries) || entries.length === 0) return;

        const closed = entries.filter((e: { outcome?: string; isOpen?: boolean }) => !e.isOpen && e.outcome !== 'open');
        if (closed.length === 0) return;

        const wins = closed.filter((e: { outcome?: string }) => e.outcome === 'win').length;
        const winRate = ((wins / closed.length) * 100).toFixed(0) + '%';
        const avgR = (closed.reduce((s: number, e: { rMultiple?: number }) => s + (e.rMultiple ?? 0), 0) / closed.length).toFixed(2);

        // Best setup
        const setupCount: Record<string, number> = {};
        for (const e of closed) { const s = e.setup ?? e.strategy ?? 'Unknown'; setupCount[s] = (setupCount[s] ?? 0) + 1; }
        const bestSetup = Object.entries(setupCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';

        // Worst behavior — find biggest losing pattern
        const losers = closed.filter((e: { outcome?: string }) => e.outcome === 'loss');
        const loserNotes = losers.map((e: { notes?: string; emotions?: string }) => e.notes ?? e.emotions ?? '').filter(Boolean);
        const leak = loserNotes.length > 0 ? 'See journal' : 'None detected';

        const note = Number(winRate) < 45
          ? 'Win rate below baseline. Review setup selection quality.'
          : Number(avgR) < 0.3
          ? 'R-multiple low. Tighten stop placement or improve entries.'
          : 'Performance within expected parameters. Stay disciplined.';

        if (!cancelled) setStats({ winRate, avgR, bestSetup, leak, note });
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <HubCard title="Performance Snapshot" right="recent trades">
      <div className="grid grid-cols-2 gap-4">
        <Metric label="Win Rate" value={stats?.winRate ?? '—'} />
        <Metric label="Avg R" value={stats?.avgR ?? '—'} />
        <Metric label="Best Setup" value={stats?.bestSetup ?? '—'} />
        <Metric label="Leak" value={stats?.leak ?? '—'} />
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="text-xs text-zinc-400">Discipline Note</div>
        <div className="mt-1 text-sm font-semibold">
          {stats?.note ?? 'Loading performance data…'}
        </div>
      </div>
    </HubCard>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CommandHubPage() {
  const router = useRouter();
  const { isRetail } = useDisplayMode();
  const { isLoggedIn, isLoading: tierLoading } = useUserTier();
  const { summary, positions, picks, loading } = useCommandHubData();

  // Redirect retail users to their dashboard
  useEffect(() => {
    if (!tierLoading && isRetail) {
      router.replace('/tools/dashboard');
    }
  }, [isRetail, tierLoading, router]);

  const handleSearch = useCallback((q: string) => {
    router.push(`/tools/markets?symbol=${encodeURIComponent(q.toUpperCase())}&type=equities`);
  }, [router]);

  if (isRetail) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* 1️⃣ Global State Strip */}
      <GlobalStateStrip />

      {/* Shell */}
      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {/* Header Row */}
        <HubHeaderRow onSearchSubmit={handleSearch} />

        {/* 2️⃣ Core Decision Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Column 1 */}
          <div className="space-y-6">
            <BiasEngineCard />
            <OpportunityScannerCard picks={picks} />
          </div>

          {/* Column 2 */}
          <div className="space-y-6">
            <TradePermissionMatrixCard />
            <CapitalFlowPanelCard />
          </div>

          {/* Column 3 */}
          <div className="space-y-6">
            <EventRiskCard summary={summary} />
            <SystemIntegrityCard summary={summary} />
          </div>
        </div>

        {/* 3️⃣ Lower Layer — Active Trade Control */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <ActivePositionsCard positions={positions} />
          </div>
          <div className="xl:col-span-1">
            <PerformanceSnapshotCard summary={summary} />
          </div>
        </div>
      </div>
    </div>
  );
}
