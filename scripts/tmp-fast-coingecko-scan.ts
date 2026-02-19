import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Pool } from 'pg';
import { COINGECKO_ID_MAP, getOHLC as getCoinGeckoOHLC, resolveSymbolToId } from '../lib/coingecko';

type ScanResult = {
  symbol: string;
  status: 'ok' | 'no_mapping' | 'no_data' | 'error';
  coinId?: string;
  bars?: number;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSymbol(input: string): string {
  return input.toUpperCase().replace(/[-_]/g, '').replace(/\/$/, '');
}

async function resolveCoinId(symbol: string): Promise<string | null> {
  const normalized = normalizeSymbol(symbol);
  return (
    COINGECKO_ID_MAP[normalized] ||
    COINGECKO_ID_MAP[normalized.replace('USDT', '')] ||
    COINGECKO_ID_MAP[normalized.replace('USD', '')] ||
    (await resolveSymbolToId(normalized.replace('USDT', '').replace('USD', '')))
  );
}

async function main() {
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = `reports/coingecko-fastscan-${ts}.json`;

  const rows = await db.query(
    `SELECT symbol FROM symbol_universe WHERE asset_type = 'crypto' ORDER BY symbol ASC`
  );
  const symbols = rows.rows.map((r) => String(r.symbol));

  const startedAt = new Date().toISOString();
  const results: ScanResult[] = [];

  for (const symbol of symbols) {
    try {
      const coinId = await resolveCoinId(symbol);
      if (!coinId) {
        results.push({ symbol, status: 'no_mapping' });
        await sleep(300);
        continue;
      }

      const bars = await getCoinGeckoOHLC(coinId, 30);
      if (!bars || bars.length === 0) {
        results.push({ symbol, status: 'no_data', coinId, bars: 0 });
      } else {
        results.push({ symbol, status: 'ok', coinId, bars: bars.length });
      }
    } catch (error: any) {
      results.push({
        symbol,
        status: 'error',
        error: error?.message || String(error),
      });
    }

    await sleep(1200);
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    no_mapping: results.filter((r) => r.status === 'no_mapping').length,
    no_data: results.filter((r) => r.status === 'no_data').length,
    error: results.filter((r) => r.status === 'error').length,
  };

  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    summary,
    failingSymbols: results.filter((r) => r.status !== 'ok').sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };

  const fs = await import('node:fs/promises');
  await fs.mkdir('reports', { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`REPORT:${outPath}`);
  console.log(JSON.stringify(summary));

  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
