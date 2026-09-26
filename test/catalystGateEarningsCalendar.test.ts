import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));

const CSV = readFileSync(resolve(__dirname, 'fixtures/earningsCalendar3month.csv'), 'utf8');
// Sat 26 Sep 2026 08:00 UTC
const NOW = Date.parse('2026-09-26T08:00:00Z');

describe('quant catalyst gate reads the EARNINGS_CALENDAR CSV', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => CSV }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('calls EARNINGS_CALENDAR with a 3-month horizon (not symbol-less EARNINGS)', async () => {
    const { checkCatalystProximity } = await import('@/lib/quant/catalystGate');
    await checkCatalystProximity(['AAPL']);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('function')).toBe('EARNINGS_CALENDAR');
    expect(url.searchParams.get('horizon')).toBe('3month');
  });

  it('populates proximity from the nearest report date, including quoted names with commas', async () => {
    const { checkCatalystProximity, shouldBlockForCatalyst } = await import('@/lib/quant/catalystGate');
    const map = await checkCatalystProximity(['AAPL', 'FLG', 'MSFT', 'NVDA', 'TSLA', 'BAD']);
    expect(map.get('AAPL')).toMatchObject({ hasEarnings: true, daysToEarnings: 2, severity: 'EXTREME' });
    expect(map.get('FLG')).toMatchObject({ hasEarnings: true, daysToEarnings: 5, severity: 'HIGH' });
    expect(map.get('MSFT')).toMatchObject({ hasEarnings: true, daysToEarnings: 12, severity: 'MEDIUM' });
    expect(map.get('NVDA')).toMatchObject({ hasEarnings: true, severity: 'LOW' });
    expect(map.get('TSLA')).toMatchObject({ hasEarnings: false, daysToEarnings: null });
    expect(map.get('BAD')).toMatchObject({ hasEarnings: false });

    expect(shouldBlockForCatalyst(map.get('AAPL'))).toBe(true);
    expect(shouldBlockForCatalyst(map.get('FLG'))).toBe(false);
    expect(shouldBlockForCatalyst(map.get('FLG'), 5)).toBe(true);
    expect(shouldBlockForCatalyst(map.get('TSLA'))).toBe(false);
  });

  it('does not cache "no earnings" when Alpha Vantage returns a JSON note instead of the calendar', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, text: async () => '{"Information":"rate limit"}' }));
    const { checkCatalystProximity } = await import('@/lib/quant/catalystGate');
    expect((await checkCatalystProximity(['AAPL'])).get('AAPL')).toMatchObject({ hasEarnings: false });
    // Next call refetches (nothing was cached) and now sees the calendar.
    expect((await checkCatalystProximity(['AAPL'])).get('AAPL')).toMatchObject({ hasEarnings: true, daysToEarnings: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
