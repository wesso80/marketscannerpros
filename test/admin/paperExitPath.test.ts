import { describe, expect, it } from 'vitest';
import { evaluatePaperExitPath, savePaperExitPath, type PaperExitPath } from '@/lib/admin/portfolio-lab/paperExitPath';
import type { ArcaPosition } from '@/lib/admin/portfolio-lab/types';
import type { Bar } from '@/types/operator';

const t = Date.parse('2026-09-28T00:00:00Z'), step = 900000;
const position = { symbol: 'BTC', assetClass: 'crypto', side: 'LONG', averageEntry: 100,
  stopLoss: 95, initialStopLoss: 95, takeProfit1: 110, openedAt: new Date(t).toISOString() } as ArcaPosition;
const candle = (i = 0, patch = {}) => ({ openAt: t + i * step, closeAt: t + (i + 1) * step,
  open: 100, high: 105, low: 98, close: 101, ...patch });
const path = (...candles: ReturnType<typeof candle>[]): PaperExitPath => ({
  symbol: 'BTC', market: 'CRYPTO', timeframe: '15m', source: 'admin_scan_bars', candles,
});
const run = (p: PaperExitPath, pos = position) => evaluatePaperExitPath(pos, p, t + 4 * step);

describe('fixed-level candle exit evidence', () => {
  it('finds a target touch even after price reverses', () => {
    expect(run(path(candle(0, { high: 112 }), candle(1, { close: 99 })))).toMatchObject({
      exit: { reason: 'TAKE_PROFIT', price: 110, at: new Date(t + step).toISOString(), ambiguous: false },
    });
  });
  it('uses stop first for unresolved same-candle ordering', () => {
    expect(run(path(candle(0, { high: 112, low: 90 })))).toMatchObject({
      exit: { reason: 'STOP_LOSS', price: 95, ambiguous: true },
    });
  });
  it('charges a gap at the adverse open', () => {
    expect(run(path(candle(0, { open: 90, low: 88 })))).toMatchObject({ exit: { price: 90 } });
  });
  it('handles short-side touches', () => {
    expect(run(path(candle(0, { low: 88 })), { ...position, side: 'SHORT',
      initialStopLoss: 105, stopLoss: 105, takeProfit1: 90 })).toMatchObject({
      exit: { reason: 'STOP_LOSS', price: 105, ambiguous: true },
    });
  });
  it('processes chronologically rather than choosing the latest candle', () => {
    expect(run(path(candle(1, { high: 120 }), candle(0, { low: 94 })))).toMatchObject({ exit: { reason: 'STOP_LOSS' } });
  });
  it('excludes pre-entry extremes and discloses partial entry coverage', () => {
    const result = run(path(candle(0, { low: 80 }), candle(1, { high: 112 })),
      { ...position, openedAt: new Date(t + 1000).toISOString() });
    expect(result).toMatchObject({ entryCandleExcluded: true, exit: { reason: 'TAKE_PROFIT' } });
  });
  it.each([
    path(candle(1, { high: 112 })),
    path(candle(), candle(2, { high: 112 })),
    path(candle(0, { low: -1 })),
    path(candle(), candle()),
    path(candle(0, { high: 112 }), candle(0, { low: 90 })),
  ])('does not invent a path through missing or invalid candles', p => {
    expect(run(p).exit).toBeUndefined();
  });
  it('does not apply a moved stop retrospectively', () => {
    expect(run(path(candle(0, { low: 94 })), { ...position, stopLoss: 99 }).status).toContain('changed');
  });
  it('does not use another instrument or forming bar', () => {
    expect(run({ ...path(candle()), symbol: 'ETH' }).exit).toBeUndefined();
    expect(run(path(candle(4, { high: 112 }))).exit).toBeUndefined();
  });
  it('saves only completed crypto 15m scanner bars', () => {
    const b = { symbol: 'BTC', market: 'CRYPTO', timeframe: '15m',
      timestamp: new Date(t).toISOString(), open: 100, high: 105, low: 98, close: 101 } as Bar;
    expect(savePaperExitPath([b], 'BTC', 'CRYPTO', '15m', t + step - 1)?.candles).toHaveLength(0);
    expect(savePaperExitPath([b], 'BTC', 'CRYPTO', '15m', t + step)?.candles[0].closeAt).toBe(t + step);
    expect(savePaperExitPath([b], 'BTC', 'CRYPTO', '1h', t + step)).toBeUndefined();
  });
});

