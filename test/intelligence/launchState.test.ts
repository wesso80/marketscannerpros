// Launch plan §16 — tests proving the intelligence launch state:
//   • Global M2 / Fragility / Liquidity remain LIVE.
//   • Lead/Lag / Pressure / Auction / Master are UNDER CONSTRUCTION public pages.
//   • Unfinished APIs never return live-looking mock values.
//   • Intelligence overview shows exactly 3 live modules + 4 under-construction.
//   • Nav links remain valid (no dead links).
//   • No mock numeric output leaks publicly.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}
function exists(rel: string): boolean {
  return existsSync(join(ROOT, rel));
}

/* ── §1/§2 — Live vs Under Construction page split ─────────────────────────── */

describe('intelligence launch: live public pages', () => {
  it.each([
    ['app/intelligence/global-m2/page.tsx'],
    ['app/intelligence/fragility/page.tsx'],
    ['app/intelligence/liquidity/page.tsx'],
  ])('%s exists and consumes native data (does not import IntelligenceUnderConstruction)', (rel) => {
    expect(exists(rel)).toBe(true);
    const src = read(rel);
    expect(src.includes('IntelligenceUnderConstruction')).toBe(false);
    // Live pages must use a real data source (useEndpoint over an /api/... route).
    expect(src.includes('/api/intelligence/')).toBe(true);
  });
});

describe('intelligence launch: under-construction public pages', () => {
  it.each([
    ['app/intelligence/lead-lag/page.tsx',     'Cross-Asset Lead/Lag'],
    ['app/intelligence/nq-pressure/page.tsx',  'NQ Institutional Pressure'],
    ['app/intelligence/auction/page.tsx',      'NQ Auction'],
    ['app/intelligence/master/page.tsx',       'Master Command Centre'],
  ])('%s renders IntelligenceUnderConstruction with module name %s', (rel, moduleName) => {
    const src = read(rel);
    expect(src.includes('IntelligenceUnderConstruction')).toBe(true);
    expect(src.includes(moduleName)).toBe(true);
    // Must NOT read from /api/intelligence/<engine>.
    expect(src.includes('useEndpoint')).toBe(false);
    // Must NOT import mock data.
    expect(src.includes('mockData')).toBe(false);
    // Must NOT import the engine-specific types from types.ts (would signal
    // a live-shaped page).
    expect(src.match(/LeadLagResult|PressureResult|AuctionResult|MasterResult/)).toBeNull();
  });
});

/* ── §10 — API safety: no mock returns from under-construction routes ─────── */

describe('intelligence launch: API safety — under-construction routes', () => {
  it.each([
    ['app/api/intelligence/lead-lag/route.ts',    'lead-lag'],
    ['app/api/intelligence/nq-pressure/route.ts', 'nq-pressure'],
    ['app/api/intelligence/auction/route.ts',     'auction'],
    ['app/api/intelligence/master/route.ts',      'master'],
  ])('%s returns UNDER_CONSTRUCTION with 503 (no mock)', (rel, moduleKey) => {
    const src = read(rel);
    expect(src.includes("'UNDER_CONSTRUCTION'")).toBe(true);
    expect(src.includes('available: false')).toBe(true);
    expect(src.includes('status: 503')).toBe(true);
    expect(src.includes(moduleKey)).toBe(true);
    // Must NOT import mockData or call any get*Result() function.
    expect(src.includes('mockData')).toBe(false);
    expect(src.match(/getLeadLagResult|getPressureResult|getAuctionResult|getMasterResult/)).toBeNull();
  });

  it.each([
    ['app/api/intelligence/global-m2/route.ts'],
    ['app/api/intelligence/fragility/route.ts'],
    ['app/api/intelligence/liquidity/route.ts'],
  ])('%s is a live route (no UNDER_CONSTRUCTION marker)', (rel) => {
    const src = read(rel);
    expect(src.includes("'UNDER_CONSTRUCTION'")).toBe(false);
  });
});

/* ── §4 — Intelligence overview shows exactly 3 live + 4 under-construction ── */

