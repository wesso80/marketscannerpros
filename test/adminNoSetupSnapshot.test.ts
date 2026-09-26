import { describe, expect, it, vi } from 'vitest';

// C2: bars fetched but no playbook → a real snapshot from the bars, explicit NO_SETUP, score 0 — never zeros
// classified as "Volatility Contraction 25". Also the serializer indicator scales (BBWP 0..100, RVOL ratio).

const m = vi.hoisted(() => ({ pipelines: [] as unknown[] }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/operator/orchestrator', async (orig) => {
  const actual = await orig<typeof import('@/lib/operator/orchestrator')>();
  return {
    ...actual,
    runScan: vi.fn(async (req: { symbols: string[] }, _ctx: unknown, provider: { getBars: (s: string, mk: string, tf: string) => Promise<unknown[]> }) => {
      await provider.getBars(req.symbols[0], 'EQUITIES', '15m');
      return { requestId: 'r', timestamp: '2026-09-25T17:00:00.000Z', environmentMode: 'RESEARCH', engineVersions: {}, symbolsScanned: 1, radar: [], pipelines: m.pipelines, snapshots: [], errors: [] };
    }),
  };
});

import { buildAdminResearchScan, NO_SETUP_REASON } from '@/lib/admin/getAdminResearchPacket';
import { barsToNoSetupIntelligence } from '@/lib/admin/serializer';
import { DEFAULT_ADMIN_SCAN_CONTEXT } from '@/lib/admin/scan-context';
import { memoizeProvider } from '@/lib/operator/market-data';
import { classifySetup } from '@/lib/engines/setupClassifier';
import { readFileSync } from 'node:fs';
import type { Bar, KeyLevel } from '@/types/operator';

const NOW = Date.parse('2026-09-25T19:45:00Z'); // Fri 15:45 ET, market open

function bars(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    symbol: 'MA', market: 'EQUITIES', timeframe: '15m',
    timestamp: new Date(NOW - (n - i) * 900_000).toISOString(),
    open: 500 + Math.sin(i / 3) * 4, high: 505 + Math.sin(i / 3) * 4, low: 495 + Math.sin(i / 3) * 4,
    close: 500 + Math.sin(i / 3) * 4 + (i % 2 ? 1 : -1), volume: 10_000 + (i % 5) * 100,
  }));
}

const levels: KeyLevel[] = [
  { price: 512, category: 'PDH', strength: 0.8 } as KeyLevel,
  { price: 488, category: 'PDL', strength: 0.8 } as KeyLevel,
];

function provider(series: Bar[]) {
  return memoizeProvider({
    getBars: vi.fn(async () => series),
    getKeyLevels: vi.fn(async () => levels),
    getCrossMarketState: vi.fn(async () => ({ vixState: 'unknown', dxyState: 'neutral', breadthState: 'neutral' })),
    getEventWindow: vi.fn(async () => ({ isActive: false, severity: null, nextEventAt: null })),
  } as never);
}

describe('C2: no setup with bars → real snapshot', () => {
  it('builds price, change, indicators and levels from the bars; setup NO_SETUP; score 0', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const series = bars(120);
    const scan = await buildAdminResearchScan({
      symbol: 'MA', market: 'EQUITIES', timeframe: '15m',
      scanContext: { ...DEFAULT_ADMIN_SCAN_CONTEXT }, provider: provider(series),
    });
    vi.useRealTimers();
    const p = scan.packet;
    expect(scan.noBars).toBe(false);
    expect(scan.bars.length).toBe(120);
    expect(p.snapshot.price).toBe(series[series.length - 1].close);
    expect(p.quote.price).toBeGreaterThan(0);
    expect(p.snapshot.indicators.ema20).toBeGreaterThan(0);
    expect(p.snapshot.indicators.atr).toBeGreaterThan(0);
    expect(p.snapshot.indicators.vwap).toBeGreaterThan(0);
    expect(p.snapshot.levels.pdh).toBe(512);
    expect(p.snapshot.levels.pdl).toBe(488);
    expect(p.setup.type).toBe('NO_SETUP');
    expect(p.setup.type).not.toBe('VOLATILITY_CONTRACTION');
    expect(p.internalResearchScore.trustAdjustedScore).toBe(0);
    expect(p.internalResearchScore.scoreDecayReason).toContain('NO_SETUP');
    expect(['NO_EDGE', 'DATA_DEGRADED']).toContain(p.lifecycle);
    expect(p.primaryReason).toBe(NO_SETUP_REASON);
    expect(p.alertEligibility.eligible).toBe(false);
    expect(p.dataTruth.status).not.toBe('ERROR');
  });

  it('source: the zero-filled placeholder is only used when there are no bars', () => {
    const src = readFileSync('lib/admin/getAdminResearchPacket.ts', 'utf8');
    expect(src).toContain('barsToNoSetupIntelligence(');
    expect(src).toContain('pipeline ? classifySetup(snapshot) : getSetupDefinition("NO_SETUP")');
  });

  it('/api/admin/symbol returns the scanned bars (packets do not embed them)', () => {
    const src = readFileSync('app/api/admin/symbol/[symbol]/route.ts', 'utf8');
    expect(src).toContain('buildAdminResearchScan');
    expect(src).toContain('scan.bars');
    expect(src).not.toContain('bars: packet.snapshot.bars || []');
  });
});

describe('serializer indicator scales', () => {
  it('BBWP is a 0..100 percentile and RVOL a ratio (~1 at average volume)', () => {
    const snap = barsToNoSetupIntelligence({ symbol: 'MA', timeframe: '15m', market: 'EQUITIES', bars: bars(120), scanTimestamp: 'x' });
    expect(snap.indicators.bbwpPercentile).toBeGreaterThanOrEqual(0);
    expect(snap.indicators.bbwpPercentile).toBeLessThanOrEqual(100);
    expect(snap.indicators.rvol).toBeGreaterThan(0.8);
    expect(snap.indicators.rvol).toBeLessThan(1.3);
    expect(snap.confidence).toBe(0);
    expect(snap.targets.entry).toBe(0);
  });

  it('a mid-range BBWP is not classified as a squeeze (the 0..1 score used to read as ≤10)', () => {
    const snap = barsToNoSetupIntelligence({ symbol: 'MA', timeframe: '15m', bars: bars(120), scanTimestamp: 'x' });
    const mid = { ...snap, bias: 'LONG' as const, indicators: { ...snap.indicators, bbwpPercentile: 55, adx: 10 } };
    expect(classifySetup(mid).type).not.toBe('VOLATILITY_CONTRACTION');
    expect(classifySetup(mid).type).not.toBe('SQUEEZE_EXPANSION');
  });

  it('pipeline snapshots scale the feature vector (0..1) to the engines\' units', () => {
    const src = readFileSync('lib/admin/serializer.ts', 'utf8');
    expect(src).not.toContain('bbwpPercentile: features?.bbwpPercentile ?? 0');
    expect(src).not.toContain('rvol: features?.relativeVolumeScore ?? 0');
    expect(src).toContain('features.bbwpPercentile * 1000) / 10');
  });
});
