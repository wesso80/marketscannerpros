import { getDerivativesTickers } from '@/lib/coingecko';
import { getCached, setCached, getRedis } from '@/lib/redis';
import { compareOi24h, HOUR_MS, OI_METHOD, totalOiChange, type OiObservation, stableOiObservation, type StableOiObservation } from './oiComparisons';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'NEAR', 'LTC', 'UNI', 'ATOM', 'ARB', 'OP', 'APT', 'TON', 'SHIB', 'TRX'];
const key = (hour: number, fixed = false) => `oi:observed-usd:${fixed ? "fixed-v1" : "v3"}:${hour}`;
type Comparison = OiObservation & ReturnType<typeof compareOi24h>;
let memo: { signature: string; until: number; promise: Promise<{ compared: Comparison[]; persisted: boolean }> } | null = null;

async function compareAndStore(current: OiObservation[], now = Date.now()) {
  const signature = JSON.stringify(current);
  if (memo?.signature === signature && now < memo.until) return memo.promise;
  const promise = (async () => {
    const hour = Math.floor(now / HOUR_MS);
    const fixed = current.every(c => "contractObservedAt" in c);
    const stored = await Promise.all([23, 24, 25].map(age => getCached<OiObservation[]>(key(hour - age, fixed)).catch(() => null)));
    const history = stored.flatMap(rows => Array.isArray(rows) ? rows : []);
    const compared = current.map(coin => ({ ...coin, ...compareOi24h(coin, history, now) }));
    let persisted = true;
    if (current.length) {
      const written = await setCached(key(hour, fixed), current, 48 * 3600);
      persisted = written !== false;
    }
    return { compared, persisted };
  })();
  memo = { signature, until: now + 300_000, promise };
  return promise;
}

/** Three bounded hourly reads survive deploys and never use the legacy unversioned anchor or v2 snapshots (no per-contract data). */
export async function trackOiHistory(current: OiObservation[], now = Date.now()): Promise<Comparison[]> {
  return (await compareAndStore(current, now)).compared;
}

