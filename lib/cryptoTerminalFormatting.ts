const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const formatCryptoNumber = (value: unknown, digits = 2) => finite(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
export function formatCryptoUsd(value: unknown): string {
  if (!finite(value)) return '—';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}
export const formatCryptoPercent = (value: unknown) => finite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
export const formatCryptoFunding = (value: unknown) => finite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(4)}%` : '—';
