import { getDerivativesTickers } from '@/lib/coingecko';
import { getCached, setCached, getRedis } from '@/lib/redis';
import { compareOi24h, HOUR_MS, OI_METHOD, totalOiChange, type OiObservation, stableOiObservation, type StableOiObservation } from './oiComparisons';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'NEAR', 'LTC', 'UNI', 'ATOM', 'ARB', 'OP', 'APT', 'TON', 'SHIB', 'TRX'];
const key = (hour: number, fixed = false) => `oi:observed-usd:${fixed ? "fixed-v1" : "v3"}:${hour}`;
type Comparison = OiObservation & ReturnType<typeof compareOi24h>;
let memo: { signature: string; until: number; promise: Promise<Comparison[]> } | null = null;

/** Three bounded hourly reads survive deploys and never use the legacy unversioned anchor or v2 snapshots (no per-contract data). */
export async function trackOiHistory(current: OiObservation[], now = Date.now()): Promise<Comparison[]> {
  const signature = JSON.stringify(current);
  if (memo?.signature === signature && now < memo.until) return memo.promise;
  const promise = (async () => {
    const hour = Math.floor(now / HOUR_MS);
    const fixed = current.every(c => "contractObservedAt" in c);
    const stored = await Promise.all([23, 24, 25].map(age => getCached<OiObservation[]>(key(hour - age, fixed)).catch(() => null)));
    const history = stored.flatMap(rows => Array.isArray(rows) ? rows : []);
    const compared = current.map(coin => ({ ...coin, ...compareOi24h(coin, history, now) }));
    if (current.length) {
      const written = await setCached(key(hour, fixed), current, 48 * 3600);
      if (fixed && written === false) throw new Error('OI hourly snapshot persistence unavailable');
    }
    return compared;
  })();
  memo = { signature, until: now + 300_000, promise };
  return promise;
}

export async function getOiEvidence() {
  const redis = getRedis();
  if (!redis) throw new Error('Fixed OI basket persistence unavailable');
  const tickers = await getDerivativesTickers();
  const now = Date.now();
  const basketKey = 'oi:fixed-basket:v1';
  const identityKey = 'oi:fixed-constituents:v1';
  const [saved, pinned] = await Promise.all([
    redis.get<StableOiObservation[]>(basketKey), redis.get<StableOiObservation[]>(identityKey),
  ]);
  const build = (previous:StableOiObservation[]):StableOiObservation[] => {
    const universe = previous.length ? previous.map(c=>c.symbol) : SYMBOLS;
    return universe.flatMap(symbol => {
      const rows = (tickers ?? []).filter(t => t.contract_type === 'perpetual' && t.index_id?.toUpperCase() === symbol)
        .map(t => ({ market:t.market, symbol:t.symbol, openInterest:t.open_interest, lastTradedAt:t.last_traded_at }));
      const prior = previous.find(c=>c.symbol===symbol) ?? null;
      const observation = stableOiObservation(symbol, rows, prior, now);
      if (!observation && prior) throw new Error(`Fixed OI basket incomplete: ${symbol}; expired constituent, not a position decline`);
      return observation ? [observation] : [];
    });
  };
  let observations = build(saved ?? pinned ?? []);
  if (!observations.length) throw new Error('No fresh open-interest observations');
  if (!pinned) {
    // Persist the identity once, without expiry. Concurrent bootstraps must adopt the same winning basket.
    await redis.set(identityKey, observations, { nx:true });
    const winner = await redis.get<StableOiObservation[]>(identityKey);
    if (!winner?.length) throw new Error('Unable to establish fixed OI constituents');
    observations = build(winner);
  }
  await redis.set(basketKey, observations, { ex:30*24*3600 });
  const coins = await trackOiHistory(observations, now);
  return {
    coins, method: OI_METHOD,
    carriedContracts: observations.reduce((n,c)=>n+c.carriedContracts,0),
    expectedContracts: observations.reduce((n,c)=>n+c.expectedContracts,0),
    basketEstablished: Boolean(pinned?.length),
    observedAt: new Date(Math.min(...coins.map(c => c.observedAt))).toISOString(),
    totalOpenInterest: coins.reduce((sum, c) => sum + c.value, 0),
    change24h: totalOiChange(coins),
    comparisonReason: totalOiChange(coins) == null
      ? 'No hourly snapshot from 23–25 hours ago covers at least 90% of the current open interest on the same venue contracts yet. Snapshots are stored hourly by the scheduled public OI job and when this feed is read.'
      : null,
    coverage: 'Fixed contracts selected from the initial CoinGecko perpetual snapshot; missing updates carried for at most 1 hour, then totals withheld. Not the whole market.',
  };
}
