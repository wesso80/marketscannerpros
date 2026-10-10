/**
 * One-shot raw daily equity history into ohlcv_bars.
 *
 *   npx tsx scripts/backfill-equity-daily-history.ts --audit
 *   EQUITY_DAILY_BACKFILL=1 npx tsx scripts/backfill-equity-daily-history.ts --symbols=SPY,AAPL,NVDA
 *   EQUITY_DAILY_BACKFILL=1 npx tsx scripts/backfill-equity-daily-history.ts
 *
 * Off unless EQUITY_DAILY_BACKFILL=1. --audit is read-only and does not need the switch.
 * Apply migrations/135_equity_history_backfill.sql by hand first. This script does not create it.
 */
process.env.AV_PROCESS_ROLE = 'jarvis';

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

async function main(): Promise<void> {
  const { runCli } = await import('../lib/history/equityDailyBackfill');
  const { q, tx } = await import('../lib/db');
  const { avTakeToken, currentAvBudgetPlan, currentAvProcessRole, runWithAvBudget } = await import('../lib/avLimiter');
  const { getLimiterRedis } = await import('../lib/redis');
  const { backfillPaceMs, FEATURE } = await import('../lib/history/equityDailyBackfill');

  const argv = process.argv.slice(2);
  const audit = argv.includes('--audit');
  if (!audit && process.env.EQUITY_DAILY_BACKFILL !== '1') {
    console.log('[equity-daily-backfill] disabled');
    process.exit(0);
  }
  if (!audit && !process.env.ALPHA_VANTAGE_API_KEY) {
    console.error('[equity-daily-backfill] ALPHA_VANTAGE_API_KEY is unset');
    process.exit(2);
  }

  const report = await runCli(argv, process.env, {
    nowMs: () => Date.now(),
    role: () => currentAvProcessRole(),
    limiterRedisPresent: () => getLimiterRedis() != null,
    paceMs: () => backfillPaceMs(currentAvBudgetPlan().reserves.backfill),
    takeToken: () => runWithAvBudget({ lane: 'backfill', feature: FEATURE }, () => avTakeToken({
      lane: 'backfill',
      feature: FEATURE,
      allowFallback: false,
    })),
    query: (sql, params) => q(sql, params ?? []),
    tx: (work) => tx((client) => work({
      query: (sql, params) => client.query(sql, params as never[]),
    })),
    fetchDaily: fetchAvDailyFull,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message) => console.log(`[equity-daily-backfill] ${message}`),
  });
  if ('equitySymbols' in report || report.exitCode === 1 && 'error' in report) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify(report));
  }
  process.exit(report.exitCode);
}

async function fetchAvDailyFull(symbol: string) {
  const { classifyAvPayload } = await import('../lib/history/equityDailyBackfill');
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=full&entitlement=realtime&apikey=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { kind: 'transient' as const, reason: `HTTP ${res.status}` };
  const json: unknown = await res.json();
  return classifyAvPayload(json);
}

main().catch((err) => {
  console.error('[equity-daily-backfill] fatal', err instanceof Error ? err.message : err);
  process.exit(1);
});
