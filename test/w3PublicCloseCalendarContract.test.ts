/**
 * W3 /api/confluence-scan mode "calendar": the REAL forward close calendar engine runs through the route and the
 * public Close Calendar contract. No timeframe weight or window score is published anywhere, close windows are listed
 * in time order (not ranked or truncated by score) and every window holds two or more closes. Only auth is faked; the
 * calendar is pure schedule computation (no network or database).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
import { POST } from '@/app/api/confluence-scan/route';
import { confluenceLearningAgent } from '@/lib/confluence-learning-agent';

const post = async (body: Record<string, unknown>) => { const r = await POST(new NextRequest('https://msp.test/api/confluence-scan', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, headers: r.headers, body: await r.json() }; };
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
const ANCHOR = '2026-03-27T12:00:00.000Z'; // Friday before a month and quarter end
beforeEach(() => { h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true; });

describe('W3: public Close Calendar', () => {
  it.each([['BTCUSD', 'crypto', 30], ['AAPL', 'equity', 5]] as const)('%s (%s, %i days): exact keys, no weight or score, windows in time order', async (symbol, assetType, horizonDays) => {
    const r = await post({ symbol, mode: 'calendar', anchor: 'CUSTOM', anchorTime: ANCHOR, horizonDays, assetType });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    const d = r.body.data;
    expect(d.contract).toBe('public-close-calendar-v1');
    expect(Object.keys(d).sort()).toEqual(['anchor', 'anchorTimeISO', 'assetClass', 'closesOnAnchorDay', 'clusterRule', 'contract', 'forwardClusters', 'generatedAt', 'horizonDays', 'horizonEndISO', 'schedule', 'scheduleBasis', 'scheduleModel', 'scheduleModelLabel', 'sessionMode', 'timezone', 'totalCloseEventsInHorizon', 'warnings']);
    expect(keyPaths(r.body).filter((p) => /^(weight|clusterScore|score|rank)$/i.test(p.split('.').at(-1)!))).toEqual([]);
    expect(JSON.stringify(r.body)).not.toMatch(/"weight"|clusterScore|ws-a/);
    expect(Object.keys(d.schedule[0]).sort()).toEqual(['category', 'closesInHorizon', 'closesOnAnchorDay', 'firstCloseAtISO', 'minsToFirstClose', 'tf', 'tfMinutes']);
    expect(d.forwardClusters.length).toBeGreaterThan(0);
    const starts = d.forwardClusters.map((w: any) => Date.parse(w.windowStartISO));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const w of d.forwardClusters) {
      expect(Object.keys(w).sort()).toEqual(['label', 'tfs', 'timeframeCount', 'windowEndISO', 'windowStartISO']);
      expect(w.timeframeCount).toBe(w.tfs.length);
      expect(w.timeframeCount).toBeGreaterThanOrEqual(2);
    }
    // Not truncated by score: every multi-close window the engine finds is published, in the same time order.
    const engine = confluenceLearningAgent.computeForwardCloseCalendar('CUSTOM', horizonDays, ANCHOR, assetType, 'extended');
    const multi = engine.forwardClusters.filter((w) => w.tfs.length >= 2).map((w) => w.windowStartISO);
    expect(d.forwardClusters.map((w: any) => w.windowStartISO)).toEqual(multi.slice(0, 60));
  }, 60_000); // the equity session calendar is CPU-heavy (holiday-aware close walk)
  it('the engine itself no longer ranks windows by score', () => {
    const engine = confluenceLearningAgent.computeForwardCloseCalendar('CUSTOM', 30, ANCHOR, 'crypto', 'extended');
    const starts = engine.forwardClusters.map((w) => Date.parse(w.windowStartISO));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(engine.forwardClusters.length).toBeGreaterThan(20); // previously cut to the top 20 by score
  });
});
