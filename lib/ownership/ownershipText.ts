/** Plain-language lines for the Golden Egg ownership panel (MV-5). Descriptive only; no buy/sell advice. */
import type { CongressSummary, InsiderSummary, InstitutionalSummary } from './avOwnership';

const compact = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  return n < 0 ? `-${s}` : s;
};
export const usd = (n: number) => (n < 0 ? `-$${compact(-n)}` : `$${compact(n)}`);
export const shares = (n: number) => compact(n);
const signed = (n: number, f: (x: number) => string) => (n > 0 ? `+${f(n)}` : f(n));

export function insiderHeadline(s: InsiderSummary): string {
  const { buys, sells } = s;
  if (buys.count === 0 && sells.count === 0) {
    return `No priced insider buys or sells reported in the last ${s.windowDays} days${s.awards.count ? ` (${s.awards.count} grant/award rows)` : ''}.`;
  }
  const lean = buys.value > sells.value ? 'net buying' : sells.value > buys.value ? 'net selling' : 'balanced';
  return `Last ${s.windowDays} days: ${buys.count} buy${buys.count === 1 ? '' : 's'} (${shares(buys.shares)} sh, ${usd(buys.value)}) vs ${sells.count} sell${sells.count === 1 ? '' : 's'} (${shares(sells.shares)} sh, ${usd(sells.value)}), ${lean} of ${usd(Math.abs(s.netValue))}.`;
}

export function congressHeadline(s: CongressSummary): string {
  if (s.totalTrades === 0) return 'No congressional trades disclosed for this symbol.';
  const { buys, sells, other } = s.last12m;
  const n = buys + sells + other;
  if (n === 0) return `No disclosed trades in the last 12 months (latest ${s.lastTradeDate}).`;
  return `Last 12 months: ${n} disclosed trade${n === 1 ? '' : 's'} (${buys} buy, ${sells} sell${other ? `, ${other} other` : ''}).`;
}

export const amountRange = (min: number | null, max: number | null) =>
  min != null && max != null ? `${usd(min)}–${usd(max)}` : min != null ? `${usd(min)}+` : max != null ? `up to ${usd(max)}` : 'amount n/a';

export function institutionalHeadline(s: InstitutionalSummary): string {
  const parts: string[] = [];
  if (s.ownershipPct != null) parts.push(`${s.ownershipPct.toFixed(0)}% institutional ownership`);
  if (s.holders != null) parts.push(`${s.holders.toLocaleString('en-US')} holders`);
  if (s.netSharesChanged != null) parts.push(`net ${signed(s.netSharesChanged, shares)} sh${s.netSharesChangedPct != null ? ` (${signed(s.netSharesChangedPct, (x) => `${x.toFixed(1)}%`)})` : ''} vs prior quarter`);
  const head = parts.length ? parts.join(' · ') : 'Institutional holdings reported';
  return s.reportPeriod ? `${head} — filings as of ${s.reportPeriod}.` : `${head}.`;
}
