const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Q8nXeM0RisqL@ep-plain-recipe-a7bmaq00-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // 1. Find and disable garbage symbols (spaces, too short, high error counts)
  const garbage = await p.query(`
    SELECT symbol, asset_type, fetch_error_count, enabled 
    FROM symbol_universe 
    WHERE symbol ~ '\\s'                         -- contains spaces
       OR (LENGTH(TRIM(symbol)) < 2)              -- too short
       OR (fetch_error_count >= 50 AND enabled = true)  -- failing repeatedly
    ORDER BY symbol
  `);
  console.log('=== GARBAGE SYMBOLS FOUND ===');
  console.log(JSON.stringify(garbage.rows, null, 2));
  console.log(`Total garbage: ${garbage.rows.length}`);

  // 2. Disable garbage symbols (contain spaces)
  const disableSpaces = await p.query(`
    UPDATE symbol_universe 
    SET enabled = false, updated_at = NOW()
    WHERE symbol ~ '\\s'
    RETURNING symbol
  `);
  console.log(`\nDisabled ${disableSpaces.rows.length} symbols with spaces:`, disableSpaces.rows.map(r => r.symbol));

  // 3. Disable symbols with 50+ errors
  const disableErrors = await p.query(`
    UPDATE symbol_universe 
    SET enabled = false, updated_at = NOW()
    WHERE fetch_error_count >= 50 AND enabled = true
    RETURNING symbol
  `);
  console.log(`\nDisabled ${disableErrors.rows.length} symbols with 50+ errors:`, disableErrors.rows.map(r => r.symbol));

  // 4. Delete quotes_latest entries for garbage symbols (with spaces)
  const deleteQuotes = await p.query(`
    DELETE FROM quotes_latest 
    WHERE symbol IN (SELECT symbol FROM symbol_universe WHERE symbol ~ '\\s')
    RETURNING symbol
  `);
  console.log(`\nDeleted ${deleteQuotes.rows.length} stale quote rows for garbage symbols`);

  // 5. Verify final state
  const remaining = await p.query(`
    SELECT COUNT(*) as total, 
           COUNT(*) FILTER (WHERE enabled) as enabled_count,
           COUNT(*) FILTER (WHERE NOT enabled) as disabled_count,
           COUNT(*) FILTER (WHERE fetch_error_count >= 50) as high_error
    FROM symbol_universe
  `);
  console.log('\n=== FINAL STATE ===');
  console.log(JSON.stringify(remaining.rows[0], null, 2));

  await p.end();
}

run().catch(e => { console.error(e); process.exit(1); });
