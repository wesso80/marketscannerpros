interface CoinSnapshot {
  symbol: string;
  aggregatedFunding?: {
    fundingRatePct?: number | null;
    annualised?: number | null;
    sentiment?: string | null;
    fundingRateMissing?: boolean;
    exchangeCount?: number | null;
  };
  aggregatedOI?: { totalOI?: number | null; totalVolume24h?: number | null };
  price?: number | null;
  change24h?: number | null;
}

type SnapshotWriter = (sql: string, values: unknown[]) => Promise<unknown>;
const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Missing funding is NULL, never a neutral signal or the UI label "Unavailable". */
export async function persistDerivativeSnapshots(
  data: { coins?: CoinSnapshot[] } | null,
  write: SnapshotWriter,
) {
  const coins = Array.isArray(data?.coins) ? data.coins : [];
  let saved = 0;
  const failedSymbols: string[] = [];
  for (const coin of coins) {
    const symbol = coin?.symbol;
    if (typeof symbol !== 'string' || !symbol.trim() || symbol.length > 20) {
      failedSymbols.push('(invalid symbol)');
      continue;
    }
    const funding = coin.aggregatedFunding;
    const rate = funding?.fundingRateMissing ? null : finiteOrNull(funding?.fundingRatePct);
    const sentiment = rate !== null && ['Bullish', 'Bearish', 'Neutral'].includes(funding?.sentiment ?? '')
      ? funding!.sentiment : null;
    try {
      await write(
        `INSERT INTO derivatives_snapshots
          (symbol, funding_rate_pct, annualised_pct, sentiment,
           total_oi, total_volume_24h, exchange_count, price, change_24h)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [symbol, rate, rate === null ? null : finiteOrNull(funding?.annualised), sentiment,
          finiteOrNull(coin.aggregatedOI?.totalOI), finiteOrNull(coin.aggregatedOI?.totalVolume24h),
          finiteOrNull(funding?.exchangeCount), finiteOrNull(coin.price), finiteOrNull(coin.change24h)],
      );
      saved++;
    } catch {
      // One malformed/provider row must not prevent the remaining coins being saved.
      failedSymbols.push(symbol);
    }
  }
  return {
    status: coins.length === 0 ? 'unavailable' : failedSymbols.length ? 'partial' : 'saved',
    expected: coins.length, saved, failed: failedSymbols.length, failedSymbols,
  };
}
