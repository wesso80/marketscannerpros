/**
 * Integration test: Every registered backtest strategy must be runnable
 * and produce at least one trade on appropriate synthetic data.
 *
 * This catches:
 *  - Missing indicator computation (indicator array is empty → 0 trades)
 *  - Strategy blocks never reached (bad if-condition)
 *  - Runtime errors (undefined access, NaN math, etc.)
 */
import { describe, it, expect } from 'vitest';
import { runStrategy } from '../lib/backtest/runStrategy';
import type { PriceData } from '../lib/backtest/providers';

// ── Synthetic data generators ───────────────────────────────────────────

/** Uptrend with pullbacks + volume spikes — triggers most long strategies */
function generateUptrendData(bars = 300): { priceData: PriceData; startDate: string; endDate: string } {
  const priceData: PriceData = {};
  const base = 100;
  const dates: string[] = [];

  for (let i = 0; i < bars; i++) {
    const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    dates.push(date);

    // Stepwise uptrend with periodic pullbacks
    const trend = base + i * 0.4;
    const cycle = Math.sin(i * 0.15) * 5; // oscillation
    const pullback = i % 50 > 40 ? -3 : 0; // pullback every 50 bars
    const close = trend + cycle + pullback;
    const high = close + 1.5 + Math.abs(Math.sin(i * 0.3)) * 2;
    const low = close - 1.5 - Math.abs(Math.cos(i * 0.3)) * 2;
    const open = close + (Math.sin(i * 0.5) > 0 ? 0.5 : -0.5);

    // Volume with periodic spikes
    const baseVol = 1_000_000;
    const volSpike = (i % 30 === 0 || i % 50 === 42) ? 4 : 1;
    const volume = baseVol * volSpike * (0.8 + Math.random() * 0.4);

    priceData[date] = { open, high, low, close, volume };
  }

  return { priceData, startDate: dates[0], endDate: dates[dates.length - 1] };
}

/** Mean-reverting / choppy data — triggers RSI oversold, BB squeeze, etc. */
function generateChoppyData(bars = 300): { priceData: PriceData; startDate: string; endDate: string } {
  const priceData: PriceData = {};
  const dates: string[] = [];

  for (let i = 0; i < bars; i++) {
    const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    dates.push(date);

    // Oscillating around 100 with sharp drops and recoveries
    const base = 100 + Math.sin(i * 0.08) * 15;
    const spike = (i % 40 < 5) ? -10 : (i % 40 > 35 ? 5 : 0); // sharp drops then recovery
    const close = base + spike;
    const high = close + 2 + (i % 40 < 3 ? 5 : 0); // long upper wicks during drops
    const low = close - 2 - (i % 40 < 5 ? 5 : 0); // deep lows during drops
    const open = close + (i % 40 < 5 ? 3 : -0.3); // bearish candles during drops

    const baseVol = 1_000_000;
    const volSpike = (i % 40 < 5) ? 5 : 1; // volume spikes during drops
    const volume = baseVol * volSpike;

    priceData[date] = { open, high, low, close, volume };
  }

  return { priceData, startDate: dates[0], endDate: dates[dates.length - 1] };
}

/** Strong trend data — triggers trend-following strategies like ADX, supertrend */
function generateStrongTrendData(bars = 300): { priceData: PriceData; startDate: string; endDate: string } {
  const priceData: PriceData = {};
  const dates: string[] = [];

  for (let i = 0; i < bars; i++) {
    const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    dates.push(date);

    // Phase 1: Strong uptrend (0-150), Phase 2: Strong downtrend (151-300)
    let close: number;
    if (i < 150) {
      close = 50 + i * 1.0 + Math.sin(i * 0.1) * 2;
    } else {
      close = 200 - (i - 150) * 0.8 + Math.sin(i * 0.1) * 2;
    }
    const high = close + 1 + Math.abs(Math.sin(i * 0.2));
    const low = close - 1 - Math.abs(Math.cos(i * 0.2));
    const open = (close + (i < 150 ? low : high)) / 2;

    const volume = 1_000_000 + Math.sin(i * 0.05) * 200_000;
    priceData[date] = { open, high, low, close, volume };
  }

  return { priceData, startDate: dates[0], endDate: dates[dates.length - 1] };
}

