'use client';

import PaidPreviewGate from '@/components/free/PaidPreviewGate';

import { useState, useEffect, useCallback } from 'react';
import FreeLoading from '@/components/free/Loading';
import { useUserTier, canAccessCryptoCommandCenter } from '@/lib/useUserTier';
import { boundedJsonFetch } from '@/lib/boundedFetch';
import LockedPreview from '@/components/free/LockedPreview';
import UpgradeGate from '@/components/UpgradeGate';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import { useAIPageContext } from '@/lib/ai/pageContext';
import TradeIdeasSection from '@/components/derivatives/TradeIdeasSection';
import type { DashboardData, DerivativesTradeIdea } from '@/components/derivatives/types';
import CoinGeckoCredit from '@/components/CoinGeckoCredit';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import ChipRow from '@/components/visual/ChipRow';
import SourceLine from '@/components/visual/SourceLine';
import StatTile from '@/components/visual/StatTile';
import { DERIVATIVE_FEED_BASIS, conditionsPhrase, derivativeDecisionReady, pressurePhrase, sydneyClock } from '@/lib/crypto/derivativeDesk';
import { selectBtcOpenInterestTile } from '@/lib/crypto/openInterestTotal';
import { formatMarketTime } from '@/lib/market/priceStamp';

export default function CryptoDashboard(props: { embeddedInDashboard?: boolean } = {}) {
  return <PaidPreviewGate tool="Crypto Derivatives"><CryptoDashboardPaid {...props} /></PaidPreviewGate>;
}
function CryptoDashboardPaid({ embeddedInDashboard = false }: { embeddedInDashboard?: boolean } = {}) {
  const { tier, isLoading: tierLoading } = useUserTier();
  const [data, setData] = useState<DashboardData>({
    fundingRates: null,
    longShort: null,
    openInterest: null,
    liquidations: null,
    prices: {},
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    const get = async (url: string) => {
      const { response, body } = await boundedJsonFetch<any>(url);
      if (!response.ok) throw new Error(body?.error || `A derivatives feed returned ${response.status}`);
      return body;
    };
    setLoading(true);
    setFetchErrors([]);
    try {
      // Liquidations stay off this page. OKX public history does not cover 24 hours, so that route is not called.
      const [fundingRes, lsRes, oiRes, heatmapRes] = await Promise.all([
        get('/api/funding-rates').catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
        get('/api/long-short-ratio').catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
        get('/api/crypto/open-interest').catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
        get('/api/crypto/heatmap').catch((e: unknown) => { setFetchErrors(prev => [...prev, String(e)]); return null; }),
      ]);

      const prices: { [key: string]: { price: number; change24h: number } } = {};
      if (heatmapRes?.cryptos) {
        for (const coin of heatmapRes.cryptos) {
          if (['BTC', 'ETH', 'SOL'].includes(coin.symbol)) {
            prices[coin.symbol] = { price: coin.price, change24h: coin.changePercent };
          }
        }
      }

      const newData: DashboardData = {
        fundingRates: fundingRes?.meta?.freshnessStatus === 'fresh' && !fundingRes?.stale && fundingRes?.coins?.length && fundingRes?.average?.fundingRatePercent != null && Number.isFinite(Number(fundingRes.average.fundingRatePercent)) ? {
          coins: fundingRes.coins,
          avgRate: parseFloat(fundingRes.average?.fundingRatePercent || '0'),
          sentiment: fundingRes.average?.sentiment || 'Neutral'
        } : null,
        longShort: lsRes?.coins?.length && lsRes?.average?.longPercent != null && lsRes?.average?.shortPercent != null ? {
          coins: lsRes.coins,
          overall: lsRes.average?.sentiment || 'Neutral',
          avgLong: parseFloat(lsRes.average?.longPercent || '50'),
          avgShort: parseFloat(lsRes.average?.shortPercent || '50'),
        } : null,
        openInterest: oiRes?.summary || oiRes?.coins?.length ? oiRes : null,
        liquidations: null,
        prices,
      };
      setData(newData);
      const hasData = newData.fundingRates || newData.longShort || newData.openInterest || Object.keys(prices).length > 0;
      if (hasData) setLastUpdate(new Date());
    } catch (error) {
      setFetchErrors(prev => [...prev, String(error)]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      interval = setInterval(fetchData, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchData, autoRefresh]);

  const { setPageData } = useAIPageContext();

  useEffect(() => {
    if (data.fundingRates || data.longShort || data.openInterest) {
      const symbols = [
        ...(data.fundingRates?.coins.map(c => c.symbol) || []),
        ...(data.longShort?.coins.map(c => c.symbol) || []),
      ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 10);

      setPageData({
        skill: 'derivatives',
        symbols,
        data: {
          fundingRates: data.fundingRates ? {
            avgRate: data.fundingRates.avgRate,
            sentiment: data.fundingRates.sentiment,
            topCoins: data.fundingRates.coins.slice(0, 5),
          } : null,
          longShort: data.longShort ? {
            overall: data.longShort.overall,
            avgLong: data.longShort.avgLong,
            avgShort: data.longShort.avgShort,
          } : null,
          openInterest: data.openInterest?.summary || null,
          prices: data.prices,
        },
        summary: `Crypto Derivatives: funding ${data.fundingRates ? 'present' : 'missing'}, long/short ${data.longShort ? 'present' : 'missing'}, open interest ${data.openInterest?.summary ? 'present' : 'missing'}.`,
      });
    }
  }, [data, setPageData]);

  if (tierLoading) return <FreeLoading />;

  if (!canAccessCryptoCommandCenter(tier)) {
    return (
      <div className={`${embeddedInDashboard ? 'min-h-[16rem]' : 'min-h-screen'} bg-[var(--msp-bg)] text-white flex items-center justify-center`}>
        <UpgradeGate feature="Crypto Derivatives Dashboard" requiredTier="pro" preview={<LockedPreview tool="Crypto Derivatives Dashboard" />} />
      </div>
    );
  }

  const oiTrendAvailable = typeof data.openInterest?.summary?.change24h === 'number' && Number.isFinite(data.openInterest.summary.change24h);

  const getMarketBias = (): { bias: string; confidence: number; bullishScore: number; bearishScore: number } => {
    let bullishScore = 0;
    let bearishScore = 0;

    if (data.fundingRates) {
      if (data.fundingRates.avgRate > 0.01) bearishScore += 1;
      else if (data.fundingRates.avgRate < -0.01) bullishScore += 1;
    }

    if (data.longShort) {
      if (data.longShort.overall === 'Bullish') bullishScore += 1;
      else if (data.longShort.overall === 'Bearish') bearishScore += 1;
    }

    if (oiTrendAvailable && data.openInterest?.summary) {
      if (data.openInterest.summary.marketSignal === 'expanding') bullishScore += 1;
      else if (data.openInterest.summary.marketSignal === 'contracting') bearishScore += 1;
    }

    const totalSignals = bullishScore + bearishScore;
    const margin = bullishScore - bearishScore;
    const hasOpposing = bullishScore > 0 && bearishScore > 0;
    const scoredInputs = [data.fundingRates, data.longShort, oiTrendAvailable].filter(Boolean).length;
    const confidence = totalSignals > 0 ? Math.round((Math.abs(margin) / totalSignals) * 100 * scoredInputs / 3) : 0;

    let bias: string;
    if (margin >= 2) bias = 'BULLISH';
    else if (margin <= -2) bias = 'BEARISH';
    else if (hasOpposing) bias = 'MIXED';
    else if (margin === 1) bias = 'LEAN BULLISH';
    else if (margin === -1) bias = 'LEAN BEARISH';
    else bias = 'NEUTRAL';

    return { bias, confidence, bullishScore, bearishScore };
  };

  const marketBias = getMarketBias();
  const decisionReady = derivativeDecisionReady({
    funding: Boolean(data.fundingRates),
    longShort: Boolean(data.longShort),
    openInterest: Boolean(data.openInterest),
  }, fetchErrors.length);

  const primarySymbols = ['BTC', 'ETH', 'SOL'];
  const volatilityProxy = Math.max(
    ...primarySymbols.map((symbol) => Math.abs(data.prices[symbol]?.change24h || 0)),
    0
  );
  const volRegime = Object.keys(data.prices).length === 0 ? null : volatilityProxy >= 3 ? 'Large' : volatilityProxy >= 1.5 ? 'Moderate' : 'Small';
  const liquidityState = !oiTrendAvailable ? null : data.openInterest?.summary?.marketSignal === 'expanding'
    ? 'Expanding'
    : data.openInterest?.summary?.marketSignal === 'contracting'
      ? 'Contracting'
      : 'Stable';

  const rotation = (() => {
    const btc = data.prices.BTC?.change24h || 0;
    const eth = data.prices.ETH?.change24h || 0;
    const sol = data.prices.SOL?.change24h || 0;
    if (!data.prices.BTC && !data.prices.ETH && !data.prices.SOL) return null;
    if (btc >= eth && btc >= sol && btc > 0.4) return 'BTC-led';
    if (sol >= btc && sol >= eth && sol > 1.2) return 'SOL-led';
    if (eth >= btc && eth >= sol && eth > 0.4) return 'ETH-led';
    if (eth > btc || sol > btc) return 'Alts-led';
    return 'Mixed';
  })();

  const pressure = pressurePhrase(marketBias.bias);
  const permission = !decisionReady ? 'Hidden' : volRegime === 'Large' && liquidityState === 'Contracting' && marketBias.bearishScore >= marketBias.bullishScore
    ? 'No'
    : marketBias.confidence >= 67
      ? 'Yes'
      : 'Conditional';
  const conditions = conditionsPhrase(permission);

  const fundingDriver = data.fundingRates
    ? data.fundingRates.avgRate > 0.01
      ? 'Funding elevated (longs paying)'
      : data.fundingRates.avgRate < -0.01
        ? 'Funding negative (shorts paying)'
        : 'Funding neutral across majors'
    : null;

  const oiDriver = oiTrendAvailable
    ? data.openInterest?.summary?.marketSignal === 'expanding'
      ? 'Open interest building'
      : data.openInterest?.summary?.marketSignal === 'contracting'
        ? 'Open interest unwinding'
        : 'Open interest stable on comparable contracts'
    : null;

  const tradeIdeas: DerivativesTradeIdea[] = decisionReady ? primarySymbols.map((symbol) => {
    const downside = (pressure || '').includes('Downside');
    const upside = (pressure || '').includes('Upside');
    return {
      id: symbol.toLowerCase(),
      symbol,
      direction: downside ? 'Downside scenario' : upside ? 'Upside scenario' : 'No directional scenario',
      setupType: permission === 'No' ? 'No directional scenario' : downside ? 'Failed-bounce study' : upside ? 'Continuation study' : 'Range study',
      trigger: [fundingDriver, oiDriver].filter(Boolean).join(' · ') || 'Readings are present with no single dominant factor.',
      invalidation: 'The reading no longer matches this scenario.',
      riskMode: conditions || 'Conditions partial',
    };
  }) : [];

  const baselineReadyAt = data.openInterest?.summary?.baselineReadyAt as string | null | undefined;
  const baselineClock = !oiTrendAvailable ? sydneyClock(baselineReadyAt) : null;
  const oiReason = typeof data.openInterest?.summary?.comparisonReason === 'string' ? data.openInterest.summary.comparisonReason : '';
  // Coverage faults still say "unavailable" upstream. Keep that word off the page; the partial alert covers the fault.
  const oiReasonVisible = Boolean(oiReason) && !/unavailable/i.test(oiReason);
  const partial = fetchErrors.length > 0 || !data.fundingRates || !data.longShort || !data.openInterest || (Boolean(oiReason) && !oiReasonVisible);

  const chips = [
    ...(!data.fundingRates ? [{ id: 'funding', label: 'Funding: not in this response', detail: 'OKX funding did not return a fresh reading.', warning: true }] : []),
    ...(!data.longShort ? [{ id: 'long-short', label: 'Long/short: not in this response', detail: 'OKX account ratios did not return a fresh reading.', warning: true }] : []),
    ...(!data.openInterest ? [{ id: 'oi', label: 'Open interest: not in this response', detail: 'The CoinGecko open-interest snapshot did not return a fresh reading.', warning: true }] : []),
    ...(Object.keys(data.prices).length === 0 ? [{ id: 'prices', label: 'Prices: not in this response', detail: 'BTC, ETH and SOL prices were not in the heatmap response.', warning: true }] : []),
  ];

  const money = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value) || !(value > 0)) return null;
    if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    if (value >= 1) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
  };
  const oiTile = selectBtcOpenInterestTile(data.openInterest);
  const oiSource = oiTile.sourceLabel;
  const oiChangeLabel = typeof data.openInterest?.summary?.change24hLabel === 'string' && data.openInterest.summary.change24hLabel
    ? data.openInterest.summary.change24hLabel
    : '24h change on the fixed contract basket, not this total';
  const basketChange = oiTrendAvailable ? data.openInterest?.summary?.change24h : null;
  const basketText = typeof basketChange === 'number' ? `${basketChange >= 0 ? '+' : ''}${basketChange.toFixed(2)}%` : null;

  return (
    <div className={`mx-auto w-full max-w-none ${embeddedInDashboard ? 'px-0 pb-6 pt-0' : 'px-4 pb-24 pt-6 md:px-6'}`}>
      <div className="mb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl"><img src="/assets/platform-tools/crypto-derivatives.png" alt="" className="h-full w-full object-contain p-0.5" /></div>
            <div>
              <h1 className="mb-1 text-3xl font-bold text-white">Crypto Derivatives</h1>
              <p className="text-gray-400">Funding, open interest, and account ratios. Research only.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                aria-label="Toggle auto-refresh"
              />
              Auto-refresh (60s)
            </label>
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="min-h-10 rounded-lg bg-[#10B981] px-3 text-xs font-semibold text-white transition-all hover:bg-[#059669] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {decisionReady && conditions && (
        <section aria-label="Conditions" className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 md:px-4">
          <h2 className="text-sm font-semibold text-white">Conditions</h2>
          <p data-derivatives-summary role="status" className="mt-1 text-lg font-semibold text-white">{conditions}</p>
          <CollapsibleSection title="Conditions evidence">
          <p className="mt-1 text-sm text-white/80">
            {[pressure, rotation, volRegime ? `24h move ${volRegime}` : null, liquidityState ? `OI trend ${liquidityState}` : null].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-2 text-xs text-[var(--msp-warn)]">{DERIVATIVE_FEED_BASIS}</p>
          <ul className="mt-3 grid gap-2">
            {[fundingDriver, oiDriver].filter(Boolean).map((item) => (
              <li key={item} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">{item}</li>
            ))}
          </ul>
          </CollapsibleSection>
        </section>
      )}

      {(!decisionReady || !conditions) && <p data-derivatives-summary role="status" className="mb-4 text-lg font-semibold text-white">{loading ? 'Loading derivatives observations…' : 'Not enough feed coverage to assess conditions.'}</p>}

      <div className="mb-4">
        <ComplianceDisclaimer collapsible variant="cryptoDerivatives" />
      </div>

      {partial && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Some feeds are not available right now. Displayed values may be incomplete.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {primarySymbols.map((symbol) => (
          <StatTile key={symbol} label={symbol} value={money(data.prices[symbol]?.price)} change={data.prices[symbol]?.change24h} />
        ))}
        <StatTile label="BTC open interest" value={loading ? null : (oiTile.value ?? 'unavailable')} />
      </div>
      <p className="mb-1 text-xs text-white/70">{oiSource}.</p>
      <p className="mb-1 text-xs text-white/70">Basket 24h: {basketText ?? 'unavailable'}. {oiChangeLabel}.</p>
      {oiTile.shownCoinCount > 0 && oiTile.shownSumFormatted ? (
        <p className="mb-4 text-xs text-white/70">Open interest across {oiTile.shownCoinCount} coins: {oiTile.shownSumFormatted}. {oiTile.shownSourceLabel}.</p>
      ) : <div className="mb-4" />}

      {baselineClock && (
        <p className="mb-4 text-sm text-[var(--msp-warn)]">24h change: building, ready about {baselineClock}</p>
      )}
      {!baselineClock && oiReasonVisible && !oiTrendAvailable && (
        <p className="mb-4 text-sm text-[var(--msp-warn)]">{oiReason}</p>
      )}

      <div className="mb-4"><CollapsibleSection title="Funding and account-ratio charts">
      <div className="grid gap-3 lg:grid-cols-2">
        <BarChart
          title="Funding"
          empty={data.fundingRates ? null : 'Funding is not in this response.'}
          rows={(data.fundingRates?.coins || []).map((coin) => ({
            symbol: coin.symbol,
            value: coin.fundingRatePercent,
            label: Number.isFinite(coin.fundingRatePercent) ? `${coin.fundingRatePercent >= 0 ? '+' : ''}${coin.fundingRatePercent.toFixed(4)}%` : '',
          })).filter((row) => row.label)}
        />
        <BarChart
          title="Long/short"
          empty={data.longShort ? null : 'Long/short ratios are not in this response.'}
          rows={(data.longShort?.coins || []).map((coin) => ({
            symbol: coin.symbol,
            value: coin.longAccount,
            label: Number.isFinite(coin.longAccount) && Number.isFinite(coin.shortAccount) ? `${coin.longAccount.toFixed(1)} / ${coin.shortAccount.toFixed(1)}` : '',
          })).filter((row) => row.label)}
        />
      </div>
      </CollapsibleSection></div>

      <div className="mb-4">
        <ChipRow items={chips} />
      </div>

      {tradeIdeas.length > 0 && (
        <div className="mb-4">
          <CollapsibleSection title="Research scenarios" summary={`${tradeIdeas.length} studies · ${conditions}`}>
            <TradeIdeasSection ideas={tradeIdeas} />
          </CollapsibleSection>
        </div>
      )}

      <SourceLine
        source={`Funding and long/short: OKX · OI: ${oiSource}`}
        basis={`${oiChangeLabel} · 8h funding equivalents · account ratios · no shared provider observation time supplied${lastUpdate ? ` · Last response with data received ${formatMarketTime(lastUpdate.toISOString(), 'Australia/Sydney') ?? 'time not recorded'} (request completion, not a provider observation time)` : ''}`}
      />
      <CoinGeckoCredit className="mt-2 text-center" />
    </div>
  );
}

function BarChart({ title, rows, empty }: { title: string; rows: Array<{ symbol: string; value: number; label: string }>; empty: string | null }) {
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const max = Math.max(1e-9, ...rows.map((row) => Math.abs(row.value)));
  const list = (items: typeof rows) => (
    <ul className="space-y-2">
      {items.map((row) => (
        <li key={`${title}-${row.symbol}`} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
          <span className="font-semibold text-white">{row.symbol}</span>
          <span className="h-2 rounded bg-white/10" aria-hidden="true">
            <span className="block h-2 rounded" style={{ width: `${Math.min(100, (Math.abs(row.value) / max) * 100)}%`, background: row.value >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }} />
          </span>
          <span className="tabular-nums text-white/80">{row.label}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
      <h2 className="mb-2 text-sm font-semibold text-white">{title}</h2>
      {rows.length === 0 ? <p className="text-xs text-white/60">{empty}</p> : list(top)}
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-10 cursor-pointer content-center text-sm text-white/80">Show all {rows.length}</summary>
          <div className="pt-2">{list(rest)}</div>
        </details>
      )}
    </section>
  );
}
