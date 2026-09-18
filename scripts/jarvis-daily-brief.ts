/**
 * Private Jarvis — daily brief prototype.
 *
 *   npm run jarvis:brief
 *
 * Owner-only, read-only. Reads production worker tables, production intelligence
 * endpoints and the same provider libraries the app uses, then writes
 * reports/jarvis-latest.{json,md}. The previous JSON (if any) is kept as
 * reports/jarvis-previous.json and used for "what changed". Nothing is deployed.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import { KEY_SYMBOLS, collectCalendar, collectCrcs, collectCrypto, collectDerivativesDb, collectIndicators, collectIntelligence, collectMacroSeries, collectMicroRegime, collectQuotes, collectRegime, collectSectors, collectTickerCatalysts, collectUnavailable } from '../lib/jarvis/collectors';
import { buildBrief } from '../lib/jarvis/brief';
import { renderMarkdown } from '../lib/jarvis/render';
import type { JarvisBrief } from '../lib/jarvis/types';

const REPORT_DIR = path.resolve(process.cwd(), 'reports');
const LATEST_JSON = path.join(REPORT_DIR, 'jarvis-latest.json');
const PREVIOUS_JSON = path.join(REPORT_DIR, 'jarvis-previous.json');
const LATEST_MD = path.join(REPORT_DIR, 'jarvis-latest.md');

function loadPrevious(): JarvisBrief | null {
  try {
    if (!fs.existsSync(LATEST_JSON)) return null;
    return JSON.parse(fs.readFileSync(LATEST_JSON, 'utf8')) as JarvisBrief;
  } catch {
    return null;
  }
}

async function main() {
  const nowMs = Date.now();
  const t0 = Date.now();
  const log = (m: string) => process.stderr.write(`[jarvis] ${m}\n`);

  log('collecting regime / quotes / scanner / macro / intelligence / calendar / crypto / sectors …');
  const [regime, micro, quotes, scanner, macro, intelligence, calendar, crypto, derivativesDb, sectors] = await Promise.all([
    collectRegime(nowMs), collectMicroRegime(nowMs), collectQuotes(nowMs), collectCrcs(nowMs), collectMacroSeries(nowMs),
    collectIntelligence(nowMs), collectCalendar(nowMs), collectCrypto(nowMs), collectDerivativesDb(nowMs), collectSectors(nowMs),
  ]);
  const topSymbols = scanner.data ? [...scanner.data.latest].sort((a, b) => b.crcs_final - a.crcs_final).slice(0, 80).map((r) => r.symbol) : [];
  const indicatorSymbols = [...new Set([...KEY_SYMBOLS, ...topSymbols])];
  log(`collecting indicators for ${indicatorSymbols.length} symbols + per-ticker catalysts …`);
  const [indicators, tickerCatalysts] = await Promise.all([collectIndicators(nowMs, indicatorSymbols), collectTickerCatalysts(nowMs, topSymbols)]);

  const previous = loadPrevious();
  const brief = buildBrief({ nowMs, regime, micro, quotes, indicators, sectors, scanner, crypto, derivativesDb, macro, intelligence, calendar, tickerCatalysts, unavailable: collectUnavailable(), previous });

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  if (fs.existsSync(LATEST_JSON)) fs.copyFileSync(LATEST_JSON, PREVIOUS_JSON);
  fs.writeFileSync(LATEST_JSON, JSON.stringify(brief, null, 2), 'utf8');
  fs.writeFileSync(LATEST_MD, renderMarkdown(brief), 'utf8');

  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${path.relative(process.cwd(), LATEST_MD)}, ${path.relative(process.cwd(), LATEST_JSON)}`);
  log(`confidence ${brief.confidence.label} ${brief.confidence.score}/100; coverage ${brief.criticalCoverage.covered}/${brief.criticalCoverage.total}; regime ${brief.marketState.regime.label}; liquidity ${brief.marketState.liquidity.label}; fragility ${brief.marketState.fragility.label}; breadth ${brief.marketState.breadth.label}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[jarvis] fatal:', err);
  process.exit(1);
});
