import { describe, expect, it } from 'vitest';
import { formatCryptoNumber, formatCryptoUsd, formatCryptoPercent, formatCryptoFunding } from '@/lib/cryptoTerminalFormatting';
describe('derivatives formatting at the JSON boundary', () => {
  it.each([null, undefined, Number.NaN, Infinity, '', '0'])('renders unavailable evidence safely: %j', value => {
    for (const format of [formatCryptoNumber, formatCryptoUsd, formatCryptoPercent, formatCryptoFunding]) expect(format(value)).toBe('—');
  });
  it('preserves a genuine observed zero and the provider funding scale', () => {
    expect(formatCryptoFunding(0)).toBe('+0.0000%');
    expect(formatCryptoFunding(0.005)).toBe('+0.0050%');
    expect(formatCryptoUsd(0)).toBe('$0.00');
  });
});
