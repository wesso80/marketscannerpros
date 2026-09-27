import { describe, expect, it, vi } from 'vitest';
import { persistDerivativeSnapshots } from '@/lib/crypto/derivativesSnapshots';

const coin = (symbol = 'BTC') => ({
  symbol, aggregatedFunding: { fundingRatePct: null, annualised: null, sentiment: 'Unavailable', exchangeCount: 3 },
  aggregatedOI: { totalOI: 1234, totalVolume24h: 4321 }, price: 100, change24h: 0,
});

describe('derivatives snapshot persistence', () => {
  it('saves all coins with unavailable funding within the existing varchar(10) contract', async () => {
    const writer = vi.fn(async (_sql: string, values: unknown[]) => {
      if (typeof values[3] === 'string' && values[3].length > 10) throw new Error('varchar(10)');
    });
    expect(await persistDerivativeSnapshots({ coins: [coin(), coin('ETH'), coin('SOL')] }, writer))
      .toMatchObject({ status: 'saved', expected: 3, saved: 3, failed: 0 });
    expect(writer.mock.calls[0][1]).toEqual(['BTC', null, null, null, 1234, 4321, 3, 100, 0]);
  });
  it('preserves measured zero funding and neutral sentiment', async () => {
    const writer = vi.fn(async (_sql: string, _values: unknown[]) => {});
    await persistDerivativeSnapshots({ coins: [{ ...coin(), aggregatedFunding: {
      fundingRatePct: 0, annualised: 0, sentiment: 'Neutral', exchangeCount: 3,
    } }] }, writer);
    expect(writer.mock.calls[0][1].slice(1, 4)).toEqual([0, 0, 'Neutral']);
  });
  it('honours explicit missing funding and rejects non-finite numbers', async () => {
    const writer = vi.fn(async (_sql: string, _values: unknown[]) => {});
    await persistDerivativeSnapshots({ coins: [{ ...coin(), price: Infinity, aggregatedFunding: {
      fundingRatePct: 0, annualised: 0, sentiment: 'Neutral', fundingRateMissing: true,
    } }] }, writer);
    expect(writer.mock.calls[0][1].slice(1, 4)).toEqual([null, null, null]);
    expect(writer.mock.calls[0][1][7]).toBeNull();
  });
  it('continues after a failed row and reports partial persistence', async () => {
    const writer = vi.fn(async (_sql: string, values: unknown[]) => {
      if (values[0] === 'ETH') throw new Error('database failure');
    });
    expect(await persistDerivativeSnapshots({ coins: [coin(), coin('ETH'), coin('SOL')] }, writer))
      .toMatchObject({ status: 'partial', expected: 3, saved: 2, failed: 1, failedSymbols: ['ETH'] });
    expect(writer).toHaveBeenCalledTimes(3);
  });
  it('does not report a missing aggregate as successfully saved', async () => {
    const writer = vi.fn();
    expect(await persistDerivativeSnapshots(null, writer)).toMatchObject({ status: 'unavailable', saved: 0 });
    expect(writer).not.toHaveBeenCalled();
  });
});
