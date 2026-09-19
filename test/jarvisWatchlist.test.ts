/**
 * Watchlist lifecycle bookkeeping: entries re-evaluated in a session must be marked seen so
 * (a) same-session re-runs are idempotent and (b) expiry counts only genuinely unseen sessions.
 */
import { describe, expect, it } from 'vitest';
import { updateWatchlist } from '@/lib/jarvis/radar/watchlist';
import type { WatchEntry } from '@/lib/jarvis/radar/store';
import type { Features } from '@/lib/jarvis/radar/types';

const feat = (symbol: string, price: number, over: Partial<Record<string, unknown>> = {}): Features =>
  ({ symbol, assetClass: 'equity', price, ret1: 1, ret5: 2, volRatio: 2, rsBench5: 1, rsBenchDelta: 0, adx: 20, rsi: 55, distToHi20Pct: 1, extensionAtr: 1, flags: [], now: { bbWidthPctile: 10, ema20: price - 5, ema50: price - 10, hi20: price + 1 }, ...over } as unknown as Features);

const entry = (symbol: string, status: WatchEntry['status'], trigger: number, inval: number): WatchEntry =>
  ({ key: `equity:${symbol}`, symbol, assetClass: 'equity', status, firstSeen: '2026-09-17', lastSeen: '2026-09-17', sessionsSeen: 1, origin: 'premove', state: { history: [{ date: '2026-09-17', status, note: '' }], metrics: {}, triggerLevel: trigger, invalidationLevel: inval, note: '' } });

describe('watchlist lifecycle bookkeeping', () => {
  it('marks re-evaluated entries as seen this session and records genuine transitions', () => {
    const all = new Map<string, Features>([['equity:ACA', feat('ACA', 150)], ['equity:GM', feat('GM', 80, { ret1: -5 })], ['equity:QUIET', feat('QUIET', 100, { volRatio: 0.9 })]]);
    const res = updateWatchlist({ existing: [entry('ACA', 'NEAR_TRIGGER', 145.77, 143), entry('GM', 'NEAR_TRIGGER', 88, 84.5), entry('QUIET', 'NEW', 105, 90), entry('GONE', 'NEW', 1, 0.5)], sessionDate: '2026-09-18', shortlist: [], premove: new Map(), deteriorating: [], all });
    const by = new Map(res.entries.map((e) => [e.symbol, e]));
    expect(by.get('ACA')).toMatchObject({ status: 'CONFIRMED_MOVE', lastSeen: '2026-09-18', sessionsSeen: 2 });
    expect(by.get('GM')).toMatchObject({ status: 'FAILED', lastSeen: '2026-09-18', sessionsSeen: 2 });
    expect(by.get('QUIET')).toMatchObject({ status: 'NEW', lastSeen: '2026-09-18', sessionsSeen: 2 });
    expect(by.get('GONE')).toMatchObject({ status: 'NEW', lastSeen: '2026-09-17', sessionsSeen: 1 }); // not in universe → genuinely unseen
    expect(res.changes.map((c) => `${c.symbol}:${c.from}>${c.to}`)).toEqual(['ACA:NEAR_TRIGGER>CONFIRMED_MOVE', 'GM:NEAR_TRIGGER>FAILED']);
  });
  it('is idempotent when the same session is processed twice', () => {
    const all = new Map<string, Features>([['equity:ACA', feat('ACA', 150, { now: { bbWidthPctile: 10, ema20: 155, ema50: 140, hi20: 151 } })]]);
    const first = updateWatchlist({ existing: [entry('ACA', 'NEAR_TRIGGER', 145.77, 143)], sessionDate: '2026-09-18', shortlist: [], premove: new Map(), deteriorating: [], all });
    expect(first.entries[0].status).toBe('CONFIRMED_MOVE');
    // price (150) is below EMA20 (155): a second pass must NOT flip CONFIRMED_MOVE → FAILED on the same session's data
    const second = updateWatchlist({ existing: first.entries, sessionDate: '2026-09-18', shortlist: [], premove: new Map(), deteriorating: [], all });
    expect(second.changes).toEqual([]);
    expect(second.entries[0]).toMatchObject({ status: 'CONFIRMED_MOVE', sessionsSeen: 2, lastSeen: '2026-09-18' });
    expect(second.entries[0].state.history).toHaveLength(2);
  });
  it('expires only after genuinely unseen sessions', () => {
    const e = entry('OLD', 'CONFIRMED_MOVE', 1, 0.5); e.lastSeen = '2026-09-15';
    const res = updateWatchlist({ existing: [e], sessionDate: '2026-09-18', shortlist: [], premove: new Map(), deteriorating: [], all: new Map() });
    expect(res.entries[0].status).toBe('EXPIRED');
  });
});
