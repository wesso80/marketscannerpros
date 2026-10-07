/**
 * Alpha Vantage INDEX_DATA parsing. The market regime no longer calls INDEX_DATA for VIX
 * (this plan is not entitled). That chain is covered in regimeVixCboe.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { parseIndexDataCloses } from '@/lib/macro/avIndexData';

const FRI = '2026-09-25';

describe('INDEX_DATA parsing', () => {
  it('reads the documented { data: [{ date, close }] } shape, newest first, skipping bad rows', () => {
    const rows = parseIndexDataCloses({ data: [{ date: '2026-09-24', close: '15.10' }, { date: FRI, close: '14.87' }, { date: 'x', close: '1' }, { date: '2026-09-23', close: '' }] });
    expect(rows).toEqual([{ on: FRI, value: 14.87 }, { on: '2026-09-24', value: 15.1 }]);
    expect(parseIndexDataCloses({ Information: 'rate limit' })).toEqual([]);
    expect(parseIndexDataCloses(null)).toEqual([]);
  });
});
