export type ParsedTimeframe = {
  raw: string;
  normalized: string;
  quantity: number;
  unit: 'minute' | 'hour' | 'day';
  totalMinutes: number;
  kind: 'intraday' | 'daily';
};

const LEGACY_TIMEFRAMES = new Set(['1min', '5min', '15min', '30min', '60min', 'daily']);

export function parseTimeframe(raw: string): ParsedTimeframe | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;

  if (value === 'daily') {
    return {
      raw,
      normalized: 'daily',
      quantity: 1,
      unit: 'day',
      totalMinutes: 1440,
      kind: 'daily',
    };
  }

  if (LEGACY_TIMEFRAMES.has(value)) {
    const quantity = Number.parseInt(value.replace('min', ''), 10);
    return {
      raw,
      normalized: value,
      quantity,
      unit: 'minute',
      totalMinutes: quantity,
      kind: 'intraday',
    };
  }

  const match = /^(\d+)\s*(min|m|hour|h|day|d)$/i.exec(value);
  if (!match) return null;

  const quantity = Number.parseInt(match[1], 10);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unitToken = match[2].toLowerCase();
  const unit: 'minute' | 'hour' | 'day' = unitToken === 'min' || unitToken === 'm'
    ? 'minute'
    : unitToken === 'hour' || unitToken === 'h'
      ? 'hour'
      : 'day';

  const totalMinutes = unit === 'minute'
    ? quantity
    : unit === 'hour'
      ? quantity * 60
      : quantity * 1440;

  const normalized = unit === 'minute'
    ? `${quantity}min`
    : unit === 'hour'
      ? `${quantity}hour`
      : quantity === 1
        ? 'daily'
        : `${quantity}day`;

  return {
    raw,
    normalized,
    quantity,
    unit,
    totalMinutes,
    kind: totalMinutes >= 1440 ? 'daily' : 'intraday',
  };
}