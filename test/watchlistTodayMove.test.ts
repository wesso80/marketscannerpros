import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { filterByMove, formatTodayMove, sortByMove, summarizeMoves, todayMove } from '@/lib/watchlist/todayMove';

const row = (symbol: string, change: number | null | undefined) => ({ item: { symbol }, ...todayMove(change) });

describe('watchlist today-move rows', () => {
  const rows = [row('AAA', 1.2), row('BBB', -3), row('CCC', null), row('DDD', 0), row('EEE', undefined), row('FFF', 0.2)];

  it('default filter shows every symbol, including unpriced ones and down days', () => {
    expect(filterByMove(rows, 'all').map((r) => r.item.symbol)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF']);
  });

  it('labels the move honestly and marks missing prices as No price (not 0%)', () => {
    expect(formatTodayMove(todayMove(1.234))).toBe('+1.23%');
    expect(formatTodayMove(todayMove(-0.4))).toBe('-0.40%');
    expect(formatTodayMove(todayMove(0))).toBe('0.00%');
    expect(formatTodayMove(todayMove(null))).toBe('No price');
    expect(formatTodayMove(todayMove(Number.NaN))).toBe('No price');
    expect(todayMove(undefined).direction).toBe('unpriced');
    expect(todayMove(0.001).direction).toBe('flat');
  });

  it('filters by direction only when asked', () => {
    expect(filterByMove(rows, 'up').map((r) => r.item.symbol)).toEqual(['AAA', 'FFF']);
    expect(filterByMove(rows, 'down').map((r) => r.item.symbol)).toEqual(['BBB']);
    expect(filterByMove(rows, 'flat').map((r) => r.item.symbol)).toEqual(['DDD']);
    expect(filterByMove(rows, 'unpriced').map((r) => r.item.symbol)).toEqual(['CCC', 'EEE']);
  });

  it('treats up and down moves the same: sorting ranks by size of move, unpriced last', () => {
    expect(sortByMove(rows, 'move').map((r) => r.item.symbol)).toEqual(['BBB', 'AAA', 'FFF', 'DDD', 'CCC', 'EEE']);
    const mirrored = [row('UP', 2), row('DOWN', -2)];
    const a = sortByMove(mirrored, 'move').map((r) => Math.abs(r.changePercent as number));
    expect(a).toEqual([2, 2]);
    // Mirror every row: the order of magnitudes is unchanged.
    const flipped = rows.map((r) => row(r.item.symbol, r.changePercent == null ? r.changePercent : -r.changePercent));
    expect(sortByMove(flipped, 'move').map((r) => r.item.symbol)).toEqual(sortByMove(rows, 'move').map((r) => r.item.symbol));
  });

  it('keeps saved order by default and sorts A-Z on request', () => {
    expect(sortByMove(rows, 'saved').map((r) => r.item.symbol)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF']);
    expect(sortByMove([row('ZZ', 1), row('AA', 1)], 'symbol').map((r) => r.item.symbol)).toEqual(['AA', 'ZZ']);
  });

  it('summarises counts; the average uses priced symbols only', () => {
    const s = summarizeMoves(rows);
    expect(s).toMatchObject({ total: 6, priced: 4, up: 2, down: 1, flat: 1, unpriced: 2 });
    expect(s.avgChangePercent).toBeCloseTo((1.2 - 3 + 0 + 0.2) / 4, 10);
    expect(summarizeMoves([row('X', null)]).avgChangePercent).toBeNull();
  });
});

describe('WatchlistWidget no longer invents scores or hides symbols by default', () => {
  const src = readFileSync(resolve(__dirname, '../components/WatchlistWidget.tsx'), 'utf8');

  it('has no confidence / stage / alignment scoring or filters', () => {
    expect(src).not.toMatch(/confidenceFilter|alignmentFilter|stageFilter|readyOnly|edgeTemperature/);
    expect(src).not.toMatch(/55 \+ \(changePercent \* 8\)/);
    expect(src).not.toMatch(/Confluence: <span|Timeframe Alignment|Multi-TF Aligned|Hot Signals|Avg Confidence/);
  });

  it('defaults to showing everything and Reset clears the filter and sort', () => {
    expect(src).toContain("useState<MoveFilter>('all')");
    expect(src).toContain("useState<MoveSort>('saved')");
    expect(src).toMatch(/const resetFilters = \(\) => \{\s*setMoveFilter\('all'\);\s*setSortMode\('saved'\);/);
    expect(src).toContain('onClick={resetFilters}');
  });

  it('shows an add prompt for an empty list instead of "No symbols match"', () => {
    expect(src).toContain('This watchlist is empty');
  });
});