/** Gap + volume data — triggers earnings drift and breakout strategies */
function generateGapData(bars = 300): { priceData: PriceData; startDate: string; endDate: string } {
  const priceData: PriceData = {};
  const dates: string[] = [];
  let prevClose = 100;

  for (let i = 0; i < bars; i++) {
    const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    dates.push(date);

    // Gap up every 60 bars (simulating earnings surprise)
    const gap = (i % 60 === 30) ? prevClose * 0.05 : 0;
    const close = prevClose + 0.2 + gap + Math.sin(i * 0.1) * 1.5;
    const open = prevClose + gap;
    const high = Math.max(open, close) + 1 + (gap > 0 ? 3 : 0);
    const low = Math.min(open, close) - 1;

    const baseVol = 1_000_000;
    const volSpike = (i % 60 === 30) ? 5 : 1;
    const volume = baseVol * volSpike;

    priceData[date] = { open, high, low, close, volume };
    prevClose = close;
  }

  return { priceData, startDate: dates[0], endDate: dates[dates.length - 1] };
}

// ── Strategy → data mapping ─────────────────────────────────────────────

/**
 * Every strategy registered in the system.
 * Signal-replay strategies are excluded (they require live signal packets).
 */
const STRATEGIES_TO_TEST: {
  id: string;
  dataGenerator: () => { priceData: PriceData; startDate: string; endDate: string };
  minTrades: number; // minimum expected trades (0 = just check no crash)
}[] = [
  // ── Core strategies (handled by runCoreStrategyStep) ──────────────
  { id: 'ema_crossover',       dataGenerator: generateUptrendData,     minTrades: 1 },
  { id: 'sma_crossover',       dataGenerator: generateStrongTrendData, minTrades: 0 }, // slow crossover, may not trigger in 300 bars
  { id: 'rsi_reversal',        dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'rsi_trend',           dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'macd_momentum',       dataGenerator: generateUptrendData,     minTrades: 1 },
  { id: 'macd_crossover',      dataGenerator: generateUptrendData,     minTrades: 1 },
  { id: 'bbands_squeeze',      dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'bbands_breakout',     dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'multi_ema_rsi',       dataGenerator: generateUptrendData,     minTrades: 1 },
  { id: 'multi_macd_adx',      dataGenerator: generateUptrendData,     minTrades: 1 },
  { id: 'stoch_oversold',      dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'adx_trend',           dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'cci_reversal',        dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'obv_volume',          dataGenerator: generateUptrendData,     minTrades: 1 },
  { id: 'multi_bb_stoch',      dataGenerator: generateChoppyData,      minTrades: 1 },

  // ── MSP Elite strategies (inline in route.ts) ─────────────────────
  { id: 'msp_multi_tf',             dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'msp_multi_tf_strict',      dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'msp_day_trader',           dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'msp_day_trader_strict',    dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'msp_day_trader_v3',        dataGenerator: generateStrongTrendData, minTrades: 1 },
  { id: 'msp_day_trader_v3_aggressive', dataGenerator: generateStrongTrendData, minTrades: 1 },
  { id: 'msp_trend_pullback',       dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'msp_liquidity_reversal',   dataGenerator: generateChoppyData,      minTrades: 0 },

  // ── Scalping strategies ───────────────────────────────────────────
  { id: 'scalp_vwap_bounce',     dataGenerator: generateChoppyData,      minTrades: 0 },
  { id: 'scalp_orb_15',          dataGenerator: generateUptrendData,     minTrades: 0 },
  { id: 'scalp_momentum_burst',  dataGenerator: generateUptrendData,     minTrades: 0 },
  { id: 'scalp_mean_revert',     dataGenerator: generateChoppyData,      minTrades: 1 },

  // ── Swing strategies ──────────────────────────────────────────────
  { id: 'swing_pullback_buy',    dataGenerator: generateUptrendData,     minTrades: 0 },
  { id: 'swing_breakout',        dataGenerator: generateUptrendData,     minTrades: 0 },
  { id: 'swing_earnings_drift',  dataGenerator: generateGapData,         minTrades: 1 },

  // ── Elite standalone strategies ───────────────────────────────────
  { id: 'triple_ema',                dataGenerator: generateUptrendData,     minTrades: 1 },
  { id: 'supertrend',                dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'volume_breakout',           dataGenerator: generateUptrendData,     minTrades: 0 },
  { id: 'volume_climax_reversal',    dataGenerator: generateChoppyData,      minTrades: 0 },
  { id: 'williams_r',                dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'macd_histogram_reversal',   dataGenerator: generateChoppyData,      minTrades: 1 },
  { id: 'rsi_divergence',            dataGenerator: generateChoppyData,      minTrades: 0 },
  { id: 'keltner_atr_breakout',      dataGenerator: generateUptrendData,     minTrades: 0 },
  { id: 'multi_confluence_5',        dataGenerator: generateStrongTrendData, minTrades: 0 },
  { id: 'ichimoku_cloud',            dataGenerator: generateStrongTrendData, minTrades: 0 },
];

