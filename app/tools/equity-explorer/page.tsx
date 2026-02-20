'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

interface EquityData {
  company: {
    symbol: string;
    name: string;
    description: string;
    exchange: string;
    currency: string;
    country: string;
    sector: string;
    industry: string;
    address: string;
    fiscalYearEnd: string;
    latestQuarter: string;
  };
  quote: {
    price: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    prevClose: number;
    latestTradingDay: string;
  };
  valuation: {
    marketCap: number;
    pe: number;
    forwardPE: number;
    peg: number;
    priceToSales: number;
    priceToBook: number;
    evToRevenue: number;
    evToEBITDA: number;
    bookValue: number;
  };
  fundamentals: {
    eps: number;
    dilutedEPS: number;
    revenuePerShare: number;
    profitMargin: number;
    operatingMargin: number;
    returnOnAssets: number;
    returnOnEquity: number;
    revenue: number;
    grossProfit: number;
    ebitda: number;
    quarterlyEarningsGrowth: number;
    quarterlyRevenueGrowth: number;
  };
  technicals: {
    beta: number;
    week52High: number;
    week52Low: number;
    week52Position: number;
    ma50: number;
    ma200: number;
    priceVs50MA: number;
    priceVs200MA: number;
  };
  dividend: {
    dividendPerShare: number;
    dividendYield: number;
    dividendDate: string;
    exDividendDate: string;
  };
  shares: {
    outstanding: number;
  };
  analysts: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    targetPrice: number;
    totalRatings: number;
  };
  financials: {
    annual: Array<{
      fiscalDate: string;
      revenue: number;
      grossProfit: number;
      operatingIncome: number;
      netIncome: number;
    }>;
    quarterly: Array<{
      fiscalDate: string;
      revenue: number;
      grossProfit: number;
      operatingIncome: number;
      netIncome: number;
    }>;
  };
  earnings: Array<{
    fiscalDate: string;
    reportedDate: string;
    reportedEPS: number;
    estimatedEPS: number;
    surprise: number;
    surprisePercent: number;
  }>;
  news: Array<{
    title: string;
    url: string;
    publishedAt: string;
    source: string;
    sentiment: string;
    sentimentScore: number;
    summary?: string;
  }>;
  chart: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  lastUpdated: string;
}

interface UpeSymbolRow {
  symbol: string;
  globalEligibility: 'eligible' | 'conditional' | 'blocked';
  eligibilityUser: 'eligible' | 'conditional' | 'blocked';
  crcsFinal: number;
  crcsUser: number;
  microAdjustment: number;
  profileName: string;
  overlayReasons: string[];
}

interface UpeGlobalSnapshot {
  regime: 'risk_on' | 'neutral' | 'risk_off';
  capitalMode: 'normal' | 'reduced' | 'defensive';
  volatilityState: string | null;
  liquidityState: string | null;
  adaptiveConfidence: number | null;
}

// Popular stocks for quick selection
const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'JPM', name: 'JPMorgan' },
];

