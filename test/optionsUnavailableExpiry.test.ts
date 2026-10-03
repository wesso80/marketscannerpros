import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { expirationsKeptOnError, expiryAfterUnavailable } from '@/hooks/useOptionsChain';

it('keeps the expiry list when a requested expiry is unavailable so another date can be chosen', () => {
  const list = [
    { date: '2026-10-05', dte: 2, label: 'Mon Oct 5 (2 DTE)', calls: 1, puts: 1, totalOI: 3 },
    { date: '2026-10-09', dte: 6, label: 'Fri Oct 9 (6 DTE)', calls: 1, puts: 1, totalOI: 3 },
  ];
  const now = Date.parse('2026-10-03T16:00:00Z');
  expect(expirationsKeptOnError(422, { expirations: list })).toEqual(list);
  expect(expirationsKeptOnError(404, { expirations: list })).toEqual([]);
  expect(expirationsKeptOnError(500, {})).toEqual([]);
  expect(expiryAfterUnavailable('2020-01-01', list.map((entry) => entry.date), now)).toBe('2026-10-05');
  expect(expiryAfterUnavailable('2026-10-09', list.map((entry) => entry.date), now)).toBeNull();

  const hook = readFileSync('hooks/useOptionsChain.ts', 'utf8');
  const view = readFileSync('components/options-terminal/OptionsTerminalView.tsx', 'utf8');
  expect(hook).toContain('expirationsKeptOnError(res.status, json)');
  expect(view).toContain('expiryAfterUnavailable(selectedExpiry, dates)');
});
