import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';
import { scannerDataQualityMetadata } from '@/lib/scanner/compliance';
import { reconcileFeedStatusWithRows } from '@/lib/scanner/feedStatusFromRows';

type Row = { trust: string; bar?: string };
const label = (r: Row) => r.trust;
const bar = (r: Row) => r.bar;
const rows = (...t: string[]) => t.map((trust) => ({ trust, bar: '2026-09-25' }));
const SAMPLE = 'Ranked sample: 25 of 312 universe symbols attempted; use Pro for a larger universe.';

describe('SC-13: Ranked tab data panels agree with the row Trust labels', () => {
  it('a sample-size note alone does not make the feed DEGRADED (server side)', () => {
    const status = buildMarketDataProviderStatus({ source: 'coingecko', stale: false, degraded: false, warnings: [], notes: [SAMPLE] });
    expect(status.degraded).toBe(false);
    expect(status.live).toBe(true);
    expect(status.notes).toEqual([SAMPLE]);
    const dq = scannerDataQualityMetadata({ source: 'coingecko', coverageScore: 100, warnings: [], notes: [SAMPLE], providerStatus: status });
    expect(dq.warnings).toEqual([]);
    expect(dq.notes).toEqual([SAMPLE]);
  });

  it('all rows GOOD + sample note → panel LIVE (not DEGRADED); the sample and last bar are shown as notes', () => {
    const server = buildMarketDataProviderStatus({ source: 'coingecko', warnings: [], notes: [SAMPLE] });
    const out = reconcileFeedStatusWithRows(server, rows('GOOD', 'GOOD', 'GOOD'), label, bar)!;
    expect(out.degraded).toBe(false);
    expect(out.stale).toBe(false);
    expect(out.live).toBe(true);
    expect(out.warnings).toEqual([]);
    expect(out.notes).toEqual(['last completed bar 2026-09-25', SAMPLE]);
  });

  it('still reconciles a response from the old server (sample text in warnings, degraded=true) to LIVE when rows are GOOD', () => {
    const old = { live: true, stale: false, degraded: true, alertLevel: 'info' as const, warnings: [SAMPLE] };
    const out = reconcileFeedStatusWithRows(old, rows('GOOD', 'GOOD'), label, bar)!;
    expect(out.degraded).toBe(false);
    expect(out.alertLevel).toBe('none');
    expect(out.notes).toContain(SAMPLE);
  });

  it('degraded rows → panel DEGRADED with a reason that matches the Degraded Data count', () => {
    const out = reconcileFeedStatusWithRows(buildMarketDataProviderStatus({ source: 'x', notes: [SAMPLE] }), rows('GOOD', 'DEGRADED', 'DEGRADED'), label, bar)!;
    expect(out.degraded).toBe(true);
    expect(out.stale).toBe(false);
    expect(out.warnings[0]).toBe('2 of 3 rows degraded (see the row Trust column for the reason)');
  });

  it('stale rows → panel STALE with a reason', () => {
    const out = reconcileFeedStatusWithRows(buildMarketDataProviderStatus({ source: 'x' }), rows('GOOD', 'STALE'), label, bar)!;
    expect(out.stale).toBe(true);
    expect(out.live).toBe(false);
    expect(out.warnings[0]).toMatch(/1 of 2 rows stale or insufficient/);
  });

  it('feed-level problems the rows cannot show keep the panel DEGRADED with the server reason', () => {
    const server = buildMarketDataProviderStatus({ source: 'x', warnings: ['23/25 symbols evaluated; 2 unavailable.'], notes: [SAMPLE] });
    const out = reconcileFeedStatusWithRows(server, rows('GOOD', 'GOOD'), label, bar)!;
    expect(out.degraded).toBe(true);
    expect(out.warnings).toEqual(['23/25 symbols evaluated; 2 unavailable.']);
  });

  it('DEGRADED/STALE always carries a reason, even when the provider gives none', () => {
    expect(buildMarketDataProviderStatus({ source: 'x', degraded: true }).warnings).toEqual(['Provider reported a problem without details']);
    expect(buildMarketDataProviderStatus({ source: 'x', stale: true }).warnings).toEqual(['Data is stale']);
    const bare = { live: false, stale: true, degraded: true, alertLevel: 'warning' as const, warnings: [] };
    const out = reconcileFeedStatusWithRows(bare, [] as Row[], label)!;
    expect(out.degraded).toBe(true);
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it('the scanner route files the sample size as a note and the page/strip use the reconciled reasons', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/scanner/run/route.ts'), 'utf8');
    expect(route).toMatch(/providerNotes\.push\(`Ranked sample/);
    expect(route).not.toMatch(/providerWarnings\.push\(`Ranked sample/);
    const page = readFileSync(join(process.cwd(), 'app/tools/scanner/page.tsx'), 'utf8');
    expect(page).toContain('reconcileFeedStatusWithRows(');
    const strip = readFileSync(join(process.cwd(), 'components/market/MarketStatusStrip.tsx'), 'utf8');
    expect(strip).toContain("'Why: '");
    expect(strip).toContain('Reason not reported by the data feed');
  });
});
