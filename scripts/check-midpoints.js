// Quick check of midpoint database state
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    // Overall counts
    const counts = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tagged = TRUE) as tagged,
        COUNT(*) FILTER (WHERE tagged = FALSE) as untagged
      FROM timeframe_midpoints
    `);
    console.log('ALL SYMBOLS:', counts.rows[0]);

    // Per-symbol counts
    const perSymbol = await pool.query(`
      SELECT 
        symbol,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tagged = TRUE) as tagged,
        COUNT(*) FILTER (WHERE tagged = FALSE) as untagged
      FROM timeframe_midpoints
      GROUP BY symbol
      ORDER BY total DESC
      LIMIT 20
    `);
    console.log('\nPER SYMBOL:');
    perSymbol.rows.forEach(r => console.log(`  ${r.symbol}: total=${r.total} tagged=${r.tagged} untagged=${r.untagged}`));

    // BTCUSD specific
    const btc = await pool.query(`
      SELECT timeframe, COUNT(*) as cnt, MIN(midpoint) as min_mp, MAX(midpoint) as max_mp
      FROM timeframe_midpoints
      WHERE symbol = 'BTCUSD' AND tagged = FALSE
      GROUP BY timeframe
      ORDER BY timeframe
    `);
    console.log('\nBTCUSD UNTAGGED BY TIMEFRAME:');
    btc.rows.forEach(r => console.log(`  ${r.timeframe}: ${r.cnt} midpoints (range: ${r.min_mp} - ${r.max_mp})`));

    // BTCUSD within 10% of current price
    const currentPrice = 71516;
    const within = await pool.query(`
      SELECT timeframe, COUNT(*) as cnt, MIN(midpoint) as min_mp, MAX(midpoint) as max_mp
      FROM timeframe_midpoints
      WHERE symbol = 'BTCUSD' AND tagged = FALSE
        AND ABS((midpoint - $1) / $1 * 100) <= 10
      GROUP BY timeframe
      ORDER BY timeframe
    `, [currentPrice]);
    console.log(`\nBTCUSD WITHIN 10% of ${currentPrice}:`);
    within.rows.forEach(r => console.log(`  ${r.timeframe}: ${r.cnt} midpoints (range: ${r.min_mp} - ${r.max_mp})`));
    if (within.rows.length === 0) console.log('  (none found)');

    // Reset tagged midpoints
    const resetArg = process.argv.includes('--reset');
    if (resetArg) {
      const symbol = process.argv[process.argv.indexOf('--reset') + 1] || null;
      const q = symbol
        ? `UPDATE timeframe_midpoints SET tagged = FALSE, tagged_at = NULL, tagged_price = NULL WHERE tagged = TRUE AND symbol = $1 RETURNING id`
        : `UPDATE timeframe_midpoints SET tagged = FALSE, tagged_at = NULL, tagged_price = NULL WHERE tagged = TRUE RETURNING id`;
      const params = symbol ? [symbol] : [];
      const result = await pool.query(q, params);
      console.log(`\nRESET: Untagged ${result.rows.length} midpoints${symbol ? ` for ${symbol}` : ''}`);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
