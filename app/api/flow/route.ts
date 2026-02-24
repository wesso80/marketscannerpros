import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';
import { computeCapitalFlowEngine } from '@/lib/capitalFlowEngine';
import { getDerivativesForSymbols, getGlobalData, getOHLC, resolveSymbolToId } from '@/lib/coingecko';
import { getLatestStateMachine, upsertStateMachine } from '@/lib/state-machine-store';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { avFetch } from '@/lib/avRateGovernor';
import { q } from '@/lib/db';
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/redis';

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

type ScanMode = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';

function normalizeCryptoSymbol(symbol: string): string {
  return symbol.replace(/[-]?(USD|USDT)$/i, '').toUpperCase();
}

function safeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Try to load daily bars from the worker's cache (Redis → DB) before hitting AV.
 * Returns parsed daily rows (date, open, high, low, close) or null on miss.
 */
async function getCachedDailyBars(symbol: string): Promise<Array<{ date: string; open: number; high: number; low: number; close: number }> | null> {
  const sym = symbol.toUpperCase().trim();
  const cacheKey = CACHE_KEYS.bars(sym, 'daily');

  // 1. Redis
  const cached = await getCached<any[]>(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 5) {
    console.log(`[flow] ${sym} daily bars from Redis (${cached.length} rows)`);
    return cached.map((b: any) => ({ date: b.timestamp || b.date, open: +b.open, high: +b.high, low: +b.low, close: +b.close }));
  }

  // 2. DB (ohlcv_bars table written by worker)
  try {
    const rows = await q<any>(
      `SELECT timestamp, open, high, low, close FROM ohlcv_bars
       WHERE symbol = $1 AND timeframe = 'daily'
       ORDER BY timestamp DESC LIMIT 100`,
      [sym]
    );
    if (rows && rows.length > 5) {
      console.log(`[flow] ${sym} daily bars from DB (${rows.length} rows)`);
      const bars = rows.map((r: any) => ({
        date: typeof r.timestamp === 'string' ? r.timestamp : new Date(r.timestamp).toISOString().slice(0, 10),
        open: +r.open, high: +r.high, low: +r.low, close: +r.close,
      }));
      // Backfill Redis
      await setCached(cacheKey, bars, CACHE_TTL.bars).catch(() => {});
      return bars;
    }
  } catch {
    // fall through to live fetch
  }

  return null;
}

