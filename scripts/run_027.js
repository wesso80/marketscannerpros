const { Pool } = require('pg');
const fs = require('fs');

const sql = fs.readFileSync('migrations/027_trim_crypto_top100.sql', 'utf8');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Q8nXeM0RisqL@ep-plain-recipe-a7bmaq00-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query(sql);
    // Also disable VANRY (stray coin not in our 100)
    await client.query("UPDATE symbol_universe SET enabled = FALSE, updated_at = NOW() WHERE symbol = 'VANRY' AND asset_type = 'crypto'");
    console.log('Migration 027 complete!');

    const counts = await client.query(
      "SELECT tier, enabled, COUNT(*) as cnt FROM symbol_universe WHERE asset_type = 'crypto' GROUP BY tier, enabled ORDER BY enabled DESC, tier"
    );
    console.log('\nCrypto universe counts:');
    for (const row of counts.rows) {
      console.log(`  Tier ${row.tier} | enabled=${row.enabled} | count=${row.cnt}`);
    }

    // Show all enabled T3 coins
    const t3 = await client.query(
      "SELECT symbol FROM symbol_universe WHERE asset_type = 'crypto' AND enabled = TRUE AND tier = 3 ORDER BY symbol"
    );
    console.log('\nTier 3 enabled coins:', t3.rows.map(r => r.symbol).join(', '));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