export async function getOiEvidence() {
  const redis = getRedis();
  const tickers = await getDerivativesTickers();
  const now = Date.now();
  const basketKey = 'oi:fixed-basket:v1';
  const identityKey = 'oi:fixed-constituents:v1';
  let saved: StableOiObservation[] | null = null;
  let pinned: StableOiObservation[] | null = null;
  let cacheUp = Boolean(redis);
  if (redis) {
    try {
      [saved, pinned] = await Promise.all([
        redis.get<StableOiObservation[]>(basketKey), redis.get<StableOiObservation[]>(identityKey),
      ]);
    } catch {
      cacheUp = false;
    }
  }
  // A null feed is a provider failure, not an empty market. Do not age contracts out or rewrite the pin.
  if (tickers == null) {
    const held = saved ?? pinned ?? [];
    if (held.length) {
      const coverage = 'CoinGecko derivatives are unavailable. The last pinned basket is unchanged. Not the whole market.';
      return {
        coins: held.map(c => ({ ...c, change24h: null, comparisonAt: null, previousValue: null, comparedValue: null })),
        method: OI_METHOD, carriedContracts: held.reduce((n, c) => n + (c.carriedContracts ?? 0), 0), droppedContracts: 0,
        expectedContracts: held.reduce((n, c) => n + (c.expectedContracts ?? 0), 0),
        basketEstablished: Boolean((pinned ?? saved)?.length),
        observedAt: new Date(Math.min(...held.map(c => c.observedAt))).toISOString(),
        totalOpenInterest: held.reduce((sum, c) => sum + c.value, 0), change24h: null,
        comparisonReason: coverage, coverage, status: 'degraded' as const,
        persistence: redis && cacheUp ? 'ok' as const : 'unavailable' as const,
      };
    }
  }
  const build = (previous:StableOiObservation[]) => {
    const universe = previous.length ? previous.map(c=>c.symbol) : SYMBOLS;
    let droppedContracts = 0;
    const observations = universe.flatMap(symbol => {
      const rows = (tickers ?? []).filter(t => t.contract_type === 'perpetual' && t.index_id?.toUpperCase() === symbol)
        .map(t => ({ market:t.market, symbol:t.symbol, openInterest:t.open_interest, lastTradedAt:t.last_traded_at }));
      const prior = previous.find(c=>c.symbol===symbol) ?? null;
      const observation = stableOiObservation(symbol, rows, prior, now);
      if (!observation) {
        if (prior) droppedContracts += Object.keys(prior.contracts).length;
        return [];
      }
      droppedContracts += observation.droppedContracts ?? 0;
      return [observation];
    });
    return { observations, droppedContracts };
  };
  const hadPin = Boolean((saved ?? pinned)?.length);
  let { observations, droppedContracts } = build(saved ?? pinned ?? []);
  if (!observations.length) {
    if (hadPin && redis && cacheUp) {
      // The saved contracts have all stopped trading. Forget them so the next read can pin what is live.
      try { await redis.del(identityKey, basketKey); } catch { cacheUp = false; }
      const coverage = `${droppedContracts} pinned contract(s) stopped trading and were removed. The basket rebuilds from the next live snapshot. Not the whole market.`;
      return {
        coins: [], method: OI_METHOD, carriedContracts: 0, expectedContracts: 0, droppedContracts,
        basketEstablished: false, observedAt: new Date(now).toISOString(), totalOpenInterest: 0, change24h: null,
        comparisonReason: coverage, coverage, status: 'degraded' as const, persistence: cacheUp ? 'ok' as const : 'unavailable' as const,
      };
    }
    if (!redis || !cacheUp) {
      const coverage = 'No live open-interest quotes, and the fixed basket is unavailable because the cache is down. Not the whole market.';
      return {
        coins: [], method: OI_METHOD, carriedContracts: 0, expectedContracts: 0, droppedContracts,
        basketEstablished: false, observedAt: new Date(now).toISOString(), totalOpenInterest: 0, change24h: null,
        comparisonReason: coverage, coverage, status: 'degraded' as const, persistence: 'unavailable' as const,
      };
    }
    throw new Error('No fresh open-interest observations');
  }
  if (redis && cacheUp) {
    try {
      if (!pinned?.length) {
        // Persist the identity once, without expiry. Concurrent bootstraps must adopt the same winning basket.
        await redis.set(identityKey, observations, { nx:true });
        const winner = await redis.get<StableOiObservation[]>(identityKey);
        if (winner?.length) ({ observations, droppedContracts } = build(winner));
      } else if (droppedContracts > 0) {
        // Keep the reduced set. A delisted contract must not stay pinned until someone deletes the key.
        await redis.set(identityKey, observations);
      }
      if (observations.length) await redis.set(basketKey, observations, { ex:30*24*3600 });
    } catch {
      cacheUp = false;
    }
  }
  if (!observations.length) throw new Error('No fresh open-interest observations');
  const { compared: coins, persisted } = await compareAndStore(observations, now);
  const carriedContracts = observations.reduce((n,c)=>n+c.carriedContracts,0);
  const persistence = redis && cacheUp && persisted ? 'ok' as const : 'unavailable' as const;
  const coverage = !redis || !cacheUp
    ? 'Live CoinGecko perpetual snapshot only. The fixed basket and hourly comparisons are unavailable because the cache is down. Not the whole market.'
    : !persisted
      ? 'Live open interest is available, but the hourly snapshot could not be stored because the cache write failed. Not the whole market.'
      : droppedContracts > 0
        ? `${droppedContracts} pinned contract(s) were carried for at most 1 hour, then removed after they stopped trading. ${carriedContracts} contract(s) are still carried. Totals use the contracts that remain. Not the whole market.`
        : 'Fixed contracts selected from the initial CoinGecko perpetual snapshot; missing updates carried for at most 1 hour, then removed from the basket. Not the whole market.';
  const status = persistence === 'ok' && carriedContracts === 0 && droppedContracts === 0 ? 'ok' as const : 'degraded' as const;
  return {
    coins, method: OI_METHOD, carriedContracts, droppedContracts,
    expectedContracts: observations.reduce((n,c)=>n+c.expectedContracts,0),
    basketEstablished: Boolean(pinned?.length),
    observedAt: new Date(Math.min(...coins.map(c => c.observedAt))).toISOString(),
    totalOpenInterest: coins.reduce((sum, c) => sum + c.value, 0),
    change24h: totalOiChange(coins),
    comparisonReason: totalOiChange(coins) == null
      ? 'No hourly snapshot from 23–25 hours ago covers at least 90% of the current open interest on the same venue contracts yet. Snapshots are stored hourly by the scheduled public OI job and when this feed is read.'
      : null,
    coverage, status, persistence,
  };
}
