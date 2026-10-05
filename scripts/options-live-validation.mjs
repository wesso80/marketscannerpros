#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const help = `Read-only Options acceptance capture (no production routes or database access).

Live (only this explicit flag permits provider GET requests):
  node scripts/options-live-validation.mjs --live --expiry YYYY-MM-DD --exchange exchange.json --missing-history-symbol SYMBOL --out evidence-directory

Offline:
  node scripts/options-live-validation.mjs --fixture scripts/options-validation/fixture.json --out evidence-directory

ALPHA_VANTAGE_API_KEY must already be set for --live. Never put it in arguments.
--expiry is optional: otherwise the existing next-listed-expiry helper selects it.
Exchange evidence and a real missing-history symbol are required for full live acceptance.
Omitting either still captures evidence but reports FAIL. No provider request on help,
argument errors, imports, normal tests, builds, or fixture runs. No scheduler is installed.
Exit: 0 checks pass (fixture is NOT live acceptance); 1 acceptance/check failure; 2 setup failure.
Scheduled window: 2026-10-06 00:30–02:00 Australia/Sydney (2026-10-05 13:30–15:00 UTC).`;
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(help); process.exit(0); }
try {
  const options = {};
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (arg==='--live') { if(options.live) throw Error('Duplicate --live'); options.live=true; continue; }
    if (!['--fixture','--expiry','--exchange','--missing-history-symbol','--out'].includes(arg)) throw Error(`Unknown argument: ${arg}`);
    if (!args[i+1] || args[i+1].startsWith('--') || options[arg.slice(2)]) throw Error(`Missing or duplicate ${arg}`);
    options[arg.slice(2)]=args[++i];
  }
  if (Boolean(options.live)===Boolean(options.fixture)) throw Error('Choose exactly one of --live or --fixture.');
  if (options.live && !process.env.ALPHA_VANTAGE_API_KEY) throw Error('ALPHA_VANTAGE_API_KEY is required; no requests made.');
  if (options.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(options.expiry)) throw Error('Expiry must be YYYY-MM-DD.');
  if (options['missing-history-symbol'] && !/^[A-Z][A-Z0-9.-]{0,14}$/.test(options['missing-history-symbol'])) throw Error('Use an uppercase missing-history ticker.');
  for (const key of ['fixture','exchange']) if(options[key]) { options[key]=resolve(options[key]); JSON.parse(readFileSync(options[key],'utf8')); }
  options.out=resolve(options.out || `artifacts/options-acceptance-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  if (existsSync(options.out)) throw Error('Output directory already exists; choose a fresh path to preserve evidence.');
  mkdirSync(dirname(options.out),{recursive:true});mkdirSync(options.out);
  const env={...process.env,OPTIONS_ACCEPTANCE_CONFIG:JSON.stringify(options),OPTIONS_ACCEPTANCE_EXPLICIT:'1'};
  for (const name of Object.keys(env)) if (/DATABASE|POSTGRES|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|REDIS|STRIPE|SIGNING_SECRET|CRYPTO_SUMMARY_KEY|OPENAI_API_KEY/.test(name)) delete env[name];
  if (!options.live) env.ALPHA_VANTAGE_API_KEY='fixture-not-a-provider-key';
  const result=spawnSync(process.execPath,[resolve(root,'node_modules/vitest/vitest.mjs'),'run','--config','scripts/options-validation/vitest.config.ts'],{cwd:root,env,stdio:'inherit'});
  if(result.error) throw Error('Could not start the installed validation runtime. Install repository dependencies first.');
  const reportPath=resolve(options.out,'report.json');
  if(!existsSync(reportPath)) { console.error('FAIL: validation runtime did not produce evidence.');process.exit(2); }
  const report=JSON.parse(readFileSync(reportPath,'utf8'));
  console.log(`\nEvidence: ${reportPath}`);
  process.exit(result.status===0 && report.checks.every(c=>c.pass) ? 0 : 1);
} catch(error) { console.error(`Setup error: ${error.message}`);process.exit(2); }
