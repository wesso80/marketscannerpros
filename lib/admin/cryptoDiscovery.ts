import type { CoinGeckoMarketData, CoinTicker } from '@/lib/coingecko';

export const DISCOVERY_POLICY = { pagesPerExchange: 3, pageSize: 250, minPairVolumeUsd: 250_000, maxSpreadPct: 0.5, minVolumeUsd: 2_000_000,
  minMarketCapUsd: 10_000_000, maxAgeMs: 15 * 60_000, cooldownSeconds: 15 * 60 } as const;
export type DiscoveryRow = { id: string; symbol: string; name: string; price: number;
  volumeUsd: number | null; marketCapUsd: number; change1h: number | null; change24h: number | null;
  change7d: number | null; observedAt: string | null; stage: 'EXTENDED' | 'MOMENTUM' | 'WATCH' | 'EXCLUDED';
  reasons: string[]; fixedScanCovered: boolean };
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
// Identity/name screening is a first pass, not a verified token-category or venue-liquidity assessment.
const pegged = /stablecoin|wrapped|bridged|staked|restaked|synthetic|xstock|tokenized.?stock|tether|(?:^|[- ])(?:usd[tcde]?|dai|eurc|paxg|xaut)(?:$|[- ])/i;
export function screenCryptoMarkets(rows: CoinGeckoMarketData[], coveredIds: ReadonlySet<string>, nowMs: number): DiscoveryRow[] {
  const unique = new Map<string, CoinGeckoMarketData>();
  for (const r of rows) if (r.id && (!unique.has(r.id) || Date.parse(r.last_updated ?? '') > Date.parse(unique.get(r.id)!.last_updated ?? ''))) unique.set(r.id, r);
  return [...unique.values()].map(r => {
    const reasons: string[] = [];
    const at = Date.parse(r.last_updated ?? '');
    if (!finite(r.current_price) || r.current_price <= 0) reasons.push('price_unavailable');
    if (!Number.isFinite(at) || at > nowMs || nowMs - at > DISCOVERY_POLICY.maxAgeMs) reasons.push('price_stale_or_timestamp_invalid');
    if (!finite(r.total_volume) || r.total_volume < DISCOVERY_POLICY.minVolumeUsd) reasons.push('volume_below_floor_or_missing');
    if (!finite(r.market_cap) || r.market_cap < DISCOVERY_POLICY.minMarketCapUsd) reasons.push('market_cap_below_floor_or_missing');
    if (pegged.test(`${r.id} ${r.name}`)) reasons.push('possible_pegged_or_derivative_asset');
    const h = finite(r.price_change_percentage_1h_in_currency) ? r.price_change_percentage_1h_in_currency : null;
    const d = finite(r.price_change_percentage_24h) ? r.price_change_percentage_24h : null;
    const w = finite(r.price_change_percentage_7d_in_currency) ? r.price_change_percentage_7d_in_currency : null;
    if (h === null || d === null) reasons.push('momentum_data_missing');
    const stage: DiscoveryRow['stage'] = reasons.length ? 'EXCLUDED' : h! >= 10 || d! >= 30 ? 'EXTENDED' : h! >= 1 && d! >= 3 ? 'MOMENTUM' : 'WATCH';
    return { id: r.id, symbol: r.symbol.toUpperCase(), name: r.name, price: r.current_price,
      volumeUsd: r.total_volume, marketCapUsd: r.market_cap, change1h: h, change24h: d, change7d: w,
      observedAt: r.last_updated ?? null, stage, reasons, fixedScanCovered: coveredIds.has(r.id) };
  }).sort((a,b) => ({MOMENTUM:0,EXTENDED:1,WATCH:2,EXCLUDED:3}[a.stage] - {MOMENTUM:0,EXTENDED:1,WATCH:2,EXCLUDED:3}[b.stage]) ||
    (b.change1h ?? -Infinity) - (a.change1h ?? -Infinity) || a.id.localeCompare(b.id));
}

