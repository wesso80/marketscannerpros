import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALERT_LIMITS } from '@/lib/alerts/planLimits';
import { isSmartConsoleAlert, smartAlertShare } from '@/lib/alerts/consoleStatus';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const base = { condition_value: 1, is_active: true };

describe('TR-25 remaining alert details', () => {
  it('Plan & Limits shows the enforced caps, not ∞', () => {
    expect(ALERT_LIMITS).toEqual({ free: 3, pro: 999 });
    const page = read('app/tools/alerts/page.tsx');
    expect(page).not.toContain('>∞<');
    expect(page).toContain('{ALERT_LIMITS.pro} active alerts');
    expect(page).toContain('{ALERT_LIMITS.free} active alerts');
  });

  it('push notifications are tagged per alert, so alerts on one symbol do not replace each other', () => {
    expect(read('app/api/alerts/check/route.ts')).toContain('tag: `price-alert-${alert.id}`');
    expect(read('app/api/alerts/check/route.ts')).not.toContain('tag: `price-alert-${alert.symbol}`');
    expect(read('app/api/alerts/smart-check/route.ts')).toContain('tag: `smart-alert-${alert.id}`');
    expect(read('app/api/alerts/smart-check/route.ts')).not.toContain('tag: `smart-alert-${alert.condition_type}`');
  });

  it('Smart % counts smart/strategy alerts among checked active alerts only', () => {
    expect(isSmartConsoleAlert({ condition_type: 'strategy_breakout' })).toBe(true);
    expect(isSmartConsoleAlert({ condition_type: 'scanner_signal' })).toBe(true);
    expect(isSmartConsoleAlert({ condition_type: 'price_above', is_smart_alert: true })).toBe(true);
    expect(isSmartConsoleAlert({ condition_type: 'price_above' })).toBe(false);

    const alerts = [
      { ...base, condition_type: 'price_above' },
      { ...base, condition_type: 'strategy_breakout' },
      { ...base, condition_type: 'price_above', is_multi_condition: true }, // not checked: ignored
      { ...base, condition_type: 'scanner_signal', is_active: false }, // inactive: ignored
    ];
    expect(smartAlertShare(alerts)).toBe(50);
    expect(smartAlertShare([])).toBe(0);
    expect(smartAlertShare([{ ...base, condition_type: 'price_above', is_multi_condition: true }])).toBe(0);
    expect(read('app/tools/alerts/page.tsx')).toContain("detail: 'Smart/strategy share of checked alerts'");
  });
});
