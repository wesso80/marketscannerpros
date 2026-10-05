'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { useUserTier, canAccessPortfolioInsights } from '@/lib/useUserTier';
import { ToolsPageHeader } from '@/components/ToolsPageHeader';
import { useAIPageContext } from '@/lib/ai/pageContext';
import UpgradeGate from '@/components/UpgradeGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

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
  source: 'ETF_PROXY' | 'SPOT' | 'LEGACY_DAILY' | 'LEGACY_MONTHLY';
  sourceSymbol?: string;
  freshnessStatus: 'LIVE' | 'DELAYED' | 'STALE';
  dataAgeDays: number;
  eligibleForGate: boolean;
  cadence?: 'live' | 'daily' | 'monthly';
  /** "monthly, as of Aug 2026" for monthly-only series. */
  asOfLabel?: string | null;
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
    availableCommodities?: number;
    staleExcluded?: number;
    gainers: number;
    losers: number;
    avgChange: number;
    topGainer: CommodityData | null;
    topLoser: CommodityData | null;
  };
  dataHealth?: {
    gateReady: boolean;
    eligibleCount: number;
    totalCount: number;
    staleSymbols: string[];
  };
  sourceAsOf?: string | null;
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
type ReviewState = 'YES' | 'CONDITIONAL' | 'NO';
type ImpulseType = 'INFLATION' | 'GROWTH' | 'DEFLATION' | 'MIXED';
type TrendDirection = 'UP' | 'FLAT' | 'DOWN';
type DriverState = 'TAILWIND' | 'NEUTRAL' | 'HEADWIND';
type RateState = 'SUPPORTIVE' | 'NEUTRAL' | 'RESTRICTIVE';
type VolRegime = 'COMPRESSION' | 'EXPANSION';

interface DerivedState {
  impulseType: ImpulseType;
  rotationLeader: CategoryKey;
  reviewState: ReviewState;
  reviewReason: string;
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

// Category codes and colors
const CATEGORY_CONFIG = {
  Energy: { icon: 'EN', color: 'var(--msp-warn)', bgColor: 'rgba(245, 158, 11, 0.1)' },
  Metals: { icon: 'MT', color: 'var(--msp-flat)', bgColor: 'rgba(148, 163, 184, 0.1)' },
  Agriculture: { icon: 'AG', color: 'var(--msp-bull)', bgColor: 'rgba(34, 197, 94, 0.1)' },
};

// Commodity-specific codes (6 core commodities)
const COMMODITY_ICONS: { [key: string]: string } = {
  WTI: 'WTI',
  NATURAL_GAS: 'NG',
  GOLD: 'AU',
  SILVER: 'AG',
  COPPER: 'CU',
  WHEAT: 'WHT',
};

const reviewBadge = {
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
      <div className="mb-1 text-[11px] text-white/45">Last 7 days</div>
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

const COMMODITY_CACHE_MS = 5 * 60 * 1000;
let commodityCache: { at: number; data: CommoditiesResponse; macro: EconomicIndicatorsResponse | null } | null = null;

function CommoditySkeleton({ embedded }: { embedded: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div data-commodity-skeleton className={embedded ? 'space-y-3 p-4' : 'mx-auto max-w-5xl space-y-3 p-6'} aria-busy="true">
      <div className="h-24 animate-pulse rounded-xl bg-white/5" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />)}</div>
      <p className="text-sm text-white/60">EN · MT · AG · Loading commodity data… {elapsed}s</p>
    </div>
  );
}

