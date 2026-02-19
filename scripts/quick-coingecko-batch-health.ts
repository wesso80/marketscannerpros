import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { COINGECKO_ID_MAP, getSimplePrices } from '../lib/coingecko';

type Status = 'ok' | 'unmapped' | 'no_price';

function coinIdForSymbol(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  return COINGECKO_ID_MAP[upper] || COINGECKO_ID_MAP[upper.replace('USDT', '')] || null;
}

async function getCryptoSymbols(): Promise<string[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 4 });
  try {
    const { rows } = await pool.query(`
      SELECT symbol
      FROM symbol_universe
      WHERE asset_type = 'crypto'
      ORDER BY symbol ASC
    `);
    return rows.map((row: { symbol: string }) => String(row.symbol || '').toUpperCase()).filter(Boolean);
  } finally {
    await pool.end();
  }
}

async function main() {
  const startedAt = Date.now();
  const symbols = await getCryptoSymbols();

  const mapped = symbols
    .map((symbol) => ({ symbol, coinId: coinIdForSymbol(symbol) }))
    .filter((item) => item.coinId);

  const uniqueIds = Array.from(new Set(mapped.map((item) => item.coinId as string)));
  const prices = (await getSimplePrices(uniqueIds, { include_24h_change: false })) || {};

  const results = symbols.map((symbol) => {
    const coinId = coinIdForSymbol(symbol);
    let status: Status;
    if (!coinId) {
      status = 'unmapped';
    } else if (!prices[coinId] || typeof prices[coinId].usd !== 'number') {
      status = 'no_price';
    } else {
      status = 'ok';
    }

    return {
      symbol,
      coinId,
      status,
      price: coinId ? prices[coinId]?.usd ?? null : null,
    };
  });

  const failed = results.filter((result) => result.status !== 'ok');
  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    totals: {
      symbols: symbols.length,
      mappedIds: mapped.length,
      uniqueIds: uniqueIds.length,
      ok: results.filter((result) => result.status === 'ok').length,
      unmapped: results.filter((result) => result.status === 'unmapped').length,
      noPrice: results.filter((result) => result.status === 'no_price').length,
      failed: failed.length,
    },
  };

  const report = { summary, failedSymbols: failed, allResults: results };

  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const fileName = `quick-coingecko-batch-health-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const outPath = path.join(reportsDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`[batch-health] symbols=${summary.totals.symbols} uniqueIds=${summary.totals.uniqueIds}`);
  console.log(`[batch-health] ok=${summary.totals.ok} failed=${summary.totals.failed} (unmapped=${summary.totals.unmapped}, noPrice=${summary.totals.noPrice})`);
  console.log(`[batch-health] report=${outPath}`);
}

main().catch((error) => {
  console.error('[batch-health] fatal', error);
  process.exit(1);
});
