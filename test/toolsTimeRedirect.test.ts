import { describe, expect, it, vi } from 'vitest';

// next/navigation's redirect() throws to stop rendering; the mock does the same with the URL.
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    throw new Error(`REDIRECT:${String(args[0])}`);
  },
}));

import Page from '@/app/tools/time/page';

async function target(params: Record<string, string | string[] | undefined>): Promise<string> {
  try {
    await Page({ searchParams: Promise.resolve(params) });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('REDIRECT:')) return msg.slice('REDIRECT:'.length);
    throw e;
  }
  throw new Error('no redirect');
}

describe('/tools/time (TR-33)', () => {
  it('sends Journal time links to the Terminal Time Confluence tab for the same symbol', async () => {
    expect(await target({ symbol: 'AAPL' })).toBe('/tools/terminal?tab=time-confluence&symbol=AAPL');
    expect(await target({ symbol: 'BTC-USD' })).toBe('/tools/terminal?tab=time-confluence&symbol=BTC-USD');
  });

  it('works with no symbol and ignores arrays and blanks', async () => {
    expect(await target({})).toBe('/tools/terminal?tab=time-confluence');
    expect(await target({ symbol: ['A', 'B'], timeframe: ' ' })).toBe('/tools/terminal?tab=time-confluence');
  });

  it('encodes the symbol and forwards type and timeframe', async () => {
    expect(await target({ symbol: 'BRK B&x=1', type: 'equity', timeframe: '1h' }))
      .toBe('/tools/terminal?tab=time-confluence&symbol=BRK+B%26x%3D1&type=equity&timeframe=1h');
  });
});
