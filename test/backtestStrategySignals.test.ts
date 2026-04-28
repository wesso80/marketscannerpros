/**
 * Strategy signal formation and intrabar execution tests.
 *
 * Three concern areas:
 *  1. Signal formation invariants — no lookahead, entry on signal-bar close
 *  2. Intrabar exit priority — stop resolves before target on same-bar touch
 *  3. Slippage model — direction, magnitude, post-processing application
 *
 * Mixing source-code invariant tests (file reads) with functional runStrategy tests
 * so both the contract (what the code says) and the outcome (what it produces) are covered.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runStrategy } from '../lib/backtest/runStrategy';
import type { PriceData } from '../lib/backtest/providers';
import { BACKTEST_SLIPPAGE_BPS } from '../lib/backtest/assumptions';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

// ── Synthetic price helpers ───────────────────────────────────────────────

function makePriceBar(close: number) {
  return {
    open: close,
    high: close * 1.005,
    low: close * 0.995,
    close,
    volume: 1_000_000,
  };
}

/**
 * Builds a PriceData dictionary with 100 sequential calendar dates.
 * runStrategy does not require trading-day calendars — it uses whatever keys are present.
 */
function makePriceData(closes: number[]): PriceData {
  const data: PriceData = {};
  closes.forEach((close, i) => {
    const d = new Date('2023-01-01');
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    data[dateStr] = makePriceBar(close);
  });
  return data;
}

/**
 * Builds a 100-bar price series that produces exactly one EMA(9/21) bullish crossover.
 *
 * Pattern:
 *   Bars  0-49: price = 95 (flat — EMA9 ≈ EMA21 ≈ 95 after warm-up)
 *   Bars 50-99: price = 105 (step-up — EMA9 jumps above EMA21 on bar 50; no reversal)
 *
 * Crossover fires on bar 50 because:
 *   ema9[49] = ema21[49] ≈ 95  →  ema9[49] <= ema21[49]  (condition met)
 *   ema9[50] = 95 + 0.2*(105-95) = 97  >  ema21[50] ≈ 95.95  (crossover confirmed)
 *
 * No reverse crossover occurs → position exits at end_of_data on bar 99.
 */
