import type { TradeRowModel } from '@/types/journal';

/** "$1,234.56" / "-$1,234.56" (TR-12: the minus goes before the dollar sign). */
export function formatUsd(value: number, digits = 2): string {
  const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return value < 0 && Number(abs.replace(/,/g, '')) !== 0 ? `-$${abs}` : `$${abs}`;
}

/** "+$12.00" / "-$12.00" / "$0.00" for P&L where a plus sign helps. */
export function formatSignedUsd(value: number, digits = 2): string {
  const text = formatUsd(value, digits);
  return value > 0 && text !== `$${(0).toFixed(digits)}` ? `+${text}` : text;
}

/** "+1.25%" / "-0.40%"; missing → "Unavailable" with no stray sign. */
export function formatSignedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

/** Local time with the zone label, e.g. "26 Sep, 3:12 AM AEST". */
export function formatLocalTime(iso: string, timeZone?: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  });
}

type Mark = NonNullable<TradeRowModel['mark']> & { tradingDay?: string | null };

/**
 * TR-13: when the mark was observed, in the reader's local time. Crypto quotes carry a provider time; stock quotes
 * carry only the trading day (plus when we fetched it); option marks are per session.
 */
export function markTimeLabel(mark: Mark | undefined, timeZone?: string): string {
  if (!mark) return 'No current price';
  if (mark.asOfDate) return `${mark.basis ?? 'EOD'} option mark for the ${mark.asOfDate} session`;
  if (mark.observedAt) {
    const local = formatLocalTime(mark.observedAt, timeZone);
    if (local) return `Price as of ${local}`;
  }
  const fetched = mark.retrievedAt ? formatLocalTime(mark.retrievedAt, timeZone) : null;
  if (mark.tradingDay) return `Last price for the ${mark.tradingDay} trading day${fetched ? ` (fetched ${fetched})` : ''}`;
  return fetched ? `Provider gave no price time (fetched ${fetched})` : 'Provider gave no price time';
}

/** TR-31: "190 Call · exp 2026-10-17" for recorded option contracts; null otherwise. */
export function optionContractLabel(trade: Pick<TradeRowModel, 'tradeType' | 'option'>): string | null {
  if (trade.tradeType !== 'Options' || !trade.option) return null;
  const { right, strike, expiration } = trade.option;
  const parts = [
    [strike != null ? String(strike) : null, right ? (right === 'call' ? 'Call' : 'Put') : null].filter(Boolean).join(' '),
    expiration ? `exp ${expiration}` : null,
  ].filter((p) => p && String(p).length > 0);
  return parts.length ? parts.join(' · ') : 'Contract details not recorded';
}

/** TR-29: comma/space separated tags → clean list (max 10, 32 chars each, no duplicates). */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const tag = part.trim().replace(/^#/, '').slice(0, 32);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}
