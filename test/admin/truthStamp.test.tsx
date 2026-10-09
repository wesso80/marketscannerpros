/**
 * Admin data-integrity (fix 2): stored admin data reports how old it is, not when it was read, and the market-data
 * admin pages show source, data time, freshness, simulated status and missing fields.
 */
// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { storedTruth } from '@/lib/admin/truthLayer';
import TruthStampLine from '@/components/admin/shared/TruthStampLine';

const NOW = Date.parse('2026-10-09T12:00:00Z');

describe('storedTruth', () => {
  it('is "delayed" within the threshold and reports the record time separately from the read time', () => {
    const t = storedTruth({ source: 'ai_signal_log', dataAsOf: '2026-10-09T11:00:00Z', staleAfterMinutes: 120, now: NOW });
    expect(t.freshness).toBe('delayed');
    expect(t.dataAsOf).toBe('2026-10-09T11:00:00.000Z');
    expect(t.fetchedAt).toBe('2026-10-09T12:00:00.000Z');
    expect(t.missingFields).toEqual([]);
  });
  it('is "stale" past the threshold, with low confidence', () => {
    const t = storedTruth({ source: 's', dataAsOf: '2026-10-07T12:00:00Z', staleAfterMinutes: 24 * 60, now: NOW });
    expect(t.freshness).toBe('stale');
    expect(t.confidence).toBe('low');
  });
  it('never claims real-time for stored data, and lists a missing record time', () => {
    const t = storedTruth({ source: 's', dataAsOf: null, staleAfterMinutes: 60, simulated: true, now: NOW });
    expect(t.freshness).toBe('unknown');
    expect(t.dataAsOf).toBeNull();
    expect(t.missingFields).toContain('observation time');
    expect(t.simulated).toBe(true);
    expect(storedTruth({ source: 's', dataAsOf: 'not a date', staleAfterMinutes: 60, now: NOW }).freshness).toBe('unknown');
  });
});

describe('TruthStampLine', () => {
  it('shows source, data time, freshness, simulated and missing fields', () => {
    const html = renderToStaticMarkup(<TruthStampLine truth={storedTruth({ source: 'arca:risk', dataAsOf: '2026-10-06T00:00:00Z', staleAfterMinutes: 60, simulated: true, missingFields: ['volume'], now: NOW })} />);
    expect(html).toContain('Source: arca:risk');
    expect(html).toContain('Stale');
    expect(html).toContain('Simulated / derived');
    expect(html).toContain('Missing: volume');
    expect(html).toContain('data-truth-stamp="stale"');
  });
  it('says so when an API supplied no truth metadata', () => {
    expect(renderToStaticMarkup(<TruthStampLine truth={null} />)).toContain('Source and data time not supplied');
  });
});

describe('the eight admin market-data pages render the stamp', () => {
  it.each(['outcomes', 'symbol/[symbol]', 'analogues', 'insider', 'data-health', 'model-diagnostics', 'backtest-lab', 'portfolio-lab/risk'])('%s', (page) => {
    expect(readFileSync(`app/admin/${page}/page.tsx`, 'utf8')).toContain('<TruthStampLine truth=');
  });
  it.each(['signals/stats', 'model-diagnostics', 'backtest-lab', 'symbol/[symbol]', 'insider', 'analogues', 'portfolio-lab/risk'])('API %s uses stored-data truth, not a read-time "real-time" stamp', (route) => {
    const src = readFileSync(`app/api/admin/${route}/route.ts`, 'utf8');
    expect(src).toContain('storedTruth(');
    expect(src).not.toMatch(/source: 'admin:postgres', freshness: 'real-time'/);
  });
});
