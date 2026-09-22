import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedBatch } from '../lib/scanner/boundedBatch';

afterEach(() => vi.useRealTimers());

describe('ranked scanner provider deadline', () => {
  it('returns 25 histories in five parallel waves instead of 25 serial waits', async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const work = boundedBatch(Array.from({ length: 25 }, (_, i) => i), async value => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 2000));
      active--;
      return value;
    }, { concurrency: 5, budgetMs: 22_000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await work).toEqual(Array.from({ length: 25 }, (_, value) => ({ status: 'fulfilled', value })));
    expect(peak).toBe(5);
    expect(active).toBe(0);
  });

  it('retains good symbols and reports hung, failed and unstarted symbols at the deadline', async () => {
    vi.useFakeTimers();
    let finishSlow!: (value: string) => void;
    const called: string[] = [];
    const work = boundedBatch(['good', 'bad', 'slow', 'pending'], async symbol => {
      called.push(symbol);
      if (symbol === 'bad') throw new Error('Provider unavailable');
      if (symbol === 'slow') return new Promise<string>(resolve => { finishSlow = resolve; });
      return symbol;
    }, { concurrency: 1, budgetMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const results = await work;
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'rejected', 'rejected']);
    expect(called).toEqual(['good', 'bad', 'slow']);
    finishSlow('late');
    await vi.runAllTimersAsync();
    expect(called).toEqual(['good', 'bad', 'slow']);
    expect(results[2].status).toBe('rejected');
  });

  it('starts no new provider work after the request budget is exhausted', async () => {
    const read = vi.fn();
    expect((await boundedBatch(['BTC'], read, { concurrency: 5, budgetMs: 0 }))[0].status).toBe('rejected');
    expect(read).not.toHaveBeenCalled();
  });
});
