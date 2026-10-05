import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[] }));
const pipeline = vi.hoisted(() => vi.fn(async () => ({ ok: false, reason: 'incomplete' })));

vi.mock('@/lib/db', () => ({
  q: async (sql: string, params: unknown[] = []) => {
    state.queries.push({ sql, params });
    if (/FROM trade_plans/i.test(sql)) {
      return [{
        plan_id: 'plan_1',
        symbol: 'AAPL',
        decision_packet_id: 'dp_1',
        draft_payload: {
          symbol: 'AAPL',
          timeframe: 'intraday',
          setup: { bias: 'long', signal_source: 'focus.creator', thesis: 'ready plan' },
          entry: { zone: 100 },
          risk: { invalidation: 90, targets: [120], risk_pct: 1 },
        },
      }];
    }
    return [];
  },
}));
vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: async () => ({ workspaceId: 'ws_1', is_admin: true, tier: 'pro' }),
}));
vi.mock('@/lib/execution/runPipeline', () => ({ runExecutionPipeline: pipeline }));

import { POST } from '@/app/api/workflow/events/route';
import { AUTO_PLAN_DRAFT_INSERT_ENABLED, handleJournalPrefill } from '../worker/engine-runner';

const routeSource = readFileSync(join(process.cwd(), 'app/api/workflow/events/route.ts'), 'utf8');
const journalInserts = (queries: { sql: string }[]) => queries.filter((query) => /insert\s+into\s+journal_entries/i.test(query.sql));

beforeEach(() => {
  state.queries = [];
  pipeline.mockClear();
});

it('server and worker auto-draft defaults insert no journal rows', async () => {
  expect(routeSource).toMatch(/const AUTO_CREATE_JOURNAL_DRAFT_FOR_EVENT_ENABLED:\s*boolean\s*=\s*false;/);
  expect(routeSource).toMatch(/if \(!AUTO_CREATE_JOURNAL_DRAFT_FOR_EVENT_ENABLED\) return false;/);
  expect(AUTO_PLAN_DRAFT_INSERT_ENABLED).toBe(false);

  const response = await POST(new NextRequest('https://example.test/api/workflow/events', {
    method: 'POST',
    body: JSON.stringify({
      events: [{
        event_id: 'evt_plan_1',
        event_type: 'trade.plan.created',
        event_version: 1,
        occurred_at: '2026-10-05T14:30:00.000Z',
        actor: { actor_type: 'user', user_id: 'user_1', anonymous_id: null, session_id: null },
        context: {
          tenant_id: 'msp',
          app: { name: 'MarketScannerPros', env: 'test' },
          page: { route: '/tools/scanner', module: 'scanner' },
        },
        entity: { entity_type: 'trade_plan', entity_id: 'plan_1', symbol: 'AAPL', asset_class: 'equity' },
        correlation: { workflow_id: 'wf_1', parent_event_id: null },
        payload: {
          plan_id: 'plan_1',
          symbol: 'AAPL',
          direction: 'long',
          asset_class: 'equity',
          decision_packet_id: 'dp_1',
          entry: { zone: 100 },
          setup: { source: 'scanner.plan', signal_type: 'confluence_scan', bias: 'long' },
          risk: { risk_score: 40, invalidation: 90, targets: [120] },
        },
      }],
    }),
  }));

  expect(response.status).toBe(200);
  expect((await response.json()).autoJournalDraftsCreated).toBe(0);
  expect(state.queries.some((query) => /journal_entries/i.test(query.sql))).toBe(false);
  expect(journalInserts(state.queries)).toEqual([]);
  expect(pipeline).not.toHaveBeenCalled();

  const beforeWorker = state.queries.length;
  const result = await handleJournalPrefill({
    id: 7,
    workspace_id: 'ws_1',
    payload: { planId: 'plan_1', symbol: 'AAPL' },
    attempts: 1,
  });

  expect(result).toMatchObject({
    ok: true,
    action: 'journal_prefill',
    workspaceId: 'ws_1',
    inserted: false,
    reason: 'auto_plan_draft_disabled',
  });
  expect(state.queries.slice(beforeWorker)).toEqual([]);
  expect(journalInserts(state.queries)).toEqual([]);
});
