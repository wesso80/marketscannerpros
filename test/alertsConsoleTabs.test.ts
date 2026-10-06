import { describe, expect, it } from 'vitest';
import { consoleAlertType, isSmartConsoleAlert, opensSmartTabFirst } from '@/lib/alerts/consoleStatus';

const basic = { condition_type: 'price_above', is_smart_alert: false };
const flippedPrice = { condition_type: 'price_below', is_smart_alert: false };
const smartFlag = { condition_type: 'price_above', is_smart_alert: true };
const strategy = { condition_type: 'strategy_breakout', is_smart_alert: false };
const scanner = { condition_type: 'scanner_squeeze', is_smart_alert: false };
const multi = { condition_type: 'price_above', is_multi_condition: true };

describe('console badge uses isSmartConsoleAlert', () => {
  it('labels basic, smart, strategy, scanner and multi rows', () => {
    expect(consoleAlertType(basic)).toBe('Basic');
    expect(consoleAlertType(flippedPrice)).toBe('Basic');
    expect(consoleAlertType(smartFlag)).toBe('Strategy');
    expect(consoleAlertType(strategy)).toBe('Strategy');
    expect(consoleAlertType(scanner)).toBe('Strategy');
    expect(consoleAlertType(multi)).toBe('Multi');
  });

  it('never disagrees with the Smart grouping', () => {
    for (const row of [basic, flippedPrice, smartFlag, strategy, scanner]) {
      expect(consoleAlertType(row) === 'Strategy').toBe(isSmartConsoleAlert(row));
    }
  });
});

describe('auto-tab opens Smart only when Basic would be empty', () => {
  it('stays on Basic when any basic row exists, including a flipped price row', () => {
    expect(opensSmartTabFirst([smartFlag, basic], 0)).toBe(false);
    expect(opensSmartTabFirst([strategy, flippedPrice], 0)).toBe(false);
  });

  it('opens Smart when every active alert is smart, strategy or scanner and there are no multi alerts', () => {
    expect(opensSmartTabFirst([smartFlag, strategy, scanner], 0)).toBe(true);
  });

  it('stays put when multi alerts exist or nothing is active', () => {
    expect(opensSmartTabFirst([smartFlag], 1)).toBe(false);
    expect(opensSmartTabFirst([], 0)).toBe(false);
  });

  it('does not count a multi row as basic', () => {
    expect(opensSmartTabFirst([multi, smartFlag], 0)).toBe(true);
  });
});