describe('durable candle checkpoints', () => {
  it('resumes a multi-day trade after the entry candles leave the saved window', () => {
    const checkpoint = { version: 1 as const, through: new Date(t + 100 * step).toISOString(),
      entryAt: position.openedAt, side: position.side, stop: 95, target: 110 };
    const result = evaluatePaperExitPath({ ...position, exitCheckpoint: checkpoint },
      path(candle(100, { high: 112 })), t + 102 * step);
    expect(result.exit).toMatchObject({ reason: 'TAKE_PROFIT', price: 110 });
  });
  it('advances only through fully checked candles and does not recheck old touches', () => {
    const first = run(path(candle()));
    expect(first.checkpoint?.through).toBe(new Date(t + step).toISOString());
    const result = run(path(candle(0, { low: 90 }), candle(1)), { ...position, exitCheckpoint: first.checkpoint });
    expect(result.exit).toBeUndefined();
    expect(result.checkpoint?.through).toBe(new Date(t + 2 * step).toISOString());
  });
  it('does not advance or manufacture a target across a checkpoint gap', () => {
    const checkpoint = run(path(candle())).checkpoint;
    const result = run(path(candle(2, { high: 112 })), { ...position, exitCheckpoint: checkpoint });
    expect(result.exit).toBeUndefined();
    expect(result.checkpoint).toBeUndefined();
  });
  it.each([
    { target: 111 }, { stop: 94 }, { side: 'SHORT' }, { version: 2 },
    { through: 'bad' }, { through: new Date(t + 9 * step).toISOString() },
    { through: new Date(t + step + 1).toISOString() }, { entryAt: 'bad' },
  ])('rejects a checkpoint that no longer matches the trade: %s', patch => {
    const checkpoint = { ...run(path(candle())).checkpoint!, ...patch };
    const result = run(path(candle(1)), { ...position, exitCheckpoint: checkpoint as never });
    expect(result.status).toBe('candle_checkpoint_invalid_or_rules_changed');
    expect(result.checkpoint).toBeUndefined();
  });
  it('does not write another checkpoint when no new candle has closed', () => {
    const checkpoint = run(path(candle())).checkpoint;
    expect(run(path(candle()), { ...position, exitCheckpoint: checkpoint }).checkpoint).toBeUndefined();
  });
});

describe('crypto exchange partial entry candle',()=>{
 const p={...position,openedAt:new Date(t+60000).toISOString()};
 it('does not credit the partial entry high as a target',()=>{
  expect(run({...path(candle(0,{high:120})),source:'crypto_exchange'},p).exit).toBeUndefined();
 });
 it('charges a possible partial entry stop conservatively with an ambiguity flag',()=>{
  expect(run({...path(candle(0,{open:90,low:88,high:120})),source:'crypto_exchange'},p).exit).toMatchObject({reason:'STOP_LOSS',price:95,ambiguous:true});
 });
 it('requires the partial entry bar before allowing a later target',()=>{
  expect(run({...path(candle(1,{high:120})),source:'crypto_exchange'},p).status).toBe('candle_path_entry_prefix_unresolved');
 });
 it('continues to a target on the next complete candle',()=>{
  expect(run({...path(candle(),candle(1,{high:120})),source:'crypto_exchange'},p).exit).toMatchObject({reason:'TAKE_PROFIT',price:110});
 });
});
