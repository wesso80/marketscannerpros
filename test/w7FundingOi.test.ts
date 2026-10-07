import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/crypto/breakdown/cache', () => ({ cachedPart: async (_key: string, _ttl: number, _budget: number, load: () => Promise<unknown>) => load() }));
import { loadOkx, oiChange } from '@/lib/crypto/breakdown/okx';
const now = Date.parse('2026-10-08T01:00:00Z');
const asOf = new Date(now).toISOString(), target = now - 24 * 3600000;
const row = (ts: number, oi: unknown) => [String(ts), '0', '0', oi];
afterEach(() => vi.unstubAllGlobals());
describe('W7 funding settlement and OI missingness', () => {
  it('shows the matching current-period settlement, not the following funding time', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input);
      let data: unknown[];
      if (url.pathname.endsWith('/instruments')) data = [{ instId: 'BTC-USDT-SWAP' }];
      else if (url.pathname.endsWith('/funding-rate')) data = [
        { instId: 'OTHER-USDT-SWAP', fundingRate: '0.001', fundingTime: String(now + 1000), nextFundingTime: String(now + 2000), ts: String(now) },
        { instId: 'BTC-USDT-SWAP', fundingRate: '0.0001', fundingTime: String(now + 7 * 3600000), nextFundingTime: String(now + 15 * 3600000), ts: String(now) },
      ];
      else if (url.pathname.endsWith('/open-interest')) data = [{ oiUsd: '0', oiCcy: '0', ts: String(now) }];
      else if (url.pathname.endsWith('/open-interest-history')) data = [row(target, 100)];
      else if (url.pathname.endsWith('/ticker')) data = [{ volCcy24h: '10', ts: String(now) }];
      else throw new Error('Unexpected fixture URL');
      return { ok: true, json: async () => ({ code: '0', data }) };
    }));
    const result = await loadOkx('BTC', now);
    const metrics = result.value.metrics;
    expect(metrics.find(m => m.label === 'Next funding time')?.value).toBe('2026-10-08T08:00:00.000Z');
    expect(metrics.find(m => m.label === 'Funding interval (hours)')?.value).toBe(8);
    expect(metrics.find(m => m.label === 'Open interest (USD)')?.value).toBe(0);
    expect(metrics.find(m => m.label === 'Open interest change, 24h')?.value).toBe(-100);
    expect(metrics.find(m => m.label === 'Open interest change, 7d')?.value).toBeNull();
  });
  it('zero current OI with a positive baseline means minus 100 percent', () => expect(oiChange(0, asOf, [row(target, 100)], 24)).toBe(-100));
  it.each([0, 100])('zero baseline with current %s is missing, without skipping to an older positive value', current => {
    expect(oiChange(current, asOf, [row(target - 3600000, 100), row(target, 0)], 24)).toBeNull();
  });
  it('insufficient or stale history stays missing', () => {
    expect(oiChange(100, asOf, [], 24)).toBeNull();
    expect(oiChange(100, asOf, [row(target - 3600001, 100)], 24)).toBeNull();
    expect(oiChange(100, asOf, [row(target + 1, 100)], 24)).toBeNull();
    expect(oiChange(100, asOf, [row(target, 100)], 168)).toBeNull();
  });
  it('missing or invalid current observation stays missing', () => {
    for (const value of [null, -1, NaN, Infinity]) expect(oiChange(value, asOf, [row(target, 100)], 24)).toBeNull();
    expect(oiChange(100, 'invalid', [row(target, 100)], 24)).toBeNull();
  });
});
