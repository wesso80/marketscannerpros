'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import Link from 'next/link';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Unified Trading Intelligence Platform
   ═══════════════════════════════════════════════════════════════════════════
   Single-file implementation of the 7-surface decision workflow:
     Dashboard → Scanner → Golden Egg → Trade Terminal → Market Explorer → Research → Workspace

   This file is self-contained at /v2 and does NOT affect the existing site.
   When ready, this replaces current /tools/* pages.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Types ────────────────────────────────────────────────────────────────────

type RegimePriority = 'trend' | 'range' | 'compression' | 'transition' | 'expansion' | 'risk_off' | 'risk_on';
type VolRegime = 'compression' | 'neutral' | 'transition' | 'expansion' | 'climax';
type Bias = 'bullish' | 'bearish' | 'neutral';
type Verdict = 'TRADE' | 'WATCH' | 'NO_TRADE';
type LifecycleState = 'DISCOVERED' | 'WATCHING' | 'SETTING_UP' | 'READY' | 'TRIGGERED' | 'ACTIVE' | 'COMPLETED' | 'INVALIDATED';
type AssetClass = 'equity' | 'crypto' | 'commodity' | 'fx' | 'index';

type Surface = 'dashboard' | 'scanner' | 'golden-egg' | 'terminal' | 'explorer' | 'research' | 'workspace';

interface SymbolIntelligence {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  change: number;
  regimePriority: RegimePriority;
  regimeCompatibility: string[];
  directionalBias: Bias;
  structureQuality: number;
  confluenceScore: number;
  timeAlignment: number;
  confidence: number;
  volatilityState: { regime: VolRegime; persistence: number; bbwp: number };
  optionsInfluence: { flowBias: Bias; gammaContext: string; ivRegime: string; expectedMove: number };
  crossMarketInfluence: { alignment: 'supportive' | 'neutral' | 'headwind'; factors: string[]; adjustedConfidence: number };
  triggerCondition: string;
  invalidation: string;
  targets: number[];
  riskReward: number;
  lifecycleState: LifecycleState;
  verdict: Verdict;
  mspScore: number;
}

interface JournalEntry {
  id: string;
  symbol: string;
  date: string;
  setupType: string;
  regime: RegimePriority;
  entry: number;
  exit: number | null;
  rr: number | null;
  outcome: 'win' | 'loss' | 'scratch' | 'open';
  notes: string;
}

interface WatchlistItem {
  symbol: string;
  addedAt: string;
  lifecycleState: LifecycleState;
  alertCondition: string;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  symbols: string[];
  category: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  forecast: string;
  previous: string;
  category: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REGIME_COLORS: Record<RegimePriority, string> = {
  trend: '#10B981',
  range: '#6366F1',
  compression: '#3B82F6',
  transition: '#A855F7',
  expansion: '#F59E0B',
  risk_off: '#EF4444',
  risk_on: '#22C55E',
};

const VERDICT_COLORS: Record<Verdict, string> = {
  TRADE: '#10B981',
  WATCH: '#F59E0B',
  NO_TRADE: '#EF4444',
};

const LIFECYCLE_COLORS: Record<LifecycleState, string> = {
  DISCOVERED: '#64748B',
  WATCHING: '#6366F1',
  SETTING_UP: '#A855F7',
  READY: '#F59E0B',
  TRIGGERED: '#10B981',
  ACTIVE: '#22C55E',
  COMPLETED: '#3B82F6',
  INVALIDATED: '#EF4444',
};

const VOL_COLORS: Record<VolRegime, string> = {
  compression: '#3B82F6',
  neutral: '#64748B',
  transition: '#A855F7',
  expansion: '#F59E0B',
  climax: '#EF4444',
};

const REGIME_WEIGHTS: Record<string, Record<string, number>> = {
  trend:       { structure: 30, momentum: 20, volatility: 15, options: 20, time: 15 },
  range:       { structure: 20, momentum: 10, volatility: 10, options: 20, time: 40 },
  compression: { structure: 15, momentum: 15, volatility: 35, options: 10, time: 25 },
  transition:  { structure: 20, momentum: 20, volatility: 25, options: 20, time: 15 },
  expansion:   { structure: 15, momentum: 25, volatility: 25, options: 20, time: 15 },
  risk_off:    { structure: 10, momentum: 10, volatility: 30, options: 30, time: 20 },
  risk_on:     { structure: 25, momentum: 25, volatility: 15, options: 20, time: 15 },
};

const CROSS_MARKET: Array<{ from: string; condition: string; effect: string }> = [
  { from: 'DXY', condition: '↑', effect: 'Crypto & equities ↓' },
  { from: 'Oil', condition: '↑', effect: 'Inflation expectations ↑' },
  { from: 'Bond Yields', condition: '↑', effect: 'Growth stocks ↓' },
  { from: 'BTC.D', condition: '↑', effect: 'Altcoins ↓' },
  { from: 'VIX', condition: 'spike', effect: 'Risk-off, equities ↓' },
  { from: 'Gold', condition: '↑', effect: 'Safe haven demand' },
];

// ─── Mock Data Generator ──────────────────────────────────────────────────────

function generateMockIntelligence(): SymbolIntelligence[] {
  const symbols: Array<{ sym: string; name: string; asset: AssetClass; price: number }> = [
    { sym: 'NVDA', name: 'NVIDIA Corp', asset: 'equity', price: 892.50 },
    { sym: 'AAPL', name: 'Apple Inc', asset: 'equity', price: 178.30 },
    { sym: 'TSLA', name: 'Tesla Inc', asset: 'equity', price: 245.80 },
    { sym: 'MSFT', name: 'Microsoft Corp', asset: 'equity', price: 415.60 },
    { sym: 'AMZN', name: 'Amazon.com', asset: 'equity', price: 186.40 },
    { sym: 'META', name: 'Meta Platforms', asset: 'equity', price: 502.30 },
    { sym: 'GOOGL', name: 'Alphabet Inc', asset: 'equity', price: 155.80 },
    { sym: 'BTC', name: 'Bitcoin', asset: 'crypto', price: 87250.00 },
    { sym: 'ETH', name: 'Ethereum', asset: 'crypto', price: 3180.50 },
    { sym: 'SOL', name: 'Solana', asset: 'crypto', price: 142.30 },
    { sym: 'XRP', name: 'Ripple', asset: 'crypto', price: 0.73 },
    { sym: 'AVAX', name: 'Avalanche', asset: 'crypto', price: 38.60 },
    { sym: 'GC', name: 'Gold Futures', asset: 'commodity', price: 2185.40 },
    { sym: 'CL', name: 'Crude Oil', asset: 'commodity', price: 78.20 },
    { sym: 'SI', name: 'Silver Futures', asset: 'commodity', price: 24.85 },
    { sym: 'DX', name: 'US Dollar Index', asset: 'index', price: 103.80 },
    { sym: 'SPX', name: 'S&P 500', asset: 'index', price: 5234.50 },
    { sym: 'NDX', name: 'Nasdaq 100', asset: 'index', price: 18520.30 },
  ];

  const regimes: RegimePriority[] = ['trend', 'range', 'compression', 'transition', 'expansion', 'risk_off', 'risk_on'];
  const volRegimes: VolRegime[] = ['compression', 'neutral', 'transition', 'expansion', 'climax'];
  const biases: Bias[] = ['bullish', 'bearish', 'neutral'];
  const verdicts: Verdict[] = ['TRADE', 'WATCH', 'NO_TRADE'];
  const lifecycles: LifecycleState[] = ['DISCOVERED', 'WATCHING', 'SETTING_UP', 'READY', 'TRIGGERED', 'ACTIVE'];

  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  return symbols.map(s => {
    const regime = pick(regimes);
    const bias = pick(biases);
    const conf = rand(35, 95);
    const struct = rand(40, 95);
    const time = rand(30, 95);
    const confl = rand(45, 95);
    const bbwp = rand(5, 95);
    const vr = bbwp < 15 ? 'compression' : bbwp < 40 ? 'neutral' : bbwp < 60 ? 'transition' : bbwp < 90 ? 'expansion' : 'climax';
    const score = Math.round((struct * 0.25 + confl * 0.25 + time * 0.2 + conf * 0.3));
    const v: Verdict = score > 75 ? 'TRADE' : score > 55 ? 'WATCH' : 'NO_TRADE';
    const change = (Math.random() * 10 - 3).toFixed(2);

    return {
      symbol: s.sym,
      name: s.name,
      assetClass: s.asset,
      price: s.price,
      change: parseFloat(change),
      regimePriority: regime,
      regimeCompatibility: regime === 'trend' ? ['breakout', 'continuation'] : regime === 'range' ? ['mean_reversion', 'sweep_reversal'] : ['vol_expansion', 'squeeze'],
      directionalBias: bias,
      structureQuality: struct,
      confluenceScore: confl,
      timeAlignment: time,
      confidence: conf,
      volatilityState: { regime: vr as VolRegime, persistence: rand(30, 90), bbwp },
      optionsInfluence: {
        flowBias: pick(biases),
        gammaContext: pick(['positive gamma', 'negative gamma', 'neutral gamma']),
        ivRegime: pick(['low IV', 'mid IV', 'high IV', 'IV crush']),
        expectedMove: parseFloat((Math.random() * 8 + 1).toFixed(1)),
      },
      crossMarketInfluence: {
        alignment: pick(['supportive', 'neutral', 'headwind']),
        factors: [pick(['DXY weakening', 'VIX declining', 'Yields stable', 'BTC.D falling', 'Oil rising'])],
        adjustedConfidence: conf + rand(-10, 5),
      },
      triggerCondition: `Break ${bias === 'bullish' ? 'above' : 'below'} ${(s.price * (1 + (bias === 'bullish' ? 0.02 : -0.02))).toFixed(2)}`,
      invalidation: `Close ${bias === 'bullish' ? 'below' : 'above'} ${(s.price * (1 + (bias === 'bullish' ? -0.03 : 0.03))).toFixed(2)}`,
      targets: [
        parseFloat((s.price * (1 + (bias === 'bullish' ? 0.04 : -0.04))).toFixed(2)),
        parseFloat((s.price * (1 + (bias === 'bullish' ? 0.07 : -0.07))).toFixed(2)),
      ],
      riskReward: parseFloat((1.5 + Math.random() * 2.5).toFixed(1)),
      lifecycleState: pick(lifecycles),
      verdict: v,
      mspScore: score,
    };
  });
}

function generateMockNews(): NewsItem[] {
  return [
    { id: '1', title: 'Fed Signals Potential Rate Cut in June Meeting', source: 'Reuters', time: '2h ago', impact: 'high', symbols: ['SPX', 'NDX', 'DX'], category: 'Macro' },
    { id: '2', title: 'NVIDIA Beats Revenue Estimates by 12%', source: 'Bloomberg', time: '4h ago', impact: 'high', symbols: ['NVDA', 'NDX'], category: 'Earnings' },
    { id: '3', title: 'Bitcoin ETF Inflows Hit $1.2B Weekly Record', source: 'CoinDesk', time: '5h ago', impact: 'medium', symbols: ['BTC', 'ETH'], category: 'Crypto' },
    { id: '4', title: 'Oil Prices Surge on OPEC+ Supply Cut Extension', source: 'CNBC', time: '6h ago', impact: 'medium', symbols: ['CL', 'GC'], category: 'Commodities' },
    { id: '5', title: 'Tesla Announces New Gigafactory Location', source: 'WSJ', time: '8h ago', impact: 'low', symbols: ['TSLA'], category: 'Corporate' },
    { id: '6', title: 'EU Proposes New Crypto Regulation Framework', source: 'FT', time: '10h ago', impact: 'medium', symbols: ['BTC', 'ETH', 'SOL'], category: 'Regulation' },
    { id: '7', title: 'Gold Hits Record High on Safe Haven Demand', source: 'Kitco', time: '12h ago', impact: 'high', symbols: ['GC', 'SI'], category: 'Commodities' },
    { id: '8', title: 'Apple Vision Pro Sales Below Expectations', source: 'Nikkei', time: '14h ago', impact: 'low', symbols: ['AAPL'], category: 'Corporate' },
  ];
}

function generateMockCalendar(): CalendarEvent[] {
  return [
    { id: '1', title: 'CPI (YoY)', date: '2026-03-15', time: '08:30 ET', impact: 'high', forecast: '2.8%', previous: '3.0%', category: 'Inflation' },
    { id: '2', title: 'FOMC Minutes', date: '2026-03-17', time: '14:00 ET', impact: 'high', forecast: '-', previous: '-', category: 'Monetary Policy' },
    { id: '3', title: 'Initial Jobless Claims', date: '2026-03-15', time: '08:30 ET', impact: 'medium', forecast: '215K', previous: '220K', category: 'Employment' },
    { id: '4', title: 'Retail Sales (MoM)', date: '2026-03-16', time: '08:30 ET', impact: 'medium', forecast: '0.3%', previous: '-0.1%', category: 'Consumer' },
    { id: '5', title: 'Options Expiry (OPEX)', date: '2026-03-21', time: 'All Day', impact: 'high', forecast: '-', previous: '-', category: 'Options' },
    { id: '6', title: 'PMI Flash', date: '2026-03-18', time: '09:45 ET', impact: 'medium', forecast: '51.2', previous: '50.8', category: 'Business' },
  ];
}

function generateMockJournal(): JournalEntry[] {
  return [
    { id: '1', symbol: 'NVDA', date: '2026-03-12', setupType: 'Compression Breakout', regime: 'compression', entry: 875.20, exit: 898.40, rr: 2.8, outcome: 'win', notes: 'DVE expansion signal confirmed' },
    { id: '2', symbol: 'ETH', date: '2026-03-11', setupType: 'Trend Continuation', regime: 'trend', entry: 3050.00, exit: 3180.50, rr: 2.1, outcome: 'win', notes: 'Time confluence cluster aligned' },
    { id: '3', symbol: 'AAPL', date: '2026-03-10', setupType: 'Range Fade', regime: 'range', entry: 182.50, exit: 179.80, rr: -1.0, outcome: 'loss', notes: 'Broke range high — invalidated' },
    { id: '4', symbol: 'BTC', date: '2026-03-09', setupType: 'Volatility Expansion', regime: 'expansion', entry: 84200.00, exit: 87250.00, rr: 3.2, outcome: 'win', notes: 'BBWP breakout from 12 to 78' },
    { id: '5', symbol: 'SOL', date: '2026-03-13', setupType: 'Compression Breakout', regime: 'compression', entry: 138.50, exit: null, rr: null, outcome: 'open', notes: 'Watching for DVE expansion' },
  ];
}

function generateMockWatchlist(): WatchlistItem[] {
  return [
    { symbol: 'NVDA', addedAt: '2026-03-12', lifecycleState: 'ACTIVE', alertCondition: 'Break above 900' },
    { symbol: 'ETH', addedAt: '2026-03-10', lifecycleState: 'READY', alertCondition: 'DVE expansion begins' },
    { symbol: 'XRP', addedAt: '2026-03-13', lifecycleState: 'SETTING_UP', alertCondition: 'Confluence > 80' },
    { symbol: 'AAPL', addedAt: '2026-03-11', lifecycleState: 'WATCHING', alertCondition: 'Range breakout' },
    { symbol: 'GC', addedAt: '2026-03-09', lifecycleState: 'TRIGGERED', alertCondition: 'New ATH break' },
    { symbol: 'SOL', addedAt: '2026-03-08', lifecycleState: 'DISCOVERED', alertCondition: 'Time cluster alignment' },
  ];
}

// ─── Utility Components ───────────────────────────────────────────────────────

function Badge({ label, color, small }: { label: string; color: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
    >
      {label}
    </span>
  );
}

function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      className={`rounded-xl border border-slate-700/50 bg-[#101A2A] p-4 ${onClick ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ScoreBar({ value, max = 100, color = '#10B981' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-700/50 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function StatBox({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold" style={{ color: color || '#fff' }}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="text-sm">{message}</div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-thin">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            active === t
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ImpactDot({ impact }: { impact: 'high' | 'medium' | 'low' }) {
  const c = impact === 'high' ? '#EF4444' : impact === 'medium' ? '#F59E0B' : '#64748B';
  return <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c }} />;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{ id: Surface; label: string; icon: string; shortLabel: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎', shortLabel: 'Dash' },
  { id: 'scanner', label: 'Scanner', icon: '⊞', shortLabel: 'Scan' },
  { id: 'golden-egg', label: 'Golden Egg', icon: '◆', shortLabel: 'GE' },
  { id: 'terminal', label: 'Trade Terminal', icon: '▤', shortLabel: 'Term' },
  { id: 'explorer', label: 'Market Explorer', icon: '◈', shortLabel: 'Expl' },
  { id: 'research', label: 'Research', icon: '◇', shortLabel: 'Res' },
  { id: 'workspace', label: 'Workspace', icon: '⊡', shortLabel: 'Work' },
];

function TopNav({ active, onChange }: { active: Surface; onChange: (s: Surface) => void }) {
  return (
    <nav className="sticky top-0 z-50 bg-[#0A101C]/95 backdrop-blur-sm border-b border-slate-700/50">
      <div className="max-w-[1800px] mx-auto px-3 flex items-center gap-1 h-12 overflow-x-auto scrollbar-thin">
        <Link href="/" className="text-emerald-400 font-bold text-sm mr-3 whitespace-nowrap flex-shrink-0">
          MSP<span className="text-slate-500 font-normal ml-1">v2</span>
        </Link>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              active === item.id
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span className="text-sm">{item.icon}</span>
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sm:hidden">{item.shortLabel}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Regime Bar (shared across surfaces) ──────────────────────────────────────

function RegimeBar({ data }: { data: SymbolIntelligence[] }) {
  const regimeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(d => { counts[d.regimePriority] = (counts[d.regimePriority] || 0) + 1; });
    return counts;
  }, [data]);

  const dominant = Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[#0D1422] border-b border-slate-800/50 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 whitespace-nowrap">Market Regime</span>
      <Badge label={dominant?.[0] || 'neutral'} color={REGIME_COLORS[dominant?.[0] as RegimePriority] || '#64748B'} small />
      <div className="h-3 w-px bg-slate-700" />
      {Object.entries(regimeCounts).map(([r, c]) => (
        <span key={r} className="text-[10px] text-slate-500 whitespace-nowrap">
          <span style={{ color: REGIME_COLORS[r as RegimePriority] }}>{r}</span>
          <span className="text-slate-600 ml-1">{c}</span>
        </span>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE 1: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardSurface({ data, news, calendar, onNavigate, onSelectSymbol }: {
  data: SymbolIntelligence[];
  news: NewsItem[];
  calendar: CalendarEvent[];
  onNavigate: (s: Surface) => void;
  onSelectSymbol: (sym: string) => void;
}) {
  const topSetups = useMemo(() => [...data].sort((a, b) => b.mspScore - a.mspScore).slice(0, 5), [data]);
  const alerts = useMemo(() => data.filter(d => d.lifecycleState === 'READY' || d.lifecycleState === 'TRIGGERED'), [data]);
  const highImpactEvents = calendar.filter(e => e.impact === 'high');

  return (
    <div className="space-y-4">
      <SectionHeader title="Command Center" subtitle="What matters today" />

      {/* Best Setups Now */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Best Setups Now</h3>
          <button onClick={() => onNavigate('scanner')} className="text-[10px] text-emerald-400 hover:underline">View Scanner →</button>
        </div>
        <div className="space-y-2">
          {topSetups.map(s => (
            <div
              key={s.symbol}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0A101C]/50 hover:bg-slate-800/50 cursor-pointer transition-colors"
              onClick={() => { onSelectSymbol(s.symbol); onNavigate('golden-egg'); }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-sm font-bold text-white w-14">{s.symbol}</div>
                <Badge label={s.regimePriority} color={REGIME_COLORS[s.regimePriority]} small />
                <Badge label={s.verdict} color={VERDICT_COLORS[s.verdict]} small />
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-slate-400">MSP Score</div>
                  <div className="text-sm font-bold" style={{ color: s.mspScore > 75 ? '#10B981' : s.mspScore > 55 ? '#F59E0B' : '#EF4444' }}>
                    {s.mspScore}
                  </div>
                </div>
                <div className="w-16">
                  <ScoreBar value={s.mspScore} color={s.mspScore > 75 ? '#10B981' : s.mspScore > 55 ? '#F59E0B' : '#EF4444'} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Watchlist Alerts */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Active Alerts</h3>
          {alerts.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">No active alerts</div>
          ) : (
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.symbol} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{a.symbol}</span>
                    <Badge label={a.lifecycleState} color={LIFECYCLE_COLORS[a.lifecycleState]} small />
                  </div>
                  <span className="text-slate-400">{a.triggerCondition}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Macro Events Today */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Upcoming Events</h3>
          <div className="space-y-2">
            {highImpactEvents.slice(0, 4).map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center">
                  <ImpactDot impact={e.impact} />
                  <span className="text-white">{e.title}</span>
                </div>
                <span className="text-slate-500">{e.time}</span>
              </div>
            ))}
            <button onClick={() => onNavigate('research')} className="text-[10px] text-emerald-400 hover:underline mt-1">Full Calendar →</button>
          </div>
        </Card>

        {/* Cross-Market */}
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence</h3>
          <div className="space-y-2">
            {CROSS_MARKET.slice(0, 4).map(cm => (
              <div key={cm.from} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{cm.from} {cm.condition}</span>
                <span className="text-slate-500">{cm.effect}</span>
              </div>
            ))}
            <button onClick={() => onNavigate('explorer')} className="text-[10px] text-emerald-400 hover:underline mt-1">Market Explorer →</button>
          </div>
        </Card>
      </div>

      {/* Latest News */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Latest Headlines</h3>
          <button onClick={() => onNavigate('research')} className="text-[10px] text-emerald-400 hover:underline">All News →</button>
        </div>
        <div className="space-y-2">
          {news.slice(0, 4).map(n => (
            <div key={n.id} className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center gap-2 min-w-0">
                <ImpactDot impact={n.impact} />
                <span className="text-white truncate">{n.title}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {n.symbols.slice(0, 2).map(sym => (
                  <span key={sym} className="text-emerald-400 cursor-pointer hover:underline" onClick={() => { onSelectSymbol(sym); onNavigate('golden-egg'); }}>{sym}</span>
                ))}
                <span className="text-slate-600">{n.time}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE 2: SCANNER
// ═══════════════════════════════════════════════════════════════════════════════

function ScannerSurface({ data, onNavigate, onSelectSymbol }: {
  data: SymbolIntelligence[];
  onNavigate: (s: Surface) => void;
  onSelectSymbol: (sym: string) => void;
}) {
  const [tab, setTab] = useState('All Markets');
  const [sortField, setSortField] = useState<'mspScore' | 'confluenceScore' | 'confidence' | 'timeAlignment'>('mspScore');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const tabs = ['All Markets', 'Equities', 'Crypto', 'Commodities', 'Indices', 'Highest Confluence', 'Vol Expansions', 'Trade Ready'];

  const filtered = useMemo(() => {
    let items = [...data];
    switch (tab) {
      case 'Equities': items = items.filter(i => i.assetClass === 'equity'); break;
      case 'Crypto': items = items.filter(i => i.assetClass === 'crypto'); break;
      case 'Commodities': items = items.filter(i => i.assetClass === 'commodity'); break;
      case 'Indices': items = items.filter(i => i.assetClass === 'index'); break;
      case 'Highest Confluence': items = items.filter(i => i.confluenceScore > 75); break;
      case 'Vol Expansions': items = items.filter(i => i.volatilityState.regime === 'expansion' || i.volatilityState.regime === 'climax'); break;
      case 'Trade Ready': items = items.filter(i => i.verdict === 'TRADE'); break;
    }
    items.sort((a, b) => sortDir === 'desc' ? b[sortField] - a[sortField] : a[sortField] - b[sortField]);
    return items;
  }, [data, tab, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortHeader = ({ field, label }: { field: typeof sortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`text-[10px] uppercase tracking-wider ${sortField === field ? 'text-emerald-400' : 'text-slate-500'} hover:text-slate-300 transition-colors`}
    >
      {label} {sortField === field && (sortDir === 'desc' ? '↓' : '↑')}
    </button>
  );

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Scanner"
        subtitle="Regime-aware ranked opportunity engine"
        action={<Badge label={`${filtered.length} results`} color="#64748B" small />}
      />

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* Regime Weight Indicator */}
      <Card className="!p-3">
        <div className="flex items-center gap-4 text-[10px] overflow-x-auto">
          <span className="text-slate-500 uppercase tracking-wider whitespace-nowrap">Regime Weights →</span>
          {Object.entries(REGIME_WEIGHTS.trend).map(([k]) => (
            <span key={k} className="text-slate-400 capitalize whitespace-nowrap">{k}</span>
          ))}
        </div>
      </Card>

      {/* Scanner Table */}
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">Symbol</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Regime</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Bias</th>
              <th className="text-center px-2 py-3"><SortHeader field="mspScore" label="MSP Score" /></th>
              <th className="text-center px-2 py-3"><SortHeader field="confluenceScore" label="Confluence" /></th>
              <th className="text-center px-2 py-3"><SortHeader field="confidence" label="Confidence" /></th>
              <th className="text-center px-2 py-3"><SortHeader field="timeAlignment" label="Time" /></th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">DVE</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Options</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Lifecycle</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Verdict</th>
              <th className="text-center px-2 py-3 text-[10px] uppercase tracking-wider text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.symbol} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{s.symbol}</div>
                  <div className="text-[10px] text-slate-500">{s.name}</div>
                </td>
                <td className="text-center px-2"><Badge label={s.regimePriority} color={REGIME_COLORS[s.regimePriority]} small /></td>
                <td className="text-center px-2">
                  <span style={{ color: s.directionalBias === 'bullish' ? '#2FB36E' : s.directionalBias === 'bearish' ? '#E46767' : '#64748B' }}>
                    {s.directionalBias === 'bullish' ? '▲' : s.directionalBias === 'bearish' ? '▼' : '—'} {s.directionalBias}
                  </span>
                </td>
                <td className="text-center px-2">
                  <span className="font-bold" style={{ color: s.mspScore > 75 ? '#10B981' : s.mspScore > 55 ? '#F59E0B' : '#EF4444' }}>
                    {s.mspScore}
                  </span>
                </td>
                <td className="text-center px-2 text-slate-300">{s.confluenceScore}</td>
                <td className="text-center px-2 text-slate-300">{s.confidence}%</td>
                <td className="text-center px-2 text-slate-300">{s.timeAlignment}</td>
                <td className="text-center px-2"><Badge label={s.volatilityState.regime} color={VOL_COLORS[s.volatilityState.regime]} small /></td>
                <td className="text-center px-2">
                  <span style={{ color: s.optionsInfluence.flowBias === 'bullish' ? '#2FB36E' : s.optionsInfluence.flowBias === 'bearish' ? '#E46767' : '#64748B' }}>
                    {s.optionsInfluence.flowBias}
                  </span>
                </td>
                <td className="text-center px-2"><Badge label={s.lifecycleState} color={LIFECYCLE_COLORS[s.lifecycleState]} small /></td>
                <td className="text-center px-2"><Badge label={s.verdict} color={VERDICT_COLORS[s.verdict]} small /></td>
                <td className="text-center px-2">
                  <button
                    onClick={() => { onSelectSymbol(s.symbol); onNavigate('golden-egg'); }}
                    className="px-2 py-1 rounded text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                  >
                    Analyze
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="No symbols match current filter" icon="⊘" />}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE 3: GOLDEN EGG
// ═══════════════════════════════════════════════════════════════════════════════

function GoldenEggSurface({ data, selectedSymbol, onSelectSymbol, onNavigate }: {
  data: SymbolIntelligence[];
  selectedSymbol: string | null;
  onSelectSymbol: (sym: string) => void;
  onNavigate: (s: Surface) => void;
}) {
  const intel = data.find(d => d.symbol === selectedSymbol) || data[0];

  if (!intel) return <EmptyState message="No symbol selected. Choose from Scanner." icon="◆" />;

  return (
    <div className="space-y-4">
      {/* Symbol Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {data.slice(0, 10).map(d => (
          <button
            key={d.symbol}
            onClick={() => onSelectSymbol(d.symbol)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              d.symbol === intel.symbol
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800'
            }`}
          >
            {d.symbol}
          </button>
        ))}
      </div>

      {/* VERDICT HEADER — Critical Upgrade #2 */}
      <Card className="!p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-700/30" style={{ background: `linear-gradient(135deg, ${VERDICT_COLORS[intel.verdict]}08, transparent)` }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{intel.symbol}</h1>
                <span className="text-lg text-slate-400">{intel.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={intel.regimePriority} color={REGIME_COLORS[intel.regimePriority]} />
                <Badge label={intel.directionalBias} color={intel.directionalBias === 'bullish' ? '#2FB36E' : intel.directionalBias === 'bearish' ? '#E46767' : '#64748B'} />
                <Badge label={intel.volatilityState.regime} color={VOL_COLORS[intel.volatilityState.regime]} />
                <Badge label={intel.lifecycleState} color={LIFECYCLE_COLORS[intel.lifecycleState]} />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <StatBox label="MSP Score" value={intel.mspScore} color={VERDICT_COLORS[intel.verdict]} />
              <StatBox label="Confluence" value={intel.confluenceScore} />
              <StatBox label="Confidence" value={`${intel.confidence}%`} />
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Verdict</div>
                <div
                  className="text-xl font-black px-4 py-1 rounded-lg"
                  style={{ color: VERDICT_COLORS[intel.verdict], backgroundColor: VERDICT_COLORS[intel.verdict] + '15' }}
                >
                  {intel.verdict}
                </div>
              </div>
            </div>
          </div>

          {/* Trigger / Invalidation / Targets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-700/30">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Trigger</div>
              <div className="text-sm text-emerald-400 font-medium">{intel.triggerCondition}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Invalidation</div>
              <div className="text-sm text-red-400 font-medium">{intel.invalidation}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Targets</div>
              <div className="text-sm text-white font-medium">{intel.targets.join(' → ')}</div>
              <div className="text-[10px] text-slate-500">RR: {intel.riskReward}x</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section A: Market Context */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">A</span> Market Context
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Regime</div>
            <Badge label={intel.regimePriority} color={REGIME_COLORS[intel.regimePriority]} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">HTF Bias</div>
            <div className="text-sm text-white capitalize">{intel.directionalBias}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Cross-Market</div>
            <Badge label={intel.crossMarketInfluence.alignment} color={intel.crossMarketInfluence.alignment === 'supportive' ? '#10B981' : intel.crossMarketInfluence.alignment === 'headwind' ? '#EF4444' : '#64748B'} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Macro Factor</div>
            <div className="text-xs text-slate-300">{intel.crossMarketInfluence.factors[0] || 'None'}</div>
          </div>
        </div>
      </Card>

      {/* Section B: Structure */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">B</span> Structure
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Structure Quality</div>
            <div className="text-lg font-bold text-white">{intel.structureQuality}/100</div>
            <ScoreBar value={intel.structureQuality} color={intel.structureQuality > 75 ? '#10B981' : intel.structureQuality > 50 ? '#F59E0B' : '#EF4444'} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Compatible Setups</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {intel.regimeCompatibility.map(s => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">{s.replace('_', ' ')}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Price</div>
            <div className="text-lg font-bold text-white">${intel.price.toLocaleString()}</div>
            <div className={`text-xs ${intel.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {intel.change >= 0 ? '+' : ''}{intel.change}%
            </div>
          </div>
        </div>
      </Card>

      {/* Section C: Timing */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">C</span> Timing
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Time Alignment</div>
            <div className="text-lg font-bold text-white">{intel.timeAlignment}/100</div>
            <ScoreBar value={intel.timeAlignment} color='#A855F7' />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Session</div>
            <div className="text-sm text-slate-300">US Regular Hours</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Event Risk</div>
            <div className="text-sm text-amber-400">CPI Tomorrow</div>
          </div>
        </div>
      </Card>

      {/* Section D: Volatility */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">D</span> Volatility (DVE)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">DVE Regime</div>
            <Badge label={intel.volatilityState.regime} color={VOL_COLORS[intel.volatilityState.regime]} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">BBWP</div>
            <div className="text-lg font-bold text-white">{intel.volatilityState.bbwp}</div>
            <ScoreBar value={intel.volatilityState.bbwp} color={VOL_COLORS[intel.volatilityState.regime]} />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Persistence</div>
            <div className="text-sm text-slate-300">{intel.volatilityState.persistence}%</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Expected Move</div>
            <div className="text-sm text-slate-300">{intel.optionsInfluence.expectedMove}%</div>
          </div>
        </div>
      </Card>

      {/* Section E: Options */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">E</span> Options / Derivatives
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Flow Bias</div>
            <span style={{ color: intel.optionsInfluence.flowBias === 'bullish' ? '#2FB36E' : intel.optionsInfluence.flowBias === 'bearish' ? '#E46767' : '#64748B' }} className="text-sm font-medium capitalize">
              {intel.optionsInfluence.flowBias}
            </span>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Gamma</div>
            <div className="text-sm text-slate-300 capitalize">{intel.optionsInfluence.gammaContext}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">IV Regime</div>
            <div className="text-sm text-slate-300 capitalize">{intel.optionsInfluence.ivRegime}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Expected Move</div>
            <div className="text-sm text-slate-300">{intel.optionsInfluence.expectedMove}%</div>
          </div>
        </div>
      </Card>

      {/* Section F: Trade Plan */}
      <Card className="border-emerald-500/20">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-emerald-400">F</span> Trade Plan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">Entry Trigger</div>
              <div className="text-sm text-emerald-400 font-medium">{intel.triggerCondition}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">Stop / Invalidation</div>
              <div className="text-sm text-red-400 font-medium">{intel.invalidation}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">Target Ladder</div>
              <div className="text-sm text-white">{intel.targets.map((t, i) => `T${i+1}: $${t.toLocaleString()}`).join(', ')}</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="R:R" value={`${intel.riskReward}x`} color="#10B981" />
              <StatBox label="Confidence" value={`${intel.confidence}%`} />
              <StatBox label="Score" value={intel.mspScore} color={VERDICT_COLORS[intel.verdict]} />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onNavigate('terminal')}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                Open in Trade Terminal →
              </button>
              <button
                onClick={() => onNavigate('workspace')}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 transition-colors"
              >
                + Watchlist
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE 4: TRADE TERMINAL
// ═══════════════════════════════════════════════════════════════════════════════

function TradeTerminalSurface({ data, selectedSymbol, onSelectSymbol }: {
  data: SymbolIntelligence[];
  selectedSymbol: string | null;
  onSelectSymbol: (sym: string) => void;
}) {
  const [tab, setTab] = useState('Chart');
  const tabs = ['Chart', 'Options', 'Volatility', 'Risk', 'Execution Notes'];
  const intel = data.find(d => d.symbol === selectedSymbol) || data[0];

  const [accountSize, setAccountSize] = useState('50000');
  const [riskPct, setRiskPct] = useState('1');

  if (!intel) return <EmptyState message="No symbol selected" icon="▤" />;

  const riskDollars = (parseFloat(accountSize) * parseFloat(riskPct) / 100) || 0;
  const stopDist = Math.abs(intel.price - intel.targets[0]) * 0.3;
  const posSize = stopDist > 0 ? Math.floor(riskDollars / stopDist) : 0;

  return (
    <div className="space-y-4">
      {/* Symbol bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{intel.symbol}</h2>
          <span className="text-lg text-slate-400">${intel.price.toLocaleString()}</span>
          <span className={`text-sm ${intel.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {intel.change >= 0 ? '+' : ''}{intel.change}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge label={intel.verdict} color={VERDICT_COLORS[intel.verdict]} small />
          <Badge label={intel.regimePriority} color={REGIME_COLORS[intel.regimePriority]} small />
        </div>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Chart' && (
        <Card>
          <div className="aspect-[16/9] bg-[#0A101C] rounded-lg border border-slate-800/50 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <div className="text-4xl mb-3">📊</div>
              <div className="text-sm">Multi-timeframe chart</div>
              <div className="text-xs text-slate-600 mt-1">TradingView widget integration point</div>
              <div className="flex gap-2 justify-center mt-3">
                {['15m', '1H', '4H', 'D', 'W'].map(tf => (
                  <span key={tf} className="px-2 py-1 rounded text-[10px] bg-slate-800 text-slate-400">{tf}</span>
                ))}
              </div>
            </div>
          </div>
          {/* Key Levels Overlay */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-[10px] text-emerald-400 uppercase">Entry</div>
              <div className="text-sm font-bold text-white">{intel.triggerCondition}</div>
            </div>
            <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
              <div className="text-[10px] text-red-400 uppercase">Stop</div>
              <div className="text-sm font-bold text-white">{intel.invalidation}</div>
            </div>
            <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
              <div className="text-[10px] text-blue-400 uppercase">Targets</div>
              <div className="text-sm font-bold text-white">{intel.targets.join(' → ')}</div>
            </div>
          </div>
        </Card>
      )}

      {tab === 'Options' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Options Chain</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatBox label="Flow Bias" value={intel.optionsInfluence.flowBias} color={intel.optionsInfluence.flowBias === 'bullish' ? '#2FB36E' : '#E46767'} />
            <StatBox label="IV Regime" value={intel.optionsInfluence.ivRegime} />
            <StatBox label="Gamma" value={intel.optionsInfluence.gammaContext} />
            <StatBox label="Expected Move" value={`${intel.optionsInfluence.expectedMove}%`} color="#F59E0B" />
          </div>
          <div className="bg-[#0A101C] rounded-lg border border-slate-800/50 p-8 text-center text-slate-500">
            <div className="text-2xl mb-2">⛓</div>
            <div className="text-sm">Options chain integration point</div>
            <div className="text-xs text-slate-600 mt-1">Strikes, IV, Greeks, OI visualization</div>
          </div>
        </Card>
      )}

      {tab === 'Volatility' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Volatility Dashboard</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">DVE Regime</div>
              <Badge label={intel.volatilityState.regime} color={VOL_COLORS[intel.volatilityState.regime]} />
            </div>
            <StatBox label="BBWP" value={intel.volatilityState.bbwp} />
            <StatBox label="Persistence" value={`${intel.volatilityState.persistence}%`} />
            <StatBox label="Expected Move" value={`${intel.optionsInfluence.expectedMove}%`} color="#F59E0B" />
          </div>
          <div className="bg-[#0A101C] rounded-lg border border-slate-800/50 p-8 text-center text-slate-500">
            <div className="text-2xl mb-2">📈</div>
            <div className="text-sm">GEX, OI, dealer positioning visualization</div>
          </div>
        </Card>
      )}

      {tab === 'Risk' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Position Size Calculator</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Account Size ($)</label>
                <input
                  type="number"
                  value={accountSize}
                  onChange={e => setAccountSize(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#0A101C] border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Risk Per Trade (%)</label>
                <input
                  type="number"
                  value={riskPct}
                  onChange={e => setRiskPct(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[#0A101C] border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatBox label="Risk ($)" value={`$${riskDollars.toFixed(0)}`} color="#EF4444" />
              <StatBox label="Position Size" value={`${posSize} shares`} color="#10B981" />
              <StatBox label="R:R Ratio" value={`${intel.riskReward}x`} color="#F59E0B" />
              <StatBox label="Max Gain" value={`$${(riskDollars * intel.riskReward).toFixed(0)}`} color="#10B981" />
            </div>
          </div>
        </Card>
      )}

      {tab === 'Execution Notes' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Setup Checklist</h3>
          <div className="space-y-3">
            {[
              { label: 'Regime compatible', check: true, detail: `${intel.regimePriority} regime — ${intel.regimeCompatibility.join(', ')} setups valid` },
              { label: 'Structure quality > 60', check: intel.structureQuality > 60, detail: `Structure: ${intel.structureQuality}` },
              { label: 'Confluence score > 70', check: intel.confluenceScore > 70, detail: `Confluence: ${intel.confluenceScore}` },
              { label: 'Time alignment > 50', check: intel.timeAlignment > 50, detail: `Time: ${intel.timeAlignment}` },
              { label: 'Cross-market alignment', check: intel.crossMarketInfluence.alignment !== 'headwind', detail: `${intel.crossMarketInfluence.alignment}: ${intel.crossMarketInfluence.factors[0]}` },
              { label: 'Options flow supportive', check: intel.optionsInfluence.flowBias === intel.directionalBias, detail: `Flow: ${intel.optionsInfluence.flowBias}` },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#0A101C]/50">
                <span className={`text-lg ${item.check ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.check ? '✓' : '✗'}
                </span>
                <div>
                  <div className="text-sm text-white">{item.label}</div>
                  <div className="text-[10px] text-slate-500">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-slate-800/30">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Notes</div>
            <textarea
              className="w-full bg-transparent text-sm text-white border-none focus:outline-none resize-none"
              rows={3}
              placeholder="Execution notes..."
            />
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE 5: MARKET EXPLORER
// ═══════════════════════════════════════════════════════════════════════════════

function MarketExplorerSurface({ data, onNavigate, onSelectSymbol }: {
  data: SymbolIntelligence[];
  onNavigate: (s: Surface) => void;
  onSelectSymbol: (sym: string) => void;
}) {
  const [tab, setTab] = useState('Overview');
  const tabs = ['Overview', 'Equities', 'Crypto', 'Commodities', 'Indices', 'Sectors', 'Volatility'];

  const byClass = useMemo(() => {
    const groups: Record<string, SymbolIntelligence[]> = {};
    data.forEach(d => {
      if (!groups[d.assetClass]) groups[d.assetClass] = [];
      groups[d.assetClass].push(d);
    });
    return groups;
  }, [data]);

  const topMovers = useMemo(() => [...data].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8), [data]);
  const volExpansions = useMemo(() => data.filter(d => d.volatilityState.regime === 'expansion' || d.volatilityState.regime === 'climax'), [data]);

  const renderHeatmap = (items: SymbolIntelligence[]) => (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {items.map(s => (
        <div
          key={s.symbol}
          className="p-3 rounded-lg cursor-pointer hover:ring-1 hover:ring-slate-600 transition-all"
          style={{
            backgroundColor: s.change >= 0
              ? `rgba(16, 185, 129, ${Math.min(0.4, Math.abs(s.change) / 10)})`
              : `rgba(239, 68, 68, ${Math.min(0.4, Math.abs(s.change) / 10)})`,
          }}
          onClick={() => { onSelectSymbol(s.symbol); onNavigate('golden-egg'); }}
        >
          <div className="text-sm font-bold text-white">{s.symbol}</div>
          <div className={`text-xs font-semibold ${s.change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            {s.change >= 0 ? '+' : ''}{s.change}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">${s.price.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionHeader title="Market Explorer" subtitle="Cross-market intelligence" />
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Overview' && (
        <>
          {/* Heatmap */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Market Heatmap</h3>
            {renderHeatmap(data)}
          </Card>

          {/* Top Movers + Vol Expansions side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Top Movers</h3>
              <div className="space-y-2">
                {topMovers.map(s => (
                  <div key={s.symbol} className="flex items-center justify-between text-xs py-1 cursor-pointer hover:bg-slate-800/30 px-2 rounded" onClick={() => { onSelectSymbol(s.symbol); onNavigate('golden-egg'); }}>
                    <span className="font-semibold text-white w-12">{s.symbol}</span>
                    <span className="text-slate-400">${s.price.toLocaleString()}</span>
                    <span className={s.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {s.change >= 0 ? '+' : ''}{s.change}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-white mb-3">Volatility Expansions</h3>
              {volExpansions.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No active expansions</div>
              ) : (
                <div className="space-y-2">
                  {volExpansions.map(s => (
                    <div key={s.symbol} className="flex items-center justify-between text-xs py-1 cursor-pointer hover:bg-slate-800/30 px-2 rounded" onClick={() => { onSelectSymbol(s.symbol); onNavigate('golden-egg'); }}>
                      <span className="font-semibold text-white w-12">{s.symbol}</span>
                      <Badge label={s.volatilityState.regime} color={VOL_COLORS[s.volatilityState.regime]} small />
                      <span className="text-slate-400">BBWP: {s.volatilityState.bbwp}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Cross-Market Influence */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Cross-Market Influence Map</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {CROSS_MARKET.map(cm => (
                <div key={cm.from} className="p-3 rounded-lg bg-[#0A101C]/50 border border-slate-800/30">
                  <div className="text-sm font-semibold text-white">{cm.from} {cm.condition}</div>
                  <div className="text-xs text-slate-400 mt-1">{cm.effect}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Asset class tabs */}
      {['Equities', 'Crypto', 'Commodities', 'Indices'].includes(tab) && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">{tab}</h3>
          {renderHeatmap(
            data.filter(d =>
              tab === 'Equities' ? d.assetClass === 'equity' :
              tab === 'Crypto' ? d.assetClass === 'crypto' :
              tab === 'Commodities' ? d.assetClass === 'commodity' :
              d.assetClass === 'index'
            )
          )}
        </Card>
      )}

      {tab === 'Sectors' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Sector Rotation</h3>
          <div className="bg-[#0A101C] rounded-lg border border-slate-800/50 p-8 text-center text-slate-500">
            <div className="text-2xl mb-2">◐</div>
            <div className="text-sm">Sector rotation heatmap</div>
            <div className="text-xs text-slate-600 mt-1">Technology, Healthcare, Financials, Energy, etc.</div>
          </div>
        </Card>
      )}

      {tab === 'Volatility' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Volatility Dashboard</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.entries(VOL_COLORS).map(([regime, color]) => {
              const count = data.filter(d => d.volatilityState.regime === regime).length;
              return (
                <div key={regime} className="text-center p-3 rounded-lg bg-[#0A101C]/50">
                  <div className="text-lg font-bold" style={{ color }}>{count}</div>
                  <div className="text-[10px] text-slate-500 uppercase">{regime}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE 6: RESEARCH
// ═══════════════════════════════════════════════════════════════════════════════

function ResearchSurface({ news, calendar, onNavigate, onSelectSymbol }: {
  news: NewsItem[];
  calendar: CalendarEvent[];
  onNavigate: (s: Surface) => void;
  onSelectSymbol: (sym: string) => void;
}) {
  const [tab, setTab] = useState('News');
  const tabs = ['News', 'Economic Calendar', 'Earnings', 'Themes'];

  return (
    <div className="space-y-4">
      <SectionHeader title="Research" subtitle="Actionable information layer" />
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'News' && (
        <div className="space-y-2">
          {news.map(n => (
            <Card key={n.id} className="!p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ImpactDot impact={n.impact} />
                    <span className="text-[10px] text-slate-500 uppercase">{n.category}</span>
                    <span className="text-[10px] text-slate-600">{n.source}</span>
                  </div>
                  <div className="text-sm text-white font-medium">{n.title}</div>
                  <div className="flex gap-2 mt-2">
                    {n.symbols.map(sym => (
                      <button
                        key={sym}
                        onClick={() => { onSelectSymbol(sym); onNavigate('golden-egg'); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-slate-600 whitespace-nowrap flex-shrink-0">{n.time}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Economic Calendar' && (
        <Card className="!p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-[10px] uppercase text-slate-500">Event</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Date</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Time</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Impact</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Forecast</th>
                <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Previous</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map(e => (
                <tr key={e.id} className="border-b border-slate-800/30">
                  <td className="px-4 py-3">
                    <div className="text-white">{e.title}</div>
                    <div className="text-[10px] text-slate-500">{e.category}</div>
                  </td>
                  <td className="text-center px-2 text-slate-400">{e.date}</td>
                  <td className="text-center px-2 text-slate-400">{e.time}</td>
                  <td className="text-center px-2"><ImpactDot impact={e.impact} /><span className="text-slate-400 capitalize">{e.impact}</span></td>
                  <td className="text-center px-2 text-white font-medium">{e.forecast}</td>
                  <td className="text-center px-2 text-slate-500">{e.previous}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'Earnings' && (
        <Card>
          <EmptyState message="Earnings calendar — coming in v3" icon="📅" />
        </Card>
      )}

      {tab === 'Themes' && (
        <Card>
          <EmptyState message="Market themes & AI summaries — coming in v3" icon="🎯" />
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE 7: WORKSPACE
// ═══════════════════════════════════════════════════════════════════════════════

function WorkspaceSurface({ data, journal, watchlist, onNavigate, onSelectSymbol }: {
  data: SymbolIntelligence[];
  journal: JournalEntry[];
  watchlist: WatchlistItem[];
  onNavigate: (s: Surface) => void;
  onSelectSymbol: (sym: string) => void;
}) {
  const [tab, setTab] = useState('Watchlist');
  const tabs = ['Watchlist', 'Journal', 'Portfolio', 'Backtest', 'Learning', 'Settings'];

  // Journal stats
  const journalStats = useMemo(() => {
    const closed = journal.filter(j => j.outcome !== 'open');
    const wins = closed.filter(j => j.outcome === 'win').length;
    const total = closed.length;
    const avgRR = closed.filter(j => j.rr !== null).reduce((sum, j) => sum + (j.rr || 0), 0) / (total || 1);
    return { wins, total, winRate: total > 0 ? Math.round((wins / total) * 100) : 0, avgRR: avgRR.toFixed(1) };
  }, [journal]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Workspace" subtitle="Personal management & learning" />
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Watchlist' && (
        <>
          {/* Lifecycle Pipeline */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Trade Pipeline</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(['DISCOVERED', 'WATCHING', 'SETTING_UP', 'READY', 'TRIGGERED', 'ACTIVE'] as LifecycleState[]).map(state => {
                const count = watchlist.filter(w => w.lifecycleState === state).length;
                return (
                  <div key={state} className="flex-shrink-0 text-center px-4 py-2 rounded-lg bg-[#0A101C]/50 min-w-[100px]">
                    <div className="text-lg font-bold" style={{ color: LIFECYCLE_COLORS[state] }}>{count}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{state.replace('_', ' ')}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Watchlist */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Active Watchlist</h3>
            <div className="space-y-2">
              {watchlist.map(w => (
                <div key={w.symbol} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0A101C]/50 hover:bg-slate-800/30 cursor-pointer"
                     onClick={() => { onSelectSymbol(w.symbol); onNavigate('golden-egg'); }}>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white text-sm">{w.symbol}</span>
                    <Badge label={w.lifecycleState} color={LIFECYCLE_COLORS[w.lifecycleState]} small />
                  </div>
                  <div className="text-xs text-slate-400">{w.alertCondition}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'Journal' && (
        <>
          {/* Stats Bar */}
          <Card className="!p-3">
            <div className="flex items-center justify-around">
              <StatBox label="Win Rate" value={`${journalStats.winRate}%`} color={journalStats.winRate > 50 ? '#10B981' : '#EF4444'} />
              <StatBox label="Wins/Total" value={`${journalStats.wins}/${journalStats.total}`} />
              <StatBox label="Avg RR" value={`${journalStats.avgRR}x`} color="#F59E0B" />
              <StatBox label="Open" value={journal.filter(j => j.outcome === 'open').length} color="#6366F1" />
            </div>
          </Card>

          {/* Journal Entries */}
          <Card className="!p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-[10px] uppercase text-slate-500">Symbol</th>
                  <th className="text-left px-2 py-3 text-[10px] uppercase text-slate-500">Date</th>
                  <th className="text-left px-2 py-3 text-[10px] uppercase text-slate-500">Setup</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Regime</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Entry</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Exit</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">RR</th>
                  <th className="text-center px-2 py-3 text-[10px] uppercase text-slate-500">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {journal.map(j => (
                  <tr key={j.id} className="border-b border-slate-800/30">
                    <td className="px-4 py-3 font-semibold text-white">{j.symbol}</td>
                    <td className="px-2 py-3 text-slate-400">{j.date}</td>
                    <td className="px-2 py-3 text-slate-300">{j.setupType}</td>
                    <td className="text-center px-2"><Badge label={j.regime} color={REGIME_COLORS[j.regime]} small /></td>
                    <td className="text-center px-2 text-white">${j.entry.toLocaleString()}</td>
                    <td className="text-center px-2 text-slate-400">{j.exit ? `$${j.exit.toLocaleString()}` : '—'}</td>
                    <td className="text-center px-2" style={{ color: j.rr && j.rr > 0 ? '#10B981' : j.rr && j.rr < 0 ? '#EF4444' : '#64748B' }}>
                      {j.rr ? `${j.rr > 0 ? '+' : ''}${j.rr}x` : '—'}
                    </td>
                    <td className="text-center px-2">
                      <Badge
                        label={j.outcome}
                        color={j.outcome === 'win' ? '#10B981' : j.outcome === 'loss' ? '#EF4444' : j.outcome === 'open' ? '#6366F1' : '#64748B'}
                        small
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'Portfolio' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Portfolio</h3>
          <div className="text-xs text-slate-500 text-center py-4">
            Connects to existing portfolio tracker at <span className="text-emerald-400">/tools/portfolio</span>
          </div>
          <div className="space-y-2">
            {data.filter(d => d.lifecycleState === 'ACTIVE').map(d => (
              <div key={d.symbol} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0A101C]/50">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">{d.symbol}</span>
                  <Badge label="ACTIVE" color="#22C55E" small />
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300">${d.price.toLocaleString()}</span>
                  <span className={d.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {d.change >= 0 ? '+' : ''}{d.change}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'Backtest' && (
        <Card>
          <EmptyState message="Backtesting engine — connects to existing /tools/backtest" icon="⟳" />
        </Card>
      )}

      {tab === 'Learning' && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-3">Learning Engine (v3 Preview)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#0A101C]/50 border border-slate-800/30">
              <div className="text-xs font-semibold text-white mb-2">Best Setup Types</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-300">Compression Breakout</span><span className="text-emerald-400">68% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Trend Continuation</span><span className="text-emerald-400">63% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Volatility Expansion</span><span className="text-amber-400">55% win rate</span></div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-[#0A101C]/50 border border-slate-800/30">
              <div className="text-xs font-semibold text-white mb-2">Regime Performance</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-300">Trend</span><span className="text-emerald-400">71% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Compression</span><span className="text-emerald-400">65% win rate</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-300">Range</span><span className="text-red-400">38% win rate</span></div>
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 text-center">
            Full personal learning engine with doctrine scoring coming in v3
          </div>
        </Card>
      )}

      {tab === 'Settings' && (
        <Card>
          <EmptyState message="Settings — connects to existing /tools/settings" icon="⚙" />
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: v2 PLATFORM SHELL
// ═══════════════════════════════════════════════════════════════════════════════

export default function MSPV2Platform() {
  const { tier, isLoading } = useUserTier();
  const [activeSurface, setActiveSurface] = useState<Surface>('dashboard');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Generate data once on mount
  const [data] = useState(() => generateMockIntelligence());
  const [news] = useState(() => generateMockNews());
  const [calendar] = useState(() => generateMockCalendar());
  const [journal] = useState(() => generateMockJournal());
  const [watchlist] = useState(() => generateMockWatchlist());

  const navigateTo = useCallback((surface: Surface) => {
    setActiveSurface(surface);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const selectSymbol = useCallback((sym: string) => {
    setSelectedSymbol(sym);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A101C] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A101C] text-white">
      <TopNav active={activeSurface} onChange={navigateTo} />
      <RegimeBar data={data} />

      <main className="max-w-[1800px] mx-auto px-3 md:px-6 py-4">
        {activeSurface === 'dashboard' && (
          <DashboardSurface data={data} news={news} calendar={calendar} onNavigate={navigateTo} onSelectSymbol={selectSymbol} />
        )}
        {activeSurface === 'scanner' && (
          <ScannerSurface data={data} onNavigate={navigateTo} onSelectSymbol={selectSymbol} />
        )}
        {activeSurface === 'golden-egg' && (
          <GoldenEggSurface data={data} selectedSymbol={selectedSymbol} onSelectSymbol={selectSymbol} onNavigate={navigateTo} />
        )}
        {activeSurface === 'terminal' && (
          <TradeTerminalSurface data={data} selectedSymbol={selectedSymbol} onSelectSymbol={selectSymbol} />
        )}
        {activeSurface === 'explorer' && (
          <MarketExplorerSurface data={data} onNavigate={navigateTo} onSelectSymbol={selectSymbol} />
        )}
        {activeSurface === 'research' && (
          <ResearchSurface news={news} calendar={calendar} onNavigate={navigateTo} onSelectSymbol={selectSymbol} />
        )}
        {activeSurface === 'workspace' && (
          <WorkspaceSurface data={data} journal={journal} watchlist={watchlist} onNavigate={navigateTo} onSelectSymbol={selectSymbol} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-8 py-4 px-6 text-center">
        <div className="text-[10px] text-slate-600">
          MSP v2 Preview — Decision Intelligence Platform
          <span className="mx-2">|</span>
          <Link href="/tools/scanner" className="text-slate-500 hover:text-emerald-400 transition-colors">Back to v1</Link>
        </div>
      </footer>
    </div>
  );
}