export default function CommoditiesPage({ embedded = false }: { embedded?: boolean }) {
  const { tier } = useUserTier();
  const { setPageData } = useAIPageContext();
  const [data, setData] = useState<CommoditiesResponse | null>(null);
  const [macroInputs, setMacroInputs] = useState<EconomicIndicatorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Energy' | 'Metals' | 'Agriculture'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchCommodities = useCallback(async () => {
    if (commodityCache && Date.now() - commodityCache.at < COMMODITY_CACHE_MS) {
      setData(commodityCache.data);
      setMacroInputs(commodityCache.macro);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const [commoditiesRes, indicatorsRes] = await Promise.all([
        fetch('/api/commodities'),
        fetch('/api/economic-indicators?all=true'),
      ]);
      if (!commoditiesRes.ok) {
        const errJson = await commoditiesRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to fetch commodities');
      }
      const json = await commoditiesRes.json();
      let indicatorsJson: EconomicIndicatorsResponse | null = null;
      if (indicatorsRes.ok) {
        indicatorsJson = await indicatorsRes.json();
      }
      
      if (!json.success) {
        throw new Error(json.error || 'Failed to fetch commodities');
      }
      
      setData(json);
      setMacroInputs(indicatorsJson);
      commodityCache = { at: Date.now(), data: json, macro: indicatorsJson };
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

  const signed = (value: number, digits = 2) => {
    if (!Number.isFinite(value)) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
  };

  const derivedState: DerivedState | null = useMemo(() => {
    if (!data?.commodities?.length || data.dataHealth?.gateReady === false) return null;

    const byCategory = {
      Energy: (data.byCategory?.Energy || []).filter((item) => item.eligibleForGate),
      Metals: (data.byCategory?.Metals || []).filter((item) => item.eligibleForGate),
      Agriculture: (data.byCategory?.Agriculture || []).filter((item) => item.eligibleForGate),
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

    const commodities = data.commodities.filter((item) => item.eligibleForGate);
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

    const reviewState: ReviewState = score >= 70 ? 'YES' : score >= 45 ? 'CONDITIONAL' : 'NO';
    const longsAllowed = reviewState !== 'NO' && impulseType !== 'DEFLATION';
    const shortsAllowed = reviewState === 'YES' || impulseType === 'DEFLATION';
    const breakoutsAllowed = reviewState === 'YES' && volRegime === 'EXPANSION';
    const meanReversionAllowed = reviewState !== 'NO' && (volRegime === 'EXPANSION' || impulseType === 'MIXED');

    const signalQuality: 'HIGH' | 'MEDIUM' | 'LOW' = score >= 72 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
    const impulseStability: 'STABLE' | 'CHOPPY' = rotationClarity >= 40 && breadthScore >= 55 ? 'STABLE' : 'CHOPPY';

    const reviewReason =
      reviewState === 'YES'
        ? `${impulseType === 'MIXED' ? 'Mixed but trending' : impulseType} impulse observed with broad participation.`
        : reviewState === 'CONDITIONAL'
          ? `${impulseType} conditions are incomplete; indicators suggest caution.`
          : `Low participation and poor alignment with USD/rates backdrop; conditions unclear.`;

    const macroRiskState: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' =
      macroInputs?.regime?.riskLevel === 'low'
        ? 'RISK_ON'
        : macroInputs?.regime?.riskLevel === 'high'
          ? 'RISK_OFF'
          : 'NEUTRAL';

    return {
      impulseType,
      rotationLeader,
      reviewState,
      reviewReason,
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
  }, [data, macroInputs]);

  useEffect(() => { fetchCommodities(); }, [fetchCommodities]);
  // Auto-refresh every 15 minutes (pauses when tab hidden)
  usePolling(fetchCommodities, autoRefresh ? 15 * 60 * 1000 : null);

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
        `Top Gainer: ${topGainerName} (${topGainerPct === 'N/A' ? 'N/A' : `+${topGainerPct}%`}). ` +
        `Top Loser: ${topLoserName} (${topLoserPct === 'N/A' ? 'N/A' : `${topLoserPct}%`}). ` +
        `Impulse: ${derivedState?.impulseType || 'MIXED'} | Review: ${derivedState?.reviewState || 'CONDITIONAL'}` :
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedCategory]);

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
    if (embedded) return null;
    return (
      <div style={{ padding: '2rem', color: '#fff', minHeight: '100vh', background: 'var(--msp-bg)' }}>
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Find real-time commodity prices with live energy, metals, and agriculture context"
          icon="CMD"
        />
        <main style={{ padding: '24px 16px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 960 }}>
            <ComplianceDisclaimer compact />
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <UpgradeGate feature="Commodities Dashboard" requiredTier="pro" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    if (embedded) return <CommoditySkeleton embedded />;
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] p-6 text-white">
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Real-time commodity impulse, rotation, and inflation/growth confirmation"
          icon="CMD"
        />
        <CommoditySkeleton embedded={false} />
      </div>
    );
  }

  if (error) {
    const errorContent = (
      <div className="mt-4 max-w-xl rounded-xl border border-rose-400/30 bg-rose-500/10 p-8 text-center">
        <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-rose-200">WARN</div>
        <div className="mb-4 text-rose-300">{error}</div>
        <button
          type="button"
          onClick={fetchCommodities}
          className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200"
        >
          Retry
        </button>
      </div>
    );
    if (embedded) return errorContent;
    return (
      <div className="min-h-screen bg-[var(--msp-bg)] p-6 text-white">
        <ToolsPageHeader 
          badge="Commodities"
          title="Commodities Dashboard" 
          subtitle="Real-time commodity impulse, rotation, and inflation/growth confirmation"
          icon="CMD"
        />
        <div className="mx-auto mt-8 max-w-xl rounded-xl border border-rose-400/30 bg-rose-500/10 p-8 text-center">
          <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-rose-200">WARN</div>
          <div className="mb-4 text-rose-300">{error}</div>
          <button
            type="button"
            onClick={fetchCommodities}
            className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const eligible = filteredCommodities.filter((item) => item.eligibleForGate);
  const excluded = filteredCommodities.filter((item) => !item.eligibleForGate);
  const plain = (value: string) => value.toLowerCase().replaceAll('_', ' ');
  const mainContent = (
    <div className="text-white">
      {!embedded && <ToolsPageHeader badge="Markets" title="Commodities" subtitle="Commodity observations and market context" icon="CMD" />}
      <main className={embedded ? 'space-y-3' : 'mx-auto max-w-6xl space-y-3 p-4'}>
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm text-white/60">Commodities overview</h2>
          <p data-commodity-verdict className="mt-1 text-lg font-semibold">{derivedState ? (derivedState.reviewState === 'YES' ? 'Broad participation observed' : derivedState.reviewState === 'CONDITIONAL' ? 'Mixed commodity evidence' : 'Limited commodity alignment') : 'Insufficient current observations'}</p>
          <p className="mt-1 text-sm text-white/65">{derivedState ? `${derivedState.rotationLeader} leads · ${derivedState.breadthScore}% advancing · ${plain(derivedState.impulseType)} conditions` : 'The available data does not support a combined market assessment.'}</p>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs text-white/65">Category <select aria-label="Commodity category" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value as typeof selectedCategory)} className="ml-2 rounded border border-white/15 bg-slate-900 p-2 text-white"><option value="all">All commodities</option>{(['Energy', 'Metals', 'Agriculture'] as const).map(cat => <option key={cat}>{cat}</option>)}</select></label>
          <button type="button" onClick={fetchCommodities} className="rounded border border-white/15 px-3 py-2 text-xs">Refresh</button>
        </div>
        {derivedState && <p data-commodity-legend className="text-xs text-white/60">Evidence legend: Long = rising-price conditions; Short = falling-price conditions. Clear or limited describes observed alignment, not a recommendation.</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {eligible.map(commodity => {
            const safeCommodityChangePercent = safeNumber(commodity.changePercent) ?? 0;
            const longAllowed = derivedState && commodity.eligibleForGate && derivedState.longsAllowed && safeCommodityChangePercent > -1.5;
            const shortAllowed = derivedState && commodity.eligibleForGate && derivedState.shortsAllowed && safeCommodityChangePercent < 1.5;
            return <article data-commodity-card key={commodity.symbol} className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 text-sm font-semibold">{commodity.name}</h3><span className="shrink-0 text-sm">{formatPrice(commodity.price, commodity.unit)}</span></div>
              <div className="mt-1 flex justify-between gap-2 text-xs text-white/60"><span>{commodity.category}</span><span>{signed(commodity.changePercent)}</span></div>
              <details className="mt-2 text-xs text-white/60"><summary className="cursor-pointer">Observation details</summary>
                <p className="mt-2">{commodity.unit}</p>
                {derivedState && <p className="mt-1">Long: {longAllowed ? 'Clear' : 'Limited'} · Short: {shortAllowed ? 'Clear' : 'Limited'}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/40">
                        <span className={commodity.freshnessStatus === 'STALE' ? 'text-rose-300' : commodity.freshnessStatus === 'DELAYED' ? 'text-amber-300' : 'text-emerald-300'}>
                          {commodity.cadence === 'monthly' && commodity.freshnessStatus !== 'STALE' ? 'MONTHLY' : commodity.freshnessStatus}{commodity.sourceSymbol ? ` · proxy ${commodity.sourceSymbol}` : ''}
                        </span>
                        <span>{commodity.asOfLabel ?? `Source date: ${commodity.date} · age ${commodity.dataAgeDays}d`}</span>
                      </div>

              </details>
            </article>;
          })}
        </div>
        {!eligible.length && <p className="text-sm text-amber-200">No included observations in this category.</p>}
        {excluded.length > 0 && <details data-excluded-commodities className="rounded-lg border border-amber-400/25 px-3 py-2 text-xs text-amber-100">
          <summary className="cursor-pointer">{excluded.length} excluded {excluded.length === 1 ? 'observation' : 'observations'} · older data</summary>
          <p className="mt-2">These rows are excluded from the assessment by the data feed.</p>
          <ul className="mt-2 space-y-1">{excluded.map(item => <li key={item.symbol}>{item.name} · {item.asOfLabel || item.date} · {formatPrice(item.price, item.unit)}</li>)}</ul>
        </details>}
        {derivedState && <details className="rounded-lg border border-white/10 px-3 py-2 text-sm">
          <summary className="cursor-pointer">Market context</summary>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/65">
            <dt>Assessment score</dt><dd>{derivedState.score}/100</dd>
            <dt>US dollar proxy</dt><dd>{plain(derivedState.usdTrend)} · {plain(derivedState.usdImpact)}</dd>
            <dt>Real rates</dt><dd>{plain(derivedState.realRatesTrend)} · {plain(derivedState.realRatesImpact)}</dd>
            <dt>Growth proxy</dt><dd>{plain(derivedState.growthTrend)} · {plain(derivedState.growthSupport)}</dd>
            <dt>Market context</dt><dd>{plain(derivedState.macroRiskState)}</dd>
            <dt>Price range</dt><dd>{plain(derivedState.volRegime)}</dd>
            <dt>Energy vs metals</dt><dd>{signed(derivedState.relative.energyVsMetals)}</dd>
            <dt>Metals vs agriculture</dt><dd>{signed(derivedState.relative.metalsVsAg)}</dd>
            <dt>Copper vs gold</dt><dd>{signed(derivedState.relative.copperVsGold)}</dd>
          </dl>
        </details>}
        <p data-commodity-source className="text-xs text-white/45">Source: Alpha Vantage · {data?.sourceAsOf ? `Latest included observation: ${data.sourceAsOf}` : 'Observation date not collected'}{data?.lastUpdate ? ` · Retrieved ${new Date(data.lastUpdate).toLocaleString('en-AU')}` : ''} · Individual dates and proxy units in observation details.</p>
        <ComplianceDisclaimer compact />
      </main>
    </div>
  );
  return mainContent;
}
