import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyAvEquitySymbol,
  partitionAvEquitySymbols,
  resetUnsupportedAvLogForTests,
  unsupportedAvLogOnce,
} from '@/lib/worker/unsupportedAvSymbol';

const REPORTED = ['NV', 'GOL', 'ALBT', 'X', 'I', '/NQ'] as const;

describe('Alpha Vantage equity symbols', () => {
  beforeEach(() => resetUnsupportedAvLogForTests());

  it('skips the reported symbols before a call and keeps real equities', () => {
    const mixed = ['AAPL', 'NV', 'a', 'H', 'GOL', '/NQ', 'ALBT', 'X', 'I', 'BRK.B', 'SPY', 'nq'];
    const parted = partitionAvEquitySymbols(mixed);
    expect(parted.fetch).toEqual(['AAPL', 'A', 'H', 'BRK.B', 'SPY', 'NQ']);
    expect(parted.skipped.map((row) => row.symbol)).toEqual(['NV', 'GOL', '/NQ', 'ALBT', 'X', 'I']);
  });

  it('classifies each reported symbol by its form', () => {
    expect(classifyAvEquitySymbol('NV')).toMatchObject({ action: 'skip', symbol: 'NV', kind: 'known_invalid' });
    expect(classifyAvEquitySymbol('GOL')).toMatchObject({ action: 'skip', symbol: 'GOL', kind: 'known_invalid' });
    expect(classifyAvEquitySymbol('ALBT')).toMatchObject({ action: 'skip', symbol: 'ALBT', kind: 'known_invalid' });
    expect(classifyAvEquitySymbol('X')).toMatchObject({ action: 'skip', symbol: 'X', kind: 'single_letter' });
    expect(classifyAvEquitySymbol('I')).toMatchObject({ action: 'skip', symbol: 'I', kind: 'single_letter' });
    expect(classifyAvEquitySymbol('/NQ')).toMatchObject({ action: 'skip', symbol: '/NQ', kind: 'future' });
    expect(classifyAvEquitySymbol('  /nq ')).toMatchObject({ action: 'skip', symbol: '/NQ', kind: 'future' });
    expect(classifyAvEquitySymbol('%2FNQ')).toMatchObject({ action: 'skip', kind: 'bad_encoding' });
    expect(classifyAvEquitySymbol('A')).toMatchObject({ action: 'fetch', symbol: 'A' });
    expect(classifyAvEquitySymbol('H')).toMatchObject({ action: 'fetch', symbol: 'H' });
    expect(classifyAvEquitySymbol('NQ1')).toMatchObject({ action: 'skip', kind: 'future' });
    expect(classifyAvEquitySymbol('SPX')).toMatchObject({ action: 'skip', kind: 'known_invalid' });
  });

  it('logs each skipped symbol once', () => {
    const first = REPORTED.map((symbol) => unsupportedAvLogOnce(classifyAvEquitySymbol(symbol)));
    const second = REPORTED.map((symbol) => unsupportedAvLogOnce(classifyAvEquitySymbol(symbol)));
    expect(first.every((line) => typeof line === 'string' && line!.startsWith('[worker] skip '))).toBe(true);
    expect(second).toEqual([null, null, null, null, null, null]);
    expect(first.find((line) => line!.includes('/NQ'))).toMatch(/futures/);
    expect(first.find((line) => line!.includes(' X:'))).toMatch(/single-letter/);
  });
});
