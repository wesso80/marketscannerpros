/** Display only: never use formatted text as a calculation input. */
export function compactAmount(value: number, currency = false): string {
  if (!Number.isFinite(value)) return 'Not collected';
  const abs = Math.abs(value);
  const unit = abs >= 1e12 ? [1e12, 'T'] as const : abs >= 1e9 ? [1e9, 'B'] as const : abs >= 1e6 ? [1e6, 'M'] as const : abs >= 1e3 ? [1e3, 'K'] as const : null;
  const amount = unit ? (abs / unit[0]).toFixed(2) + unit[1] : abs.toLocaleString('en-US', { minimumFractionDigits: currency ? 2 : 0, maximumFractionDigits: 2 });
  return `${value < 0 ? '-' : ''}${currency ? '$' : ''}${amount}`;
}
