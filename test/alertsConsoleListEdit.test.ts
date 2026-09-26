import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAlertEdit, canEditLevel, consoleListAlerts, consoleRowLabel, symbolFromQuery } from '@/lib/alerts/consoleList';

const base = { symbol: 'AAPL', condition_type: 'price_above', condition_value: 200, trigger_count: 0 };

describe('consoleListAlerts', () => {
  it('keeps paused and fired alerts, active ones first', () => {
    const rows = [
      { ...base, id: 'paused', is_active: false },
      { ...base, id: 'armed', is_active: true },
      { ...base, id: 'fired', is_active: false, trigger_count: 1, is_recurring: false },
    ];
    expect(consoleListAlerts(rows).map((a) => a.id)).toEqual(['armed', 'paused', 'fired']);
  });
});

describe('consoleRowLabel', () => {
  it('labels a triggered one-time alert "Fired" and other inactive alerts "Paused"', () => {
    expect(consoleRowLabel({ ...base, id: '1', is_active: false, trigger_count: 1, is_recurring: false }, 'Disabled')).toBe('Fired');
    expect(consoleRowLabel({ ...base, id: '2', is_active: false, trigger_count: 3, is_recurring: true }, 'Disabled')).toBe('Paused');
    expect(consoleRowLabel({ ...base, id: '3', is_active: false }, 'Disabled')).toBe('Paused');
    expect(consoleRowLabel({ ...base, id: '4', is_active: true }, 'Armed')).toBe('Armed');
  });
});

describe('buildAlertEdit', () => {
  const alert = { ...base, id: 'a1', is_active: true };
  it('builds a PUT body with the new name and level', () => {
    expect(buildAlertEdit(alert, { name: ' AAPL breakout ', level: '210.5' }))
      .toEqual({ ok: true, body: { id: 'a1', name: 'AAPL breakout', conditionValue: 210.5 } });
  });
  it('rejects a blank, zero or non-numeric level', () => {
    expect(buildAlertEdit(alert, { name: 'x', level: '' }).ok).toBe(false);
    expect(buildAlertEdit(alert, { name: 'x', level: '0' }).ok).toBe(false);
    expect(buildAlertEdit(alert, { name: 'x', level: 'abc' }).ok).toBe(false);
  });
  it('only edits the name for smart and multi-condition alerts', () => {
    const smart = { ...base, id: 's1', is_active: true, condition_type: 'oi_surge', is_smart_alert: true };
    expect(canEditLevel(smart)).toBe(false);
    expect(buildAlertEdit(smart, { name: 'OI', level: '' })).toEqual({ ok: true, body: { id: 's1', name: 'OI' } });
    expect(canEditLevel({ ...base, id: 'm', is_active: false, is_multi_condition: true })).toBe(false);
    expect(canEditLevel({ ...base, id: 'p', is_active: true, condition_type: 'percent_change_down' })).toBe(true);
  });
});

describe('symbolFromQuery', () => {
  it('accepts ticker-like symbols and rejects junk', () => {
    expect(symbolFromQuery('aapl')).toBe('AAPL');
    expect(symbolFromQuery('BRK.B')).toBe('BRK.B');
    expect(symbolFromQuery('EUR/USD')).toBe('EUR/USD');
    expect(symbolFromQuery('')).toBeNull();
    expect(symbolFromQuery(null)).toBeNull();
    expect(symbolFromQuery('<script>')).toBeNull();
    expect(symbolFromQuery('X'.repeat(25))).toBeNull();
  });
});

describe('alerts page wiring', () => {
  const src = readFileSync(resolve(__dirname, '../app/tools/alerts/page.tsx'), 'utf8');
  it('lists all alerts in the console, not only active ones', () => {
    expect(src).toContain('consoleListAlerts(alerts).filter');
    expect(src).not.toContain('const filtered = activeAlerts.filter');
  });
  it('Edit fills the form with the alert and saves via PUT', () => {
    expect(src).toMatch(/setEditForm\(\{ name: alert\.name \?\? '', level: String\(alert\.condition_value/);
    expect(src).toContain('buildAlertEdit(alert, editForm)');
  });
  it('reads ?symbol= and passes it to the new-alert form', () => {
    expect(src).toContain("symbolFromQuery(searchParams?.get('symbol'))");
    expect(src).toContain('prefilledSymbol={prefillSymbol ?? undefined}');
  });
});
