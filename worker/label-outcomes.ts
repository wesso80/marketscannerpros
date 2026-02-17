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

// Lazy database connection
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
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

/**
 * Get price at a specific time from ohlcv_bars
 * 
 * CRITICAL: To avoid label leakage, we must use the FIRST bar's CLOSE
 * that is >= target time. Not the high/low during the window,
 * not the closest bar, but strictly the first bar AFTER horizon.
 * 
 * @param horizonMinutes - Used to determine tolerance window
 */
async function getPriceAtTime(
  symbol: string, 
  targetTime: Date,
  horizonMinutes: number = 1440
): Promise<{ price: number | null; withinTolerance: boolean }> {
  const tolerance = TOLERANCE_WINDOWS[horizonMinutes] || { bars: 2, minutes: 240 };
  const maxTime = new Date(targetTime.getTime() + tolerance.minutes * 60 * 1000);
  
  // STRICT: First bar AFTER target time (avoids label leakage)
  const firstBarAfter = await q<{ close: string, ts: string }>(
    `SELECT close, ts FROM ohlcv_bars 
     WHERE symbol = $1 
       AND timeframe IN ('daily', '1h', '60min')
       AND ts >= $2
       AND ts <= $3
     ORDER BY ts ASC
     LIMIT 1`,
    [symbol, targetTime, maxTime]
  );
  
  if (firstBarAfter.length > 0) {
    return { price: parseFloat(firstBarAfter[0].close), withinTolerance: true };
  }
  
  // If no bar within tolerance window, check if signal is recent enough to use current quote
  const now = new Date();
  const hoursSinceTarget = (now.getTime() - targetTime.getTime()) / (1000 * 60 * 60);
  
  // Only use current quote if we're within tolerance window of target
  if (hoursSinceTarget >= 0 && hoursSinceTarget * 60 < tolerance.minutes) {
    const quote = await q<{ price: string }>(
      'SELECT price FROM quotes_latest WHERE symbol = $1',
      [symbol]
    );
    if (quote.length > 0) {
      return { price: parseFloat(quote[0].price), withinTolerance: true };
    }
  }
  
  // No price found within tolerance
  return { price: null, withinTolerance: false };
}

/**
 * Compute outcome label based on direction and thresholds
 */
function computeOutcome(
  direction: string,
  pctMove: number,
  correctThreshold: number,
  wrongThreshold: number
): 'correct' | 'wrong' | 'neutral' {
  if (direction === 'bullish') {
    if (pctMove >= correctThreshold) return 'correct';
    if (pctMove <= -wrongThreshold) return 'wrong';
    return 'neutral';
  } else {
    // bearish
    if (pctMove <= -correctThreshold) return 'correct';
    if (pctMove >= wrongThreshold) return 'wrong';
    return 'neutral';
  }
}

async function labelOutcomes() {
  console.log('='.repeat(60));
  console.log('🎯 Signal Outcome Labeler');
  console.log('='.repeat(60));
  
  // Get all configured horizons
  const thresholds = await q<ThresholdConfig>(
    'SELECT horizon_minutes, horizon_label, correct_threshold::float, wrong_threshold::float FROM outcome_thresholds ORDER BY horizon_minutes'
  );
  
  if (thresholds.length === 0) {
    console.log('⚠️ No thresholds configured. Run the migration first.');
    return;
  }
  
  console.log(`📊 Processing ${thresholds.length} horizons: ${thresholds.map(t => t.horizon_label).join(', ')}\n`);
  
  let totalLabeled = 0;
  let totalErrors = 0;
  let totalUnknown = 0;
  
  for (const threshold of thresholds) {
    const { horizon_minutes, horizon_label, correct_threshold, wrong_threshold } = threshold;
    
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
    
    let labeled = 0;
    let skipped = 0;
    let unknown = 0;
    
    for (const signal of unlabeled) {
      const { signal_id, symbol, direction, signal_at, price_at_signal } = signal;
      const priceAtSignal = typeof price_at_signal === 'string' ? parseFloat(price_at_signal) : price_at_signal;
      
      // Calculate target time
      const signalTime = new Date(signal_at);
      const targetTime = new Date(signalTime.getTime() + horizon_minutes * 60 * 1000);
      
      // Get price at target time with tolerance
      const { price: priceLater, withinTolerance } = await getPriceAtTime(symbol, targetTime, horizon_minutes);
      
      // If no price found within tolerance, mark as unknown (not wrong!)
      if (priceLater === null) {
        // Only mark as unknown if the signal is old enough that we SHOULD have data
        const now = new Date();
        const tolerance = TOLERANCE_WINDOWS[horizon_minutes] || { bars: 2, minutes: 240 };
        const shouldHaveData = now.getTime() > targetTime.getTime() + tolerance.minutes * 60 * 1000;
        
        if (shouldHaveData) {
          // Record as unknown - data should exist but doesn't
          try {
            await q(
              `INSERT INTO signal_outcomes (signal_id, horizon_minutes, price_later, pct_move, outcome)
               VALUES ($1, $2, NULL, NULL, 'unknown')
               ON CONFLICT (signal_id, horizon_minutes) 
               DO UPDATE SET outcome = 'unknown', labeled_at = NOW()`,
              [signal_id, horizon_minutes]
            );
            unknown++;
          } catch (err) {
            console.error(`   ⚠️ Error marking ${symbol} as unknown:`, err instanceof Error ? err.message : err);
          }
        } else {
          // Not old enough yet, skip and try again later
          skipped++;
        }
        continue;
      }
      
      // Calculate % move
      const pctMove = ((priceLater - priceAtSignal) / priceAtSignal) * 100;
      
      // Determine outcome
      const outcome = computeOutcome(direction, pctMove, correct_threshold, wrong_threshold);
      
      // Insert outcome
      try {
        await q(
          `INSERT INTO signal_outcomes (signal_id, horizon_minutes, price_later, pct_move, outcome)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (signal_id, horizon_minutes) 
           DO UPDATE SET price_later = $3, pct_move = $4, outcome = $5, labeled_at = NOW()`,
          [signal_id, horizon_minutes, priceLater, pctMove, outcome]
        );
        labeled++;
        
        // Log interesting results
        if (outcome === 'correct' || outcome === 'wrong') {
          const icon = outcome === 'correct' ? '✅' : '❌';
          const sign = pctMove >= 0 ? '+' : '';
          console.log(`   ${icon} ${symbol} (${direction}): ${sign}${pctMove.toFixed(2)}% → ${outcome}`);
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
  
  // Refresh accuracy stats if we labeled anything
  if (totalLabeled > 0) {
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

// Run if called directly
labelOutcomes()
  .then(() => {
    console.log('🏁 Outcome labeling complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
