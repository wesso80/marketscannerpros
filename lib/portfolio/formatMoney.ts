/**
 * Money formatters for the Portfolio page.
 *
 * `formatMoney` keeps the sign of the value: negative amounts render as
 * "-$1,234.56" and non-negative amounts as "$1,234.56". (It used to take
 * Math.abs, which made negative Account Equity / Expectancy look positive.)
 *
 * `formatSignedMoney` always shows an explicit sign: "+$1,234.56" / "-$1,234.56".
 *
 * Values that round to zero at 2 decimals never show a minus sign.
 * `locale` is only for tests; the page uses the browser default.
 */
function formatAbs(value: number, locale?: string): string {
  return Math.abs(value).toLocaleString(locale, { maximumFractionDigits: 2 });
}

function isNegativeAfterRounding(value: number): boolean {
  return Math.round(value * 100) < 0;
}

export function formatMoney(value: number, locale?: string): string {
  return `${isNegativeAfterRounding(value) ? '-' : ''}$${formatAbs(value, locale)}`;
}

export function formatSignedMoney(value: number, locale?: string): string {
  return `${isNegativeAfterRounding(value) ? '-' : '+'}$${formatAbs(value, locale)}`;
}
