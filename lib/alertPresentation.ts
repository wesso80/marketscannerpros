export function alertThreshold(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function alertConditionLabel(type: string, value: unknown): string {
  const labels: Record<string,string> = {
    scanner_buy_signal:'RSI above',scanner_sell_signal:'RSI below',
    scanner_bullish_flip:'scanner upside change',scanner_bearish_flip:'scanner downside change',
    strategy_buy_signal:'strategy upside condition',strategy_sell_signal:'strategy downside condition',
    oi_divergence_bull:'open interest up · price down',oi_divergence_bear:'open interest down · price up',
    ls_ratio_high:'position ratio above',ls_ratio_low:'position ratio below',
  };
  const label = labels[type] ?? type.replaceAll('_', ' ').toLowerCase();
  const threshold = alertThreshold(value);
  if (type.includes('cross')) return label;
  if (threshold == null || (type.startsWith('price_') && threshold <= 0)) return `${label} · threshold not recorded`;
  const unit = type.startsWith('price_') ? '$' : '';
  const suffix = /percent|funding|oi_change/.test(type) ? '%' : type === 'volume_spike' ? '×' : '';
  return `${label} ${unit}${threshold.toLocaleString('en-US', { maximumFractionDigits: Math.abs(threshold) >= 1 ? 2 : 8 })}${suffix}`;
}

/** Display-only cleanup for recorded condition codes; stored evidence is unchanged. */
export function alertHistoryLabel(value: string | null | undefined): string {
  if (!value) return 'Condition not recorded';
  return value.replace(/[A-Z]+_[A-Z_]+/g, code => code.toLowerCase().replaceAll('_', ' '))
    .replace(/\b(bullish|long|buy)\b/gi, 'upside')
    .replace(/\b(bearish|short|sell)\b/gi, 'downside')
    .replace(/\bUNKNOWN\b|\bUnavailable\b|\bN\/A\b/g, 'Not collected');
}
