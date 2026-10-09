// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StageBadge from '@/components/crypto/top/StageBadge';
import EquityTop from '@/components/crypto/top/EquityTop';
import { symbolVerdictLabel } from '@/lib/presentation/symbolDisplay';
import type { GoldenEggPayload } from '@/src/features/goldenEgg/types';

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;

const mapped: Array<[string, string]> = [
  ['NO BASE', 'No base yet'],
  ['NO_BASE', 'No base yet'],
  ['  no base  ', 'No base yet'],
  ['BASE_FORMING', 'Base forming'],
  ['BASE FORMING', 'Base forming'],
  ['BREAKOUT', 'Breakout'],
  ['NOT ENOUGH DATA', 'Not enough data'],
  ['NOT_ENOUGH_DATA', 'Not enough data'],
  ['WATCH', 'Base in place'],
  ['BROKE OUT, RULE NOT MET', 'Broke out, rule not met'],
  ['MEETS v1 RULES', 'Meets the rules'],
  ['MEETS_V1_RULES', 'Meets the rules'],
  ['EXTENDED', 'Extended'],
  ['FELL BACK', 'Fell back'],
  ['FELL_BACK', 'Fell back'],
  ['NONE', 'No setup'],
  ['NO_SETUP', 'No setup'],
  ['No setup', 'No setup'],
  ['BLOCKED', 'Blocked'],
  ['TREND_CONTINUATION', 'Trend continuation'],
  ['PULLBACK', 'Pullback'],
  ['SQUEEZE', 'Squeeze'],
  ['EXHAUSTION_FADE', 'Exhaustion fade'],
  ['Research snapshot', 'Research snapshot'],
];

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(mapped)('maps %s to the reader label %s', (raw, label) => {
  expect(symbolVerdictLabel(raw)).toBe(label);
  expect(symbolVerdictLabel(raw)).not.toMatch(ENGINE_TOKEN);
});

it('falls back to plain words for an unknown engine token', () => {
  expect(symbolVerdictLabel('ZZZ_NEW_STATE')).toBe('Zzz new state');
  expect(symbolVerdictLabel('FUTURE STAGE')).toBe('Future stage');
  expect(symbolVerdictLabel('ZZZ_NEW_STATE')).not.toBe('ZZZ_NEW_STATE');
  expect(symbolVerdictLabel('ZZZ_NEW_STATE')).not.toMatch(ENGINE_TOKEN);
  expect(symbolVerdictLabel(null)).toBe('Not recorded');
  expect(symbolVerdictLabel('')).toBe('Not recorded');
  expect(symbolVerdictLabel('   ')).toBe('Not recorded');
});

it('shows the reader label on the crypto pill and keeps the raw stage off the text', () => {
  const { container } = render(<StageBadge stage="NO BASE" />);
  const pill = container.querySelector('[data-stage-badge]');
  expect(pill?.textContent).toBe('No base yet');
  expect(pill?.getAttribute('data-engine-stage')).toBe('NO BASE');
  expect(pill?.textContent).not.toMatch(ENGINE_TOKEN);
  cleanup();
  render(<StageBadge stage="BASE_FORMING" />);
  expect(screen.getByText('Base forming')).toBeTruthy();
  cleanup();
  render(<StageBadge stage="BREAKOUT" />);
  expect(screen.getByText('Breakout')).toBeTruthy();
  cleanup();
  render(<StageBadge stage="ZZZ_NEW_STATE" />);
  expect(screen.getByText('Zzz new state')).toBeTruthy();
  expect(screen.queryByText('ZZZ_NEW_STATE')).toBeNull();
});

it('shows no verdict pill on the stock top, even for a no-setup packet (Phase 4)', () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, candles: [] }) })));
  const data = {
    meta: { symbol: 'AAPL', assetClass: 'equity', price: 10, asOfTs: '2026-10-02T00:00:00.000Z', timeframe: 'daily' },
    layer2: { setup: { keyLevels: [] } },
    canonicalVerdict: { permission: 'BLOCK', setupType: 'NONE', blockReasons: [], factors: [] },
  } as unknown as GoldenEggPayload;
  const before = JSON.stringify(data);
  const { container } = render(<EquityTop data={data} />);
  expect(container.querySelector('[data-equity-verdict]')).toBeNull();
  expect(container.textContent).not.toMatch(/No setup/);
  expect(JSON.stringify(data)).toBe(before);
});

it('stays out of the base-breakout rule and the daily-picks ranker', () => {
  const rule = readFileSync('lib/crypto/breakdown/baseBreakoutV1.ts', 'utf8');
  const ranker = readFileSync('lib/scoring/canonical/dailyPick.ts', 'utf8');
  expect(rule).not.toContain('symbolVerdictLabel');
  expect(ranker).not.toContain('symbolVerdictLabel');
  expect(readFileSync('app/daily-scan/wording.ts', 'utf8')).toContain('readerVerdict');
});
