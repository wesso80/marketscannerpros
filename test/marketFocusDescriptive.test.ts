/**
 * Daily Market Focus (cron job and manual generator share lib/marketFocus/prompt): the prompt carries no bias lock,
 * phase labels or invalidation framing; the stored explanation is filtered for directive and directional sentences
 * and labelled; a provider failure stores a generic notice. OpenAI, database, auth and candidates are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ reply: '' as string, fail: false, prompts: [] as any[], inserts: [] as any[][] }));
vi.mock('openai', () => ({ default: class { chat = { completions: { create: vi.fn(async (req: any) => {
  h.prompts.push(req.messages);
  if (h.fail) throw new Error('401 Incorrect API key sk-live-CANARY');
  return { choices: [{ message: { content: h.reply } }] };
}) } }; } }));
vi.mock('@/lib/adminAuth', () => ({ verifyCronAuth: () => true }));
vi.mock('@/lib/opsAlerting', () => ({ alertCronFailure: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string, params: any[]) => {
  if (/select id, status from daily_market_focus/.test(sql)) return [];
  if (/insert into daily_market_focus \(/.test(sql)) return [{ id: 'f1' }];
  if (/insert into daily_market_focus_items/.test(sql)) h.inserts.push(params);
  return [];
}) }));
import { GET } from '@/app/api/jobs/generate-market-focus/route';
import { buildMarketFocusPrompt, MARKET_FOCUS_LABEL, MARKET_FOCUS_SYSTEM_PROMPT, MARKET_FOCUS_UNAVAILABLE, sanitizeMarketFocusText } from '@/lib/marketFocus/prompt';

const CANDIDATE = { assetClass: 'equity', symbol: 'AAPL', score: 84, scannerPayload: { phase: 'bullish', rsi: 61 }, keyLevels: { support: 180, resistance: 195 }, risks: { earnings: '2026-10-30' } };
beforeEach(() => {
  h.reply = ''; h.fail = false; h.prompts = []; h.inserts = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({ candidates: String(url).includes('equity') ? [CANDIDATE] : [] }), { status: 200 })));
});

describe('market focus prompt and filter', () => {
  it('the prompt has no bias lock, phase labels or invalidation framing', () => {
    const p = buildMarketFocusPrompt(CANDIDATE);
    expect(p).not.toMatch(/BIAS LOCK|Bullish Phase|Bearish Phase|Scenario Stance|invalidates|accelerate|Do NOT contradict/i);
    expect(p).toContain('not a forecast');
    expect(MARKET_FOCUS_SYSTEM_PROMPT).toMatch(/Do not state or imply a direction/);
  });
  it('drops directive and directional sentences and keeps descriptive ones', () => {
    const out = sanitizeMarketFocusText('What was measured: RSI 61 per the scanner. The bullish phase is confirmed. Traders should watch 195. A break of 180 invalidates the thesis.\nData limits: earnings on 30 Oct.');
    expect(out).toBe('What was measured: RSI 61 per the scanner.\nData limits: earnings on 30 Oct.');
  });
});

describe('cron job stores a descriptive, labelled explanation', () => {
  it('filters the model output before storing it', async () => {
    h.reply = 'What was measured: the scanner ranked AAPL 84 with RSI 61. Bullish Phase with upside toward 195. You should consider buying the dip.\nReference levels (as reported): 180 and 195 per the scanner.';
    const r = await GET(new Request('https://msp.test/api/jobs/generate-market-focus'));
    expect(r.status).toBe(200);
    expect(h.prompts[0][0].content).toBe(MARKET_FOCUS_SYSTEM_PROMPT);
    const explanation = h.inserts[0][7];
    expect(explanation).toContain('the scanner ranked AAPL 84 with RSI 61.');
    expect(explanation).toContain('180 and 195 per the scanner.');
    expect(explanation).not.toMatch(/Bullish|upside|should|buying/i);
    expect(explanation.endsWith(MARKET_FOCUS_LABEL)).toBe(true);
  });
  it('a provider failure stores a generic notice, not the error text', async () => {
    h.fail = true;
    await GET(new Request('https://msp.test/api/jobs/generate-market-focus'));
    expect(h.inserts[0][7]).toBe(MARKET_FOCUS_UNAVAILABLE);
    expect(JSON.stringify(h.inserts)).not.toMatch(/sk-live|Incorrect API key/);
  });
});
