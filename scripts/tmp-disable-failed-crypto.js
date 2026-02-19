require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');

async function main() {
  const reportPath = 'reports/quick-coingecko-batch-health-2026-02-19T00-12-18-131Z.json';
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const failedSymbols = report.failedSymbols.map((item) => item.symbol);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const before = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE asset_type='crypto') AS total_crypto,
        COUNT(*) FILTER (WHERE asset_type='crypto' AND enabled=true) AS enabled_crypto,
        COUNT(*) FILTER (WHERE asset_type='crypto' AND enabled=false) AS disabled_crypto
      FROM symbol_universe
    `);

    const update = await pool.query(
      `
      UPDATE symbol_universe
      SET enabled = false, updated_at = NOW()
      WHERE asset_type = 'crypto'
        AND symbol = ANY($1::text[])
      `,
      [failedSymbols]
    );

    const after = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE asset_type='crypto') AS total_crypto,
        COUNT(*) FILTER (WHERE asset_type='crypto' AND enabled=true) AS enabled_crypto,
        COUNT(*) FILTER (WHERE asset_type='crypto' AND enabled=false) AS disabled_crypto
      FROM symbol_universe
    `);

    const stillEnabled = await pool.query(`
      SELECT symbol
      FROM symbol_universe
      WHERE asset_type='crypto' AND enabled=true
      ORDER BY symbol
    `);

    console.log(
      JSON.stringify(
        {
          reportPath,
          targetedFailedSymbols: failedSymbols.length,
          rowsUpdated: update.rowCount,
          before: before.rows[0],
          after: after.rows[0],
          enabledSymbols: stillEnabled.rows.map((row) => row.symbol),
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
