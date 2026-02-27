/**
 * Backtest API
 * 
 * @route POST /api/backtest
 * @description Run historical backtests on trading strategies with real market data
 * @authentication Optional (enhanced features for authenticated users)
 * 
 * @body {object} request
 * @body {string} request.symbol - Stock symbol (e.g., "AAPL", "TSLA")
 * @body {string} request.strategy - Strategy name ("ema_crossover", "rsi_mean_reversion", "macd_momentum", "bollinger_bands")
 * @body {string} request.startDate - Backtest start date (YYYY-MM-DD)
 * @body {string} request.endDate - Backtest end date (YYYY-MM-DD)
 * @body {number} request.initialCapital - Starting capital amount
 * 
 * @returns {object} Backtest results
 * @returns {number} totalTrades - Number of trades executed
 * @returns {number} winRate - Percentage of winning trades
 * @returns {number} totalReturn - Total profit/loss
 * @returns {number} maxDrawdown - Maximum drawdown percentage
 * @returns {number} sharpeRatio - Risk-adjusted returns metric
 * @returns {Array} trades - Individual trade details
 * 
 * @example
 * POST /api/backtest
 * Body: { symbol: "AAPL", strategy: "ema_crossover", startDate: "2023-01-01", endDate: "2023-12-31", initialCapital: 10000 }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { backtestRequestSchema, type BacktestRequest } from '../../../lib/validation';
import { getSessionFromCookie } from '@/lib/auth';
import { createRateLimiter, getClientIP } from '@/lib/rateLimit';
import { buildBacktestEngineResult } from '@/lib/backtest/engine';
import { getBacktestStrategy } from '@/lib/strategies/registry';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import {
  parseBacktestTimeframe,
  isStrategyTimeframeCompatible,
  computeCoverage,
} from '@/lib/backtest/timeframe';
import { buildBacktestDiagnostics, inferStrategyDirection } from '@/lib/backtest/diagnostics';
import { buildValidationPayload } from '@/lib/backtest/validationPayload';
import {
  fetchPriceData,
  isCryptoSymbol,
  normalizeSymbol,
} from '@/lib/backtest/providers';
import { runStrategy } from '@/lib/backtest/runStrategy';
export type { StrategyResult, Trade } from '@/lib/backtest/runStrategy';

/** Backtest: 10 per minute per IP (heavy compute) */
const backtestLimiter = createRateLimiter('backtest', {
  windowMs: 60 * 1000,
  max: 10,
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit check
    const ip = getClientIP(req);
    const rl = backtestLimiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many backtest requests. Please wait before running another.', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    // Pro Trader tier required
    // Allow internal cron jobs to bypass auth via x-cron-secret header
    const cronSecret = process.env.CRON_SECRET;
    const headerCronSecret = req.headers.get('x-cron-secret');
    const isCronBypass = cronSecret && headerCronSecret === cronSecret;

    if (!isCronBypass) {
      const session = await getSessionFromCookie();
      if (!session?.workspaceId) {
        return NextResponse.json({ error: 'Please log in to use Backtesting' }, { status: 401 });
      }
      if (!hasProTraderAccess(session.tier)) {
        return NextResponse.json({ error: 'Pro Trader subscription required for Backtesting' }, { status: 403 });
      }
    }

    // Validate request body with Zod
    const json = await req.json();
    const body: BacktestRequest = backtestRequestSchema.parse(json);
    
    const { symbol, strategy, startDate, endDate, initialCapital, timeframe = 'daily' } = body;

    const strategyDefinition = getBacktestStrategy(strategy);
    if (!strategyDefinition) {
      return NextResponse.json(
        { error: `Unknown strategy: ${strategy}` },
        { status: 400 }
      );
    }

    const isCrypto = isCryptoSymbol(symbol);
    const normalizedSymbol = isCrypto ? normalizeSymbol(symbol) : symbol.toUpperCase();
    
    const parsedTimeframe = parseBacktestTimeframe(timeframe);
    if (!parsedTimeframe) {
      return NextResponse.json(
        { error: `Unsupported timeframe format: ${timeframe}` },
        { status: 400 }
      );
    }

    if (!isStrategyTimeframeCompatible(strategyDefinition.timeframes, parsedTimeframe)) {
      return NextResponse.json(
        {
          error: `Timeframe ${parsedTimeframe.normalized} is not supported for strategy ${strategyDefinition.label}`,
        },
        { status: 400 }
      );
    }
    
    logger.info('Backtest request started', { 
      symbol: normalizedSymbol, 
      strategy: strategyDefinition.id,
      startDate, 
      endDate, 
      initialCapital,
      timeframe: parsedTimeframe.normalized,
      assetType: isCrypto ? 'crypto' : 'stock'
    });

    // Fetch real historical price data
    logger.debug(`Fetching ${isCrypto ? 'crypto (CoinGecko)' : 'stock (Alpha Vantage)'} price data for ${normalizedSymbol} (${parsedTimeframe.normalized})...`);
    const { priceData, source: priceDataSource, volumeUnavailable, closeType } = await fetchPriceData(normalizedSymbol, parsedTimeframe.normalized, startDate, endDate);
    logger.debug(`Fetched ${Object.keys(priceData).length} bars of price data (closeType=${closeType}, volumeUnavailable=${volumeUnavailable})`);

    const coverage = computeCoverage(priceData, startDate, endDate);

    // Run backtest with real indicators
    const { trades, dates } = runStrategy(
      strategyDefinition.id,
      priceData,
      initialCapital,
      coverage.appliedStartDate,
      coverage.appliedEndDate,
      normalizedSymbol,
      parsedTimeframe.normalized
    );
    logger.debug(`Backtest complete: ${trades.length} trades executed`);
    const result = buildBacktestEngineResult(trades, dates, initialCapital);
    const strategyDirection = strategyDefinition.direction ?? inferStrategyDirection(strategyDefinition.id, result.trades);
    const diagnostics = buildBacktestDiagnostics(
      result,
      strategyDirection,
      parsedTimeframe.normalized,
      coverage.bars,
    );
    const validation = buildValidationPayload(strategyDefinition.id, strategyDirection, result);

    logger.info('Backtest completed successfully', { 
      symbol, 
      totalTrades: result.totalTrades,
      winRate: result.winRate,
      totalReturn: result.totalReturn.toFixed(2)
    });

    return NextResponse.json({
      ...result,
      dataSources: {
        priceData: priceDataSource,
        assetType: isCrypto ? 'crypto' : 'stock',
        closeType,
        volumeUnavailable,
      },
      dataCoverage: {
        requested: {
          startDate,
          endDate,
        },
        applied: {
          startDate: coverage.appliedStartDate,
          endDate: coverage.appliedEndDate,
        },
        minAvailable: coverage.minAvailable,
        maxAvailable: coverage.maxAvailable,
        bars: coverage.bars,
        provider: priceDataSource,
      },
      validation,
      strategyProfile: {
        id: strategyDefinition.id,
        label: strategyDefinition.label,
        direction: strategyDirection,
        invalidation: diagnostics.invalidation,
      },
      diagnostics,
    });
  } catch (error: any) {
    logger.error('Backtest error', { 
      error: error?.message || 'Failed to run backtest',
      stack: error?.stack
    });
    
    return NextResponse.json(
      { error: error.message || 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
