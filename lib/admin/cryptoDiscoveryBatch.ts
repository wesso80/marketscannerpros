import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { getMarketData, getDiscoveryExchangeTickers, COINGECKO_ID_MAP } from '@/lib/coingecko';
import { isAdminCryptoEnabled, isCoinGeckoEnabled } from '@/lib/admin/adminCrypto';
import { sharedScanUniverse } from '@/lib/admin/sharedScanLogic';
import { collectDiscoveryMarkets, screenCryptoMarkets, DISCOVERY_POLICY } from '@/lib/admin/cryptoDiscovery';

const KEY = 'admin:crypto-discovery:v1';
export async function runDiscoveryBatch() {
  if (!isAdminCryptoEnabled() || !isCoinGeckoEnabled()) return NextResponse.json({error:'Admin crypto or CoinGecko requests are paused'}, {status:409});
  try {
    const redis = getRedis();
    if (!redis) throw new Error('Discovery cache unavailable');
    // Shared, atomic cooldown survives process restarts; fail closed if unavailable. Never deleted early.
    if (!await redis.set(`${KEY}:budget`, 'reserved', {nx:true, ex:DISCOVERY_POLICY.cooldownSeconds}))
      return NextResponse.json({error:'A scan is running or the 15-minute shared cooldown is active. Load saved results.'}, {status:429});
    const startedAt = new Date().toISOString();
    const collected = await collectDiscoveryMarkets(getDiscoveryExchangeTickers,
      ids => getMarketData({ids, per_page:250, price_change_percentage:['1h','24h','7d'], precision:'full'}, {retries:0, timeoutMs:5000}), Date.now());
    const covered = new Set(sharedScanUniverse('CRYPTO').map(s => COINGECKO_ID_MAP[s]).filter(Boolean));
    const rows = screenCryptoMarkets(collected.rows, covered, Date.now()).map(r=>({...r,venues:collected.venues[r.id]}));
    const partial = collected.coverage.some(c=>c.status==='FAILED') || collected.failedMarketBatches.length > 0 || collected.missingMarketIds.length > 0;
    const snapshot = { version:'crypto-discovery.v1', mode:'RESEARCH_ONLY', startedAt, finishedAt:new Date().toISOString(),
      requests:collected.requests, coverage:collected.coverage, partial, missingMarketIds:collected.missingMarketIds,
      failedMarketBatches:collected.failedMarketBatches, uniqueCoins:rows.length, policy:DISCOVERY_POLICY, rows };
    await redis.set(KEY, snapshot, {ex:86400});
    return NextResponse.json({snapshot}, {status:partial ? 206 : 200});
  } catch { return NextResponse.json({error:'Discovery failed or could not save results. No trade was created.'}, {status:503}); }
}
