import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Pool } from 'pg';
import { COINGECKO_ID_MAP, getOHLC } from '../lib/coingecko';
import * as fs from 'fs';
import * as path from 'path';

type ScanResult = {
  symbol: string;
  coinId: string | null;
  status: 'ok' | 'nodata' | 'unmapped';
  bars: number;
  durationMs: number;
};

const CONCURRENCY = Number.parseInt(process.env.CG_SCAN_CONCURRENCY || '20', 10);
const TIMEOUT_MS = Number.parseInt(process.env.CG_SCAN_TIMEOUT_MS || '4000', 10);
const RETRIES = Number.parseInt(process.env.CG_SCAN_RETRIES || '0', 10);

async function getCryptoSymbols(): Promise<string[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });

  try {
    const { rows } = await pool.query(
      `
      SELECT symbol
      FROM symbol_universe
      WHERE asset_type = 'crypto'
      ORDER BY symbol ASC
      `
    );

    return rows.map((row: { symbol: string }) => String(row.symbol || '').toUpperCase()).filter(Boolean);
  } finally {
    await pool.end();
  }
}

function mapCoinId(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  return COINGECKO_ID_MAP[upper] || COINGECKO_ID_MAP[upper.replace('USDT', '')] || null;
}

async function scanSymbol(symbol: string): Promise<ScanResult> {
  const startedAt = Date.now();
  const coinId = mapCoinId(symbol);

  if (!coinId) {
    return {
      symbol,
      coinId: null,
      status: 'unmapped',
      bars: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const ohlc = await getOHLC(coinId, 30, {
    retries: RETRIES,
    timeoutMs: TIMEOUT_MS,
  });

  const bars = Array.isArray(ohlc) ? ohlc.length : 0;
  return {
    symbol,
    coinId,
    status: bars > 0 ? 'ok' : 'nodata',
    bars,
    durationMs: Date.now() - startedAt,
  };
}

async function runPool<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TOutput>
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
  return results;
}

async function main() {
  const startedAt = Date.now();
  const symbols = await getCryptoSymbols();

  console.log(`[quick-scan] symbols=${symbols.length} concurrency=${CONCURRENCY} timeoutMs=${TIMEOUT_MS} retries=${RETRIES}`);

  const results = await runPool(symbols, CONCURRENCY, async (symbol) => {
    const result = await scanSymbol(symbol);
    if (result.status !== 'ok') {
      console.log(`[quick-scan] ${result.symbol} -> ${result.status}${result.coinId ? ` (${result.coinId})` : ''}`);
    }
    return result;
  });

  const ok = results.filter((result) => result.status === 'ok');
  const nodata = results.filter((result) => result.status === 'nodata');
  const unmapped = results.filter((result) => result.status === 'unmapped');

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    config: {
      concurrency: CONCURRENCY,
      timeoutMs: TIMEOUT_MS,
      retries: RETRIES,
    },
    totals: {
      symbols: symbols.length,
      ok: ok.length,
      nodata: nodata.length,
      unmapped: unmapped.length,
      failed: nodata.length + unmapped.length,
    },
    failedSymbols: [...unmapped, ...nodata].map((result) => ({
      symbol: result.symbol,
      status: result.status,
      coinId: result.coinId,
      bars: result.bars,
      durationMs: result.durationMs,
    })),
    allResults: results,
  };

  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, `quick-coingecko-scan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`[quick-scan] done in ${report.elapsedMs}ms`);
  console.log(`[quick-scan] ok=${report.totals.ok} failed=${report.totals.failed} (unmapped=${report.totals.unmapped}, nodata=${report.totals.nodata})`);
  console.log(`[quick-scan] report=${outPath}`);
}

main().catch((error) => {
  console.error('[quick-scan] fatal:', error);
  process.exit(1);
});
