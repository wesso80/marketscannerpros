// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AlertCapNotice from '@/components/alerts/AlertCapNotice';
import OperatorProposalRail from '@/components/operator/OperatorProposalRail';
import { alertCapSkipReason, publishAlertCapNotice } from '@/lib/alerts/planLimits';
import { emitWorkflowEvents } from '@/lib/workflow/client';

const capMessage = alertCapSkipReason('pro', 100);

const proposal = {
  id: 'prop-1',
  rank: 1,
  packetId: 'pkt-1',
  symbol: 'AAPL',
  status: 'candidate',
  score: 0.8,
  confidence: 0.7,
  canAssistExecute: false,
  blockReason: null,
  action: { type: 'create_alert', payload: { symbol: 'AAPL' }, mode: 'draft', requiresConfirm: false },
  cooldown: { key: 'cd-1', expiresAt: '2026-10-06T12:00:00.000Z' },
};

beforeEach(() => {
  vi.stubGlobal('React', React);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('shows the plan-cap sentence when an automatic create is skipped', async () => {
  render(<AlertCapNotice />);
  expect(screen.queryByText(capMessage)).toBeNull();
  publishAlertCapNotice(capMessage);
  expect(await screen.findByText(capMessage)).toBeTruthy();
});

it('workflow event ingest publishes the auto-plan skip so the page can show it', async () => {
  const seen: string[] = [];
  const onNotice = (event: Event) => seen.push(String((event as CustomEvent<string>).detail));
  window.addEventListener('msp-alert-cap-notice', onNotice);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ autoAlertsCreated: 0, autoAlertsSkippedForCap: 1, autoAlertSkipReasons: [capMessage] }),
  })));

  const body = await emitWorkflowEvents([{ event_type: 'trade.plan.created' } as never]);
  expect(body?.autoAlertsSkippedForCap).toBe(1);
  expect(body?.autoAlertSkipReasons).toEqual([capMessage]);
  expect(seen).toEqual([capMessage]);

  seen.length = 0;
  (fetch as unknown as { mockResolvedValueOnce: (value: unknown) => void }).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ autoAlertsCreated: 0, autoAlertsSkippedForCap: 0, autoAlertSkipReasons: [capMessage] }),
  });
  await emitWorkflowEvents([{ event_type: 'trade.plan.created' } as never]);
  expect(seen).toEqual([]);
  window.removeEventListener('msp-alert-cap-notice', onNotice);
});

it('draft alert creation shows the cap sentence instead of a success line', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/api/operator/proposals')) {
      return { ok: true, json: async () => ({ success: true, proposals: [proposal] }) };
    }
    if (String(url).includes('/api/actions/execute') && init?.method === 'POST') {
      return {
        ok: true,
        json: async () => ({ success: true, result: { kind: 'alert_draft', created: false, reason: capMessage } }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }));

  render(<OperatorProposalRail source="options_confluence_page" symbolFallback="AAPL" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Draft' }));

  expect(await screen.findByText(capMessage)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Draft' })).toBeTruthy();
  await waitFor(() => {
    expect(screen.queryByText(/Draft created/i)).toBeNull();
  });
  const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
  expect(calls.some((url) => url.includes('/api/operator/attention'))).toBe(false);
});