async function fetchLiquidityLevels(symbol: string): Promise<{ levels: Array<{ level: number; label: string }>; vwap?: number }> {
  if (!ALPHA_VANTAGE_KEY) return { levels: [] };

  try {
    // Try cached daily bars first (written by worker) to avoid 1 AV call
    const cachedDaily = await getCachedDailyBars(symbol);

    const intradayUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=60min&outputsize=compact&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;

    // Rate-governed intraday fetch (still needed for VWAP / overnight levels)
    const intradayData = await avFetch(intradayUrl, `INTRADAY ${symbol}`);

    // Use cached daily if available, otherwise rate-governed live fetch
    let dailyData: any = null;
    if (cachedDaily && cachedDaily.length > 5) {
      // Simulate AV shape from cached bars
      const ts: Record<string, Record<string, string>> = {};
      for (const b of cachedDaily) {
        ts[b.date] = { '1. open': String(b.open), '2. high': String(b.high), '3. low': String(b.low), '4. close': String(b.close), '5. volume': '0' };
      }
      dailyData = { 'Time Series (Daily)': ts };
      console.log(`[flow] ${symbol} daily bars served from cache — saved 1 AV call`);
    } else {
      const dailyUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&entitlement=realtime&apikey=${ALPHA_VANTAGE_KEY}`;
      dailyData = await avFetch(dailyUrl, `DAILY ${symbol}`);
    }

    const levels: Array<{ level: number; label: string }> = [];
    let vwap: number | undefined;

    const intradaySeries = intradayData?.['Time Series (60min)'] as Record<string, Record<string, string>> | undefined;
    if (intradaySeries && Object.keys(intradaySeries).length > 0) {
      const entries = Object.entries(intradaySeries)
        .map(([timestamp, values]) => {
          const high = safeNumber(values['2. high']);
          const low = safeNumber(values['3. low']);
          const close = safeNumber(values['4. close']);
          const volume = safeNumber(values['5. volume']) ?? 0;
          if (high === null || low === null || close === null) return null;
          return {
            timestamp,
            dateKey: timestamp.slice(0, 10),
            hour: Number(timestamp.slice(11, 13)),
            high,
            low,
            close,
            volume,
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const dayKeys = Array.from(new Set(entries.map((entry) => entry.dateKey))).sort();
      const todayKey = dayKeys[dayKeys.length - 1];
      const prevKey = dayKeys[dayKeys.length - 2];

      if (todayKey) {
        const today = entries.filter((entry) => entry.dateKey === todayKey);
        const premkt = today.filter((entry) => entry.hour < 9);
        if (premkt.length) {
          levels.push({ level: Math.max(...premkt.map((entry) => entry.high)), label: 'ONH' });
          levels.push({ level: Math.min(...premkt.map((entry) => entry.low)), label: 'ONL' });
        }

        const sumPv = today.reduce((acc, bar) => acc + (((bar.high + bar.low + bar.close) / 3) * Math.max(1, bar.volume)), 0);
        const sumVol = today.reduce((acc, bar) => acc + Math.max(1, bar.volume), 0);
        if (sumVol > 0) {
          vwap = sumPv / sumVol;
        }
      }

      if (prevKey) {
        const prev = entries.filter((entry) => entry.dateKey === prevKey);
        if (prev.length) {
          levels.push({ level: Math.max(...prev.map((entry) => entry.high)), label: 'PDH' });
          levels.push({ level: Math.min(...prev.map((entry) => entry.low)), label: 'PDL' });
        }
      }
    }

    const dailySeries = dailyData?.['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
    if (dailySeries && Object.keys(dailySeries).length > 0) {
      const dailyRows = Object.entries(dailySeries)
        .map(([date, values]) => {
          const high = safeNumber(values['2. high']);
          const low = safeNumber(values['3. low']);
          const open = safeNumber(values['1. open']);
          const close = safeNumber(values['4. close']);
          if (high === null || low === null || open === null || close === null) return null;
          return { date, high, low, open, close };
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
        .sort((a, b) => b.date.localeCompare(a.date));

      const week = dailyRows.slice(0, 5);
      if (week.length) {
        levels.push({ level: Math.max(...week.map((row) => row.high)), label: 'WEEK_HIGH' });
        levels.push({ level: Math.min(...week.map((row) => row.low)), label: 'WEEK_LOW' });
      }

      if (dailyRows.length >= 2) {
        const current = dailyRows[0];
        const previous = dailyRows[1];
        const gapPct = Math.abs((current.open - previous.close) / Math.max(0.01, previous.close));
        if (gapPct >= 0.004) {
          levels.push({ level: previous.close, label: 'GAP_REF' });
          levels.push({ level: current.open, label: 'GAP_OPEN' });
        }
      }

      const recent = dailyRows.slice(0, 8);
      for (let i = 0; i < recent.length - 1; i += 1) {
        const current = recent[i];
        const next = recent[i + 1];
        const eqh = Math.abs(current.high - next.high) / Math.max(0.01, current.high);
        const eql = Math.abs(current.low - next.low) / Math.max(0.01, current.low);
        if (eqh <= 0.0015) levels.push({ level: (current.high + next.high) / 2, label: 'EQH' });
        if (eql <= 0.0015) levels.push({ level: (current.low + next.low) / 2, label: 'EQL' });
      }
    }

    return { levels, vwap };
  } catch (error) {
    console.warn('[flow] Liquidity level fetch failed:', error);
    return { levels: [] };
  }
}

async function fetchCryptoFlowContext(symbol: string): Promise<{
  spot: number;
  atr?: number;
  vwap?: number;
  levels: Array<{ level: number; label: string }>;
  positioning: {
    openInterestUsd?: number;
    oiChangePercent?: number;
    fundingRate?: number;
    basisPercent?: number;
    longShortRatio?: number;
    liquidationLevels?: Array<{ level: number; side: 'long_liq' | 'short_liq'; weight?: number }>;
  };
}> {
  const base = normalizeCryptoSymbol(symbol);
  const coinId = await resolveSymbolToId(base);
  if (!coinId) throw new Error(`No CoinGecko mapping for ${base}`);

  const [ohlc, derivatives] = await Promise.all([
    getOHLC(coinId, 7),
    getDerivativesForSymbols([base]),
  ]);

  if (!ohlc || !ohlc.length) {
    throw new Error(`No CoinGecko OHLC for ${base}`);
  }

  const candles = ohlc.map((row: number[]) => ({
    t: new Date(row[0]).toISOString(),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: 0,
  }));

  const spot = candles[candles.length - 1].c;
  const levels: Array<{ level: number; label: string }> = [];

  const byDay = new Map<string, typeof candles>();
  for (const candle of candles) {
    const day = candle.t.slice(0, 10);
    const bucket = byDay.get(day) ?? [];
    bucket.push(candle);
    byDay.set(day, bucket);
  }
  const days = Array.from(byDay.keys()).sort();
  const currentDay = days[days.length - 1];
  const prevDay = days[days.length - 2];
  if (prevDay) {
    const prev = byDay.get(prevDay) || [];
    levels.push({ level: Math.max(...prev.map((c) => c.h)), label: 'PDH' });
    levels.push({ level: Math.min(...prev.map((c) => c.l)), label: 'PDL' });
  }
  if (currentDay) {
    const today = byDay.get(currentDay) || [];
    const overnight = today.filter((c) => Number(c.t.slice(11, 13)) < 9);
    if (overnight.length) {
      levels.push({ level: Math.max(...overnight.map((c) => c.h)), label: 'ONH' });
      levels.push({ level: Math.min(...overnight.map((c) => c.l)), label: 'ONL' });
    }
  }

  const week = candles.slice(-96);
  levels.push({ level: Math.max(...week.map((c) => c.h)), label: 'WEEK_HIGH' });
  levels.push({ level: Math.min(...week.map((c) => c.l)), label: 'WEEK_LOW' });
  for (let i = 0; i < week.length - 1; i += 1) {
    const current = week[i];
    const next = week[i + 1];
    const eqh = Math.abs(current.h - next.h) / Math.max(0.0001, current.h);
    const eql = Math.abs(current.l - next.l) / Math.max(0.0001, current.l);
    if (eqh <= 0.0015) levels.push({ level: (current.h + next.h) / 2, label: 'EQH' });
    if (eql <= 0.0015) levels.push({ level: (current.l + next.l) / 2, label: 'EQL' });
  }

  const sumPv = candles.reduce((acc, c) => acc + (((c.h + c.l + c.c) / 3) * Math.max(1, c.v)), 0);
  const sumVol = candles.reduce((acc, c) => acc + Math.max(1, c.v), 0);
  const vwap = sumVol > 0 ? sumPv / sumVol : undefined;

  const best = derivatives.length
    ? [...derivatives].sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0))[0]
    : null;

  const openInterestUsd = Number(best?.open_interest || 0) || undefined;
  const fundingRate = Number.isFinite(best?.funding_rate) ? Number(best!.funding_rate) * 100 : undefined;
  const basisPercent = Number.isFinite(best?.basis) && Number.isFinite(best?.index) && Number(best!.index) > 0
    ? (Number(best!.basis) / Number(best!.index)) * 100
    : undefined;

  let oiChangePercent: number | undefined;
  const global = await getGlobalData();
  const marketMove = Number(global?.market_cap_change_percentage_24h_usd || 0);
  if (Number.isFinite(marketMove)) {
    oiChangePercent = marketMove * 0.35;
  }

  const longShortRatio = undefined;

  const crowdingDirection = Number.isFinite(longShortRatio)
    ? (longShortRatio! > 1 ? 'long_crowded' : 'short_crowded')
    : (Number.isFinite(fundingRate) ? (fundingRate! > 0 ? 'long_crowded' : fundingRate! < 0 ? 'short_crowded' : 'neutral') : 'neutral');

  const liquidationLevels = Number.isFinite(spot) && crowdingDirection !== 'neutral'
    ? [
        {
          level: spot * (crowdingDirection === 'long_crowded' ? 0.985 : 1.015),
          side: (crowdingDirection === 'long_crowded' ? 'long_liq' : 'short_liq') as 'long_liq' | 'short_liq',
          weight: 0.85,
        },
        {
          level: spot * (crowdingDirection === 'long_crowded' ? 1.015 : 0.985),
          side: (crowdingDirection === 'long_crowded' ? 'short_liq' : 'long_liq') as 'long_liq' | 'short_liq',
          weight: 0.65,
        },
      ]
    : undefined;

  const highs = candles.slice(-14).map((c) => c.h);
  const lows = candles.slice(-14).map((c) => c.l);
  const atr = highs.length && lows.length ? (Math.max(...highs) - Math.min(...lows)) / Math.max(1, highs.length / 3) : undefined;

  return {
    spot,
    atr,
    vwap,
    levels,
    positioning: {
      openInterestUsd,
      oiChangePercent,
      fundingRate,
      basisPercent,
      longShortRatio,
      liquidationLevels,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ success: false, error: 'Pro Trader subscription required for Capital Flow Engine' }, { status: 403 });
    }

    const url = new URL(request.url);
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
    const marketType = (url.searchParams.get('marketType') || 'equity').toLowerCase();
    const scanMode = (url.searchParams.get('scanMode') || 'intraday_1h') as ScanMode;
    const expirationDate = url.searchParams.get('expirationDate') || undefined;
    const playbook = (url.searchParams.get('playbook') || 'momentum_pullback').toLowerCase().trim();
    const direction: 'long' | 'short' =
      (url.searchParams.get('direction') || 'long').toLowerCase() === 'short' ? 'short' : 'long';

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'symbol is required' }, { status: 400 });
    }

    const previousState = await getLatestStateMachine(session.workspaceId, symbol, playbook, direction)
      .catch((error) => {
        console.warn('[flow] state-machine load failed:', error);
        return null;
      });

    const stateMachineContext = {
      currentState: previousState?.state,
      previousState: previousState?.previous_state ?? undefined,
      stateSinceIso: previousState?.state_since,
      event: 'bar_close_5m' as const,
      cooldownUntilIso: null,
      positionOpen: false,
      edgeDecay: false,
      triggerCurrent: 'waiting_confirmation',
      triggerEta: 'unknown',
      setupMissing: [],
      playbook,
      direction,
    };

    const flowPromise = marketType === 'crypto'
      ? (async () => {
          const crypto = await fetchCryptoFlowContext(symbol);
          return computeCapitalFlowEngine({
            symbol,
            marketType: 'crypto',
            spot: crypto.spot,
            vwap: crypto.vwap,
            atr: crypto.atr,
            liquidityLevels: crypto.levels,
            cryptoPositioning: crypto.positioning,
            trendMetrics: {
              emaAligned: crypto.vwap ? crypto.spot >= crypto.vwap : undefined,
            },
            dataHealth: {
              freshness: 'LIVE',
              fallbackActive: false,
            },
            riskGovernorContext: {
              stateMachineContext,
            },
          });
        })()
      : (async () => {
          const analysis = await optionsAnalyzer.analyzeForOptions(symbol, scanMode, expirationDate);
          const liquidity = await fetchLiquidityLevels(symbol);
          return computeCapitalFlowEngine({
            symbol,
            marketType: 'equity',
            spot: analysis.currentPrice,
            vwap: liquidity.vwap,
            atr: analysis.expectedMove?.selectedExpiry,
            openInterest: analysis.openInterestAnalysis
              ? {
                  totalCallOI: analysis.openInterestAnalysis.totalCallOI,
                  totalPutOI: analysis.openInterestAnalysis.totalPutOI,
                  pcRatio: analysis.openInterestAnalysis.pcRatio,
                  expirationDate: analysis.openInterestAnalysis.expirationDate,
                  highOIStrikes: analysis.openInterestAnalysis.highOIStrikes,
                }
              : null,
            liquidityLevels: liquidity.levels,
            dataHealth: {
              freshness: analysis.dataQuality?.freshness,
              fallbackActive: !!analysis.dataConfidenceCaps?.length,
              lastUpdatedIso: analysis.dataQuality?.lastUpdated,
            },
            riskGovernorContext: {
              stateMachineContext,
            },
          });
        })();

    const resolvedFlow = await flowPromise;

    const stateMachine = resolvedFlow.brain_decision_v1?.state_machine;
    if (stateMachine) {
      const transition = {
        old_state: stateMachine.previous_state,
        new_state: stateMachine.state,
        reason: stateMachine.audit.transition_reason,
        timestamp: resolvedFlow.brain_decision_v1.meta.generated_at,
        changed: stateMachine.previous_state !== stateMachine.state,
      };

      await upsertStateMachine({
        workspaceId: session.workspaceId,
        symbol,
        playbook,
        direction,
        eventType: 'bar_close_5m',
        output: {
          state_machine: stateMachine,
          transition,
        },
        brainScore: resolvedFlow.brain_decision_v1.brain_score.overall,
        stateConfidence: resolvedFlow.brain_decision_v1.probability_matrix.confidence,
        metadata: {
          route: '/api/flow',
          marketType,
          scanMode,
        },
      }).catch((error) => {
        console.warn('[flow] state-machine persist failed:', error);
      });
    }

    return NextResponse.json({
      success: true,
      data: resolvedFlow,
    });
  } catch (error) {
    console.error('[flow] API error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to compute flow' }, { status: 500 });
  }
}