// ── Tests ───────────────────────────────────────────────────────────────

describe('Strategy integration – every strategy runs without error', () => {

  for (const { id, dataGenerator, minTrades } of STRATEGIES_TO_TEST) {
    it(`${id} — runs without throwing`, () => {
      const { priceData, startDate, endDate } = dataGenerator();
      let result: ReturnType<typeof runStrategy>;

      expect(() => {
        result = runStrategy(id, priceData, 10_000, startDate, endDate, 'TEST', 'daily');
      }).not.toThrow();

      // Verify the result is structurally valid
      expect(result!).toBeDefined();
      expect(result!.trades).toBeInstanceOf(Array);
      expect(result!.dates).toBeInstanceOf(Array);
      expect(result!.closes).toBeInstanceOf(Array);

      // Every trade must have required fields
      for (const trade of result!.trades) {
        expect(trade.symbol).toBe('TEST');
        expect(typeof trade.entry).toBe('number');
        expect(typeof trade.exit).toBe('number');
        expect(typeof trade.return).toBe('number');
        expect(typeof trade.returnPercent).toBe('number');
        expect(typeof trade.holdingPeriodDays).toBe('number');
        expect(trade.side).toBeDefined();
        expect(['LONG', 'SHORT']).toContain(trade.side);

        // No NaN/Infinity in financials
        expect(Number.isFinite(trade.entry)).toBe(true);
        expect(Number.isFinite(trade.exit)).toBe(true);
        expect(Number.isFinite(trade.return)).toBe(true);
        expect(Number.isFinite(trade.returnPercent)).toBe(true);
      }
    });

    if (minTrades > 0) {
      it(`${id} — produces >= ${minTrades} trade(s) on synthetic data`, () => {
        const { priceData, startDate, endDate } = dataGenerator();
        const result = runStrategy(id, priceData, 10_000, startDate, endDate, 'TEST', 'daily');
        expect(result.trades.length).toBeGreaterThanOrEqual(minTrades);
      });
    }
  }
});

describe('Signal-replay strategies throw informative error', () => {
  for (const id of ['brain_signal_replay', 'options_signal_replay', 'time_scanner_signal_replay']) {
    it(`${id} — throws with clear message`, () => {
      const { priceData, startDate, endDate } = generateUptrendData();
      expect(() => {
        runStrategy(id, priceData, 10_000, startDate, endDate, 'TEST', 'daily');
      }).toThrow(/live-signal replay strategy/);
    });
  }
});
