'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import { ToolsPageHeader } from '@/components/ToolsPageHeader';
import { useAIPageContext } from '@/lib/ai/pageContext';
import UpgradeGate from '@/components/UpgradeGate';

interface CommodityData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
  category: string;
  date: string;
  history: { date: string; value: number }[];
}

interface CommoditiesResponse {
  commodities: CommodityData[];
  byCategory: {
    Energy: CommodityData[];
    Metals: CommodityData[];
    Agriculture: CommodityData[];
  };
  summary: {
    totalCommodities: number;
    gainers: number;
    losers: number;
    avgChange: number;
    topGainer: CommodityData | null;
    topLoser: CommodityData | null;
  };
  lastUpdate: string;
}

interface EconomicIndicatorsResponse {
  rates?: {
    treasury10y?: { value: number | null; history?: { date: string; value: number }[] };
  };
  inflation?: {
    inflationRate?: { value: number | null; history?: { date: string; value: number }[] };
  };
  growth?: {
    realGDP?: { value: number | null; history?: { date: string; value: number }[] };
  };
  regime?: {
    riskLevel?: 'low' | 'medium' | 'high';
  };
}

type CategoryKey = 'Energy' | 'Metals' | 'Agriculture';
type PermissionState = 'YES' | 'CONDITIONAL' | 'NO';
type ImpulseType = 'INFLATION' | 'GROWTH' | 'DEFLATION' | 'MIXED';
type TrendDirection = 'UP' | 'FLAT' | 'DOWN';
type DriverState = 'TAILWIND' | 'NEUTRAL' | 'HEADWIND';
type RateState = 'SUPPORTIVE' | 'NEUTRAL' | 'RESTRICTIVE';
type VolRegime = 'COMPRESSION' | 'EXPANSION';

interface DerivedState {
  impulseType: ImpulseType;
  rotationLeader: CategoryKey;
  permission: PermissionState;
  permissionReason: string;
  usdImpact: DriverState;
  realRatesImpact: RateState;
  volRegime: VolRegime;
  breadthScore: number;
  longsAllowed: boolean;
  shortsAllowed: boolean;
  breakoutsAllowed: boolean;
  meanReversionAllowed: boolean;
  score: number;
  signalQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  impulseStability: 'STABLE' | 'CHOPPY';
  usdTrend: TrendDirection;
  realRatesTrend: TrendDirection;
  growthTrend: TrendDirection;
  growthSupport: 'SUPPORTIVE' | 'NEUTRAL' | 'FADING';
  macroRiskState: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';
  topGainer: CommodityData | null;
  topLoser: CommodityData | null;
  relative: {
    energyVsMetals: number;
    metalsVsAg: number;
    copperVsGold: number;
  };
  categoryAvg: Record<CategoryKey, number>;
}

