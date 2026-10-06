// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CapitalPressureView from '@/components/terminal/CapitalPressureView';
import { capitalLevelLabel } from '@/lib/presentation/capitalLevelLabel';

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;
const SESSION_LOW = 'UTC 00:00–09:00 session low';
const SESSION_HIGH = 'UTC 00:00–09:00 session high';

const mapped: Array<[string, string]> = [
  ['UTC_00_09_LOW', SESSION_LOW],
  ['UTC00_09LOW', SESSION_LOW],
  ['Utc00 09low', SESSION_LOW],
  ['Utc 00 09 low', SESSION_LOW],
  ['UTC_00_09_HIGH', SESSION_HIGH],
  ['UTC00_09HIGH', SESSION_HIGH],
  ['PDL', 'Prior day low'],
  ['PDH', 'Prior day high'],
  ['ONL', 'Overnight low'],
  ['WEEK_HIGH', 'Week high'],
  ['7D_LOW', '7d low'],
];

afterEach(() => { cleanup(); });

it.each(mapped)('maps %s to the reader label %s', (raw, label) => {
  expect(capitalLevelLabel(raw)).toBe(label);
  expect(capitalLevelLabel(raw)).not.toMatch(/Utc00|UTC_00|UTC00/);
  expect(capitalLevelLabel(raw)).not.toMatch(ENGINE_TOKEN);
});

it('leaves prose and camelCase alone', () => {
  const prose = 'The UTC_00_09_LOW sits under spot, and PDL is separate.';
  expect(capitalLevelLabel(prose)).toBe(prose);
  expect(capitalLevelLabel('see PDL in the note')).toBe('see PDL in the note');
  expect(capitalLevelLabel('levelAtUtc00')).toBe('levelAtUtc00');
});

it('falls back to plain words for an unknown level key', () => {
  expect(capitalLevelLabel('ZZZ_NEW_LEVEL')).toBe('Zzz new level');
  expect(capitalLevelLabel('FUTURE STAGE')).toBe('Future stage');
  expect(capitalLevelLabel('ZZZ_NEW_LEVEL')).not.toBe('ZZZ_NEW_LEVEL');
  expect(capitalLevelLabel(null)).toBe('Not recorded');
  expect(capitalLevelLabel('')).toBe('Not recorded');
  expect(capitalLevelLabel('unknown')).toBe('Not measured');
});

it('shows the session low on Capital Pressure without changing the level payload', () => {
  vi.stubGlobal('React', React);
  const data = { data: { spot: 100, bias: 'neutral', market_mode: 'chop', conviction: 10, gamma_state: 'Mixed', asof: '2026-10-02T00:00:00Z', flow_trade_permission: { blocked: false, tps: 10 }, liquidity_levels: [{ level: 95.5, label: 'UTC_00_09_LOW', prob: 0.5 }, { level: 98, label: 'PDL', prob: 0.4 }] } };
  const before = JSON.stringify(data);
  render(<CapitalPressureView symbol="BTC" data={data} loading={false} error={null} onRefresh={() => {}} />);
  expect(screen.getByText(SESSION_LOW)).toBeTruthy();
  expect(screen.getByText('Prior day low')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/Utc00 09low|Utc 00 09 low|UTC_00_09_LOW/);
  expect(JSON.stringify(data)).toBe(before);
  vi.unstubAllGlobals();
});

it('leaves the flow route key and the scoring engine alone', () => {
  const route = readFileSync('app/api/flow/route.ts', 'utf8');
  expect(route).toContain("label: 'UTC_00_09_LOW'");
  expect(route).toContain("label: 'UTC_00_09_HIGH'");
  expect(route).not.toContain('capitalLevelLabel');
  expect(readFileSync('lib/capitalFlowEngine.ts', 'utf8')).not.toContain('capitalLevelLabel');
  const view = readFileSync('components/terminal/CapitalPressureView.tsx', 'utf8');
  expect(view).toContain('capitalLevelLabel(lv.label)');
});
