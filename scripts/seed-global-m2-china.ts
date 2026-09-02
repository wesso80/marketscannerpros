/**
 * One-time official-PBOC seed for Global M2 China history.
 *
 * Runs the ALREADY-VALIDATED live PBOC provider from a PBOC-reachable machine
 * (LOCAL LIVE), normalizes every month with historical month-end FX, validates,
 * and persists GM2_USD_CN to macro_series so production can serve it as STALE
 * when Render cannot reach PBOC.
 *
 * It NEVER invents data and NEVER types monetary values by hand — every value
 * comes from the official parser + FX normalization.
 *
 * Usage:
 *   npx tsx scripts/seed-global-m2-china.ts           # dry-run (prints summary, writes nothing)
 *   npx tsx scripts/seed-global-m2-china.ts --write    # persists (requires DATABASE_URL)
 *
 * Safety: --write only proceeds if DATABASE_URL is set; it uses the existing
 * secure dbGlobalM2Store.write() path. No secrets are printed.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fetchChinaM2 } from '../lib/intelligence/data/providers/pbocM2';
import { fetchUsdFxDaily } from '../lib/intelligence/data/providers/alphaVantageFx';
import { normalizeM2BlocFull, UNIT_TRANSFORMS } from '../lib/intelligence/data/globalM2Normalize';
import { dbGlobalM2Store } from '../lib/intelligence/data/globalM2Store';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

async function main() {
  const write = process.argv.includes('--write');
  console.log(`\n=== Global M2 China seed (${write ? 'WRITE' : 'DRY-RUN'}) — LOCAL LIVE ===\n`);

  const china = await fetchChinaM2();
  if (!china.ok) {
    console.error(`PBOC provider failed (not reachable from this machine?): ${china.error}`);
    process.exit(1);
  }
  const usdcny = await fetchUsdFxDaily('CNY');
  if (!usdcny.ok) {
    console.error(`USDCNY FX failed: ${usdcny.error}`);
    process.exit(1);
  }

  const bloc = normalizeM2BlocFull({
    id: 'CN', name: 'China', nativeCurrency: 'CNY', nativeUnit: china.nativeUnit, classification: 'EXACT',
    provider: china.provider, sourceSeries: china.sourceSeries, sourceUrl: china.sourceUrl,
    retrievedAt: china.retrievedAt, nativeUnitScale: UNIT_TRANSFORMS.pbocYiYuanToCny(1), // 1e8
    fxDirection: 'divide', fxPair: 'USDCNY', dailyFx: usdcny.daily, m2: china.m2,
  });

  const obs = bloc.observations;
  if (obs.length < 13) {
    console.error(`Refusing to seed: only ${obs.length} normalized months (need >=13). Fail closed.`);
    process.exit(1);
  }
  const lastNative = china.m2[china.m2.length - 1];
  const lastNorm = obs[obs.length - 1];

  console.log('DRY-RUN SUMMARY');
  console.log(`  provider              = PBOC`);
  console.log(`  classification        = EXACT`);
  console.log(`  observations (norm)   = ${obs.length}`);
  console.log(`  native months parsed  = ${china.m2.length}`);
  console.log(`  first month           = ${obs[0].month}`);
  console.log(`  last month            = ${lastNorm.month}`);
  console.log(`  latest native CNY M2  = ${lastNative.nativeM2.toLocaleString()} 亿元 (~CNY ${(lastNative.nativeM2 * 1e8 / 1e12).toFixed(3)}T)`);
  console.log(`  latest FX             = USDCNY ${lastNorm.fxRate} @ ${lastNorm.fxObservationDate}`);
  console.log(`  latest normalized USD = $${(lastNorm.usdM2 / 1e12).toFixed(3)}T`);
  console.log(`  source series         = ${china.sourceSeries}`);
  console.log(`  source URL            = ${china.sourceUrl}`);
  console.log(`  validation status     = OK (provider fail-closed parse + FX-before-return; ${obs.length} months with valid aligned FX)`);

  if (!write) {
    console.log('\nDry-run only. Re-run with --write (and DATABASE_URL set) to persist.\n');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('\n--write requested but DATABASE_URL is not set. Refusing to write. STOP.\n');
    process.exit(2);
  }
  const written = await dbGlobalM2Store.write(
    'CN',
    obs.map((o) => ({ month: o.month, usdM2: o.usdM2 })),
    { provider: 'PBOC', classification: 'EXACT' },
  );
  console.log(`\nPersisted ${written} GM2_USD_CN observations to macro_series.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
