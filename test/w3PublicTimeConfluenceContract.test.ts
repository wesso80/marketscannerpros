/**
 * W3 /api/confluence-scan: only the "hierarchical" and "calendar" modes are public, and the hierarchical scan is
 * serialized through the public Time Confluence contract. The internal scan is loaded with canaries in every private
 * family (direction, confidence, target, trade setup, R:R, signal strength, scores, banners, entry window, structure,
 * decompression pull, raw candles). The agent is a fake; no network or database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true, scans: 0, fail: false }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
vi.mock('@/lib/confluence-learning-agent', () => ({
  confluenceLearningAgent: {
    detectAssetClass: (s: string) => (s.endsWith('USD') ? 'crypto' : 'equity'),
    computeForwardCloseCalendar: vi.fn(() => ({ anchor: 'NOW', schedule: [], forwardClusters: [] })),
    scanHierarchical: vi.fn(async (symbol: string, mode: string) => {
      h.scans++;
      if (h.fail) throw new Error('No price data for ZZZ. secret-internal-detail');
      return {
        mode, modeLabel: 'Intraday 1H', primaryTF: '1h', currentPrice: 101.5, isLivePrice: false, includedTFs: ['30m', '1h', '2h', '4h'],
        decompression: { unmeasuredTFs: ['4h'], decompressions: [{ canary: 'CANARY-DECOMP' }], activeCount: 3, temporalCluster: { score: 77 }, clusteredCount: 2, clusteringRatio: 0.6, netPullDirection: 'bullish', netPullStrength: 88, pullBias: 64, reasoning: 'CANARY-PULL' },
        mid50Levels: [{ tf: '1h', level: 100, distance: 1.5, isDecompressing: true }, { tf: '2h', level: 99.6, distance: 1.9078, isDecompressing: false }, { tf: '30m', level: 0, distance: 0, isDecompressing: false }],
        clusters: [{ levels: [100, 99.6], tfs: ['1h', '2h'], avgLevel: 99.8 }],
        candleCloseConfluence: {
          closes: [{ tf: '1h', tfMinutes: 60, nextCloseAt: '2026-10-08T15:00:00.000Z', minsToClose: 12, weight: 3, mid50Level: 100, distanceToMid50: 1.5, pullDirection: 'down' }, { tf: '4h', tfMinutes: 240, nextCloseAt: '2026-10-08T16:00:00.000Z', minsToClose: 72, weight: 6 }],
          closingNow: { count: 1, timeframes: ['30m'], highestTF: '30m', isRare: false },
          closingSoon: { count: 2, timeframes: [{ tf: '1h', minsAway: 12, weight: 3 }, { tf: '4h', minsAway: 72, weight: 6 }], peakConfluenceIn: 72, peakCount: 2 },
          peakCloseCluster: { count: 2, timeframes: ['1h', '4h'], windowStartMins: 60, windowEndMins: 75, weightedScore: 91 },
          specialEvents: { isMonthEnd: false, isWeekEnd: true, isQuarterEnd: false, isYearEnd: false, sessionClose: 'ny' },
          confluenceScore: 83, confluenceRating: 'high', isMarketOpen: true,
          bestEntryWindow: { startMins: 55, endMins: 80, reason: 'CANARY-ENTRYWINDOW' },
        },
        prediction: { direction: 'bullish', confidence: 74, reasoning: 'CANARY-REASON', targetLevel: 123.45, expectedMoveTime: '45m' },
        tradeSetup: { entryPrice: 101.5, stopLoss: 97.25, takeProfit: 111.11, riskRewardRatio: 2.5, riskPercent: 4.2, rewardPercent: 9.5 },
        signalStrength: 'strong',
        scoreBreakdown: { directionScore: 66, clusterScore: 70, dominantClusterRatio: 0.7, decompressionScore: 60, activeTFs: 3, hasHigherTF: true, banners: ['MEGA CONFLUENCE', 'EXTREME BULLISH'] },
        candlesByTf: { '30M': [{ ts: Date.parse('2026-10-08T14:30:00Z'), open: 1, high: 2, low: 0.5, close: 1.5 }] },
        structure: { zones: [{ type: 'demand', top: 98, bottom: 97, tf: '1h', strength: 9 }], patterns: [{ name: 'CANARY-PATTERN', tf: '1h', bias: 'bullish', confidence: 80 }], structureScore: 70 },
      };
    }),
  },
}));
import { GET, POST } from '@/app/api/confluence-scan/route';

let n = 0;
const post = async (body: Record<string, unknown>) => { const r = await POST(new NextRequest('https://msp.test/api/confluence-scan', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, headers: r.headers, body: await r.json() }; };
const FORBIDDEN_KEYS = /^(prediction|direction|confidence|reasoning|targetLevel|expectedMoveTime|tradeSetup|entryPrice|stopLoss|takeProfit|riskRewardRatio|riskPercent|rewardPercent|signalStrength|scoreBreakdown|banners|confluenceScore|confluenceRating|bestEntryWindow|structure|candlesByTf|decompression|netPullDirection|pullBias|pullDirection|weight|weightedScore|isDecompressing|isRare)$/;
const PRIVATE_TEXT = /CANARY|bullish|bearish|123\.45|97\.25|111\.11|MEGA|EXTREME|ws-a|secret-internal/i;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
beforeEach(() => { h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true; h.scans = 0; h.fail = false; });

describe('W3: /api/confluence-scan publishes only measured timing evidence', () => {
  it('cold and cached hierarchical responses: public contract only, private headers', async () => {
    const req = { symbol: 'zzta', mode: 'hierarchical', scanMode: 'intraday_1h', assetType: 'equity' };
    const cold = await post(req), warm = await post(req);
    expect(h.scans).toBe(1);
    expect(warm.body.cached).toBe(true);
    for (const r of [cold, warm]) {
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      const d = r.body.data;
      expect(d.contract).toBe('public-time-confluence-v1');
      expect(Object.keys(d).sort()).toEqual(['closes', 'contract', 'includedTFs', 'latestBarAt', 'midpoints', 'modeLabel', 'note', 'observedAt', 'price', 'primaryTF', 'scanMode', 'symbol', 'unmeasuredTFs']);
      expect(keyPaths(r.body).filter((p) => FORBIDDEN_KEYS.test(p.split('.').at(-1)!))).toEqual([]);
      expect(JSON.stringify(r.body)).not.toMatch(PRIVATE_TEXT);
      expect(d.symbol).toBe('ZZTA');
      expect(d.price).toEqual({ value: 101.5, basis: 'last 30-minute bar close', source: 'Alpha Vantage' });
      expect(d.latestBarAt).toBe('2026-10-08T14:30:00.000Z');
      expect(d.unmeasuredTFs).toEqual(['4h']);
      expect(d.closes.schedule).toEqual([
        { tf: '1h', tfMinutes: 60, nextCloseAt: '2026-10-08T15:00:00.000Z', minsToClose: 12, midpoint: 100, distanceToMidpointPct: 1.5 },
        { tf: '4h', tfMinutes: 240, nextCloseAt: '2026-10-08T16:00:00.000Z', minsToClose: 72, midpoint: null, distanceToMidpointPct: null },
      ]);
      expect(d.closes.closingNow).toEqual({ count: 1, timeframes: ['30m'], highestTF: '30m', windowMins: 5 });
      expect(d.closes.closingSoon).toEqual({ count: 2, timeframes: [{ tf: '1h', minsAway: 12 }, { tf: '4h', minsAway: 72 }] });
      expect(d.closes.densestWindow).toEqual({ count: 2, timeframes: ['1h', '4h'], startMins: 60, endMins: 75 });
      expect(d.closes.calendarEvents).toEqual({ monthEnd: false, weekEnd: true, quarterEnd: false, yearEnd: false, sessionClose: 'ny' });
      // A zero midpoint is the engine's "unmeasured" sentinel, never a price.
      expect(d.midpoints.levels).toEqual([{ tf: '1h', level: 100, distancePct: 1.5 }, { tf: '2h', level: 99.6, distancePct: 1.91 }]);
      expect(d.midpoints.groups).toEqual([{ tfs: ['1h', '2h'], levels: [100, 99.6], averageLevel: 99.8 }]);
    }
  });
  it('the retired modes (AI forecast with levels, learning, quick/state checks) are refused before any scan', async () => {
    for (const mode of ['full', 'forecast', 'learn', 'quick', 'state-only', 'anything']) {
      const r = await post({ symbol: `ZZT${n++}`, mode });
      expect(r.status).toBe(400);
    }
    expect((await GET()).status).toBe(405);
    expect(h.scans).toBe(0);
  });
  it('calendar mode still returns the schedule', async () => {
    const r = await post({ symbol: 'BTCUSD', mode: 'calendar', anchor: 'TODAY', horizonDays: 1 });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ anchor: 'NOW', schedule: [], forwardClusters: [] });
  });
  it('rejects unknown scan modes, returns a generic error, and checks access before scanning', async () => {
    expect((await post({ symbol: `ZZT${n++}`, mode: 'hierarchical', scanMode: 'everything' })).status).toBe(400);
    h.fail = true;
    const err = await post({ symbol: `ZZT${n++}`, mode: 'hierarchical' });
    expect(err.status).toBe(500);
    expect(JSON.stringify(err.body)).not.toMatch(/secret-internal|No price data/);
    h.fail = false; h.scans = 0;
    h.session = null;
    expect((await post({ symbol: `ZZT${n++}`, mode: 'hierarchical' })).status).toBe(401);
    h.session = { workspaceId: 'ws-a' }; h.paid = false;
    expect((await post({ symbol: `ZZT${n++}`, mode: 'hierarchical' })).status).toBe(403);
    expect(h.scans).toBe(0);
  });
});
