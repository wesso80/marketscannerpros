import { describe, expect, it } from 'vitest';
import { formatMoney, formatSignedMoney } from '@/lib/portfolio/formatMoney';

describe('portfolio formatMoney (TR-2)', () => {
  it('keeps the minus sign on negative amounts', () => {
    expect(formatMoney(-1234.56, 'en-US')).toBe('-$1,234.56');
    expect(formatMoney(-0.5, 'en-US')).toBe('-$0.5');
  });

  it('formats positive amounts and zero without a sign', () => {
    expect(formatMoney(1234.56, 'en-US')).toBe('$1,234.56');
    expect(formatMoney(0, 'en-US')).toBe('$0');
  });

  it('never shows "-$0" for values that round to zero', () => {
    expect(formatMoney(-0.001, 'en-US')).toBe('$0');
    expect(formatMoney(-0, 'en-US')).toBe('$0');
  });

  it('Account Equity = cash + open value shows negative when the sum is negative', () => {
    const availableCash = -5000;
    const portfolioValue = 3765.44;
    expect(formatMoney(availableCash + portfolioValue, 'en-US')).toBe('-$1,234.56');
  });
});

describe('portfolio formatSignedMoney', () => {
  it('always shows an explicit sign', () => {
    expect(formatSignedMoney(1234.56, 'en-US')).toBe('+$1,234.56');
    expect(formatSignedMoney(-1234.56, 'en-US')).toBe('-$1,234.56');
    expect(formatSignedMoney(0, 'en-US')).toBe('+$0');
    expect(formatSignedMoney(-0.001, 'en-US')).toBe('+$0');
  });
});