describe('intelligence overview page', () => {
  const src = read('app/intelligence/page.tsx');

  it('lists exactly the 3 approved LIVE_NOW modules', () => {
    expect(src.includes('const LIVE_NOW')).toBe(true);
    // Must reference all 3 live hrefs and NONE of the under-construction hrefs
    // in the LIVE_NOW section.
    const liveBlock = src.slice(src.indexOf('const LIVE_NOW'), src.indexOf('const COMING_SOON'));
    expect(liveBlock).toContain('/intelligence/global-m2');
    expect(liveBlock).toContain('/intelligence/fragility');
    expect(liveBlock).toContain('/intelligence/liquidity');
    expect(liveBlock).not.toContain('/intelligence/lead-lag');
    expect(liveBlock).not.toContain('/intelligence/nq-pressure');
    expect(liveBlock).not.toContain('/intelligence/auction');
    expect(liveBlock).not.toContain('/intelligence/master');
  });

  it('lists the 4 UNDER-CONSTRUCTION modules in COMING_SOON', () => {
    const comingBlock = src.slice(src.indexOf('const COMING_SOON'));
    expect(comingBlock).toContain('/intelligence/lead-lag');
    expect(comingBlock).toContain('/intelligence/nq-pressure');
    expect(comingBlock).toContain('/intelligence/auction');
    expect(comingBlock).toContain('/intelligence/master');
    // 4 UNDER CONSTRUCTION status labels.
    const matches = comingBlock.match(/UNDER CONSTRUCTION/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('never claims FULL_PARITY on any module', () => {
    expect(src.includes('FULL_PARITY')).toBe(false);
  });
});

/* ── §5 — Navigation retains valid links + attaches UNDER CONSTRUCTION badges ── */

describe('IntelligenceNav', () => {
  const src = read('components/intelligence/IntelligenceNav.tsx');

  it('keeps a link for every module (no dead links)', () => {
    for (const href of [
      '/intelligence',
      '/intelligence/global-m2',
      '/intelligence/fragility',
      '/intelligence/liquidity',
      '/intelligence/lead-lag',
      '/intelligence/nq-pressure',
      '/intelligence/auction',
      '/intelligence/master',
      '/intelligence/history',
    ]) {
      expect(src).toContain(`href: '${href}'`);
    }
  });

  it('marks Lead/Lag / NQ Pressure / Auction / Master as underConstruction', () => {
    const tabs = src.slice(src.indexOf('const TABS'), src.indexOf('export default'));
    for (const label of ['Lead/Lag', 'NQ Pressure', 'Auction', 'Master']) {
      const idx = tabs.indexOf(`label: '${label}'`);
      expect(idx).toBeGreaterThan(-1);
      // The underConstruction flag must be present on that same tab entry.
      const rowStart = tabs.lastIndexOf('{', idx);
      const rowEnd = tabs.indexOf('}', idx);
      const row = tabs.slice(rowStart, rowEnd);
      expect(row).toContain('underConstruction: true');
    }
  });
});

/* ── §10/§11 — /api/intelligence/status returns launch shape (not mock scores) ── */

describe('intelligence status route', () => {
  const src = read('app/api/intelligence/status/route.ts');

  it('is not backed by mockData', () => {
    expect(src.includes('mockData')).toBe(false);
    expect(src.includes('getEngineStatus')).toBe(false);
  });

  it('classifies each module with LIVE / LIVE_PARTIAL / UNDER_CONSTRUCTION', () => {
    expect(src).toContain('LIVE_PARTIAL');
    expect(src).toContain('UNDER_CONSTRUCTION');
    // Exactly 3 modules have available:true; 4 have available:false.
    const trueMatches = src.match(/available: true/g) ?? [];
    const falseMatches = src.match(/available: false/g) ?? [];
    expect(trueMatches.length).toBe(3);
    expect(falseMatches.length).toBe(4);
  });
});

/* ── §9 — Under-construction pages do not leak mock scores publicly ───────── */

describe('mock leakage audit — public intelligence pages', () => {
  it.each([
    ['app/intelligence/lead-lag/page.tsx'],
    ['app/intelligence/nq-pressure/page.tsx'],
    ['app/intelligence/auction/page.tsx'],
    ['app/intelligence/master/page.tsx'],
  ])('%s does not display a numeric mock score or CommandStrip', (rel) => {
    const src = read(rel);
    // Presence of these components implies live-looking output.
    expect(src.includes('CommandStrip')).toBe(false);
    expect(src.includes('IntelligenceTable')).toBe(false);
    expect(src.includes('ScoreCell')).toBe(false);
  });
});

/* ── §5/§16 — no dead links after launch: files exist for every nav href ──── */

describe('nav integrity — every under-construction href resolves to a page', () => {
  it.each([
    ['app/intelligence/lead-lag/page.tsx'],
    ['app/intelligence/nq-pressure/page.tsx'],
    ['app/intelligence/auction/page.tsx'],
    ['app/intelligence/master/page.tsx'],
  ])('%s exists (no dead link)', (rel) => {
    expect(exists(rel)).toBe(true);
  });
});
