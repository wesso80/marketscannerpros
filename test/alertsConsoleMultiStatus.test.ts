import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkedActiveAlerts, deriveStatus, legacyMultiAlerts } from '@/lib/alerts/consoleStatus';

const base = { condition_type: 'price_above', condition_value: 100, is_active: true };

describe('TR-25: Alert radar console status for multi-condition alerts', () => {
  it('shows multi-condition alerts as "Not checked", whether armed or paused', () => {
    expect(deriveStatus({ ...base, condition_type: 'multi', is_multi_condition: true })).toBe('Not checked');
    expect(deriveStatus({ ...base, condition_type: 'multi', is_multi_condition: true, is_active: false })).toBe('Not checked');
  });

  it('keeps the existing statuses for checked alerts', () => {
    const now = Date.parse('2026-09-26T00:00:00Z');
    expect(deriveStatus(base, now)).toBe('Armed');
    expect(deriveStatus({ ...base, is_active: false }, now)).toBe('Disabled');
    expect(deriveStatus({ ...base, condition_value: 0 }, now)).toBe('Incomplete');
    expect(deriveStatus({ ...base, triggered_at: '2026-09-25T23:50:00Z', cooldown_minutes: 60 }, now)).toBe('Cooldown');
    expect(deriveStatus({ ...base, triggered_at: '2026-09-25T20:00:00Z', cooldown_minutes: 60 }, now)).toBe('Armed');
  });

  it('does not count multi-condition alerts as active, but still lists them', () => {
    const alerts = [
      { ...base, id: 'a' },
      { ...base, id: 'b', is_active: false },
      { ...base, id: 'm', condition_type: 'multi', is_multi_condition: true },
    ];
    expect(checkedActiveAlerts(alerts).map((a) => a.id)).toEqual(['a']);
    expect(legacyMultiAlerts(alerts).map((a) => a.id)).toEqual(['m']);
  });

  it('the console no longer offers a Multi tab or opens it from New alert', () => {
    const src = readFileSync(resolve(__dirname, '../app/tools/alerts/page.tsx'), 'utf8');
    expect(src).not.toMatch(/setActiveZone4Tab\('multi'\)/);
    expect(src).not.toMatch(/>\s*Multi\s*</);
    expect(src).toMatch(/from '@\/lib\/alerts\/consoleStatus'/);
    expect(src).toMatch(/status === 'Not checked'/);
    expect(src).not.toMatch(/function deriveStatus/);
  });
});
