import { isUsRegularSessionOpen, lastCompletedUsSessionDate, nyDateTime, toYmd } from '@/lib/time/usSession';

const numberOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(typeof v === 'string' ? v.replace(/%$/, '') : v);
  return Number.isFinite(n) ? n : null;
};
const iso = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const ms = v instanceof Date ? v.getTime() : typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
/** One public contract across cache writers and DB rows. Retrieval time is never quote observation time. */
export function serializePublicQuote(input: Record<string, any>, now = Date.now()) {
  const r = input['Global Quote'] ?? input;
  const crypto = r.assetClass === 'crypto' || r.asset_class === 'crypto' || r.changeBasis === 'rolling_24h' || String(r.source ?? '').startsWith('coingecko');
  const assetClass = crypto ? 'crypto' : r.assetClass ?? r.asset_class ?? 'unknown';
  const observedAt = iso(r.observedAt ?? r.observed_at ?? r.updatedAt ?? r.timestamp);
  const latestDay = toYmd(r.latestDay ?? r.latest_trading_day ?? r['07. latest trading day']);
  const ageMs = observedAt ? now - Date.parse(observedAt) : null;
  const price = numberOrNull(r.price ?? r['05. price']);
  const stale = price == null || price <= 0 || (assetClass === 'equity' && !isUsRegularSessionOpen(now)
    ? !latestDay || latestDay < lastCompletedUsSessionDate(now) || latestDay > nyDateTime(now).ymd
    : ageMs == null || ageMs < -60000 || ageMs > 15 * 60000);
  const prior = numberOrNull(r.prevClose ?? r.prev_close ?? r['08. previous close']);
  return {
    price, open:numberOrNull(r.open ?? r['02. open']), high:numberOrNull(r.high ?? r['03. high']), low:numberOrNull(r.low ?? r['04. low']),
    prevClose: assetClass === 'equity' ? prior : null,
    price24hAgo: crypto ? numberOrNull(r.price24hAgo ?? prior) : null,
    volume:numberOrNull(r.volume ?? r['06. volume']),
    changeAmt:numberOrNull(r.changeAmt ?? r.change_amount ?? r['09. change']),
    changePct:numberOrNull(r.changePct ?? r.change_percent ?? r['10. change percent']),
    assetClass, changeBasis:crypto ? 'rolling_24h' : assetClass === 'equity' ? 'previous_session_close' : 'unknown',
    latestDay, observedAt, updatedAt:observedAt, fetchedAt:iso(r.fetchedAt ?? r.fetched_at),
    stale, ageSeconds:ageMs == null ? null : Math.max(0,Math.floor(ageMs/1000)),
  };
}