// Category icons and colors
const CATEGORY_CONFIG = {
  Energy: { icon: '⛽', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
  Metals: { icon: '🔩', color: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)' },
  Agriculture: { icon: '🌾', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)' },
};

// Commodity-specific icons (6 core commodities)
const COMMODITY_ICONS: { [key: string]: string } = {
  WTI: '🛢️',
  NATURAL_GAS: '🔥',
  GOLD: '🥇',
  SILVER: '🥈',
  COPPER: '🟤',
  WHEAT: '🌾',
};

const permissionBadge = {
  YES: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  CONDITIONAL: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  NO: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
};

const chipTone = {
  good: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  bad: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
  neutral: 'border-white/15 bg-black/20 text-white/75',
};

const trendIcon: Record<TrendDirection, string> = {
  UP: '↑',
  FLAT: '→',
  DOWN: '↓',
};

function trendFromHistory(history?: { date: string; value: number }[], threshold = 0.08): TrendDirection {
  if (!history || history.length < 2) return 'FLAT';
  const latest = history[0]?.value;
  const previous = history[1]?.value;
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) return 'FLAT';
  const delta = latest - previous;
  if (Math.abs(delta) < threshold) return 'FLAT';
  return delta > 0 ? 'UP' : 'DOWN';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sparklineBars(history: { date: string; value: number }[], isPositive: boolean) {
  if (!history || history.length < 5) return null;
  const segment = history.slice(0, 7).reverse();
  const values = segment.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] text-white/45">Last 7 days</div>
      <div className="flex h-8 items-end gap-1">
        {segment.map((point, index) => {
          const height = ((point.value - min) / range) * 100;
          return (
            <div
              key={`${point.date}-${index}`}
              className={`flex-1 rounded-sm ${isPositive ? 'bg-emerald-400/70' : 'bg-rose-400/70'}`}
              style={{ height: `${Math.max(12, height)}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function CommoditiesPage() {
  const { tier } = useUserTier();
  const { setPageData } = useAIPageContext();
  const [data, setData] = useState<CommoditiesResponse | null>(null);
  const [macroInputs, setMacroInputs] = useState<EconomicIndicatorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Energy' | 'Metals' | 'Agriculture'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchCommodities = useCallback(async () => {
    try {
      setError(null);
      const [commoditiesRes, indicatorsRes] = await Promise.all([
        fetch('/api/commodities'),
        fetch('/api/economic-indicators?all=true'),
      ]);
      const json = await commoditiesRes.json();
      let indicatorsJson: EconomicIndicatorsResponse | null = null;
      if (indicatorsRes.ok) {
        indicatorsJson = await indicatorsRes.json();
      }
      
      if (!commoditiesRes.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch commodities');
      }
      
      setData(json);
      setMacroInputs(indicatorsJson);
    } catch (err: any) {
      console.error('Failed to fetch commodities:', err);
      setError(err.message || 'Failed to load commodity data');
    } finally {
      setLoading(false);
    }
  }, []);

  const safeNumber = (value: unknown): number | null => {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const safeFixed = (value: unknown, digits = 2, fallback = 'N/A'): string => {
    const num = safeNumber(value);
    return num === null ? fallback : num.toFixed(digits);
  };

  const signed = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;

  const derivedState: DerivedState | null = (() => {
    if (!data?.commodities?.length) return null;

    const byCategory = {
      Energy: data.byCategory?.Energy || [],
      Metals: data.byCategory?.Metals || [],
      Agriculture: data.byCategory?.Agriculture || [],
    } as const;

    const categoryAvg = (Object.keys(byCategory) as CategoryKey[]).reduce((acc, category) => {
      const bucket = byCategory[category];
      if (!bucket.length) {
        acc[category] = 0;
      } else {
        acc[category] = bucket.reduce((sum, item) => sum + (safeNumber(item.changePercent) ?? 0), 0) / bucket.length;
      }
      return acc;
    }, {} as Record<CategoryKey, number>);

    const sortedCats = (Object.keys(categoryAvg) as CategoryKey[]).sort(
      (a, b) => categoryAvg[b] - categoryAvg[a]
    );
    const rotationLeader = sortedCats[0];
    const secondCategory = sortedCats[1];
    const rotationClarityRaw = Math.abs(categoryAvg[rotationLeader] - categoryAvg[secondCategory]);
    const rotationClarity = clampScore(rotationClarityRaw * 20);

    const commodities = data.commodities;
    const gainers = commodities.filter((item) => (safeNumber(item.changePercent) ?? 0) > 0).length;
    const breadthScore = clampScore((gainers / commodities.length) * 100);
    const avgAbsMove =
      commodities.reduce((sum, item) => sum + Math.abs(safeNumber(item.changePercent) ?? 0), 0) / commodities.length;
    const volRegime: VolRegime = avgAbsMove >= 1.4 ? 'EXPANSION' : 'COMPRESSION';

    const getBySymbol = (symbol: string) => commodities.find((item) => item.symbol === symbol);
    const copperChange = safeNumber(getBySymbol('COPPER')?.changePercent) ?? 0;
    const goldChange = safeNumber(getBySymbol('GOLD')?.changePercent) ?? 0;
    const energyLead = categoryAvg.Energy > 0.2;
    const metalsLead = categoryAvg.Metals > 0.2;
    const agLead = categoryAvg.Agriculture > 0.2;

    const usdProxyRaw = -((categoryAvg.Energy + categoryAvg.Metals + categoryAvg.Agriculture) / 3);
    const usdTrend: TrendDirection = usdProxyRaw > 0.2 ? 'UP' : usdProxyRaw < -0.2 ? 'DOWN' : 'FLAT';
    const usdImpact: DriverState = usdTrend === 'UP' ? 'HEADWIND' : usdTrend === 'DOWN' ? 'TAILWIND' : 'NEUTRAL';

    const nominalTrend = trendFromHistory(macroInputs?.rates?.treasury10y?.history, 0.04);
    const inflationTrend = trendFromHistory(macroInputs?.inflation?.inflationRate?.history, 0.04);
    const realRatesTrend: TrendDirection =
      nominalTrend === inflationTrend
        ? 'FLAT'
        : nominalTrend === 'UP' && inflationTrend !== 'UP'
          ? 'UP'
          : nominalTrend === 'DOWN' && inflationTrend !== 'DOWN'
            ? 'DOWN'
            : 'FLAT';

    const realRatesImpact: RateState =
      realRatesTrend === 'UP' ? 'RESTRICTIVE' : realRatesTrend === 'DOWN' ? 'SUPPORTIVE' : 'NEUTRAL';

    const growthProxyRaw = copperChange + categoryAvg.Energy - goldChange;
    const growthTrend: TrendDirection = growthProxyRaw > 0.8 ? 'UP' : growthProxyRaw < -0.8 ? 'DOWN' : 'FLAT';
    const growthSupport = growthTrend === 'UP' ? 'SUPPORTIVE' : growthTrend === 'DOWN' ? 'FADING' : 'NEUTRAL';

    let impulseType: ImpulseType = 'MIXED';
    if (energyLead && copperChange > 0 && usdTrend !== 'UP' && realRatesTrend !== 'UP') {
      impulseType = 'GROWTH';
    } else if (goldChange > 0.25 && usdTrend === 'DOWN' && realRatesTrend === 'DOWN') {
      impulseType = 'INFLATION';
    } else if (!energyLead && !metalsLead && !agLead && usdTrend === 'UP' && realRatesTrend === 'UP') {
      impulseType = 'DEFLATION';
    }

    const usdAlignment =
      impulseType === 'DEFLATION'
        ? usdTrend === 'UP'
          ? 95
          : usdTrend === 'FLAT'
            ? 65
            : 35
        : usdTrend === 'DOWN'
          ? 90
          : usdTrend === 'FLAT'
            ? 65
            : 35;

    const ratesAlignment =
      impulseType === 'INFLATION'
        ? realRatesTrend === 'DOWN'
          ? 90
          : realRatesTrend === 'FLAT'
            ? 65
            : 30
        : impulseType === 'GROWTH'
          ? realRatesTrend === 'FLAT'
            ? 85
            : realRatesTrend === 'DOWN'
              ? 75
              : 40
          : realRatesTrend === 'UP'
            ? 85
            : 55;

    const volSuitability =
      impulseType === 'MIXED' ? (volRegime === 'EXPANSION' ? 70 : 55) : volRegime === 'EXPANSION' ? 85 : 70;

    const score = clampScore(
      breadthScore * 0.25 +
        rotationClarity * 0.2 +
        usdAlignment * 0.2 +
        ratesAlignment * 0.2 +
        volSuitability * 0.15
    );

    const permission: PermissionState = score >= 70 ? 'YES' : score >= 45 ? 'CONDITIONAL' : 'NO';
    const longsAllowed = permission !== 'NO' && impulseType !== 'DEFLATION';
    const shortsAllowed = permission === 'YES' || impulseType === 'DEFLATION';
    const breakoutsAllowed = permission === 'YES' && volRegime === 'EXPANSION';
    const meanReversionAllowed = permission !== 'NO' && (volRegime === 'EXPANSION' || impulseType === 'MIXED');

    const signalQuality: 'HIGH' | 'MEDIUM' | 'LOW' = score >= 72 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
    const impulseStability: 'STABLE' | 'CHOPPY' = rotationClarity >= 40 && breadthScore >= 55 ? 'STABLE' : 'CHOPPY';

    const permissionReason =
      permission === 'YES'
        ? `${impulseType === 'MIXED' ? 'Mixed but tradable' : impulseType} impulse confirmed with broad participation.`
        : permission === 'CONDITIONAL'
          ? `${impulseType} setup is incomplete; size down and avoid low-quality breakouts.`
          : `Low participation and poor alignment with USD/rates backdrop; treat as noise.`;

    const macroRiskState: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' =
      macroInputs?.regime?.riskLevel === 'low'
        ? 'RISK_ON'
        : macroInputs?.regime?.riskLevel === 'high'
          ? 'RISK_OFF'
          : 'NEUTRAL';

    return {
      impulseType,
      rotationLeader,
      permission,
      permissionReason,
      usdImpact,
      realRatesImpact,
      volRegime,
      breadthScore,
      longsAllowed,
      shortsAllowed,
      breakoutsAllowed,
      meanReversionAllowed,
      score,
      signalQuality,
      impulseStability,
      usdTrend,
      realRatesTrend,
      growthTrend,
      growthSupport,
      macroRiskState,
      topGainer: data.summary?.topGainer || null,
      topLoser: data.summary?.topLoser || null,
      relative: {
        energyVsMetals: categoryAvg.Energy - categoryAvg.Metals,
        metalsVsAg: categoryAvg.Metals - categoryAvg.Agriculture,
        copperVsGold: copperChange - goldChange,
      },
      categoryAvg,
    };
  })();

  useEffect(() => {
    fetchCommodities();
    
    // Auto-refresh every 15 minutes (commodities update less frequently)
    if (autoRefresh) {
      const interval = setInterval(fetchCommodities, 15 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchCommodities, autoRefresh]);

  // Push data to AI context
  useEffect(() => {
    if (data) {
      const commoditySymbols = data.commodities.map(c => c.symbol);
      const topGainerName = data.summary?.topGainer?.name || 'N/A';
      const topLoserName = data.summary?.topLoser?.name || 'N/A';
      const topGainerPct = safeFixed(data.summary?.topGainer?.changePercent, 2);
      const topLoserPct = safeFixed(data.summary?.topLoser?.changePercent, 2);
      const summaryText = data.summary ? 
        `Commodities: ${data.summary.gainers} gainers, ${data.summary.losers} losers. ` +
        `Top Gainer: ${topGainerName} (+${topGainerPct}%). ` +
        `Top Loser: ${topLoserName} (${topLoserPct}%). ` +
        `Impulse: ${derivedState?.impulseType || 'MIXED'} | Permission: ${derivedState?.permission || 'CONDITIONAL'}` : 
        'Loading commodity data...';
      
      setPageData({
        skill: 'commodities' as any,
        symbols: commoditySymbols,
        data: {
          commodities: data.commodities,
          summary: data.summary,
          selectedCategory,
          lastUpdate: data.lastUpdate,
          commodityGate: derivedState,
        },
        summary: summaryText,
      });
    }
  }, [data, selectedCategory, setPageData, derivedState]);

  const filteredCommodities = data?.commodities.filter(c => 
    selectedCategory === 'all' || c.category === selectedCategory
  ) || [];

  const formatPrice = (price: number, unit: string) => {
    const numericPrice = safeNumber(price) ?? 0;
    if (unit.includes('cents')) {
      return `${numericPrice.toFixed(2)}¢`;
    }
    return `$${numericPrice.toFixed(2)}`;
  };

  const formatChange = (change: number, changePercent: number) => {
    const numericChange = safeNumber(change) ?? 0;
    const numericChangePercent = safeNumber(changePercent) ?? 0;
    const sign = numericChange >= 0 ? '+' : '';
    return `${sign}${numericChange.toFixed(2)} (${sign}${numericChangePercent.toFixed(2)}%)`;
  };

  // Gate for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div style={{ padding: '2rem', color: '#fff', minHeight: '100vh', background: '#0f172a' }}>
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Find real-time commodity prices with live energy, metals, and agriculture context"
          icon="🛢️"
        />
        <main style={{ padding: '24px 16px', display: 'flex', justifyContent: 'center' }}>
          <UpgradeGate feature="Commodities Dashboard" requiredTier="pro" />
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] p-6 text-white">
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Real-time commodity impulse, rotation, and inflation/growth confirmation"
          icon="🛢️"
        />
        <div className="flex h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-5xl animate-pulse">⛽🔩🌾</div>
            <div className="text-white/60">Loading commodity data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] p-6 text-white">
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Real-time commodity impulse, rotation, and inflation/growth confirmation"
          icon="🛢️"
        />
        <div className="mx-auto mt-8 max-w-xl rounded-xl border border-rose-400/30 bg-rose-500/10 p-8 text-center">
          <div className="mb-3 text-3xl">⚠️</div>
          <div className="mb-4 text-rose-300">{error}</div>
          <button
            onClick={fetchCommodities}
            className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-white">
      <ToolsPageHeader 
        badge="Commodities"
        title="Commodities Dashboard" 
        subtitle="Real-time commodity impulse, rotation, and inflation/growth confirmation"
        icon="🛢️"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/60">US/Eastern aligned</span>
            <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/60">
              {data?.lastUpdate ? `Updated ${new Date(data.lastUpdate).toLocaleTimeString()}` : 'Awaiting update'}
            </span>
            <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/70">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto refresh (15m)
            </label>
            <button
              onClick={fetchCommodities}
              className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200"
            >
              Refresh
            </button>
          </div>
        }
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {derivedState && (
          <>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-white/90">Commodities Deployment Gate</h2>
                  <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${permissionBadge[derivedState.permission]}`}>
                    PERMISSION: {derivedState.permission}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/75">
                    Impulse: {derivedState.impulseType}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/75">
                    Rotation: {derivedState.rotationLeader}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/75">
                    USD: {derivedState.usdImpact}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/75">
                    Real Rates: {derivedState.realRatesImpact}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/75">
                    Vol: {derivedState.volRegime}
                  </span>
                </div>
                <p className="mt-3 text-sm text-white/70">{derivedState.permissionReason}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Longs</span>
                    <span className={derivedState.longsAllowed ? 'text-emerald-300' : 'text-rose-300'}>
                      {derivedState.longsAllowed ? 'Allowed' : 'Restricted'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Shorts</span>
                    <span className={derivedState.shortsAllowed ? 'text-emerald-300' : 'text-rose-300'}>
                      {derivedState.shortsAllowed ? 'Allowed' : 'Restricted'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Breakouts</span>
                    <span className={derivedState.breakoutsAllowed ? 'text-emerald-300' : 'text-amber-300'}>
                      {derivedState.breakoutsAllowed ? 'Allowed' : 'Restricted'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Mean Reversion</span>
                    <span className={derivedState.meanReversionAllowed ? 'text-emerald-300' : 'text-amber-300'}>
                      {derivedState.meanReversionAllowed ? 'Allowed' : 'Restricted'}
                    </span>
                  </div>
                </div>
              </article>

              <article className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <h2 className="mb-3 text-sm font-semibold text-white/90">Environment Breakdown</h2>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between border-b border-white/5 py-1">
                    <span className="text-white/60">Macro Regime</span>
                    <span className="text-white/80">{derivedState.macroRiskState}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 py-1">
                    <span className="text-white/60">USD Trend</span>
                    <span className="text-white/80">{trendIcon[derivedState.usdTrend]} {derivedState.usdTrend} ({derivedState.usdImpact})</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 py-1">
                    <span className="text-white/60">Real Rates Trend</span>
                    <span className="text-white/80">{trendIcon[derivedState.realRatesTrend]} {derivedState.realRatesTrend} ({derivedState.realRatesImpact})</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 py-1">
                    <span className="text-white/60">Growth Proxy</span>
                    <span className="text-white/80">{trendIcon[derivedState.growthTrend]} {derivedState.growthTrend} ({derivedState.growthSupport})</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-white/60">Commodity Breadth</span>
                    <span className="text-white/80">{derivedState.breadthScore}/100</span>
                  </div>
                </div>
                {(derivedState.volRegime === 'EXPANSION' && derivedState.signalQuality !== 'HIGH') && (
                  <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                    Correlation warning: high cross-asset volatility, reduce leverage until signal quality improves.
                  </p>
                )}
              </article>
            </section>

            <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Rotation Leader Strip</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Energy vs Metals</span>
                    <span className={derivedState.relative.energyVsMetals >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {signed(derivedState.relative.energyVsMetals)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Metals vs Ag</span>
                    <span className={derivedState.relative.metalsVsAg >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {signed(derivedState.relative.metalsVsAg)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Copper vs Gold</span>
                    <span className={derivedState.relative.copperVsGold >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {signed(derivedState.relative.copperVsGold)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                  Leader: {derivedState.rotationLeader}
                </div>
              </article>

              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Breadth & Participation</h3>
                <div className="text-2xl font-bold text-white/90">{derivedState.breadthScore}</div>
                <div className="text-xs text-white/60">Breadth Score (0-100)</div>
                <div className="mt-3 flex items-center gap-3 text-sm">
                  <span className="text-emerald-300">{data?.summary.gainers} Advancing</span>
                  <span className="text-rose-300">{data?.summary.losers} Declining</span>
                </div>
                <div className="mt-2 text-xs text-white/70">
                  Participation: {derivedState.breadthScore >= 65 ? 'Strong' : derivedState.breadthScore >= 45 ? 'Mixed' : 'Weak'}
                </div>
              </article>

              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Trend Quality</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Impulse Stability</span>
                    <span className="text-white/80">{derivedState.impulseStability}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Volatility</span>
                    <span className="text-white/80">{derivedState.volRegime}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="text-white/60">Signal Quality</span>
                    <span className="text-white/80">{derivedState.signalQuality}</span>
                  </div>
                </div>
              </article>
            </section>

            <section className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`rounded-md border px-3 py-1 text-xs ${selectedCategory === 'all' ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-black/20 text-white/70'}`}
                  >
                    All ({data?.commodities.length || 0})
                  </button>
                  {(['Energy', 'Metals', 'Agriculture'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`rounded-md border px-3 py-1 text-xs ${selectedCategory === cat ? 'border-white/30 bg-white/10 text-white' : 'border-white/15 bg-black/20 text-white/70'}`}
                    >
                      {CATEGORY_CONFIG[cat].icon} {cat} ({data?.byCategory[cat]?.length || 0})
                    </button>
                  ))}
                </div>
                <div className="text-xs text-white/60">Sort: Market Impact (default)</div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCommodities.map((commodity) => {
                  const safeCommodityChangePercent = safeNumber(commodity.changePercent) ?? 0;
                  const isPositive = safeCommodityChangePercent >= 0;
                  const catConfig = CATEGORY_CONFIG[commodity.category as keyof typeof CATEGORY_CONFIG];
                  const inflationSensitive = commodity.category === 'Energy' || commodity.symbol === 'GOLD';
                  const growthSensitive = commodity.symbol === 'WTI' || commodity.symbol === 'COPPER' || commodity.category === 'Energy';
                  const usdSensitive = commodity.symbol === 'GOLD' || commodity.symbol === 'SILVER';
                  const longAllowed = derivedState.longsAllowed && safeCommodityChangePercent > -1.5;
                  const shortAllowed = derivedState.shortsAllowed && safeCommodityChangePercent < 1.5;

                  return (
                    <article key={commodity.symbol} className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/[0.07]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{COMMODITY_ICONS[commodity.symbol] || '📊'}</span>
                          <div>
                            <div className="text-sm font-semibold text-white/90">{commodity.name}</div>
                            <div
                              className="mt-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px]"
                              style={{ color: catConfig.color, background: catConfig.bgColor }}
                            >
                              {catConfig.icon} {commodity.category}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-2xl font-bold text-white/90">{formatPrice(commodity.price, commodity.unit)}</div>
                        <div className="text-[11px] text-white/45">{commodity.unit}</div>
                      </div>

                      <div className={`mt-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm ${isPositive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                        <span>{isPositive ? '▲' : '▼'}</span>
                        <span>{formatChange(commodity.change, commodity.changePercent)}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {inflationSensitive && <span className={`rounded px-1.5 py-0.5 text-[10px] border ${chipTone.warn}`}>Inflation-sensitive</span>}
                        {growthSensitive && <span className={`rounded px-1.5 py-0.5 text-[10px] border ${chipTone.good}`}>Growth-sensitive</span>}
                        {usdSensitive && <span className={`rounded px-1.5 py-0.5 text-[10px] border ${chipTone.neutral}`}>USD-sensitive</span>}
                        {Math.abs(safeCommodityChangePercent) > 1.4 && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] border ${chipTone.bad}`}>Breakout watch</span>
                        )}
                      </div>

                      {sparklineBars(commodity.history, isPositive)}

                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                          <span className="text-white/55">Long</span>
                          <span className={longAllowed ? 'text-emerald-300' : 'text-amber-300'}>{longAllowed ? 'Allowed' : 'Restricted'}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1">
                          <span className="text-white/55">Short</span>
                          <span className={shortAllowed ? 'text-emerald-300' : 'text-amber-300'}>{shortAllowed ? 'Allowed' : 'Restricted'}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-right text-[10px] text-white/40">Updated: {commodity.date}</div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">USD Driver (DXY proxy)</h3>
                <p className="text-sm text-white/80">{trendIcon[derivedState.usdTrend]} {derivedState.usdTrend} → {derivedState.usdImpact}</p>
                <p className="mt-2 text-xs text-white/60">What this means: stronger USD suppresses commodities; weaker USD supports broad upside.</p>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Rates Driver (Real yield proxy)</h3>
                <p className="text-sm text-white/80">{trendIcon[derivedState.realRatesTrend]} {derivedState.realRatesTrend} → {derivedState.realRatesImpact}</p>
                <p className="mt-2 text-xs text-white/60">What this means: rising real rates pressure metals, falling real rates support gold and inflation trades.</p>
              </article>
              <article className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white/90">Inflation/Growth Driver</h3>
                <p className="text-sm text-white/80">{trendIcon[derivedState.growthTrend]} {derivedState.growthTrend} → {derivedState.growthSupport}</p>
                <p className="mt-2 text-xs text-white/60">What this means: copper + energy leadership confirms growth impulse; weak ag dampens food inflation pressure.</p>
              </article>
            </section>

            <section className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-white/90">Trading Implications</h3>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-sm">
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">If You&apos;re Long</div>
                  <p className="text-white/75">
                    {derivedState.rotationLeader === 'Energy' ? 'Prefer Energy leaders.' : `Prefer ${derivedState.rotationLeader} leaders.`}{' '}
                    {derivedState.realRatesTrend === 'UP' ? 'Avoid aggressive Gold breakout longs.' : 'Gold longs can be tactical if breadth improves.'}
                  </p>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">If You&apos;re Short</div>
                  <p className="text-white/75">
                    {derivedState.impulseType === 'DEFLATION'
                      ? 'Deflation pressure supports tactical shorts in weakest complex.'
                      : 'Fade only overextended spikes when volatility expands and breadth weakens.'}
                  </p>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Portfolio Positioning</div>
                  <p className="text-white/75">
                    {derivedState.impulseType === 'INFLATION' && 'Inflation impulse building; reduce duration risk and overweight real assets.'}
                    {derivedState.impulseType === 'GROWTH' && 'Growth impulse active; favor cyclicals and copper-linked exposure.'}
                    {derivedState.impulseType === 'DEFLATION' && 'Deflation pressure rising; de-risk high beta and avoid weak breakouts.'}
                    {derivedState.impulseType === 'MIXED' && 'Mixed impulse; keep sizing smaller and prioritize confirmation over anticipation.'}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75">
                Operator summary: {derivedState.impulseType} impulse, {derivedState.rotationLeader} leading, permission {derivedState.permission.toLowerCase()} ({derivedState.score}/100).
              </div>
            </section>

            <section className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="rounded-md border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-white/75">Create Alert</button>
              <button className="rounded-md border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-white/75">Add to Watchlist</button>
              <button className="rounded-md border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-white/75">Run Confluence Scan</button>
              <button className="rounded-md border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-white/75">Open Journal Draft</button>
            </section>
          </>
        )}

        {data?.lastUpdate && (
          <div className="mt-6 text-center text-xs text-white/45">
            Data from Alpha Vantage • Last update: {new Date(data.lastUpdate).toLocaleTimeString()}
            {autoRefresh && ' • Auto-refreshing every 15 minutes'}
          </div>
        )}
      </main>
    </div>
  );
}
