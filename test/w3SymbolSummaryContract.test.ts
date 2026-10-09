/**
 * W3 Option 2 acceptance, Symbol AI summary (/api/deep-analysis, which replaced the standalone Deep Analysis page).
 * The engine is replaced by a fixture packet deliberately loaded with every private field; the news provider and the
 * OpenAI call are fakes (no provider request, no model call). Checks the COMPLETE serialized response and the exact
 * prompt sent to the model: no verdict, grade, permission, score, playbook, sizing or analyst field anywhere; forecast
 * and recommendation lines from the model are removed; auth is checked before any computation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildPayload } from '@/lib/goldenEgg/engine';
import { sanitizeSummary } from '@/lib/research/symbolSummary';
import { now, price, ind, tc } from './fixtures/goldenEggTiming';

const h = vi.hoisted(() => ({ packet: null as any, session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true, computeCalls: [] as any[], prompts: [] as any[], modelText: '' }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
vi.mock('@/lib/rateLimit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rateLimit')>()),
  deepAnalysisLimiter: { check: () => ({ allowed: true, remaining: 1, retryAfter: 0 }) },
}));
vi.mock('@/lib/goldenEgg/engine', async (orig) => ({
  ...(await orig<typeof import('@/lib/goldenEgg/engine')>()),
  computeGoldenEgg: vi.fn(async (p: any) => { h.computeCalls.push(p); return { payload: h.packet, cached: false, localDemo: false, warnings: [], dataQuality: { source: 'fixture' } }; }),
}));
vi.mock('@/lib/goldenEgg/companyOverview', () => ({ getFundamentalsSummary: vi.fn(async () => ({ name: 'Apple Inc' })) }));
vi.mock('@/lib/research/newsEvidence', async (orig) => ({
  ...(await orig<typeof import('@/lib/research/newsEvidence')>()),
  fetchSymbolNewsFeed: vi.fn(async () => ({
    status: 'available', fetchedAt: new Date(now).toISOString(),
    feed: [{ title: 'Apple Inc reports quarterly results', summary: 'Apple Inc revenue rose.', source: 'Fixture Wire', time_published: '20261001T120000', ticker_sentiment: [{ ticker: 'AAPL', relevance_score: '0.9', ticker_sentiment_label: 'Bullish', ticker_sentiment_score: '0.6' }], overall_sentiment_label: 'Bullish' }],
  })),
}));
import { GET } from '@/app/api/deep-analysis/route';

function loadedPacket() {
  const p: any = buildPayload('AAPL', 'equity', { ...price, historicalDates: price.historicalCloses!.map((_, i) => new Date(now - (300 - i) * 86400000).toISOString().slice(0, 10)) }, ind, null, null, '1D', null, tc, null, { nowMs: now, timeframeKey: 'daily' });
  p.canonicalVerdict = { version: 'v', permission: 'PASS', grade: 'A', score: 88, setupType: 'TREND_CONTINUATION', direction: 'long', sizeMultiplier: 1.25, blockReasons: [{ code: 'X', message: 'private block reason' }], watchReasons: [], factors: [], levels: { entry: 101, invalidation: 97, target: 110, riskReward: 2.5 } };
  p.legacyConfluence = { label: 'legacy confluence (secondary)', assessment: 'ALIGNED', direction: 'LONG', grade: 'B', confluenceScore: 76, primaryBlocker: 'private blocker text', flipConditions: [] };
  p.doctrine = { id: 'd', label: 'Trend pullback doctrine', confidence: 72, regime: 'trend', reasons: [], playbook: { description: 'x', direction: 'long', category: 'c', entryCriteria: ['buy the dip'], riskModel: { stopDescription: 's', targetDescription: 't', defaultRR: 2 }, failureSignals: [] } };
  p.layer2.scenario.hypotheticalRisk = { riskPct: 1, riskUsd: 250, sizeUnits: 40 };
  p.canonical.fundamentals = { name: 'Apple Inc', sector: 'Tech', industry: 'HW', marketCap: 3e12, pe: 30, forwardPe: 28, peg: 2, revenueGrowthYoy: 0.08, earningsGrowthYoy: 0.1, profitMargin: 0.25, multipleLabel: 'P/E', periodSummary: 'Q2', analystTarget: 261.5, analystCount: 41, nextEarningsDate: '2026-10-30', daysToEarnings: 25, lastReportedQuarter: '2026-06-30', lastEpsBeat: true };
  return p;
}

// `narrative` is allowed only as the top-level AI text field; everywhere else it is a private engine field.
const FORBIDDEN_KEYS = /^(layer1|canonicalVerdict|legacyConfluence|doctrine|playbook|grade|permission|assessment|confluence|confluenceScore|confidence|score|scores|sizeMultiplier|hypotheticalRisk|riskUsd|sizeUnits|verdict|flipConditions|primaryDriver|primaryBlocker|blockReasons|analystTarget|analystCount|lastEpsBeat|setupType|thesis|riskReward|entry|target|sentiment|overall_sentiment_label)$/;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
const PRIVATE_TEXT = /TREND_CONTINUATION|Trend pullback doctrine|buy the dip|private block reason|private blocker text|legacy confluence|ALIGNED|\bPASS\b|261\.5|\banalyst|\bGrade [A-F]\b|\b\d{1,3}\/100\b|confluence score|size multiplier|\bBullish\b|\bBearish\b/i;

const call = async (qs = 'symbol=AAPL&type=equity') => { const r = await GET(new NextRequest(`https://msp.test/api/deep-analysis?${qs}`)); return { status: r.status, body: await r.json() }; };

beforeEach(() => {
  h.packet = loadedPacket(); h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true; h.computeCalls = []; h.prompts = [];
  h.modelText = 'WHAT THE EVIDENCE SHOWS\n- Close recorded on the last completed bar.\n- AAPL will rally to 300, a high probability buy.\nWHAT DIFFERS OR IS MISSING\n- Options data not available.\nWHAT TO CHECK AGAIN\n- Next earnings date.\n- Setup grade A, 88/100.';
  vi.stubEnv('OPENAI_API_KEY', 'test-key-not-real');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    if (!String(url).startsWith('https://api.openai.com/')) throw new Error(`unexpected network call: ${url}`);
    h.prompts.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: h.modelText } }] }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('W3 Option 2: /api/deep-analysis is a summary of the public Symbol evidence only', () => {
  it('complete response: exact top-level keys, nothing forbidden anywhere', async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.contract).toBe('public-symbol-summary-v1');
    expect(Object.keys(body).sort()).toEqual(['assetClass', 'contract', 'dates', 'generatedAt', 'independenceNote', 'narrative', 'narrativeSource', 'news', 'removedLines', 'sections', 'success', 'symbol', 'timeframe']);
    expect(Object.keys(body.sections).sort()).toEqual(['differences', 'events', 'evidence', 'missing', 'recheck', 'summary']);
    expect(Object.keys(body.news).sort()).toEqual(['events', 'fetchedAt', 'headline', 'provider', 'rule', 'status']);
    const forbidden = keyPaths(body).filter((p) => p !== '.narrative' && (FORBIDDEN_KEYS.test(p.split('.').at(-1)!) || p.endsWith('.narrative')));
    expect(forbidden).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(PRIVATE_TEXT);
    expect(JSON.stringify(body)).not.toMatch(/ws-a|workspace/i);
    expect(body.sections.evidence.length).toBeGreaterThan(0);
    expect(body.news.status).toBe('available');
  });

  it('the prompt sent to the model contains only the evidence sections, no private field or wording', async () => {
    await call();
    expect(h.prompts).toHaveLength(1);
    const [system, user] = h.prompts[0].messages;
    expect(system.role).toBe('system');
    expect(system.content).toContain('Do not forecast, predict or recommend.');
    expect(user.content).toMatch(/^SYMBOL: AAPL \(equity, /);
    for (const heading of ['DATES:', 'SUMMARY:', 'OBSERVATIONS BY INPUT', 'NEWS AND EVENTS', 'WHERE METHODS OR DATES DIFFER:', 'MISSING OR PARTIAL:', 'CHECK AGAIN WHEN NEW DATA ARRIVES:']) expect(user.content).toContain(heading);
    expect(user.content).toContain('COMPANY (reporting period 2026-06-30)');
    expect(user.content).not.toMatch(PRIVATE_TEXT);
    expect(user.content).not.toMatch(/eps beat|beat estimates|consensus/i);
  });

  it('forecast, recommendation and score lines from the model are removed and counted', async () => {
    const { body } = await call();
    expect(body.narrative).toContain('WHAT THE EVIDENCE SHOWS');
    expect(body.narrative).toContain('- Options data not available.');
    expect(body.narrative).not.toMatch(/rally|buy|88\/100|grade A/i);
    expect(body.removedLines).toBe(2);
    expect(body.narrativeSource).toBe('gpt-4o, from the evidence sections only');
  });

  it('with no model key the evidence is still returned and the narrative is marked unavailable (no fabricated text)', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(h.prompts).toEqual([]);
    expect(body.narrative).toBeNull();
    expect(body.narrativeSource).toBe('unavailable');
    expect(body.sections.evidence.length).toBeGreaterThan(0);
  });

  it('auth and input are checked before any computation or model call', async () => {
    h.session = null;
    expect((await call()).status).toBe(401);
    h.session = { workspaceId: 'ws-a' }; h.paid = false;
    expect((await call()).status).toBe(403);
    h.paid = true;
    expect((await call('symbol=AAPL&expiry=next-friday')).status).toBe(400);
    expect((await call('type=equity')).status).toBe(400);
    expect(h.computeCalls).toEqual([]);
    expect(h.prompts).toEqual([]);
  });

  it('passes the selected expiry to the shared packet (W1) and does not mutate the internal packet', async () => {
    const before = JSON.stringify(h.packet);
    await call('symbol=AAPL&type=equity&expiry=2026-10-16');
    expect(h.computeCalls[0]).toMatchObject({ symbol: 'AAPL', assetClass: 'equity', expiry: '2026-10-16', workspaceId: 'ws-a' });
    expect(JSON.stringify(h.packet)).toBe(before);
  });
});

describe('sanitizeSummary', () => {
  it('keeps descriptive lines and drops forecasting / recommending / scoring ones', () => {
    const out = sanitizeSummary('- Close was 101.2 on 2026-10-06.\n- Price is likely to break higher.\n- Traders should wait.\n- Investors should buy.\n- Momentum is bearish.\n- Setup scored 76 / 100.\n- RSI(14) was 58 on the completed bar.');
    expect(out.text).toBe('- Close was 101.2 on 2026-10-06.\n- RSI(14) was 58 on the completed bar.');
    expect(out.removedLines).toBe(5);
    expect(sanitizeSummary(null)).toEqual({ text: null, removedLines: 0 });
    expect(sanitizeSummary('- will rally\n- buy now')).toEqual({ text: null, removedLines: 2 });
  });
});
