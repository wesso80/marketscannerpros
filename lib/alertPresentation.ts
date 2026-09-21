export function alertThreshold(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function alertConditionLabel(type: string, value: unknown): string {
  const label = type.replaceAll('_', ' ');
  const threshold = alertThreshold(value);
  if (type.includes('cross')) return label;
  if (threshold == null || (type.startsWith('price_') && threshold <= 0)) return `${label} · threshold unavailable`;
  const unit = type.startsWith('price_') ? '$' : '';
  const suffix = /percent|funding|oi_change/.test(type) ? '%' : type === 'volume_spike' ? '×' : '';
  return `${label} ${unit}${threshold.toLocaleString('en-US', { maximumFractionDigits: 8 })}${suffix}`;
}
