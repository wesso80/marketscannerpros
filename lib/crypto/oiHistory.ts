import { getDerivativesTickers } from '@/lib/coingecko';
import { getCached, setCached } from '@/lib/redis';
import { buildOiObservation, compareOi24h, HOUR_MS, OI_METHOD, totalOiChange, type OiObservation } from './oiComparisons';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'NEAR', 'LTC', 'UNI', 'ATOM', 'ARB', 'OP', 'APT', 'TON', 'SHIB', 'TRX'];
const key = (hour: number) => `oi:observed-usd:v3:${hour}`;
type Comparison = OiObservation & ReturnType<typeof compareOi24h>;
let memo: { signature: string; until: number; promise: Promise<Comparison[]> } | null = null;

/** Three bounded hourly reads survive deploys and never use the legacy unversioned anchor or v2 snapshots (no per-contract data). */
export async function trackOiHistory(current: OiObservation[], now = Date.now()): Promise<Comparison[]> {
  const signature = JSON.stringify(current);
  if (memo?.signature === signature && now < memo.until) return memo.promise;
  const promise = (async () => {
    const hour = Math.floor(now / HOUR_MS);
    const stored = await Promise.all([23, 24, 25].map(age => getCached<OiObservation[]>(key(hour - age)).catch(() => null)));
    const history = stored.flatMap(rows => Array.isArray(rows) ? rows : []);
    const compared = current.map(coin => ({ ...coin, ...compareOi24h(coin, history, now) }));
    if (current.length) await setCached(key(hour), current, 48 * 3600).catch(() => {});
    return compared;
  })();
  memo = { signature, until: now + 300_000, promise };
  return promise;
}

export async function getOiEvidence() {
  const tickers = await getDerivativesTickers();
  const now = Date.now();
  const observations = SYMBOLS.flatMap(symbol => {
    const rows = (tickers ?? []).filter(t => t.contract_type === 'perpetual' && t.index_id?.toUpperCase() === symbol)
      .map(t => ({ market: t.market, symbol: t.symbol, openInterest: t.open_interest, lastTradedAt: t.last_traded_at }));
    const observation = buildOiObservation(symbol, rows, now);
    return observation ? [observation] : [];
  });
  if (!observations.length) throw new Error('No fresh open-interest observations');
  const coins = await trackOiHistory(observations, now);
  return {
    coins, method: OI_METHOD,
    observedAt: new Date(Math.min(...coins.map(c => c.observedAt))).toISOString(),
    totalOpenInterest: coins.reduce((sum, c) => sum + c.value, 0),
    change24h: totalOiChange(coins),
    comparisonReason: totalOiChange(coins) == null
      ? 'No hourly snapshot from 23–25 hours ago covers at least 90% of the current open interest on the same venue contracts yet. Snapshots are stored hourly when this feed or the smart-alert job runs.'
      : null,
    coverage: 'Perpetual contracts on the available top three CoinGecko derivatives venues; not the whole market.',
  };
}
