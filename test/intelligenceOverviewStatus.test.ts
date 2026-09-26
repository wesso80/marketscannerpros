import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fragilityStatusLabel, globalM2StatusLabel, liquidityStatusLabel, tileStatus } from '@/lib/intelligence/overviewStatus';

describe('Intelligence overview tiles use the pages\' status rules (RS-10)', () => {
  it('Global M2: LIVE when the headline is eligible (every included bloc, 100% weighted coverage), PARTIAL only when diagnostic', () => {
    expect(globalM2StatusLabel({ enabled: true, interpretationEligible: true })).toBe('LIVE');
    expect(globalM2StatusLabel({ enabled: true, interpretationEligible: false })).toBe('LIVE · PARTIAL');
    expect(globalM2StatusLabel({ enabled: false, interpretationEligible: false })).toBe('NOT ENABLED');
    expect(globalM2StatusLabel(null)).toBe('UNAVAILABLE');
  });

  it('Fragility: PARTIAL source reads LIVE · PARTIAL (the page\'s badge), not a hard-coded LIVE', () => {
    expect(fragilityStatusLabel({ sourceStatus: 'PARTIAL', isStale: false })).toBe('LIVE · PARTIAL');
    expect(fragilityStatusLabel({ sourceStatus: 'OK', isStale: false })).toBe('LIVE');
    expect(fragilityStatusLabel({ sourceStatus: 'OK', isStale: true })).toBe('STALE');
    expect(fragilityStatusLabel({ sourceStatus: 'DATA_UNAVAILABLE', isStale: false })).toBe('DATA UNAVAILABLE');
    expect(fragilityStatusLabel(undefined)).toBe('MOCK');
  });

  it('Liquidity: the page\'s own status chip', () => {
    expect(liquidityStatusLabel({ statusLabel: 'LIVE · PARTIAL UPSTREAM' })).toBe('LIVE · PARTIAL UPSTREAM');
    expect(liquidityStatusLabel(null)).toBe('UNAVAILABLE');
  });

  it('loading and failed endpoints never claim LIVE', () => {
    expect(tileStatus({ loading: true, error: null }, () => 'LIVE')).toBe('CHECKING');
    expect(tileStatus({ loading: false, error: 'Request failed (500)' }, () => 'LIVE')).toBe('UNAVAILABLE');
    expect(tileStatus({ loading: false, error: null }, () => 'LIVE')).toBe('LIVE');
  });

  it('the overview and the Fragility page share the helpers; no live tile hard-codes a status', () => {
    const overview = readFileSync('app/intelligence/page.tsx', 'utf8');
    const liveBlock = overview.slice(overview.indexOf('const LIVE_NOW'), overview.indexOf('const COMING_SOON'));
    expect(liveBlock).not.toMatch(/status: 'LIVE/);
    expect(overview).toContain('globalM2StatusLabel(');
    expect(overview).toContain('fragilityStatusLabel(');
    expect(overview).toContain('liquidityStatusLabel(');
    expect(overview).toMatch(/<LastUpdatedBadge timestamp=\{lastUpdated\} \/>/);
    expect(readFileSync('app/intelligence/fragility/page.tsx', 'utf8')).toContain('fragilityStatusLabel(meta)');
  });
});
