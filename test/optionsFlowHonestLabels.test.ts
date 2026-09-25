/**
 * Options Flow showed "Institutional flow: bullish, conviction +91", "Large flow estimate: bullish, 95% confidence",
 * a SWEEP pattern and "whale" tier tags for AAPL (26 Sep 2026) while running on the previous-session
 * HISTORICAL_OPTIONS fallback. All of it was guessed from end-of-day bid/ask/last snapshots, which are not trade
 * prints: you cannot see who initiated a trade, a sweep, a block, or a single "whale" order in a snapshot.
 *
 * Now the API returns inferenceAvailable:false with those fields null, keeps plain facts (premium, volume, OI,
 * skew, ATM IV) labelled "Previous session estimate", and skips a same-day expiry on previous-session data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return { av: {} as Record<string, unknown> };
});
vi.mock('@/lib/redis', () => ({
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => undefined),
  CACHE_KEYS: { optionsChain: (s: string) => `opt:chain:${s}` },
  CACHE_TTL: { optionsChain: 120 },
}));
vi.mock('@/lib/options/access', () => ({ checkOptionsAccess: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => m.av[new URL(url).searchParams.get('function') || ''] ?? null),
}));

import { clearSharedOptionsChainCache } from '../lib/options/chainCache';
import { GET as flowGET } from '../app/api/options-flow/route';
import {
  classifyOptionsFlow, computeFlowFacts, toSnapshotFlowView, FLOW_DIRECTION_INFERENCE_AVAILABLE,
  DIRECTION_NOT_INFERRED_NOTE, BID_ASK_SPLIT_LABEL,
} from '../lib/options-flow-classifier';

const TODAY = '2026-09-25'; // Fri, US time — expires today
const NEXT = '2026-10-02';

/** Heavy call volume printed at the ask across many strikes: the old code called this a bullish whale SWEEP. */
function row(exp: string, type: 'call' | 'put', k: number, session = '2026-09-24') {
  const call = type === 'call';
  return {
    contractID: `AAPL${exp.replace(/-/g, '').slice(2)}${call ? 'C' : 'P'}${k}`, symbol: 'AAPL', expiration: exp,
    strike: k.toFixed(2), type,
    bid: call ? '4.90' : '1.00', ask: call ? '5.10' : '1.10', last: call ? '5.10' : '1.05', mark: call ? '5.00' : '1.05',
    volume: call ? '2000' : '100', open_interest: call ? '1500' : '3000', date: session,
    implied_volatility: call ? '0.25' : '0.30', delta: call ? '0.45' : '-0.35', gamma: '0.02',
  };
}
const strikes = Array.from({ length: 12 }, (_, i) => 240 + i * 2.5);
const chainFor = (exps: string[], session?: string) => ({
  message: 'success',
  data: exps.flatMap((exp) => strikes.flatMap((k) => [row(exp, 'call', k, session), row(exp, 'put', k, session)])),
});
const quote = { 'Global Quote': { '05. price': '250.00', '10. change percent': '0.5%' } };
/** Every string VALUE in the payload (keys like whaleCount are allowed; their values are null). */
const stringValues = (v: unknown): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? v.map(stringValues).join(' ') : v && typeof v === 'object' ? Object.values(v).map(stringValues).join(' ') : '';
const get = async () => {
  const res = await flowGET(new NextRequest('http://localhost/api/options-flow?symbol=AAPL'));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  m.av = {};
  clearSharedOptionsChainCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-25T15:15:00Z')); // Fri 11:15 ET
});
afterEach(() => { vi.useRealTimers(); });

