import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { omitForexPicks } from '@/lib/scanner/omitForexPicks';

describe('omitForexPicks', () => {
  it('drops stored forex rows and leaves equities and crypto', () => {
    const rows = [
      { asset_class: 'forex', symbol: 'EURUSD', score: 10 },
      { asset_class: 'crypto', symbol: 'BTC', score: 65 },
      { asset_class: 'equity', symbol: 'AAPL', score: 40 },
      { asset_class: 'FOREX', symbol: 'AUDUSD', score: 8 },
      { asset_class: ' commodity ', symbol: 'GOLD', score: 1 },
    ];
    expect(omitForexPicks(rows).map((row) => row.symbol)).toEqual(['BTC', 'AAPL', 'GOLD']);
  });

  it('daily-picks applies the filter to the response and does not delete stored rows', () => {
    const src = readFileSync('app/api/scanner/daily-picks/route.ts', 'utf8');
    expect(src).toContain('omitForexPicks(picks)');
    expect(src).not.toMatch(/DELETE\s+FROM\s+daily_picks/i);
    expect(src).toContain('FROM daily_picks_history');
  });
});
