/**
 * Cleanup script to clear all cached data from Redis and Postgres
 * Run with: npx tsx scripts/cleanup-cache.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Pool } from 'pg';
import { Redis } from '@upstash/redis';

async function cleanup() {
  console.log('🧹 Starting cleanup...\n');

  // 1. Clear Redis
  console.log('--- Redis ---');
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (redisUrl && redisToken) {
    try {
      const redis = new Redis({ url: redisUrl, token: redisToken });
      await redis.flushdb();
      console.log('✅ Redis flushed');
    } catch (err) {
      console.log('❌ Redis flush failed:', (err as Error).message);
    }
  } else {
    console.log('⏭️  Redis not configured, skipping');
  }

  // 2. Clear Postgres cached data tables
  console.log('\n--- Postgres ---');
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.log('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  
  try {
    // Truncate all cached data tables (keeps schema intact)
    const tables = [
      'quotes_latest',
      'ohlcv_bars', 
      'indicators_latest',
      'options_chain_latest',
      'options_metrics_latest',
      'scanner_results_cache',
      'worker_runs'
    ];

    for (const table of tables) {
      try {
        await pool.query(`TRUNCATE TABLE ${table}`);
        console.log(`✅ Truncated ${table}`);
      } catch (err) {
        // Table might not exist
        console.log(`⏭️  ${table} - ${(err as Error).message.split('\n')[0]}`);
      }
    }

    // Reset symbol_universe to just the defaults (remove on-demand additions)
    // Keep enabled symbols but clear fetch timestamps
    await pool.query(`
      UPDATE symbol_universe 
      SET last_fetched_at = NULL, fetch_error_count = 0
    `);
    console.log('✅ Reset symbol_universe fetch timestamps');

    // Optionally: remove tier 3 symbols (on-demand added)
    const { rowCount } = await pool.query(`
      DELETE FROM symbol_universe WHERE tier = 3
    `);
    console.log(`✅ Removed ${rowCount} on-demand (tier 3) symbols`);

  } finally {
    await pool.end();
  }

  console.log('\n🎉 Cleanup complete! Ready to go live when you are.');
}

cleanup().catch(console.error);
