/**
 * W3 acceptance, Symbol endpoint (P3-07, P3-08, P4-01, P4-02): /api/golden-egg serializes the public Symbol contract,
 * built from an allow-list. The COMPLETE serialized response is validated (nothing stripped before checking): exact
 * key sets, no forbidden key anywhere, no score / grade / permission wording in any string. The internal packet is not
 * mutated, auth is checked before computation, and two workspaces sharing the market cache get the same public body.
 * The engine is replaced by a fixture packet deliberately loaded with every private field.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildPayload } from '@/lib/goldenEgg/engine';
import { now, price, ind, tc } from './fixtures/goldenEggTiming';

const h = vi.hoisted(() => ({ packet: null as any, session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true, computeCalls: [] as any[] }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
vi.mock('@/lib/goldenEgg/engine', async (orig) => ({
  ...(await orig<typeof import('@/lib/goldenEgg/engine')>()),
  computeGoldenEgg: vi.fn(async (p: any) => { h.computeCalls.push(p); return { payload: h.packet, cached: h.computeCalls.length > 1, localDemo: false, warnings: [], dataQuality: { source: 'fixture' } }; }),
}));
import { GET } from '@/app/api/golden-egg/route';

function loadedPacket() {
  const p: any = buildPayload('AAPL', 'equity', { ...price, historicalDates: price.historicalCloses!.map((_, i) => new Date(now - (300 - i) * 86400000).toISOString().slice(0, 10)) }, ind, null, null, '1D', null, tc, null, { nowMs: now, timeframeKey: 'daily' });
  // Every private field the engine can attach, so the test proves they are not serialized.
  p.canonicalVerdict = { version: 'v', permission: 'PASS', grade: 'A', score: 88, setupType: 'TREND_CONTINUATION', direction: 'long', sizeMultiplier: 1.25, blockReasons: [], watchReasons: [], factors: [{ name: 'trendQuality', value: 0.9, pass: true }], levels: { entry: 101, invalidation: 97, target: 110, riskReward: 2.5 } };
  p.legacyConfluence = { label: 'legacy confluence (secondary)', assessment: 'ALIGNED', direction: 'LONG', grade: 'B', confluenceScore: 76, primaryBlocker: null, flipConditions: [] };
  p.doctrine = { id: 'd', label: 'Trend pullback', confidence: 72, regime: 'trend', reasons: [], playbook: { description: 'x', direction: 'long', category: 'c', entryCriteria: ['buy the dip'], riskModel: { stopDescription: 's', targetDescription: 't', defaultRR: 2 }, failureSignals: [] } };
  p.layer2.scenario.hypotheticalRisk = { riskPct: 1, riskUsd: 250, sizeUnits: 40 };
  p.canonical.fundamentals = { name: 'Apple Inc', sector: 'Tech', industry: 'HW', marketCap: 3e12, pe: 30, forwardPe: 28, peg: 2, revenueGrowthYoy: 0.08, earningsGrowthYoy: 0.1, profitMargin: 0.25, multipleLabel: 'P/E', periodSummary: 'Q2', analystTarget: 260, analystCount: 40, nextEarningsDate: '2026-10-30', daysToEarnings: 25, lastReportedQuarter: '2026-06-30', lastEpsBeat: true };
  return p;
}

const FORBIDDEN_KEYS = /^(layer1|canonicalVerdict|legacyConfluence|doctrine|playbook|narrative|grade|permission|assessment|confluence|confluenceScore|confidence|score|scores|scoreBreakdown|scoreCalculation|sizeMultiplier|hypotheticalRr|hypotheticalRisk|riskUsd|sizeUnits|rMultiple|illustrativeR|prediction|bestEntryWindow|verdict|flipConditions|primaryDriver|primaryBlocker|analystTarget|analystCount|relation|alignment|setupType|thesis|confirmation|cta|signalStrength|gating|directionalConfidence|breakoutScore|trapScore|exhaustionRisk|riskReward|entry|target)$/;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
function strings(v: any, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}
const call = async (qs = 'symbol=AAPL&type=equity') => { const r = await GET(new NextRequest(`https://msp.test/api/golden-egg?${qs}`)); return { status: r.status, body: await r.json() }; };

beforeEach(() => { h.packet = loadedPacket(); h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true; h.computeCalls = []; });

describe('W3: /api/golden-egg serializes only the public Symbol contract', () => {
  it('complete response: exact key sets, nothing forbidden anywhere', async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    const d = body.data;
    expect(d.contract).toBe('public-symbol-v1');
    expect(Object.keys(d).sort()).toEqual(['canonical', 'contract', 'layer2', 'layer3', 'meta', 'optionsRequest', 'priceEvidence', 'timingEvidence']);
    expect(Object.keys(d.canonical).sort()).toEqual(['assetClass', 'barInterval', 'changePct', 'crossMarket', 'dataTrust', 'derivatives', 'fundamentals', 'historyBars', 'indicators', 'lastCompletedBarAt', 'levels', 'liquidity', 'network', 'options', 'price', 'priceTs', 'source', 'symbol', 'timeframe']);
    expect(Object.keys(d.layer2.setup).sort()).toEqual(['invalidation', 'keyLevels', 'timeframeAlignment']);
    expect(Object.keys(d.layer2.scenario).sort()).toEqual(['invalidationLevel', 'reactionZones', 'referenceLevel', 'referenceTrigger']);
    expect(Object.keys(d.layer3).sort()).toEqual(['momentum', 'options', 'structure', 'timeConfluence']);
    expect(Object.keys(d.layer3.timeConfluence).sort()).toEqual(['banners', 'closeSchedule', 'closes', 'decompression', 'decompressionTarget', 'displayNote', 'enabled', 'sessionState']);
    // Recursive scan of the whole serialized body (response envelope included).
    const forbidden = keyPaths(body).filter((p) => FORBIDDEN_KEYS.test(p.split('.').at(-1)!));
    expect(forbidden).toEqual([]);
    const wording = strings(body).filter((s) => /\b\d{1,3}\/100\b|\bGrade [A-F]\b|\bNO_TRADE\b|\bpermission\b|\bplaybook\b/i.test(s));
    expect(wording).toEqual([]);
    // Evidence that must remain.
    expect(d.canonical.fundamentals.lastReportedQuarter).toBe('2026-06-30');
    expect(d.layer2.setup.timeframeAlignment).toEqual({ aligned: h.packet.layer2.setup.timeframeAlignment.score, of: h.packet.layer2.setup.timeframeAlignment.max, details: h.packet.layer2.setup.timeframeAlignment.details });
    expect(d.layer3.timeConfluence.closeSchedule.length).toBe(h.packet.layer3.timeConfluence.closeSchedule.length);
  });
  it('the internal packet is not mutated (it stays cached for private consumers)', async () => {
    const before = JSON.stringify(h.packet);
    await call();
    expect(JSON.stringify(h.packet)).toBe(before);
    expect(h.packet.canonicalVerdict.grade).toBe('A');
  });
  it('auth is checked before any computation', async () => {
    h.session = null;
    expect((await call()).status).toBe(401);
    h.session = { workspaceId: 'ws-a' }; h.paid = false;
    expect((await call()).status).toBe(403);
    expect(h.computeCalls).toEqual([]);
  });
  it('two workspaces on the shared market cache receive the same public body, with no workspace data', async () => {
    const a = await call();
    h.session = { workspaceId: 'ws-b', tier: 'pro' };
    const b = await call();
    expect(h.computeCalls.map((c) => c.workspaceId)).toEqual(['ws-a', 'ws-b']);
    const strip = (x: any) => ({ ...x, cached: undefined, dataQuality: undefined, providerStatus: undefined });
    expect(strip(b.body)).toEqual(strip(a.body));
    expect(JSON.stringify(a.body)).not.toMatch(/ws-a|ws-b|workspace/i);
  });
});
