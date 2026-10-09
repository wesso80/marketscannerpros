/**
 * /api/alerts/test-trigger must not invent a price: with no Alpha Vantage quote the self-test stops before creating a
 * test alert or sending email. Auth, database, provider and email are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ inserts: 0, sent: 0, quote: null as any, fetchThrows: false }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-a-123456789' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => {}) }));
vi.mock('@/lib/alerts/historyPrice', () => ({ historyPriceInsert: vi.fn(() => ({})) }));
vi.mock('@/lib/email', () => ({ buildTriggeredAlertContent: vi.fn(() => ({ subject: 's', html: 'h' })) }));
vi.mock('@/lib/alerts/emailControls', () => ({ deliverUserAlertEmail: vi.fn(async () => { h.sent++; return { sent: true, id: 'e1' }; }) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string) => {
  if (/SELECT email/.test(sql)) return [{ email: 'user@example.com' }];
  if (/INSERT INTO alerts/.test(sql)) { h.inserts++; return [{ id: 'a1' }]; }
  return [];
}) }));
import { GET } from '@/app/api/alerts/test-trigger/route';

beforeEach(() => {
  h.inserts = 0; h.sent = 0; h.fetchThrows = false;
  vi.stubGlobal('fetch', vi.fn(async () => { if (h.fetchThrows) throw new Error('network down'); return new Response(JSON.stringify(h.quote), { status: 200 }); }));
});

describe('alert self-test without a price', () => {
  it.each([['empty quote', { Note: 'rate limited' }, false], ['fetch error', null, true]])('%s: stops with 503, no alert created, no email, no invented price', async (_n, quote, throws) => {
    h.quote = quote; h.fetchThrows = throws as boolean;
    const r = await GET(new NextRequest('https://msp.test/api/alerts/test-trigger'));
    const body = await r.json();
    expect(r.status).toBe(503);
    expect(body).toMatchObject({ success: false, price: null, emailId: null });
    expect(h.inserts).toBe(0);
    expect(h.sent).toBe(0);
    expect(JSON.stringify(body)).not.toMatch(/\$150|fallback price|network down/);
    expect(body.log.at(-1)).toMatch(/TEST STOPPED — no AAPL price was collected/);
  });
  it('with a real quote it proceeds and uses that price', async () => {
    h.quote = { 'Global Quote': { '05. price': '231.45' } };
    const r = await GET(new NextRequest('https://msp.test/api/alerts/test-trigger'));
    const body = await r.json();
    expect(body.price).toBe(231.45);
    expect(h.inserts).toBe(1);
  });
});
