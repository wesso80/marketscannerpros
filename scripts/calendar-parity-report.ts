/**
 * Development-only calendar provider parity report.
 *
 *   npx tsx scripts/calendar-parity-report.ts [--days=30] [--countries=US,JP,...] [--json]
 *
 * Compares each configured live provider (TRADING_ECONOMICS_API_KEY, EODHD_API_KEY)
 * against the curated seed over the window. Providers without a key are
 * reported NOT_CONFIGURED. Nothing here writes to the database or the app.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ALL_COUNTRIES, parseCountryFilter } from '../lib/macro/calendar/countries';
import { collectProviderResults } from '../lib/macro/calendar/feed';
import { compareProvider, formatParityReport, type ParityReport } from '../lib/macro/calendar/parity';
import type { ProviderId } from '../lib/macro/calendar/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const days = Math.min(90, Math.max(1, parseInt(arg('days') ?? '30', 10) || 30));
  const countries = arg('countries') ? parseCountryFilter(arg('countries')) : ALL_COUNTRIES;
  const nowMs = Date.now();
  const fromUtcMs = nowMs;
  const toUtcMs = nowMs + days * 86_400_000;
  const order: ProviderId[] = ['curated', 'trading-economics', 'eodhd'];

  const results = await collectProviderResults({ order, countries, fromUtcMs, toUtcMs, nowMs });
  const baseline = results.find((r) => r.providerId === 'curated')!;

  const report: ParityReport = {
    windowFromUtc: new Date(fromUtcMs).toISOString(),
    windowToUtc: new Date(toUtcMs).toISOString(),
    generatedAt: new Date(nowMs).toISOString(),
    countries,
    providers: results
      .filter((r) => r.providerId !== 'curated')
      .map((r) => compareProvider({ providerId: r.providerId, status: r.status, error: r.error, baseline: baseline.inputs, provider: r.inputs, countries })),
  };

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatParityReport(report)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
