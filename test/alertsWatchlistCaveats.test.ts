import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RECURRING_BASIC_COOLDOWN_MINUTES, newAlertCooldownMinutes } from '@/lib/alerts/alertTiming';

const read = (p: string) => readFileSync(p, 'utf8');

describe('new alerts get a sensible default cooldown', () => {
  it('recurring basic alerts default to 60 minutes; one-time basic alerts need none', () => {
    expect(DEFAULT_RECURRING_BASIC_COOLDOWN_MINUTES).toBe(60);
    expect(newAlertCooldownMinutes({ isSmartAlert: false, isRecurring: true })).toBe(60);
    expect(newAlertCooldownMinutes({ isSmartAlert: false, isRecurring: false })).toBeNull();
  });
  it('smart alerts keep 60 and a requested cooldown is kept', () => {
    expect(newAlertCooldownMinutes({ isSmartAlert: true, isRecurring: true })).toBe(60);
    expect(newAlertCooldownMinutes({ requested: 15, isSmartAlert: false, isRecurring: true })).toBe(15);
    expect(newAlertCooldownMinutes({ requested: 240, isSmartAlert: true, isRecurring: true })).toBe(240);
    expect(newAlertCooldownMinutes({ requested: 0, isSmartAlert: false, isRecurring: false })).toBeNull();
    expect(newAlertCooldownMinutes({ requested: -5, isSmartAlert: false, isRecurring: true })).toBe(60);
  });
  it('POST /api/alerts uses it', () => {
    const route = read('app/api/alerts/route.ts');
    expect(route).toContain('newAlertCooldownMinutes({ requested: body.cooldownMinutes, isSmartAlert, isRecurring })');
    expect(route).not.toContain('(isSmartAlert ? 60 : null)');
  });
});

describe('Alerts Console lists every alert', () => {
  const page = read('app/tools/alerts/page.tsx');
  it('shows the first 12 then "Show all N alerts" instead of silently dropping the rest', () => {
    expect(page).toContain('const CONSOLE_ROW_LIMIT = 12;');
    expect(page).not.toMatch(/filtered\)\.slice\(0, 12\)/);
    expect(page).toContain('visibleAlertRows.map(');
    expect(page).toContain('Show all ${alertRows.length} alerts');
    expect(page).toContain('of ${alertRows.length} shown');
  });
});

describe('Watchlist: re-adding a symbol is a notice, not an error', () => {
  const widget = read('components/WatchlistWidget.tsx');
  it('uses neutral styling for "already on this list"', () => {
    expect(widget).toContain('setNotice(`${String(data.item?.symbol ?? newSymbol).toUpperCase()} is already on this list.`)');
    expect(widget).not.toMatch(/setError\([^)]*already on this list/);
    expect(widget).toContain('role="status"');
  });
});