export const DISCOVERY_EXCHANGES = ['binance', 'gdax', 'kraken', 'kucoin', 'okex'] as const;
export type VenueEvidence = { exchange: string; pair: string; volumeUsd: number; spreadPct: number; observedAt: string };
export function eligibleVenue(t: CoinTicker, exchange: string, nowMs: number): VenueEvidence | null {
  const at = Date.parse(t.last_traded_at);
  if (!t.coin_id || t.market?.identifier !== exchange || t.is_stale !== false || t.is_anomaly !== false ||
      !Number.isFinite(at) || at > nowMs || nowMs - at > DISCOVERY_POLICY.maxAgeMs ||
      !finite(t.converted_volume?.usd) || t.converted_volume.usd < DISCOVERY_POLICY.minPairVolumeUsd ||
      !finite(t.bid_ask_spread_percentage) || t.bid_ask_spread_percentage < 0 || t.bid_ask_spread_percentage > DISCOVERY_POLICY.maxSpreadPct) return null;
  return {exchange, pair:`${t.base}/${t.target}`, volumeUsd:t.converted_volume.usd,
    spreadPct:t.bid_ask_spread_percentage, observedAt:t.last_traded_at};
}
/** Major-exchange volume window, NOT all listings. IDs retain identity across duplicate symbols/pairs.
 * At most 15 ticker + 6 market requests, no retries or per-coin candle requests. */
export async function collectDiscoveryMarkets(
  fetchTickers: (exchange: string, page: number) => Promise<CoinTicker[] | null>,
  fetchMarkets: (ids: string[]) => Promise<CoinGeckoMarketData[] | null>, nowMs: number,
) {
  const venues: Record<string, VenueEvidence[]> = {};
  const coverage: {exchange:string; pages:number; status:'CAPPED'|'END'|'FAILED'; pairsSeen:number}[] = [];
  let requests = 0;
  let eligiblePairs=0,latestTradeAt:number|null=null;
  const rejectedPairs:Record<string,number>={};
  for (const exchange of DISCOVERY_EXCHANGES) {
    const entry: typeof coverage[number] = {exchange,pages:0,status:'CAPPED',pairsSeen:0};
    coverage.push(entry);
    for (let page=1; page<=DISCOVERY_POLICY.pagesPerExchange; page++) {
      requests++; entry.pages++;
      const batch = await fetchTickers(exchange,page).catch(()=>null);
      if (!batch) {entry.status='FAILED'; break;}
      entry.pairsSeen += batch.length;
      for (const t of batch.slice(0,100)) {
        const at=Date.parse(t.last_traded_at);
        if(Number.isFinite(at))latestTradeAt=Math.max(latestTradeAt??at,at);
        const evidence = eligibleVenue(t,exchange,nowMs);
        if(evidence)eligiblePairs++;
        else{
          const reason=!t.coin_id?'missing_coin_id':t.market?.identifier!==exchange?'venue_mismatch':t.is_stale!==false||t.is_anomaly!==false?'stale_or_anomaly_flag':!Number.isFinite(at)||at>nowMs||nowMs-at>DISCOVERY_POLICY.maxAgeMs?'trade_timestamp_outside_window':!finite(t.converted_volume?.usd)||t.converted_volume.usd<DISCOVERY_POLICY.minPairVolumeUsd?'pair_volume_below_floor':'spread_invalid_or_too_wide';
          rejectedPairs[reason]=(rejectedPairs[reason]??0)+1;
        }
        if (evidence && !(venues[t.coin_id]??[]).some(v=>v.exchange===exchange && v.pair===evidence.pair))
          (venues[t.coin_id]??=[]).push(evidence);
      }
      if (batch.length < 100) {entry.status='END'; break;}
    }
  }
  const ids = Object.keys(venues).sort();
  const rows: CoinGeckoMarketData[] = [];
  const failedMarketBatches: number[] = [];
  for (let i=0; i<ids.length; i+=250) {
    requests++;
    const chunk = ids.slice(i,i+250);
    const batch = await fetchMarkets(chunk).catch(()=>null);
    if (!batch) {failedMarketBatches.push(i/250+1); continue;}
    const requested = new Set(chunk);
    rows.push(...batch.filter(r=>requested.has(r.id)));
  }
  const returned = new Set(rows.map(r=>r.id));
  return {rows,venues,coverage,requests,eligiblePairs,rejectedPairs,latestTradeAt:latestTradeAt===null?null:new Date(latestTradeAt).toISOString(),failedMarketBatches,missingMarketIds:ids.filter(id=>!returned.has(id))};
}