function makeEmaCrossoverPriceData(): { data: PriceData; startDate: string; endDate: string; rawEntryClose: number } {
  const closes = [
    ...Array.from({ length: 50 }, () => 95),   // flat warm-up
    ...Array.from({ length: 50 }, () => 105),  // step-up — triggers crossover
  ];
  const data = makePriceData(closes);
  const dates = Object.keys(data).sort();
  return {
    data,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    rawEntryClose: 105,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SIGNAL FORMATION INVARIANTS (source-code contracts)
// ═══════════════════════════════════════════════════════════════════════════

describe('signal formation — source code invariants', () => {
  it('entry is recorded at the signal bar close, not the next-bar open', () => {
    // EMA crossover in strategyExecutors must set entry = close (current bar),
    // not closes[i+1] or priceData[dates[i+1]]
    const executors = read('lib/backtest/strategyExecutors.ts');
    // Entry line: position = { ..., entry: close, ... }
    // "close" is the variable bound at bar i; no i+1 anywhere in the entry block
    expect(executors).toContain("entry: close, entryDate: date, entryIdx: i");
  });

  it('EMA crossover uses previous-bar confirmation to prevent same-bar lookahead', () => {
    const executors = read('lib/backtest/strategyExecutors.ts');
    // The long entry guard requires i-1 below and i above: no same-bar prediction
    expect(executors).toContain('ema9[i - 1] <= ema21[i - 1] && ema9[i] > ema21[i]');
    expect(executors).toContain('ema9[i - 1] >= ema21[i - 1] && ema9[i] < ema21[i]');
  });

  it('main loop excludes the last bar from signal detection (no future price lookahead)', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    // Loop must run up to dates.length - 1 (exclusive), leaving the last bar as
    // only accessible for end-of-data exit price — never as a signal source
    expect(runner).toContain('for (let i = startIdx; i < dates.length - 1; i++)');
  });

  it('end-of-data exit uses the last available close price', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    expect(runner).toContain("exitReason: 'end_of_data'");
    expect(runner).toContain('const lastIdx = dates.length - 1');
    expect(runner).toContain('const exitPrice = closes[lastIdx]');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. INTRABAR STOP-BEFORE-TARGET PRIORITY (source-code + assumptions metadata)
// ═══════════════════════════════════════════════════════════════════════════

describe('intrabar exit priority — stop resolves before target', () => {
  it('when both SL and TP touch the same bar, stop exit is recorded (not target)', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    // The priority resolution: hitSL wins. Both MSP strategies use this pattern.
    // Pattern: exitReason = hitSL ? 'stop' : hitTP ? 'target' : ...
    expect(runner).toContain("hitSL ? 'stop' : hitTP ? 'target'");
  });

  it('checkHitSLTP evaluates both SL and TP independently without short-circuit', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    // Both hitSL and hitTP are computed before the ternary — no early return
    expect(runner).toContain('const hitSL = side === \'LONG\' ? low <= sl : high >= sl');
    expect(runner).toContain('const hitTP = side === \'LONG\' ? high >= tp : low <= tp');
    expect(runner).toContain('return { hitSL, hitTP }');
  });

  it('assumptions metadata documents the intrabar stop-first rule', async () => {
    const { buildBacktestAssumptionsMetadata } = await import('../lib/backtest/assumptions');
    const meta = buildBacktestAssumptionsMetadata({
      strategyId: 'msp_day_trader',
      timeframe: 'daily',
      assetType: 'stock',
      totalTrades: 55,
      bars: 500,
      volumeUnavailable: false,
    });
    expect(meta.fillModel.intrabarPriority).toContain('stop is resolved before target');
    expect(meta.fillModel.intrabarAmbiguity).toBeTruthy();
  });

  it('MSP Day Trader uses 1.0 ATR stop and 3.5 ATR target (3.5:1 ratio)', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    // These constants define the asymmetric risk/reward for the flagship strategy
    expect(runner).toContain('const slATR = 1.0');
    expect(runner).toContain('const tpATR = 3.5');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. SLIPPAGE MODEL (source-code contracts + functional)
// ═══════════════════════════════════════════════════════════════════════════

describe('slippage model — direction and magnitude', () => {
  it('LONG entry slippage is adverse (fills higher than close)', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    // applyEntrySlippage: LONG pays more
    expect(runner).toContain("return side === 'LONG' ? price + slip : price - slip");
  });

  it('LONG exit slippage is adverse (receives less than close)', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    // applyExitSlippage: LONG exits lower
    expect(runner).toContain("return side === 'LONG' ? price - slip : price + slip");
  });

  it('slippage is applied in a post-processing loop after all signal logic', () => {
    const runner = read('lib/backtest/runStrategy.ts');
    // Slippage loop is after the main bar loop — positions are recorded at clean
    // prices and then adjusted, so signal conditions never use slipped prices
    expect(runner).toContain('// ── Apply slippage model to all trades');
    expect(runner).toContain('for (const t of trades)');
    expect(runner).toContain('const slippedEntry = applyEntrySlippage(t.entry, t.side)');
    expect(runner).toContain('const slippedExit = applyExitSlippage(t.exit, t.side)');
  });

  it('functional: LONG entry price after slippage exceeds raw close (adverse fill)', () => {
    const { data, startDate, endDate, rawEntryClose } = makeEmaCrossoverPriceData();
    const result = runStrategy('ema_crossover', data, 10_000, startDate, endDate, 'TESTSYM');
    expect(result.trades.length).toBeGreaterThanOrEqual(1);

    const longTrade = result.trades.find(t => t.side === 'LONG');
    expect(longTrade).toBeDefined();
    // Entry must be ABOVE raw close due to adverse LONG entry slippage
    expect(longTrade!.entry).toBeGreaterThan(rawEntryClose);
    // Exact expected value: rawEntryClose * (1 + slippageBps / 10_000)
    expect(longTrade!.entry).toBeCloseTo(rawEntryClose * (1 + BACKTEST_SLIPPAGE_BPS / 10_000), 4);
  });

  it('functional: LONG exit price after slippage is below raw close (adverse fill)', () => {
    const { data, startDate, endDate, rawEntryClose } = makeEmaCrossoverPriceData();
    const result = runStrategy('ema_crossover', data, 10_000, startDate, endDate, 'TESTSYM');

    const longTrade = result.trades.find(t => t.side === 'LONG');
    expect(longTrade).toBeDefined();
    // After slippage, LONG exit receives less than raw close
    expect(longTrade!.exit).toBeLessThan(rawEntryClose);
    expect(longTrade!.exit).toBeCloseTo(rawEntryClose * (1 - BACKTEST_SLIPPAGE_BPS / 10_000), 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. END-OF-DATA EXIT FUNCTIONAL TEST
// ═══════════════════════════════════════════════════════════════════════════

describe('end-of-data exit — functional', () => {
  it('position not closed by signal before end of data exits with exitReason end_of_data', () => {
    const { data, startDate, endDate } = makeEmaCrossoverPriceData();
    // The step-up price series has no reverse EMA crossover — open position must exit at end_of_data
    const result = runStrategy('ema_crossover', data, 10_000, startDate, endDate, 'TESTSYM');

    const lastTrade = result.trades[result.trades.length - 1];
    expect(lastTrade).toBeDefined();
    expect(lastTrade.exitReason).toBe('end_of_data');
  });

  it('end-of-data exit date matches the last date in the dataset', () => {
    const { data, startDate, endDate } = makeEmaCrossoverPriceData();
    const result = runStrategy('ema_crossover', data, 10_000, startDate, endDate, 'TESTSYM');

    const lastTrade = result.trades[result.trades.length - 1];
    const lastResultDate = result.dates[result.dates.length - 1];
    expect(lastTrade.exitDate).toBe(lastResultDate);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. AUDIT ROADMAP UPDATED
// ═══════════════════════════════════════════════════════════════════════════

describe('audit roadmap — strategy signal formation pass', () => {
  it('audit doc records strategy signal formation and intrabar tests as complete', () => {
    const audit = read('docs/market-scanner-pros-elite-audit.md');
    expect(audit).toContain('strategy-level tests');
    expect(audit).toContain('intrabar');
  });
});
