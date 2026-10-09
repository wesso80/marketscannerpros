/**
 * Label Outcomes Worker
 * 
 * Pulls signals missing outcomes and labels them based on actual price moves.
 * 
 * How it works:
 * 1. Get all configured horizons from outcome_thresholds table
 * 2. For each horizon, find signals that are old enough but don't have outcomes yet
 * 3. Look up the price at signal_at + horizon from ohlcv_bars
 * 4. Compute pct_move = ((price_later - price_at_signal) / price_at_signal) * 100
 * 5. Apply threshold rules to label as correct/wrong/neutral
 * 6. Upsert into signal_outcomes
 * 7. Refresh accuracy stats
 * 
 * Run every few hours (or daily after market close):
 * npx tsx worker/label-outcomes.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Pool } from 'pg';
import { alertWorkerError } from '../lib/opsAlerting';
import { COINGECKO_ID_MAP } from '../lib/coingecko';
import { bandForHorizon, bandsFromRows, horizonsWithFallback } from '../lib/signals/outcomeRule';
import {
  declaredAssetClass, inCryptoSymbolMap, labelHorizonMove, resolveOutcomeLabelAsset, symbolBase,
} from '../lib/signals/outcomeGuard';

// Lazy database connection
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
  }
  return pool;
}

async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}

// Threshold config (matches the database defaults)
interface ThresholdConfig {
  horizon_minutes: number;
  horizon_label: string;
  correct_threshold: number;  // % move needed for "correct"
  wrong_threshold: number;    // % move needed for "wrong"
}

interface UnlabeledSignal {
  signal_id: number;
  symbol: string;
  direction: string;
  signal_at: Date;
  price_at_signal: number;
}

// Tolerance windows by horizon (bars/time allowed past target)
// These prevent "false unknown" when data is slightly delayed
const TOLERANCE_WINDOWS: Record<number, { bars: number; minutes: number }> = {
  60:    { bars: 2, minutes: 120 },    // 1h: allow +2 bars (2h total)
  240:   { bars: 1, minutes: 240 },    // 4h: allow +1 bar (8h total)
  1440:  { bars: 1, minutes: 1440 },   // 1d: allow +1 day (market gaps)
  10080: { bars: 2, minutes: 2880 },   // 1w: allow +2 days
};

interface ScopedBar {
  close: string;
  ts: string;
  bar_class: string;
}

/**
 * Bars for one symbol in a time window, tagged by asset class.
 *
 * Equity rows are ohlcv_bars joined to symbol_universe.asset_type equity/stock/etf.
 * Crypto rows are cg_hist_daily (via cg_hist_coins.symbol or the coin id) or
 * ohlcv_bars joined to a crypto universe row. ohlcv_bars has no class column of
 * its own, so an unjoined bar is not used. quotes_latest is never used.
 *
 * Symbols are stored uppercased, so compare to UPPER($1) and leave the symbol index usable.
 */
async function getScopedBars(symbol: string, from: Date, to: Date, coinId: string): Promise<ScopedBar[]> {
  return q<ScopedBar>(
    `SELECT close, ts, bar_class FROM (
       SELECT b.close::text AS close, b.ts, 'equity'::text AS bar_class
         FROM ohlcv_bars b
         JOIN symbol_universe u ON u.symbol = b.symbol
        WHERE b.symbol = UPPER($1)
          AND lower(u.asset_type) IN ('equity', 'equities', 'stock', 'etf')
          AND b.timeframe IN ('daily', '1h', '60min')
          AND b.ts >= $2
          AND b.ts <= $3
       UNION ALL
       SELECT COALESCE(d.close, d.price)::text AS close,
              ((d.day + 1)::timestamp AT TIME ZONE 'UTC') - INTERVAL '1 millisecond' AS ts,
              'crypto'::text AS bar_class
         FROM cg_hist_daily d
         JOIN cg_hist_coins c ON c.id = d.coin_id
        WHERE (upper(c.symbol) = UPPER($1) OR d.coin_id = $4)
          AND COALESCE(d.close, d.price) IS NOT NULL
          AND ((d.day + 1)::timestamp AT TIME ZONE 'UTC') - INTERVAL '1 millisecond' >= $2
          AND ((d.day + 1)::timestamp AT TIME ZONE 'UTC') - INTERVAL '1 millisecond' <= $3
       UNION ALL
       SELECT b.close::text AS close, b.ts, 'crypto'::text AS bar_class
         FROM ohlcv_bars b
         JOIN symbol_universe u ON u.symbol = b.symbol
        WHERE b.symbol = UPPER($1)
          AND lower(u.asset_type) IN ('crypto', 'cryptocurrency')
          AND b.timeframe IN ('daily', '1h', '60min')
          AND b.ts >= $2
          AND b.ts <= $3
     ) class_bars`,
    [symbol, from, to, coinId],
  );
}