function formatNumber(num: number | undefined, decimals: number = 2): string {
  if (num === undefined || num === null || isNaN(num)) return 'N/A';
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || price === null || isNaN(price)) return 'N/A';
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(pct: number | undefined): string {
  if (pct === undefined || pct === null || isNaN(pct)) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function formatVolume(vol: number | undefined): string {
  if (vol === undefined || vol === null || isNaN(vol)) return 'N/A';
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  return vol.toString();
}

function PercentBadge({ value }: { value: number | undefined }) {
  if (value === undefined || value === null || isNaN(value)) return <span className="text-gray-500">N/A</span>;
  const isPositive = value >= 0;
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${isPositive ? 'border-green-500/30 bg-green-500/20 text-green-300' : 'border-red-500/30 bg-red-500/20 text-red-300'}`}>
      {isPositive ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function MiniChart({ data }: { data: Array<{ close: number }> }) {
  if (!data || data.length < 2) return null;
  
  const prices = data.map(d => d.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#10B981' : '#EF4444';
  
  const width = 200;
  const height = 60;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const colors: Record<string, string> = {
    'Bullish': 'bg-green-500/20 text-green-400',
    'Somewhat-Bullish': 'bg-green-500/10 text-green-300',
    'Neutral': 'bg-gray-500/20 text-gray-400',
    'Somewhat-Bearish': 'bg-red-500/10 text-red-300',
    'Bearish': 'bg-red-500/20 text-red-400',
  };
  
  return (
    <span className={`rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold ${colors[sentiment] || colors['Neutral']}`}>
      {sentiment}
    </span>
  );
}

// Quick Signal Summary helpers
function getQuickSignals(data: EquityData): {
  trend: { label: 'Bullish' | 'Bearish' | 'Neutral'; icon: string; color: string };
  momentum: { label: 'Strong' | 'Weak' | 'Neutral'; icon: string; color: string };
  volatility: { label: 'High' | 'Normal' | 'Low'; icon: string; color: string };
} {
  // Trend: based on price vs MAs
  const above50 = data.technicals.priceVs50MA > 0;
  const above200 = data.technicals.priceVs200MA > 0;
  const trend = above50 && above200 
    ? { label: 'Bullish' as const, icon: '📈', color: 'text-green-400' }
    : !above50 && !above200 
      ? { label: 'Bearish' as const, icon: '📉', color: 'text-red-400' }
      : { label: 'Neutral' as const, icon: '➖', color: 'text-yellow-400' };
  
  // Momentum: based on price change and 52-week position
  const weekPos = data.technicals.week52Position;
  const changePercent = data.quote.changePercent || 0;
  const momentum = weekPos > 70 && changePercent > 0
    ? { label: 'Strong' as const, icon: '🔥', color: 'text-green-400' }
    : weekPos < 30 || changePercent < -2
      ? { label: 'Weak' as const, icon: '❄️', color: 'text-red-400' }
      : { label: 'Neutral' as const, icon: '⚖️', color: 'text-slate-400' };
  
  // Volatility: based on beta
  const beta = data.technicals.beta || 1;
  const volatility = beta > 1.5
    ? { label: 'High' as const, icon: '⚡', color: 'text-yellow-400' }
    : beta < 0.8
      ? { label: 'Low' as const, icon: '🛡️', color: 'text-teal-300' }
      : { label: 'Normal' as const, icon: '📊', color: 'text-slate-400' };
  
  return { trend, momentum, volatility };
}

// Aggregate news sentiment score
function getAggregateSentiment(news: EquityData['news']): { score: number; label: string; color: string } | null {
  if (!news || news.length === 0) return null;
  
  const sentimentValues: Record<string, number> = {
    'Bullish': 1,
    'Somewhat-Bullish': 0.5,
    'Neutral': 0,
    'Somewhat-Bearish': -0.5,
    'Bearish': -1,
  };
  
  let totalScore = 0;
  let count = 0;
  
  for (const item of news) {
    // Use sentimentScore if available, otherwise map from label
    if (typeof item.sentimentScore === 'number') {
      totalScore += item.sentimentScore;
      count++;
    } else if (item.sentiment && sentimentValues[item.sentiment] !== undefined) {
      totalScore += sentimentValues[item.sentiment];
      count++;
    }
  }
  
  if (count === 0) return null;
  
  const avgScore = totalScore / count;
  const percentage = Math.round((avgScore + 1) / 2 * 100); // Convert -1 to 1 range to 0-100%
  
  const label = avgScore > 0.3 ? 'Bullish' : avgScore < -0.3 ? 'Bearish' : 'Neutral';
  const color = avgScore > 0.3 ? 'text-green-400' : avgScore < -0.3 ? 'text-red-400' : 'text-yellow-400';
  
  return { score: percentage, label, color };
}

function AnalystRatingsBar({ analysts }: { analysts: EquityData['analysts'] }) {
  const total = analysts.totalRatings || 1;
  const segments = [
    { label: 'Strong Buy', count: analysts.strongBuy, color: '#22c55e' },
    { label: 'Buy', count: analysts.buy, color: '#84cc16' },
    { label: 'Hold', count: analysts.hold, color: '#eab308' },
    { label: 'Sell', count: analysts.sell, color: '#f97316' },
    { label: 'Strong Sell', count: analysts.strongSell, color: '#ef4444' },
  ];
  
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-700">
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>Strong Buy ({analysts.strongBuy})</span>
        <span>Hold ({analysts.hold})</span>
        <span>Strong Sell ({analysts.strongSell})</span>
      </div>
    </div>
  );
}

export default function EquityExplorerPage() {
  const { tier, isLoading: tierLoading } = useUserTier();
  const [symbol, setSymbol] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState<EquityData | null>(null);
  const [upeSignal, setUpeSignal] = useState<UpeSymbolRow | null>(null);
  const [upeGlobal, setUpeGlobal] = useState<UpeGlobalSnapshot | null>(null);
  const [upeMicroState, setUpeMicroState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchEquityData = useCallback(async (sym: string, isRefresh = false) => {
    if (!sym) return;
    
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setData(null);
      setUpeSignal(null);
      setUpeGlobal(null);
      setUpeMicroState(null);
    }
    setError(null);

    try {
      const [response, upeResponse, upeGlobalResponse] = await Promise.all([
        fetch(`/api/equity/detail?symbol=${encodeURIComponent(sym)}`, {
          signal: abortControllerRef.current.signal,
          cache: 'no-store',
        }),
        fetch(`/api/upe/crcs/symbol?symbol=${encodeURIComponent(sym.toUpperCase())}&asset_class=equity`, {
          signal: abortControllerRef.current.signal,
          cache: 'no-store',
        }),
        fetch('/api/upe/snapshot/global', {
          signal: abortControllerRef.current.signal,
          cache: 'no-store',
        }),
      ]);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch data');
      }

      const result = await response.json();
      setData(result);
      setSymbol(sym.toUpperCase());

      if (upeResponse.ok) {
        const upeResult = await upeResponse.json();
        if (upeResult?.row) {
          setUpeSignal(upeResult.row as UpeSymbolRow);
        } else {
          setUpeSignal(null);
        }
      } else {
        setUpeSignal(null);
      }

      if (upeGlobalResponse.ok) {
        const globalResult = await upeGlobalResponse.json();
        setUpeGlobal((globalResult?.globalSnapshot || null) as UpeGlobalSnapshot | null);
        setUpeMicroState(globalResult?.microStates?.equity?.microState || null);
      } else {
        setUpeGlobal(null);
        setUpeMicroState(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setUpeSignal(null);
      setUpeGlobal(null);
      setUpeMicroState(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      fetchEquityData(searchInput.trim());
    }
  };

  const handleRefresh = () => {
    if (symbol) {
      fetchEquityData(symbol, true);
    }
  };

  // Gate Pro Trader features
  if (!tierLoading && tier !== 'pro_trader' && tier !== 'pro') {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <UpgradeGate 
          requiredTier="pro" 
          feature="Equity Explorer"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <div className="mx-auto w-full max-w-[1500px] space-y-2 px-2 pb-6 pt-3 md:px-3">
        <header className="rounded-lg border border-slate-700 bg-slate-900 p-2">
          <h1 className="text-lg font-bold text-teal-300">📈 Equity Explorer</h1>
          <p className="text-xs text-slate-400">Decision-grade equity view: valuation, trend, risk, and catalyst context.</p>
        </header>

        <section className="rounded-lg border border-slate-700 bg-slate-900 p-2">
          <form onSubmit={handleSearch}>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative flex-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder="Enter stock symbol (e.g., AAPL, MSFT, GOOGL)"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !searchInput.trim()}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:bg-slate-700"
            >
              {loading ? 'Finding Stock Setup...' : 'Find Stock Setup'}
            </button>
            {data && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800 disabled:bg-slate-800"
                title="Refresh data"
              >
                {refreshing ? '⏳' : '🔄'}
              </button>
            )}
            </div>
          </form>

          <div className="mt-2 flex flex-wrap gap-1">
            {POPULAR_STOCKS.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => {
                  setSearchInput(stock.symbol);
                  fetchEquityData(stock.symbol);
                }}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  symbol === stock.symbol
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {stock.symbol}
              </button>
            ))}
          </div>
        </section>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4">
            <p className="text-sm text-rose-300">❌ {error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
          </div>
        )}

        {/* Data Display */}
        {data && !loading && (
          <div className="space-y-2">
            <section className="rounded-lg border border-slate-700 bg-slate-900 p-2">
              <div className="grid gap-2 lg:grid-cols-[1fr_420px]">
                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 1 • Equity Deployment Gate</p>
                    <span className="text-[10px] text-slate-500">US session anchor</span>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1">
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">Permission: <span className={`${upeSignal?.eligibilityUser === 'eligible' ? 'text-emerald-300' : upeSignal?.eligibilityUser === 'conditional' ? 'text-amber-300' : 'text-rose-300'} font-semibold`}>{upeSignal ? (upeSignal.eligibilityUser === 'eligible' ? 'Eligible' : upeSignal.eligibilityUser === 'conditional' ? 'Conditional' : 'Blocked') : 'Pending'}</span></span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">Capital Mode: <span className="font-semibold text-slate-100">{upeGlobal?.capitalMode || 'reduced'}</span></span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">Vol Regime: <span className="font-semibold text-slate-100">{upeGlobal?.volatilityState || 'unknown'}</span></span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded border border-slate-700 bg-slate-900/70 p-2"><p className="text-[10px] text-slate-500">Large Cap</p><p className="text-xs font-semibold text-emerald-300">Eligible</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 p-2"><p className="text-[10px] text-slate-500">Mid Cap</p><p className="text-xs font-semibold text-amber-300">Conditional</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 p-2"><p className="text-[10px] text-slate-500">High Beta</p><p className="text-xs font-semibold text-amber-300">Conditional</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 p-2"><p className="text-[10px] text-slate-500">Earnings Risk</p><p className="text-xs font-semibold text-slate-200">Review</p></div>
                  </div>
                  <p className="mt-2 rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400">{upeSignal?.eligibilityUser === 'blocked' ? 'Blocked conditions detected — monitor only, do not force deployment.' : upeSignal?.eligibilityUser === 'conditional' ? 'Mixed conditions — require trend + volume confirmation before deployment.' : 'Conditions favorable for standard workflow execution.'}</p>
                </div>

                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Environment Breakdown</p>
                    <span className="text-[10px] text-slate-500">Inputs</span>
                  </div>
                  <div className="grid gap-1.5 text-xs">
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Global Regime</span><p className="font-semibold text-slate-100">{upeGlobal?.regime || 'neutral'}</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Equities Micro Regime</span><p className="font-semibold text-slate-100">{upeMicroState || 'neutral'}</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Liquidity</span><p className="font-semibold text-slate-100">{upeGlobal?.liquidityState || 'stable'}</p></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1"><span className="text-slate-500">Adaptive Confidence</span><p className="font-semibold text-slate-100">{upeGlobal?.adaptiveConfidence !== null && upeGlobal?.adaptiveConfidence !== undefined ? `${Math.round(upeGlobal.adaptiveConfidence)}%` : 'N/A'}</p></div>
                  </div>
                </div>
              </div>
            </section>

            <section className="z-20 flex flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/95 p-1 backdrop-blur md:sticky md:top-2 md:gap-1.5 md:p-1.5">
              {[
                ['Asset', `${data.company.symbol} • ${data.company.exchange}`],
                ['Price', formatPrice(data.quote.price)],
                ['24h', `${data.quote.changePercent >= 0 ? '+' : ''}${data.quote.changePercent.toFixed(2)}%`],
                ['Permission', upeSignal ? (upeSignal.eligibilityUser === 'eligible' ? 'Eligible' : upeSignal.eligibilityUser === 'conditional' ? 'Conditional' : 'Blocked') : 'Pending'],
                ['CRCS', upeSignal ? upeSignal.crcsUser.toFixed(1) : '—'],
                ['ΔHr', upeSignal ? `${upeSignal.microAdjustment >= 0 ? '+' : ''}${upeSignal.microAdjustment.toFixed(2)}` : '—'],
                ['Trend', getQuickSignals(data).trend.label],
                ['Momentum', getQuickSignals(data).momentum.label],
                ['Volatility', getQuickSignals(data).volatility.label],
                ['Volume', formatVolume(data.quote.volume)],
                ['P/E', data.valuation.pe > 0 ? data.valuation.pe.toFixed(2) : 'N/A'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[9px] leading-tight text-slate-300 md:px-2 md:text-[10px]">
                  <span className="font-semibold text-slate-100">{k}</span> · {v}
                </div>
              ))}
            </section>

            <section className="grid gap-2 lg:grid-cols-[1fr_420px]">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Action</p>
                    <h2 className="text-xs font-bold">Price + Permission Console</h2>
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-slate-700 bg-slate-950/60 p-2">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <h2 className="text-lg font-bold">{data.company.symbol}</h2>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300">
                      {data.company.exchange}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{data.company.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {data.company.sector} • {data.company.industry}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{formatPrice(data.quote.price)}</p>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className={`text-xs ${data.quote.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {data.quote.change >= 0 ? '+' : ''}{data.quote.change.toFixed(2)}
                    </span>
                    <PercentBadge value={data.quote.changePercent} />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Last updated: {data.quote.latestTradingDay}
                  </p>
                </div>
                </div>
              
              {/* Mini Chart */}
              {data.chart.length > 0 && (
                <div className="mt-2 flex justify-center rounded-md border border-slate-700 bg-slate-950/60 py-1">
                  <MiniChart data={data.chart} />
                </div>
              )}
              
              {/* Quick Signal Summary */}
              {(() => {
                const signals = getQuickSignals(data);
                const eligibilityLabel = upeSignal
                  ? upeSignal.eligibilityUser === 'eligible'
                    ? 'Eligible'
                    : upeSignal.eligibilityUser === 'conditional'
                    ? 'Conditional'
                    : 'Blocked'
                  : 'Pending';
                return (
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1">
                      <span className="text-[10px] uppercase text-slate-500">Trend</span>
                      <span className={`text-xs font-semibold ${signals.trend.color}`}>
                        {signals.trend.icon} {signals.trend.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1">
                      <span className="text-[10px] uppercase text-slate-500">Momentum</span>
                      <span className={`text-xs font-semibold ${signals.momentum.color}`}>
                        {signals.momentum.icon} {signals.momentum.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1">
                      <span className="text-[10px] uppercase text-slate-500">Volatility</span>
                      <span className={`text-xs font-semibold ${signals.volatility.color}`}>
                        {signals.volatility.icon} {signals.volatility.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1">
                      <span className="text-[10px] uppercase text-slate-500">Permission</span>
                      <span
                        className={`text-xs font-semibold ${
                          eligibilityLabel === 'Eligible'
                            ? 'text-emerald-300'
                            : eligibilityLabel === 'Conditional'
                            ? 'text-amber-300'
                            : eligibilityLabel === 'Blocked'
                            ? 'text-rose-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {eligibilityLabel}
                      </span>
                    </div>
                    {upeSignal && (
                      <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1">
                        <span className="text-[10px] uppercase text-slate-500">Action</span>
                        {upeSignal.eligibilityUser === 'blocked' ? (
                          <button
                            type="button"
                            disabled
                            className="cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-500"
                            title={upeSignal.overlayReasons?.length ? upeSignal.overlayReasons.join(' • ') : 'Blocked by governance profile or global gate'}
                          >
                            Blocked
                          </button>
                        ) : (
                          <Link
                            href={`/tools/confluence-scanner?symbol=${data.company.symbol}&eligibility=${upeSignal.eligibilityUser}&crcs=${upeSignal.crcsUser.toFixed(1)}`}
                            className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
                          >
                            Open Scanner
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
                <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                  {upeSignal?.eligibilityUser === 'blocked' ? (
                    <button type="button" disabled className="cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-500" title={upeSignal.overlayReasons?.join(' • ') || 'Blocked by governance'}>Create Alert</button>
                  ) : (
                    <Link href={`/tools/alerts?symbol=${data.company.symbol}`} className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Create Alert</Link>
                  )}
                  {upeSignal?.eligibilityUser === 'blocked' ? (
                    <button type="button" disabled className="cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-500" title={upeSignal.overlayReasons?.join(' • ') || 'Blocked by governance'}>Add to Watchlist</button>
                  ) : (
                    <Link href={`/tools/watchlists?symbol=${data.company.symbol}`} className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Add to Watchlist</Link>
                  )}
                  {upeSignal?.eligibilityUser === 'blocked' ? (
                    <button type="button" disabled className="cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-500" title={upeSignal.overlayReasons?.join(' • ') || 'Blocked by governance'}>Run Confluence Scan</button>
                  ) : (
                    <Link href={`/tools/confluence-scanner?symbol=${data.company.symbol}`} className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Run Confluence Scan</Link>
                  )}
                  {upeSignal?.eligibilityUser === 'blocked' ? (
                    <button type="button" disabled className="cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-500" title={upeSignal.overlayReasons?.join(' • ') || 'Blocked by governance'}>Open Journal Draft</button>
                  ) : (
                    <Link href={`/tools/journal?note=${encodeURIComponent(`Review ${data.company.symbol} setup`)}`} className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-center text-[10px] text-slate-300">Open Journal Draft</Link>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Context</p>
                  <h2 className="text-xs font-bold">Trend / RS / Volatility Context</h2>
                </div>
                <div className="grid gap-2">
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Structure Bias</p>
                    <p className="text-xs text-slate-200">Weekly: <span className="font-semibold">{data.technicals.priceVs200MA >= 0 ? 'Bullish' : 'Bearish'}</span> • Daily: <span className="font-semibold">{data.technicals.priceVs50MA >= 0 ? 'Bullish' : 'Bearish'}</span></p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Relative Strength</p>
                    <p className="text-xs text-slate-200">vs SPY: <span className={`font-semibold ${data.quote.changePercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{data.quote.changePercent >= 0 ? '+' : ''}{data.quote.changePercent.toFixed(2)}%</span> • vs Sector: <span className="font-semibold text-slate-300">proxy</span></p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Volatility + Liquidity</p>
                    <p className="text-xs text-slate-200">ATR state: <span className="font-semibold">{upeGlobal?.volatilityState || 'normal'}</span> • RVOL proxy: <span className="font-semibold">{(data.quote.volume / Math.max(1, data.valuation.marketCap / 1000)).toFixed(2)}x</span></p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Event Risk</p>
                    <p className="text-xs text-slate-200">Earnings: <span className="font-semibold">Upcoming schedule check</span> • News: <span className="font-semibold">{getAggregateSentiment(data.news)?.label || 'Neutral'}</span></p>
                  </div>
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-400">
                    {upeSignal?.eligibilityUser === 'conditional' ? 'Conditional — deploy only on trend + volume confirmation.' : upeSignal?.eligibilityUser === 'blocked' ? 'Blocked — no execution until governance state clears.' : 'Eligible — execution workflow is permissioned.'}
                  </div>
                </div>
              </div>
            </section>

            <details className="group rounded-lg border border-slate-700 bg-slate-900 p-2">
              <summary className="flex list-none cursor-pointer items-center justify-between text-xs font-bold">
                <span>Zone 3 • Informational (Collapsed by Default)</span>
                <span className="text-[10px] text-slate-500 group-open:hidden">Expand</span>
                <span className="hidden text-[10px] text-slate-500 group-open:inline">Collapse</span>
              </summary>

              <div className="mt-2 space-y-2">
            {/* Key Stats Grid */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
                <p className="text-[10px] uppercase text-slate-500">Market Cap</p>
                <p className="text-sm font-bold">{formatNumber(data.valuation.marketCap)}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
                <p className="text-[10px] uppercase text-slate-500">P/E Ratio</p>
                <p className="text-sm font-bold">{data.valuation.pe > 0 ? data.valuation.pe.toFixed(2) : 'N/A'}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
                <p className="text-[10px] uppercase text-slate-500">Volume</p>
                <p className="text-sm font-bold">{formatVolume(data.quote.volume)}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
                <p className="text-[10px] uppercase text-slate-500">Dividend Yield</p>
                <p className="text-sm font-bold">{data.dividend.dividendYield > 0 ? `${(data.dividend.dividendYield * 100).toFixed(2)}%` : 'N/A'}</p>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid gap-2 lg:grid-cols-2">
              {/* Valuation */}
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Valuation Metrics
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">P/E (TTM)</p>
                    <p className="font-semibold">{data.valuation.pe > 0 ? data.valuation.pe.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Forward P/E</p>
                    <p className="font-semibold">{data.valuation.forwardPE > 0 ? data.valuation.forwardPE.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">PEG Ratio</p>
                    <p className="font-semibold">{data.valuation.peg > 0 ? data.valuation.peg.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Price/Sales</p>
                    <p className="font-semibold">{data.valuation.priceToSales > 0 ? data.valuation.priceToSales.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Price/Book</p>
                    <p className="font-semibold">{data.valuation.priceToBook > 0 ? data.valuation.priceToBook.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">EV/EBITDA</p>
                    <p className="font-semibold">{data.valuation.evToEBITDA > 0 ? data.valuation.evToEBITDA.toFixed(2) : 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Fundamentals */}
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Fundamentals
                </h3>
                
                {/* Growth Metrics Highlight */}
                {(data.fundamentals.quarterlyRevenueGrowth || data.fundamentals.quarterlyEarningsGrowth) && (
                  <div className="mb-3 grid grid-cols-2 gap-3 rounded-md border border-slate-700/70 bg-slate-950/60 p-2">
                    {data.fundamentals.quarterlyRevenueGrowth !== undefined && (
                      <div className="text-center">
                        <p className="text-xs text-teal-300 uppercase mb-1">Revenue YoY</p>
                        <p className={`text-lg font-bold ${data.fundamentals.quarterlyRevenueGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {data.fundamentals.quarterlyRevenueGrowth >= 0 ? '▲' : '▼'} {Math.abs(data.fundamentals.quarterlyRevenueGrowth * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {data.fundamentals.quarterlyEarningsGrowth !== undefined && (
                      <div className="text-center">
                        <p className="text-xs text-teal-300 uppercase mb-1">EPS YoY</p>
                        <p className={`text-lg font-bold ${data.fundamentals.quarterlyEarningsGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {data.fundamentals.quarterlyEarningsGrowth >= 0 ? '▲' : '▼'} {Math.abs(data.fundamentals.quarterlyEarningsGrowth * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">EPS (TTM)</p>
                    <p className="font-semibold">${data.fundamentals.eps.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Revenue</p>
                    <p className="font-semibold">{formatNumber(data.fundamentals.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Profit Margin</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.profitMargin * 100)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Operating Margin</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.operatingMargin * 100)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">ROE</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.returnOnEquity * 100)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">ROA</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.returnOnAssets * 100)}</p>
                  </div>
                </div>
              </div>

              {/* Technicals */}
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Technical Levels
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">52-Week Range</span>
                      <span className="text-gray-300">{formatPrice(data.technicals.week52Low)} - {formatPrice(data.technicals.week52High)}</span>
                    </div>
                    <div className="relative h-2 bg-slate-700 rounded-full">
                      <div 
                        className="absolute h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(Math.max(data.technicals.week52Position, 0), 100)}%` }}
                      />
                      <div 
                        className="absolute w-3 h-3 bg-white rounded-full -top-0.5 transform -translate-x-1/2"
                        style={{ left: `${Math.min(Math.max(data.technicals.week52Position, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-400">50-Day MA</p>
                      <p className="font-semibold">{formatPrice(data.technicals.ma50)}</p>
                      <PercentBadge value={data.technicals.priceVs50MA} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">200-Day MA</p>
                      <p className="font-semibold">{formatPrice(data.technicals.ma200)}</p>
                      <PercentBadge value={data.technicals.priceVs200MA} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Beta</p>
                      <p className="font-semibold">{data.technicals.beta.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Day Range</p>
                      <p className="font-semibold text-sm">{formatPrice(data.quote.low)} - {formatPrice(data.quote.high)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analyst Ratings */}
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Analyst Ratings
                </h3>
                {data.analysts.totalRatings > 0 ? (
                  <div className="space-y-4">
                    <AnalystRatingsBar analysts={data.analysts} />
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Target Price</span>
                      <span className="text-xl font-bold text-emerald-400">
                        {formatPrice(data.analysts.targetPrice)}
                      </span>
                    </div>
                    {data.quote.price > 0 && data.analysts.targetPrice > 0 && (
                      <p className="text-sm text-gray-400">
                        {data.analysts.targetPrice > data.quote.price 
                          ? `+${((data.analysts.targetPrice - data.quote.price) / data.quote.price * 100).toFixed(1)}% upside`
                          : `${((data.analysts.targetPrice - data.quote.price) / data.quote.price * 100).toFixed(1)}% downside`
                        }
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">No analyst ratings available</p>
                )}
              </div>
            </div>

            {/* Earnings */}
            {data.earnings.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Recent Earnings
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-slate-700">
                        <th className="text-left py-2">Quarter</th>
                        <th className="text-right py-2">Reported</th>
                        <th className="text-right py-2">Estimated</th>
                        <th className="text-right py-2">Actual</th>
                        <th className="text-right py-2">Surprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.earnings.slice(0, 4).map((e, i) => (
                        <tr key={i} className="border-b border-slate-700/50">
                          <td className="py-2">{e.fiscalDate}</td>
                          <td className="text-right text-gray-400">{e.reportedDate}</td>
                          <td className="text-right">${e.estimatedEPS.toFixed(2)}</td>
                          <td className="text-right">${e.reportedEPS.toFixed(2)}</td>
                          <td className="text-right">
                            <span className={e.surprisePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {e.surprisePercent >= 0 ? '+' : ''}{e.surprisePercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* News */}
            {data.news.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                    Latest News
                  </h3>
                  {/* Aggregate News Sentiment */}
                  {(() => {
                    const sentiment = getAggregateSentiment(data.news);
                    if (!sentiment) return null;
                    return (
                      <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1">
                        <span className="text-[10px] text-slate-400">News Sentiment:</span>
                        <span className={`font-bold ${sentiment.color}`}>
                          {sentiment.score}% {sentiment.label}
                        </span>
                        <div className="w-16 h-2 bg-slate-600 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              sentiment.score > 60 ? 'bg-green-500' : 
                              sentiment.score < 40 ? 'bg-red-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${sentiment.score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-4">
                  {data.news.slice(0, 5).map((article, i) => (
                    <a
                      key={i}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border border-slate-700 bg-slate-950/60 p-3 transition-colors hover:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-200 mb-1">{article.title}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{article.source}</span>
                            <span>•</span>
                            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <SentimentBadge sentiment={article.sentiment} />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Company Description */}
            {data.company.description && (
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  About {data.company.name}
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {data.company.description}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                  <div>
                    <p className="text-gray-500">Country</p>
                    <p className="text-gray-300">{data.company.country}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Fiscal Year End</p>
                    <p className="text-gray-300">{data.company.fiscalYearEnd}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Shares Outstanding</p>
                    <p className="text-gray-300">{formatNumber(data.shares.outstanding).replace('$', '')}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Latest Quarter</p>
                    <p className="text-gray-300">{data.company.latestQuarter}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Attribution */}
            <p className="mt-1 text-center text-[11px] text-slate-500">
              Data powered by Alpha Vantage • Updated every 5 minutes during market hours
            </p>
              </div>
            </details>
          </div>
        )}

        {/* Empty State */}
        {!data && !loading && !error && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-10 text-center">
            <p className="mb-2 text-4xl">📊</p>
            <h3 className="text-lg font-semibold text-slate-200">Ready to evaluate an equity setup?</h3>
            <p className="mt-1 text-sm text-slate-500">Search or choose a popular symbol to generate decision context.</p>
          </div>
        )}
      </div>
    </div>
  );
}
