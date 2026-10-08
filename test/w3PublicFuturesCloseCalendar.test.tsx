// @vitest-environment jsdom
/**
 * W3 Futures Session close calendar: /api/terminal/futures publishes close times and counts only. The REAL futures
 * calendar engine runs through the REAL route (clock pinned, auth faked); its category weights and weighted "stack"
 * score stay internal (the engine output is unchanged). The UI test renders the Futures panel with that real response.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
import { GET } from '@/app/api/terminal/futures/route';
import { buildFuturesCloseCalendar } from '@/lib/terminal/futures/futuresCloseCalendar';
import FuturesTerminalPanel from '@/components/terminal/futures/FuturesTerminalPanel';

const NOW = new Date('2026-10-05T15:00:00Z'); // Monday, Globex open
const get = async (qs: string) => { const r = await GET(new NextRequest(`https://msp.test/api/terminal/futures?${qs}`)); return { status: r.status, body: await r.json() }; };
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
beforeEach(() => {
  h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  vi.stubGlobal('React', React);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('public futures close calendar (route)', () => {
  it.each(['globex', 'rth', 'cash_bridge'])('%s: close times and counts only, groups in time order', async (anchorMode) => {
    const { status, body } = await get(`symbol=ES&anchorMode=${anchorMode}&horizon=5d`);
    expect(status).toBe(200);
    const c = body.closeCalendar;
    expect(c.contract).toBe('public-futures-close-calendar-v1');
    expect(Object.keys(c).sort()).toEqual(['anchorMode', 'clusters', 'contract', 'groupRule', 'horizonDays', 'schedule', 'symbol', 'timeline', 'timezone', 'warnings']);
    expect(keyPaths(c).filter((p) => /^(weight|clusterScore|score|stack|label)$/.test(p.split('.').at(-1)!))).toEqual([]);
    expect(JSON.stringify(c)).not.toMatch(/"weight"|clusterScore|stack/i);
    expect(c.anchorMode).toBe(anchorMode);
    expect(c.horizonDays).toBe(5);
    for (const row of c.schedule) expect(Object.keys(row).sort()).toEqual(['category', 'minutesToClose', 'nextCloseISO', 'timeframe']);
    expect(c.clusters.length).toBeGreaterThan(0);
    const times = c.clusters.map((g: any) => Date.parse(g.timeISO));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const g of c.clusters) {
      expect(Object.keys(g).sort()).toEqual(['closeCount', 'timeEtLabel', 'timeISO', 'timeframes']);
      expect(g.closeCount).toBe(g.timeframes.length);
    }
    // The projection keeps exactly the engine's groups and schedule (times and timeframes), without weights.
    const engine = buildFuturesCloseCalendar('/ES', anchorMode as any, 5, NOW);
    expect(c.clusters.map((g: any) => [g.timeISO, g.timeframes])).toEqual(engine.clusters.map((g) => [g.timeISO, g.timeframes]));
    expect(c.schedule.map((r: any) => [r.timeframe, r.nextCloseISO, r.minutesToClose])).toEqual(engine.schedule.map((r) => [r.timeframe, r.nextCloseISO, r.minutesToClose]));
  });
  it('internal engine output is unchanged (still carries its weights for internal use)', () => {
    const engine = buildFuturesCloseCalendar('/ES', 'globex', 1, NOW);
    expect(engine.schedule[0]).toHaveProperty('weight');
    expect(engine.clusters[0]).toHaveProperty('clusterScore');
  });
  it('checks access before computing', async () => {
    h.session = null;
    expect((await get('symbol=ES')).status).toBe(401);
    h.session = { workspaceId: 'ws-a', tier: 'free' }; h.paid = false;
    expect((await get('symbol=ES')).status).toBe(403);
  });
});

describe('Futures Close Calendar view', () => {
  it('shows close times and close counts from the real response, with no weight, stack or score', async () => {
    const { body } = await get('symbol=ES&anchorMode=globex&horizon=5d');
    const { container } = render(<FuturesTerminalPanel data={body} loading={false} error={null} tab="Close Calendar" symbol="/ES" />);
    const detail = screen.getByText('Schedule detail');
    fireEvent.click(detail);
    const text = container.textContent || '';
    expect(text).not.toMatch(/\bWeight\b|\bweight\b|\bstack\b|\bScore\b/);
    const groups = container.querySelectorAll('[data-futures-close-group]');
    expect(groups.length).toBe(body.closeCalendar.clusters.length);
    body.closeCalendar.clusters.forEach((g: any, i: number) => {
      expect(groups[i].textContent).toContain(`${g.timeEtLabel} ET · ${g.closeCount} ${g.closeCount === 1 ? 'close' : 'closes'}`);
      expect(groups[i].textContent).toContain(g.timeframes.join(', '));
    });
    expect(text).toContain(body.closeCalendar.groupRule);
    expect(screen.getByRole('list', { name: 'Close times' })).toBeTruthy();
  });
});
