/**
 * No-broker-execution: the operator `order.export` action returns a research note, not an order ticket. No side /
 * quantity / market-order fields, levels are reference levels, and the standard admin classification is attached.
 */
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-op', cid: 'admin_founder@example.com', tier: 'pro', is_admin: true }) }));
vi.mock('@/lib/proTraderAccess', async (orig) => ({ ...(await orig<typeof import('@/lib/proTraderAccess')>()), hasPaidSessionAccess: () => true }));
vi.mock('@/lib/operator/privateAccess', () => ({ operatorAccessDenied: () => null }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string) => (/INSERT INTO operator_action_executions/i.test(sql) ? [{ id: 1 }] : [])) }));
vi.mock('@/lib/engine/jobQueue', () => ({ enqueueEngineJob: async () => ({ enqueued: false }) }));
vi.mock('@/lib/execution/runPipeline', () => ({ runExecutionPipeline: async () => ({ ok: false }) }));

import { POST } from '@/app/api/actions/execute/route';

it('order.export returns a research note with no order fields', async () => {
  const res = await POST(new NextRequest('https://example.test/api/actions/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionType: 'order.export', idempotencyKey: 'note-1', params: { symbol: 'aapl', side: 'BUY', quantity: 250, entryPrice: 101.5, stop: 97, targets: [108, 'x', 115] } }),
  }));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.result.kind).toBe('research_note');
  expect(body.result.classification).toBe('ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION');
  const note: string = body.result.note;
  expect(note).toContain('RESEARCH NOTE (not an order)');
  expect(note).toContain('Symbol: AAPL');
  expect(note).toContain('Scenario studied: upside');
  expect(note).toContain('Reference level: 101.50');
  expect(note).toContain('Invalidation level: 97.00');
  expect(note).toContain('Levels of interest: 108.00, 115.00');
  expect(JSON.stringify(body)).not.toMatch(/\bQTY\b|\b250\b|SIDE=|ENTRY=|\bMKT\b|BUY|SELL|order_export|BROKER_EXECUTION=/);
});

it('missing levels say not collected instead of inventing a market order', async () => {
  const res = await POST(new NextRequest('https://example.test/api/actions/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionType: 'order.export', idempotencyKey: 'note-2', params: { symbol: 'MSFT' } }),
  }));
  const note: string = (await res.json()).result.note;
  expect(note).toContain('Scenario studied: not stated');
  expect(note).toContain('Reference level: not collected');
  expect(note).not.toContain('MKT');
});

it('the route source has no order-ticket builder', () => {
  const src = readFileSync('app/api/actions/execute/route.ts', 'utf8');
  expect(src).not.toMatch(/exportOrderDraft|BROKER_EXECUTION=MANUAL_ONLY|`QTY=|`SIDE=/);
});
