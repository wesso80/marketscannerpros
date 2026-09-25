import { NextRequest, NextResponse } from 'next/server';
import { buildOkxResponseMeta, getOkxFundingRates } from '@/lib/crypto/okxDerivatives';

const CACHE_DURATION = 300; // cache age is separate from each contract's funding interval
let cache: { data: any; timestamp: number } | null = null;

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'AVAX', 'DOT', 'LINK'];

interface FundingRate {
  symbol: string;
  fundingRate: number;        // 8h-equivalent rate as a decimal (e.g. 0.0001)
  fundingRatePercent: number; // 8h-equivalent rate in percent (e.g. 0.01%)
  rawFundingRatePercent: number; // rate for the contract's own interval, in percent
  fundingIntervalHours: number;  // observed interval (e.g. 8 or 4)
  annualized: number;         // annualised using the observed interval
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  exchanges: number;
  nextFundingTime: string;          // when the current-period rate settles
}

function withCountdown<T extends { nextFunding?: { timestamp: string | null } }>(data: T) {
  const at = data.nextFunding?.timestamp ? Date.parse(data.nextFunding.timestamp) : Number.NaN;
  const timeUntilMs = Number.isFinite(at) && at > Date.now() ? at - Date.now() : null;
  return {
    ...data,
    nextFunding: {
      timestamp: data.nextFunding?.timestamp ?? null,
      timeUntilMs,
      timeUntilFormatted: timeUntilMs == null ? null : formatDuration(timeUntilMs),
    },
  };
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export async function GET(_req: NextRequest) {
  if (cache && Date.now() - cache.timestamp < CACHE_DURATION * 1000) {
    const meta = buildOkxResponseMeta({
      endpointFamily: 'DERIVATIVES',
      lastUpdated: cache.data?.meta?.lastUpdated ?? new Date(cache.timestamp).toISOString(),
      maxAgeMs: CACHE_DURATION * 1000,
      fallbackUsed: Boolean(cache.data?.meta?.fallbackUsed),
    });
    return NextResponse.json({
      ...withCountdown(cache.data),
      timestamp: meta.lastUpdated,
      source: meta.provider,
      freshnessStatus: meta.freshnessStatus,
      meta,
    });
  }

  try {
    // OKX supplies each contract's funding schedule, so intervals are observed,
    // not assumed. (CoinGecko's derivatives feed has no interval, and Binance /
    // Bybit block US-hosted servers.)
    const observations = await getOkxFundingRates(SYMBOLS);
    if (!observations.length) throw new Error('No observed OKX funding rates');

    const rates: FundingRate[] = observations.map((o) => ({
      symbol: o.symbol,
      fundingRate: Number((o.ratePercent8h / 100).toFixed(8)),
      fundingRatePercent: Number(o.ratePercent8h.toFixed(4)),
      rawFundingRatePercent: Number(o.rawRatePercent.toFixed(4)),
      fundingIntervalHours: o.intervalHours,
      annualized: Number(o.annualizedPercent.toFixed(2)),
      sentiment: o.sentiment,
      exchanges: 1,
      nextFundingTime: new Date(o.settlementTime).toISOString(),
    }));

    const avgRate = rates.reduce((sum, r) => sum + r.fundingRatePercent, 0) / rates.length;
    const avgAnnualized = rates.reduce((sum, r) => sum + r.annualized, 0) / rates.length;

    let overallSentiment: 'Bullish' | 'Bearish' | 'Neutral';
    if (avgRate > 0.02) overallSentiment = 'Bullish';
    else if (avgRate < -0.01) overallSentiment = 'Bearish';
    else overallSentiment = 'Neutral';

    // The current-period rate settles at OKX's fundingTime; report BTC's.
    const nextFundingMs = observations.find((o) => o.symbol === 'BTC')?.settlementTime ?? null;

    const fetchedAt = new Date(Math.min(...observations.map((o) => o.observedAt))).toISOString();
    const meta = buildOkxResponseMeta({
      endpointFamily: 'DERIVATIVES',
      lastUpdated: fetchedAt,
      maxAgeMs: CACHE_DURATION * 1000,
    });

    const result = {
      available: true,
      average: {
        fundingRatePercent: Number(avgRate.toFixed(4)),
        annualized: Number(avgAnnualized.toFixed(2)),
        sentiment: overallSentiment,
      },
      nextFunding: {
        timestamp: nextFundingMs ? new Date(nextFundingMs).toISOString() : null,
        timeUntilMs: null,
        timeUntilFormatted: null,
      },
      coins: rates.sort((a, b) => b.fundingRatePercent - a.fundingRatePercent),
      source: meta.provider,
      exchange: 'OKX USDT-margined perpetual swaps',
      annualizationAssumption: "Rates are OKX's current-period funding for each USDT perpetual. fundingRatePercent is normalised to an 8-hour interval using each contract's observed funding interval; annualised = rate × (24 ÷ interval hours) × 365.",
      timestamp: meta.lastUpdated,
      freshnessStatus: meta.freshnessStatus,
      meta,
    };

    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(withCountdown(result));
  } catch (error) {
    console.error('[Funding Rates API] Error:', error);

    if (cache) {
      const meta = buildOkxResponseMeta({
        endpointFamily: 'DERIVATIVES',
        lastUpdated: cache.data?.meta?.lastUpdated ?? new Date(cache.timestamp).toISOString(),
        maxAgeMs: CACHE_DURATION * 1000,
        fallbackUsed: true,
      });
      return NextResponse.json({
        ...withCountdown(cache.data),
        stale: true,
        timestamp: meta.lastUpdated,
        source: meta.provider,
        freshnessStatus: meta.freshnessStatus,
        meta,
      });
    }

    return NextResponse.json({ error: 'Funding rates are unavailable: the OKX public funding feed could not be reached.', available: false, rates: [], coins: [] }, { status: 503 });
  }
}

