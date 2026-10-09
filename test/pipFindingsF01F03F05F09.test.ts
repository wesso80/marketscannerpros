import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectCryptoDeskTiles } from '@/lib/terminal/cryptoDeskTiles';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe("Pip audit follow-ups (display only)", () => {
  it('F01: a completed scan with a zero-match filter shows "No matches", never the Example card', () => {
    const page = read('app/tools/scanner/page.tsx');
    const noMatch = page.indexOf('rankedRows.length===0 && allResults.length>0');
    const example = page.indexOf('data-scanner-example');
    expect(noMatch).toBeGreaterThan(-1);
    expect(noMatch).toBeLessThan(example); // checked before the example branch
    expect(page).toContain('data-scanner-no-matches');
  });

  it('F09: the scanner source line carries the completed scan time for the active mode', () => {
    const page = read('app/tools/scanner/page.tsx');
    expect(page).toContain("asOf={mode === 'queue' ? rankedScanAsOf : proScanResults?.dataQuality?.computedAt ?? null}");
  });

  it('F09: every Terminal crypto tile carries the source and time from its own feed', () => {
    const now = Date.parse('2026-10-07T03:30:00Z');
    const r = selectCryptoDeskTiles('BTC', {
      funding: { exchange: 'OKX USDT-margined perpetual swaps', meta: { freshnessStatus: 'fresh', sourceAttribution: 'OKX public API', lastUpdated: '2026-10-07T03:20:00Z' }, stale: false, coins: [{ symbol: 'BTC', fundingRatePercent: 0.0038 }] },
      longShort: { exchange: 'OKX (all contracts per coin)', coins: [{ symbol: 'BTC', longAccount: 54.1, shortAccount: 45.9, timestamp: Date.parse('2026-10-07T03:15:00Z') }] },
      openInterest: { coins: [{ symbol: 'BTC', openInterestFormatted: '$4.57B', sourceLabel: 'CoinGecko derivatives', observedAt: '2026-10-07T03:25:00Z' }] },
    }, now);
    expect(r.mode).toBe('tiles');
    if (r.mode !== 'tiles') return;
    expect(r.tiles.map((t) => [t.label, t.source, Boolean(t.asOf)])).toEqual([
      ['Funding', 'OKX USDT-margined perpetual swaps', true],
      ['Open interest', 'CoinGecko derivatives', true],
      ['Long/short', 'OKX (all contracts per coin)', true],
    ]);
    // A feed without a time never gets an invented one.
    const bare = selectCryptoDeskTiles('BTC', { funding: { meta: { freshnessStatus: 'fresh' }, coins: [{ symbol: 'BTC', fundingRatePercent: 0.01 }] }, longShort: null, openInterest: null }, now);
    if (bare.mode === 'tiles') expect(bare.tiles[0].asOf).toBeUndefined();
  });

  it('F03: Flow labels do not claim hedging or institutional intent that the disclaimer rules out', () => {
    const view = read('components/options-terminal/OptionsFlowView.tsx');
    expect(view).not.toContain('(heavy hedging)');
    expect(view).not.toContain('>Institutional Flow<');
    expect(view).toContain('Large-trade lean');
  });

  it('F05: the Deep Analysis 52-week tile was retired with that page (W3); the AI summary has no 52-week tile or field', () => {
    expect(existsSync('app/tools/deep-analysis/page.tsx')).toBe(false);
    expect(read('components/research/SymbolAiSummary.tsx')).not.toMatch(/week52|52-week/i);
    expect(read('lib/research/symbolSummary.ts')).not.toMatch(/week52|52-week/i);
  });
});
