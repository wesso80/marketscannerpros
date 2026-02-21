'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUserTier } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';
import CryptoMorningDecisionCard from '@/components/CryptoMorningDecisionCard';
import ExplorerActionGrid from '@/components/explorer/ExplorerActionGrid';

interface CoinData {
  coin: {
    id: string;
    symbol: string;
    name: string;
    image: string;
    description: string;
    links: {
      homepage?: string;
      whitepaper?: string;
      twitter?: string;
      reddit?: string;
      github?: string;
      blockchain?: string;
    };
    categories: string[];
    genesis_date?: string;
    hashing_algorithm?: string;
  };
  sentiment: {
    votes_up_percentage?: number;
    votes_down_percentage?: number;
    watchlist_users?: number;
  };
  market: {
    rank?: number;
    price_usd?: number;
    market_cap?: number;
    fully_diluted_valuation?: number;
    total_volume_24h?: number;
    high_24h?: number;
    low_24h?: number;
    circulating_supply?: number;
    total_supply?: number;
    max_supply?: number;
    ath: { usd?: number; change_percentage?: number; date?: string };
    atl: { usd?: number; change_percentage?: number; date?: string };
  };
  price_changes: {
    '24h'?: number;
    '7d'?: number;
    '14d'?: number;
    '30d'?: number;
    '60d'?: number;
    '200d'?: number;
    '1y'?: number;
  };
  developer?: {
    github_stars?: number;
    github_forks?: number;
    contributors?: number;
    commits_4_weeks?: number;
  };
  tickers: Array<{
    exchange: string;
    pair: string;
    price: number;
    volume_usd: number;
    spread?: number;
    trade_url?: string;
    is_stale: boolean;
  }>;
  ohlc: [number, number, number, number, number][];
  sparkline?: number[];
  derivatives?: {
    funding_rate?: number;
    funding_sentiment?: string;
    open_interest?: number;
    volume_24h?: number;
  };
  last_updated?: string;
}

interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
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

const POPULAR_COINS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
];