describe('toSnapshotFlowView', () => {
  const calls = strikes.map((k) => row(NEXT, 'call', k)) as any[];
  const puts = strikes.map((k) => row(NEXT, 'put', k)) as any[];
  const raw = classifyOptionsFlow(calls, puts, 250, 'AAPL', NEXT);

  it('the raw classifier would still make the misleading calls (sanity)', () => {
    expect(raw.flowPattern.pattern).toBe('sweep');
    expect(raw.smartMoney.whaleFlows.length).toBeGreaterThan(0);
    expect(raw.smartMoney.confidence).toBeGreaterThan(80);
    expect(raw.aggregate.conviction).toBeGreaterThan(80);
  });

  it('withholds conviction, confidence, block/sweep and whale/institutional tiers by default', () => {
    expect(FLOW_DIRECTION_INFERENCE_AVAILABLE).toBe(false);
    const v = toSnapshotFlowView(raw);
    expect(v.inferenceAvailable).toBe(false);
    expect(v.inferenceNote).toBe(DIRECTION_NOT_INFERRED_NOTE);
    expect(v.inferenceNote).toMatch(/^Direction not inferred \(snapshot data\)/);
    expect(v.aggregate.conviction).toBeNull();
    expect(v.aggregate.netPremium).toBeNull();
    expect(v.aggregate.splitLabel).toBe(BID_ASK_SPLIT_LABEL);
    expect(v.smartMoney).toEqual({ direction: null, confidence: null, signals: [], whaleCount: null, institutionalCount: null });
    expect(v.flowPattern.pattern).toBeNull();
    expect(v.flowPattern.reason).not.toMatch(/sweep|block|institutional|aggressive/i);
    expect(v.flowPattern.activeStrikes).toBe(raw.flowPattern.activeStrikes);
    for (const f of v.topFlows) {
      expect(f.premiumTier).toBeNull();
      expect(f.directionConfidence).toBeNull();
    }
    // Only the explanatory note may mention these words.
    expect(stringValues({ ...v, inferenceNote: '' })).not.toMatch(/whale|🐋|sweep|block|institutional/i);
  });

  it('keeps plain facts: premium, volume and volume vs OI across all contracts', () => {
    const f = computeFlowFacts(raw.contracts);
    expect(f.callVolume).toBe(2000 * 12);
    expect(f.putVolume).toBe(100 * 12);
    expect(f.callPremium).toBeCloseTo(5.0 * 2000 * 100 * 12);
    expect(f.putPremium).toBeCloseTo(1.05 * 100 * 100 * 12);
    expect(f.totalPremium).toBeCloseTo(f.callPremium + f.putPremium);
    expect(f.putCallVolumeRatio).toBeCloseTo(0.05);
    expect(f.volumeToOpenInterest).toBeCloseTo((2100 * 12) / (4500 * 12));
    expect(f.contractsVolumeAboveOI).toBe(12);
    expect(toSnapshotFlowView(raw).facts).toEqual(f);
  });
});

describe('GET /api/options-flow on the previous-session fallback', () => {
  it('returns no directional scores or tiers, labels facts "Previous session estimate", and skips the 0DTE expiry', async () => {
    m.av = { REALTIME_OPTIONS: null, HISTORICAL_OPTIONS: chainFor([TODAY, NEXT]), GLOBAL_QUOTE: quote };
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      quoteBasis: 'previous_session', asOfDate: '2026-09-24',
      inferenceAvailable: false, factsLabel: 'Previous session estimate',
      expiration: NEXT,
    });
    expect(body.availableExpirations).toEqual([TODAY, NEXT]);
    expect(body.expiryNote).toMatch(/Skipped 2026-09-25 \(expires today\)/);
    expect(body.aggregate.conviction).toBeNull();
    expect(body.smartMoney.confidence).toBeNull();
    expect(body.smartMoney.direction).toBeNull();
    expect(body.flowPattern.pattern).toBeNull();
    expect(body.topFlows.length).toBeGreaterThan(0);
    expect(body.topFlows.every((f: any) => f.premiumTier === null)).toBe(true);
    expect(body.facts.callVolume).toBe(24000);
    expect(body.ivSkew.atmIV).toBeGreaterThan(0);
    expect(stringValues({ ...body, inferenceNote: '' })).not.toMatch(/whale|🐋|sweep|block|institutional/i);
  });

  it('keeps the only expiry when it is 0DTE and nothing later exists', async () => {
    m.av = { REALTIME_OPTIONS: null, HISTORICAL_OPTIONS: chainFor([TODAY]), GLOBAL_QUOTE: quote };
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.expiration).toBe(TODAY);
    expect(body.expiryNote).toBeNull();
  });

  it('live chain: 0DTE is still allowed, and inference is still withheld (snapshots are never trade prints)', async () => {
    m.av = { REALTIME_OPTIONS: chainFor([TODAY, NEXT], TODAY), GLOBAL_QUOTE: quote };
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toMatchObject({ quoteBasis: 'realtime', expiration: TODAY, expiryNote: null, inferenceAvailable: false, factsLabel: 'Snapshot estimate' });
    expect(body.aggregate.conviction).toBeNull();
  });
});

describe('Options Flow page', () => {
  const page = readFileSync(join(__dirname, '..', 'app', 'tools', 'options-flow', 'page.tsx'), 'utf8');
  it('gates conviction, large-flow, pattern and tier widgets on the API flag', () => {
    expect(page).toContain('const inferred = data.inferenceAvailable === true;');
    expect(page).toContain("const DIRECTION_NOT_INFERRED = 'Direction not inferred (snapshot data)';");
    expect(page).toContain('{inferred && data.aggregate.conviction !== null && data.smartMoney.direction ? (');
    expect(page).toContain('{/* Large flow estimate — only when inference is backed by trade prints */}\n                {inferred && (');
    expect(page).toContain("{inferred && data.flowPattern.pattern ? `${patternCode(data.flowPattern.pattern)} Flow Pattern` : 'Strike Distribution'}");
    expect(page).toContain("['Strike', 'Type', 'Side (bid/ask est.)', 'Volume', 'OI', 'Premium', 'IV', 'Delta', 'Moneyness']");
    expect(page).toContain('Buy/sell split — {splitLabel.toLowerCase()}:');
    expect(page).not.toContain('analyze real-money options flow');
  });
});