function pickClassBar(
  rows: ScopedBar[],
  assetClass: 'equity' | 'crypto',
  order: 'asc' | 'desc',
): { price: number; observedAtMs: number; barClass: 'equity' | 'crypto' } | { otherClassOnly: true } | null {
  const sorted = [...rows].sort((a, b) => {
    const delta = new Date(a.ts).getTime() - new Date(b.ts).getTime();
    return order === 'asc' ? delta : -delta;
  });
  const same = sorted.find((row) => row.bar_class === assetClass);
  if (same) {
    const price = parseFloat(same.close);
    const observedAtMs = new Date(same.ts).getTime();
    if (!Number.isFinite(price) || !(price > 0) || !Number.isFinite(observedAtMs)) {
      return sorted.some((row) => row.bar_class !== assetClass) ? { otherClassOnly: true } : null;
    }
    return { price, observedAtMs, barClass: assetClass };
  }
  if (sorted.some((row) => row.bar_class !== assetClass)) return { otherClassOnly: true };
  return null;
}

async function labelOutcomes() {
  console.log('='.repeat(60));
  console.log('🎯 Signal Outcome Labeler');
  console.log('='.repeat(60));
  
  // Per-horizon bands from outcome_thresholds, read once. Empty table or a failed
  // read → DEFAULT_OUTCOME_BANDS via bandsFromRows. classifyMove applies the band
  // from bandForHorizon so a horizon uses the same map the session labeler uses.
  let thresholdRows: ThresholdConfig[] = [];
  try {
    thresholdRows = await q<ThresholdConfig>(
      'SELECT horizon_minutes, horizon_label, correct_threshold::float, wrong_threshold::float FROM outcome_thresholds ORDER BY horizon_minutes'
    );
    if (thresholdRows.length === 0) {
      console.log('⚠️ No outcome_thresholds rows. Using the default per-horizon bands.');
    }
  } catch (err) {
    thresholdRows = [];
    console.error('⚠️ outcome_thresholds read failed. Using the default per-horizon bands.', err instanceof Error ? err.message : err);
  }
  const thresholds = horizonsWithFallback(thresholdRows);
  const bandMap = bandsFromRows(thresholdRows);
  
  console.log(`📊 Processing ${thresholds.length} horizons: ${thresholds.map(t => t.horizon_label).join(', ')}\n`);
  
  let totalLabeled = 0;
  let totalErrors = 0;
  let totalUnknown = 0;
  
  for (const threshold of thresholds) {
    const { horizon_minutes, horizon_label } = threshold;
    
    console.log(`\n⏱️ Processing ${horizon_label} horizon (${horizon_minutes} min)...`);
    
    // Get unlabeled signals for this horizon
    const unlabeled = await q<UnlabeledSignal>(
      'SELECT * FROM get_unlabeled_signals($1, 200)',
      [horizon_minutes]
    );
    
    if (unlabeled.length === 0) {
      console.log(`   ✓ No signals to label`);
      continue;
    }
    
    console.log(`   Found ${unlabeled.length} signals to label`);

    const featureById = new Map<number, unknown>();
    const universeBySymbol = new Map<string, string[]>();
    try {
      const metas = await q<{ id: string; features_json: unknown }>(
        `SELECT id, features_json FROM signals_fired WHERE id = ANY($1::bigint[])`,
        [unlabeled.map((row) => row.signal_id)],
      );
      for (const row of metas) featureById.set(Number(row.id), row.features_json);
      const symbols = [...new Set(unlabeled.map((row) => String(row.symbol).toUpperCase()))];
      const universe = await q<{ symbol: string; asset_type: string }>(
        `SELECT symbol, asset_type FROM symbol_universe WHERE symbol = ANY($1::text[])`,
        [symbols],
      );
      for (const row of universe) {
        const key = String(row.symbol).toUpperCase();
        universeBySymbol.set(key, [...(universeBySymbol.get(key) ?? []), row.asset_type]);
      }
    } catch (err) {
      console.warn('[outcomes] symbol class read failed; collisions are judged from the coin map only', err instanceof Error ? err.message : err);
    }
    
    let labeled = 0;
    let skipped = 0;
    let unknown = 0;
    
    for (const signal of unlabeled) {
      const { signal_id, symbol, direction, signal_at, price_at_signal } = signal;
      const priceAtSignal = typeof price_at_signal === 'string' ? parseFloat(price_at_signal) : price_at_signal;
      if (!Number.isFinite(priceAtSignal) || priceAtSignal === 0) {
        skipped++;
        continue;
      }
      
      const signalTime = new Date(signal_at);
      const targetTime = new Date(signalTime.getTime() + horizon_minutes * 60 * 1000);
      const asset = resolveOutcomeLabelAsset({
        symbol,
        declared: declaredAssetClass(featureById.get(Number(signal_id))),
        universeTypes: universeBySymbol.get(String(symbol).toUpperCase()) ?? [],
        inCryptoMap: inCryptoSymbolMap(symbolBase(symbol), COINGECKO_ID_MAP),
      });
      let observation: { price: number; observedAtMs: number; live: false; barClass: 'equity' | 'crypto' } | null = null;
      let otherClassOnly = false;
      if (asset.status === 'ok') {
        const tolerance = TOLERANCE_WINDOWS[horizon_minutes] || { bars: 2, minutes: 240 };
        const windowEnd = new Date(targetTime.getTime() + tolerance.minutes * 60 * 1000);
        const entryFrom = new Date(signalTime.getTime() - 2 * 24 * 60 * 60 * 1000);
        const coinId = COINGECKO_ID_MAP[symbolBase(symbol)] ?? '';
        const entryRows = await getScopedBars(symbol, entryFrom, signalTime, coinId);
        const horizonRows = await getScopedBars(symbol, targetTime, windowEnd, coinId);
        const entryBar = pickClassBar(entryRows, asset.assetClass, 'desc');
        const horizonBar = pickClassBar(horizonRows, asset.assetClass, 'asc');
        otherClassOnly = (!!entryBar && 'otherClassOnly' in entryBar) || (!!horizonBar && 'otherClassOnly' in horizonBar);
        if (!otherClassOnly && horizonBar && 'price' in horizonBar) {
          observation = { price: horizonBar.price, observedAtMs: horizonBar.observedAtMs, live: false, barClass: horizonBar.barClass };
        }
      }
      const decision = labelHorizonMove({
        direction,
        bandPct: bandForHorizon(horizon_minutes, bandMap),
        priceAtSignal,
        nowMs: Date.now(),
        signalAtMs: signalTime.getTime(),
        horizonMinutes: horizon_minutes,
        asset,
        observation,
        otherClassOnly,
      });

      if (decision.action === 'skip') {
        skipped++;
        continue;
      }

      if (decision.reason === 'suspect' || decision.reason === 'ambiguous' || decision.reason === 'expired' || decision.reason === 'wrong_asset') {
        console.warn(`[outcomes] ${symbol} ${decision.reason}${decision.pctMove != null ? ` ${decision.pctMove.toFixed(2)}%` : ''} → unknown`);
      }
      
      try {
        await q(
          `INSERT INTO signal_outcomes (signal_id, horizon_minutes, price_later, pct_move, outcome)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (signal_id, horizon_minutes) 
           DO UPDATE SET price_later = $3, pct_move = $4, outcome = $5, labeled_at = NOW()`,
          [signal_id, horizon_minutes, decision.priceLater, decision.pctMove, decision.outcome]
        );
        if (decision.outcome === 'unknown') unknown++;
        else labeled++;
        
        if (decision.outcome === 'correct' || decision.outcome === 'wrong') {
          const icon = decision.outcome === 'correct' ? '✅' : '❌';
          const sign = (decision.pctMove ?? 0) >= 0 ? '+' : '';
          console.log(`   ${icon} ${symbol} (${direction}): ${sign}${(decision.pctMove ?? 0).toFixed(2)}% → ${decision.outcome}`);
        }
      } catch (err) {
        console.error(`   ❌ Error labeling ${symbol}:`, err instanceof Error ? err.message : err);
        totalErrors++;
      }
    }
    
    totalLabeled += labeled;
    totalUnknown += unknown;
    console.log(`   Labeled: ${labeled}, Unknown: ${unknown}, Skipped (too recent): ${skipped}`);
  }
  
  console.log('\n' + '-'.repeat(60));
  console.log(`📊 Total Labeled: ${totalLabeled}`);
  console.log(`⚠️ Total Unknown (missing data): ${totalUnknown}`);
  console.log(`❌ Errors: ${totalErrors}`);
  
  // signal_accuracy_stats is a table, not a materialized view. refresh_signal_accuracy
  // rebuilds it. Run that whenever this pass wrote a labelled or unknown row.
  if (totalLabeled > 0 || totalUnknown > 0) {
    console.log('\n🔄 Refreshing accuracy statistics...');
    let accuracyStatsAvailable = true;
    try {
      await q('SELECT refresh_signal_accuracy(90)');
      console.log('✅ Accuracy stats updated');
    } catch (err) {
      accuracyStatsAvailable = false;
      console.warn(
        '⚠️ Skipping accuracy stats refresh (schema mismatch or missing function):',
        err instanceof Error ? err.message : err
      );
    }
    
    // Print summary
    const stats = accuracyStatsAvailable ? await q<{
      signal_type: string;
      direction: string;
      horizon_minutes: number;
      total_signals: number;
      accuracy_pct: string;
    }>(`
      SELECT signal_type, direction, horizon_minutes, total_signals, accuracy_pct 
      FROM signal_accuracy_stats 
      WHERE total_signals >= 5
      ORDER BY total_signals DESC 
      LIMIT 15
    `) : [];
    
    if (stats.length > 0) {
      console.log('\n📈 Signal Accuracy Summary:');
      console.log('   Type          | Direction | Horizon | Signals | Win Rate');
      console.log('   ' + '-'.repeat(55));
      for (const s of stats) {
        const horizonLabel = s.horizon_minutes === 60 ? '1h' : 
                            s.horizon_minutes === 240 ? '4h' : 
                            s.horizon_minutes === 1440 ? '1d' : 
                            s.horizon_minutes === 10080 ? '1w' : `${s.horizon_minutes}m`;
        console.log(`   ${s.signal_type.padEnd(13)} | ${s.direction.padEnd(9)} | ${horizonLabel.padEnd(7)} | ${String(s.total_signals).padEnd(7)} | ${s.accuracy_pct || 'N/A'}%`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch');
  const onceMode = args.includes('--once') || !watchMode;
  const intervalArg = args.find((arg) => arg.startsWith('--interval-minutes='));
  const intervalFromArg = intervalArg ? parseInt(intervalArg.replace('--interval-minutes=', ''), 10) : Number.NaN;
  const intervalFromEnv = parseInt(process.env.OUTCOMES_INTERVAL_MINUTES || '180', 10);
  const intervalMinutes = Number.isFinite(intervalFromArg) && intervalFromArg > 0
    ? intervalFromArg
    : (Number.isFinite(intervalFromEnv) && intervalFromEnv > 0 ? intervalFromEnv : 180);

  if (onceMode) {
    await labelOutcomes();
    console.log('🏁 Outcome labeling complete');
    return;
  }

  console.log(`🔁 Outcome labeling watch mode enabled (every ${intervalMinutes} minutes)`);
  let cycle = 0;
  while (true) {
    cycle += 1;
    console.log(`\n[outcomes] === Cycle ${cycle} ===`);
    try {
      await labelOutcomes();
      console.log('[outcomes] Cycle complete');
    } catch (err) {
      console.error('[outcomes] Cycle failed:', err instanceof Error ? err.message : err);
    }

    const sleepMs = intervalMinutes * 60 * 1000;
    console.log(`[outcomes] Waiting ${intervalMinutes} minutes until next cycle...`);
    await sleep(sleepMs);
  }
}

// Run if called directly (npm run worker:outcomes). Importing this file must not exit.
const invokedDirectly = (process.argv[1] ?? '').replace(/\\/g, '/').includes('label-outcomes');
if (invokedDirectly) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('💥 Fatal error:', err);
      await alertWorkerError('label-outcomes', err?.message || String(err));
      process.exit(1);
    });
}