function formatNumber(num: number | undefined, decimals = 2): string {
  if (num === undefined || num === null) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || price === null) return 'N/A';
  if (price < 0.00001) return `$${price.toFixed(10)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PercentBadge({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) return <span className="text-slate-500">N/A</span>;
  const isPositive = value >= 0;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${isPositive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
      {isPositive ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

function MiniSparkline({ data, color = '#10B981' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((val - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" className="h-16 w-full" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}

function OHLCChart({ data, height = 220 }: { data: [number, number, number, number, number][]; height?: number }) {
  if (!data || data.length < 2) {
    return <div className="flex h-48 items-center justify-center text-slate-500">No OHLC data available</div>;
  }

  const prices = data.map((d) => [d[2], d[3]]).flat();
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const chartWidth = 800;
  const candleWidth = Math.max(2, Math.floor((chartWidth - 40) / data.length) - 2);
  const spacing = candleWidth + 2;

  const getY = (price: number) => height - 20 - ((price - minPrice) / priceRange) * (height - 40);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${Math.max(chartWidth, data.length * spacing + 40)} ${height}`}
        className="w-full"
        style={{ minWidth: '420px', maxHeight: `${height}px` }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = 20 + pct * (height - 40);
          const price = maxPrice - pct * priceRange;
          return (
            <g key={i}>
              <line x1="40" y1={y} x2={data.length * spacing + 40} y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />
              <text x="5" y={y + 4} fill="#64748b" fontSize="10">${price >= 1 ? price.toFixed(0) : price.toFixed(4)}</text>
            </g>
          );
        })}

        {data.map((candle, i) => {
          const [, open, high, low, close] = candle;
          const x = 45 + i * spacing;
          const isGreen = close >= open;
          const color = isGreen ? '#10B981' : '#EF4444';
          const bodyTop = getY(Math.max(open, close));
          const bodyBottom = getY(Math.min(open, close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);

          return (
            <g key={i}>
              <line x1={x + candleWidth / 2} y1={getY(high)} x2={x + candleWidth / 2} y2={getY(low)} stroke={color} strokeWidth="1" />
              <rect x={x} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} stroke={color} strokeWidth="1" rx="1" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function computeDecisionState(coinData: CoinData | null, btc7d: number | null) {
  if (!coinData) {
    return {
      structureBias: 'Neutral',
      alignmentScore: 50,
      volatilityState: 'Unknown',
      liquidityState: 'Unknown',
      relativeStrengthVsBtc: null as number | null,
      tradePermission: 'Conditional',
      regimeTag: 'Observe',
      riskTag: 'Moderate',
    };
  }

  const p24 = coinData.price_changes['24h'] ?? 0;
  const p7 = coinData.price_changes['7d'] ?? 0;
  const p30 = coinData.price_changes['30d'] ?? 0;
  const p200 = coinData.price_changes['200d'] ?? 0;

  const bullishVotes = [p24 > 0, p7 > 0, p30 > 0, p200 > 0].filter(Boolean).length;
  const bearishVotes = [p24 < 0, p7 < 0, p30 < 0, p200 < 0].filter(Boolean).length;

  const structureBias = bullishVotes >= 3 ? 'Bullish' : bearishVotes >= 3 ? 'Bearish' : 'Neutral';
  const alignmentScore = Math.round((Math.max(bullishVotes, bearishVotes) / 4) * 100);

  const high = coinData.market.high_24h;
  const low = coinData.market.low_24h;
  const price = coinData.market.price_usd;
  const volRangePct = high && low && price ? ((high - low) / price) * 100 : null;
  const volatilityState = volRangePct === null ? 'Unknown' : volRangePct > 8 ? 'Expansion' : volRangePct < 3 ? 'Compression' : 'Normal';

  const marketCap = coinData.market.market_cap;
  const vol24 = coinData.market.total_volume_24h;
  const volRatio = marketCap && vol24 ? vol24 / marketCap : null;
  const liquidityState = volRatio === null ? 'Unknown' : volRatio > 0.12 ? 'High' : volRatio < 0.03 ? 'Thin' : 'Moderate';

  const relativeStrengthVsBtc = btc7d === null ? null : p7 - btc7d;

  let tradePermission: 'Yes' | 'Conditional' | 'No' = 'Conditional';
  if (alignmentScore >= 70 && liquidityState !== 'Thin' && volatilityState !== 'Expansion') tradePermission = 'Yes';
  if (alignmentScore <= 35 || liquidityState === 'Thin') tradePermission = 'No';

  const regimeTag = structureBias === 'Bullish' ? 'Risk-On' : structureBias === 'Bearish' ? 'Risk-Off' : 'Mixed';
  const riskTag = volatilityState === 'Expansion' || liquidityState === 'Thin' ? 'Elevated' : 'Normal';

  return {
    structureBias,
    alignmentScore,
    volatilityState,
    liquidityState,
    relativeStrengthVsBtc,
    tradePermission,
    regimeTag,
    riskTag,
  };
}

function CryptoDetailPageContent() {
  const { tier } = useUserTier();
  const searchParams = useSearchParams();
  const initialCoinId = searchParams.get('coin');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [coinData, setCoinData] = useState<CoinData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [chartView, setChartView] = useState<'sparkline' | 'ohlc'>('ohlc');
  const [btc7dChange, setBtc7dChange] = useState<number | null>(null);
  const [upeSignal, setUpeSignal] = useState<UpeSymbolRow | null>(null);
  const [upeGlobal, setUpeGlobal] = useState<UpeGlobalSnapshot | null>(null);
  const [upeMicroState, setUpeMicroState] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const hasLoadedInitial = useRef(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchCoins = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/crypto/detail?action=search&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.coins || []);
      setShowDropdown(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) searchCoins(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchCoins]);

  const loadCoinBySymbolOrId = useCallback(async (symbolOrId: string) => {
    setLoading(true);
    setError(null);
    setSelectedCoin(symbolOrId);
    setShowDropdown(false);
    setSearchQuery('');
    setUpeSignal(null);

    try {
      const [res, upeSymbolRes, upeGlobalRes] = await Promise.all([
        fetch(`/api/crypto/detail?action=detail&symbol=${encodeURIComponent(symbolOrId)}`, { cache: 'no-store' }),
        fetch(`/api/upe/crcs/symbol?symbol=${encodeURIComponent(symbolOrId.toUpperCase())}&asset_class=crypto`, { cache: 'no-store' }),
        fetch('/api/upe/snapshot/global', { cache: 'no-store' }),
      ]);

      if (!res.ok) throw new Error('Failed to fetch coin data');
      const data = await res.json();
      setCoinData(data);

      if (upeSymbolRes.ok) {
        const upeSymbolData = await upeSymbolRes.json();
        setUpeSignal((upeSymbolData?.row || null) as UpeSymbolRow | null);
      }

      if (upeGlobalRes.ok) {
        const upeGlobalData = await upeGlobalRes.json();
        setUpeGlobal((upeGlobalData?.globalSnapshot || null) as UpeGlobalSnapshot | null);
        setUpeMicroState(upeGlobalData?.microStates?.crypto?.microState || null);
      }

      if (data?.coin?.symbol?.toUpperCase() === 'BTC') {
        setBtc7dChange(data.price_changes?.['7d'] ?? null);
      } else {
        try {
          const btcRes = await fetch('/api/crypto/detail?action=detail&symbol=BTC', { cache: 'no-store' });
          if (btcRes.ok) {
            const btcData = await btcRes.json();
            setBtc7dChange(btcData?.price_changes?.['7d'] ?? null);
          }
        } catch {
          setBtc7dChange(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCoinData(null);
      setBtc7dChange(null);
      setUpeSignal(null);
      setUpeGlobal(null);
      setUpeMicroState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCoinId && !hasLoadedInitial.current && tier && tier !== 'free') {
      hasLoadedInitial.current = true;
      loadCoinBySymbolOrId(initialCoinId);
    }
  }, [initialCoinId, loadCoinBySymbolOrId, tier]);

  if (!tier || tier === 'free') {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)]">
        <div className="container mx-auto px-4 py-16">
          <UpgradeGate requiredTier="pro" feature="Crypto Asset Explorer" />
        </div>
      </div>
    );
  }

  const decision = useMemo(() => computeDecisionState(coinData, btc7dChange), [coinData, btc7dChange]);
  const permissionLabel = upeSignal
    ? upeSignal.eligibilityUser === 'eligible'
      ? 'Eligible'
      : upeSignal.eligibilityUser === 'conditional'
      ? 'Conditional'
      : 'Blocked'
    : decision.tradePermission === 'Yes'
    ? 'Eligible'
    : decision.tradePermission === 'No'
    ? 'Blocked'
    : 'Conditional';
  const isBlocked = permissionLabel === 'Blocked';
  const blockReason = upeSignal?.overlayReasons?.length
    ? upeSignal.overlayReasons.join(' • ')
    : 'Blocked by governance profile or global gate';

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <div className="mx-auto w-full max-w-none space-y-2 px-2 pb-6 pt-3 md:px-3">
        <header className="rounded-lg border border-slate-700 bg-slate-900 p-2">
          <h1 className="text-lg font-bold text-teal-300">🔍 Crypto Asset Explorer</h1>
          <p className="text-xs text-slate-400">Decision-grade asset view: status, permission, context, then details.</p>
        </header>

        <CryptoMorningDecisionCard />

        <section className="rounded-lg border border-slate-700 bg-slate-900 p-2" ref={searchRef}>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="Search any coin (e.g., XRP, Bitcoin, SOL)..."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            )}

            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-700 bg-slate-900">
                {searchResults.map((coin) => (
                  <button
                    key={coin.id}
                    onClick={() => loadCoinBySymbolOrId(coin.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800"
                  >
                    <img src={coin.thumb} alt={coin.name} className="h-6 w-6 rounded-full" />
                    <span className="text-sm font-medium text-white">{coin.name}</span>
                    <span className="text-xs text-slate-400">{coin.symbol.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {POPULAR_COINS.map((coin) => (
              <button
                key={coin.symbol}
                onClick={() => loadCoinBySymbolOrId(coin.symbol)}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  selectedCoin === coin.symbol ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-300'
                }`}
              >
                {coin.symbol}
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Loading decision context...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-center">
            <p className="text-sm text-rose-300">❌ {error}</p>
            <button
              onClick={() => selectedCoin && loadCoinBySymbolOrId(selectedCoin)}
              className="mt-2 rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"
            >
              Retry
            </button>
          </div>
        )}

        {coinData && !loading && (
          <>
            <section className="z-20 flex flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/95 p-1 backdrop-blur md:sticky md:top-2 md:gap-1.5 md:p-1.5">
              {[
                ['Asset', `${coinData.coin.symbol.toUpperCase()} • #${coinData.market.rank || 'N/A'}`],
                ['Price', formatPrice(coinData.market.price_usd)],
                ['24h', `${coinData.price_changes['24h'] !== undefined ? `${coinData.price_changes['24h'] >= 0 ? '+' : ''}${coinData.price_changes['24h']?.toFixed(2)}%` : 'N/A'}`],
                ['Bias', decision.structureBias],
                ['Align', `${decision.alignmentScore}%`],
                ['Vol', decision.volatilityState],
                ['Liquidity', decision.liquidityState],
                ['Regime', upeGlobal?.regime || decision.regimeTag],
                ['Micro', upeMicroState || 'neutral'],
                ['Risk', decision.riskTag],
                ['Permission', permissionLabel],
                ['CRCS', upeSignal ? upeSignal.crcsUser.toFixed(1) : '—'],
                ['ΔHr', upeSignal ? `${upeSignal.microAdjustment >= 0 ? '+' : ''}${upeSignal.microAdjustment.toFixed(2)}` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[9px] leading-tight text-slate-300 md:px-2 md:text-[10px]">
                  <span className="font-semibold text-slate-100">{k}</span> · {v}
                </div>
              ))}
            </section>

            <section className="grid gap-2 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-1.5 md:items-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Action</p>
                    <h2 className="text-xs font-bold">Price + Permission Console</h2>
                  </div>
                  <button
                    onClick={() => selectedCoin && loadCoinBySymbolOrId(selectedCoin)}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                  >
                    Refresh
                  </button>
                </div>

                <div className="h-auto overflow-visible rounded-md border border-slate-700 bg-slate-950/60 p-1.5 md:h-[540px] md:overflow-y-auto">
                  <div className="rounded-md border border-slate-700 bg-slate-900/70 p-2">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{coinData.coin.name} ({coinData.coin.symbol.toUpperCase()})</span>
                      <PercentBadge value={coinData.price_changes['24h']} />
                    </div>

                    <div className="mb-2 flex gap-1 rounded bg-slate-800/70 p-1">
                      <button
                        onClick={() => setChartView('ohlc')}
                        className={`rounded px-2 py-1 text-[10px] ${chartView === 'ohlc' ? 'bg-emerald-500 text-white' : 'text-slate-300'}`}
                      >
                        Candles
                      </button>
                      <button
                        onClick={() => setChartView('sparkline')}
                        className={`rounded px-2 py-1 text-[10px] ${chartView === 'sparkline' ? 'bg-emerald-500 text-white' : 'text-slate-300'}`}
                      >
                        Sparkline
                      </button>
                    </div>

                    {chartView === 'ohlc' ? (
                      coinData.ohlc?.length ? (
                        <OHLCChart data={coinData.ohlc} height={220} />
                      ) : (
                        <div className="rounded bg-slate-950 p-6 text-center text-xs text-slate-500">No OHLC data</div>
                      )
                    ) : coinData.sparkline?.length ? (
                      <div className="rounded bg-slate-950 p-3">
                        <MiniSparkline data={coinData.sparkline} color={(coinData.price_changes['7d'] ?? 0) >= 0 ? '#10B981' : '#EF4444'} />
                      </div>
                    ) : (
                      <div className="rounded bg-slate-950 p-6 text-center text-xs text-slate-500">No sparkline data</div>
                    )}
                  </div>

                  <div className="mt-2 rounded-md border border-slate-700 bg-slate-900/70 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Trade Permission</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-100">{permissionLabel}</p>
                      <p className="text-xs text-slate-400">Alignment {decision.alignmentScore}%</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">
                      {permissionLabel === 'Eligible' && 'Structure and liquidity conditions support execution workflow.'}
                      {permissionLabel === 'Conditional' && 'Mixed conditions. Require tighter confirmation stack before entry.'}
                      {permissionLabel === 'Blocked' && 'Condition stack fails risk policy. Monitor, do not force setup.'}
                    </p>
                  </div>

                  <ExplorerActionGrid
                    assetType="crypto"
                    symbol={coinData.coin.symbol}
                    blocked={isBlocked}
                    blockReason={blockReason}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Zone 2 • Context</p>
                  <h2 className="text-xs font-bold">Trend / RS / Liquidity Context</h2>
                </div>

                <div className="grid gap-2">
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Structure Bias</p>
                    <p className="text-sm font-bold text-slate-100">{decision.structureBias}</p>
                    <p className="text-[11px] text-slate-400">Weekly {coinData.price_changes['7d']?.toFixed(2) ?? 'N/A'}% • Monthly {coinData.price_changes['30d']?.toFixed(2) ?? 'N/A'}%</p>
                  </div>

                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Relative Strength vs BTC (7D)</p>
                    <p className={`text-sm font-bold ${decision.relativeStrengthVsBtc === null ? 'text-slate-400' : decision.relativeStrengthVsBtc >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {decision.relativeStrengthVsBtc === null ? 'N/A' : `${decision.relativeStrengthVsBtc >= 0 ? '+' : ''}${decision.relativeStrengthVsBtc.toFixed(2)}%`}
                    </p>
                  </div>

                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Volatility + Liquidity</p>
                    <p className="text-[11px] text-slate-300">Volatility: {decision.volatilityState}</p>
                    <p className="text-[11px] text-slate-300">Liquidity: {decision.liquidityState}</p>
                    <p className="text-[11px] text-slate-400">24h Vol {formatNumber(coinData.market.total_volume_24h)} • MCap {formatNumber(coinData.market.market_cap)}</p>
                  </div>

                  {coinData.derivatives && (
                    <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                      <p className="text-[10px] uppercase text-slate-500">Derivatives Overlay</p>
                      <p className="text-[11px] text-slate-300">Funding: {coinData.derivatives.funding_rate !== undefined ? `${(coinData.derivatives.funding_rate * 100).toFixed(4)}%` : 'N/A'}</p>
                      <p className="text-[11px] text-slate-300">Sentiment: {coinData.derivatives.funding_sentiment?.toUpperCase() || 'N/A'}</p>
                      <p className="text-[11px] text-slate-300">Open Interest: {formatNumber(coinData.derivatives.open_interest)}</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <details className="group rounded-lg border border-slate-700 bg-slate-900 p-2">
              <summary className="flex list-none cursor-pointer items-center justify-between text-xs font-bold">
                <span>Zone 3 • Informational (Collapsed by Default)</span>
                <span className="text-[10px] text-slate-500 group-open:hidden">Expand</span>
                <span className="hidden text-[10px] text-slate-500 group-open:inline">Collapse</span>
              </summary>

              <div className="mt-2 max-h-[420px] overflow-y-auto space-y-2 pr-1">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="mb-1 text-[10px] uppercase text-slate-500">Performance</p>
                    {([
                      ['24h', coinData.price_changes['24h']],
                      ['7d', coinData.price_changes['7d']],
                      ['14d', coinData.price_changes['14d']],
                      ['30d', coinData.price_changes['30d']],
                      ['60d', coinData.price_changes['60d']],
                      ['1y', coinData.price_changes['1y']],
                    ] as Array<[string, number | undefined]>).map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between py-0.5">
                        <span className="text-xs text-slate-400">{label}</span>
                        <PercentBadge value={val} />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="mb-1 text-[10px] uppercase text-slate-500">ATH / ATL</p>
                    <div className="text-xs text-slate-300">ATH: {formatPrice(coinData.market.ath.usd)} ({coinData.market.ath.change_percentage?.toFixed(2) ?? 'N/A'}%)</div>
                    <div className="text-xs text-slate-300">ATL: {formatPrice(coinData.market.atl.usd)} ({coinData.market.atl.change_percentage?.toFixed(2) ?? 'N/A'}%)</div>
                    <div className="mt-1 text-xs text-slate-400">FDV: {formatNumber(coinData.market.fully_diluted_valuation)}</div>
                    <div className="text-xs text-slate-400">Circulating: {coinData.market.circulating_supply ? `${(coinData.market.circulating_supply / 1e6).toFixed(2)}M` : 'N/A'}</div>
                  </div>
                </div>

                {(coinData.sentiment.votes_up_percentage !== undefined || coinData.sentiment.watchlist_users) && (
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="mb-1 text-[10px] uppercase text-slate-500">Sentiment</p>
                    <p className="text-xs text-slate-300">Bullish votes: {coinData.sentiment.votes_up_percentage?.toFixed(1) ?? 'N/A'}%</p>
                    <p className="text-xs text-slate-300">Watchlist users: {coinData.sentiment.watchlist_users?.toLocaleString() ?? 'N/A'}</p>
                  </div>
                )}

                {coinData.developer && coinData.developer.github_stars && (
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="mb-1 text-[10px] uppercase text-slate-500">Developer Activity</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-300">
                      <span>Stars: {coinData.developer.github_stars?.toLocaleString() || 'N/A'}</span>
                      <span>Forks: {coinData.developer.github_forks?.toLocaleString() || 'N/A'}</span>
                      <span>Contributors: {coinData.developer.contributors?.toLocaleString() || 'N/A'}</span>
                      <span>Commits 4w: {coinData.developer.commits_4_weeks?.toLocaleString() || 'N/A'}</span>
                    </div>
                  </div>
                )}

                {coinData.tickers?.length > 0 && (
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="mb-1 text-[10px] uppercase text-slate-500">Exchange Tickers</p>
                    <div className="space-y-1">
                      {coinData.tickers.slice(0, 8).map((ticker, idx) => (
                        <div key={`${ticker.exchange}-${idx}`} className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs">
                          <span className="text-slate-200">{ticker.exchange} • {ticker.pair}</span>
                          <span className="text-slate-400">{formatPrice(ticker.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {coinData.coin.description && (
                  <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
                    <p className="mb-1 text-[10px] uppercase text-slate-500">About</p>
                    <p className="text-xs leading-5 text-slate-300">{coinData.coin.description}</p>
                  </div>
                )}
              </div>
            </details>

            <div className="text-center text-[11px] text-slate-500">
              Last updated: {coinData.last_updated ? new Date(coinData.last_updated).toLocaleString() : 'N/A'}
            </div>
          </>
        )}

        {!selectedCoin && !loading && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-10 text-center">
            <div className="mb-2 text-4xl">🔎</div>
            <h3 className="text-lg font-semibold text-slate-200">Ready to evaluate a crypto setup?</h3>
            <p className="mt-1 text-sm text-slate-500">Search or choose a popular coin to generate decision context.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PageLoadingSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--msp-bg)]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
    </div>
  );
}

export default function CryptoDetailPage() {
  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <CryptoDetailPageContent />
    </Suspense>
  );
}
