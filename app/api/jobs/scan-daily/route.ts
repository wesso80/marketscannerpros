import { randomUUID } from 'node:crypto';
/**
 * Daily Scanner Cron Job
 * 
 * @route POST /api/jobs/scan-daily
 * @description Scans top symbols for each asset class and stores results
 * @cron Runs daily at 9:30 PM UTC (4:30 PM EST after market close)
 * 
 * Protected by CRON_SECRET - only callable by Render cron (or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { avTakeToken } from "@/lib/avRateGovernor";
import { runWithAvBudget } from "@/lib/avLimiter";
import { verifyCronAuth, verifyAdminAuth } from "@/lib/adminAuth";
import { alertCronFailure } from "@/lib/opsAlerting";
import { computeDailyIndicators, ema200SanityFailure, scanCryptoDailyIndicators } from "@/lib/scanner/dailyCryptoIndicators";
import { canonicalForDailyPick, compactCanonical, selectDailyPicks, withCanonicalColumns, type RegimeOverlayInputs } from "@/lib/scoring/canonical";
import { loadRegimeOverlayInputs } from "@/lib/scoring/canonical/regimeOverlayData";
import { parseAlphaVantageDailyBars } from "@/lib/scanner/avDailyBars";
import { DAILY_SCAN_ASSETS, parseDailyScanAssets, type DailyScanAsset } from "@/lib/scanner/dailyScanAssets";
import { dailyPublication, isCompletedDailyBar } from '@/lib/scanner/dailyPublication';
import { latestUsSessionDate } from "@/lib/time/usSession";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max

// Top symbols to scan for each asset class
const EQUITY_UNIVERSE = [
  // Mega-cap tech
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  // Finance
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP",
  // Healthcare
  "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
  // Consumer
  "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "SBUX", "TGT", "HD",
  // Industrial
  "CAT", "DE", "UPS", "FDX", "BA", "HON", "GE", "LMT", "RTX", "MMM",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "VLO", "MPC", "KMI",
  // Semi & Tech
  "AMD", "INTC", "QCOM", "MU", "AMAT", "LRCX", "KLAC", "TXN", "ADI", "MRVL",
  // Growth
  "NFLX", "UBER", "ABNB", "SQ", "SHOP", "SNOW", "PLTR", "CRWD", "ZS", "DDOG",
  // Other notable
  "BRK.B", "DIS", "CMCSA", "VZ", "T", "PYPL", "ADBE", "NOW", "INTU", "IBM"
];

const CRYPTO_UNIVERSE = [
  "BTC", "ETH", "BNB", "XRP", "SOL", "ADA", "DOGE", "TRX", "AVAX", "LINK",
  "DOT", "MATIC", "SHIB", "LTC", "BCH", "ATOM", "UNI", "XLM", "ETC", "NEAR",
  "APT", "ARB", "OP", "INJ", "FIL", "VET", "AAVE", "GRT", "ALGO", "FTM",
  "SAND", "MANA", "AXS", "THETA", "XTZ", "EOS", "FLOW", "CHZ", "CRV", "LDO",
  "MKR", "SNX", "COMP", "SUSHI", "YFI", "BAL", "1INCH", "ENS", "LRC", "IMX"
];

const FOREX_UNIVERSE = [
  "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY", "HKD", "SGD",
  "SEK", "NOK", "MXN", "ZAR", "TRY", "INR", "BRL", "PLN", "THB", "KRW"
];

// Rate limiter — avTakeToken() handles the global 400 RPM governor,
// but add a small floor delay to avoid burst-hammering
const RATE_LIMIT_DELAY = 200; // ms between calls (governor handles throttling)

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      await avTakeToken();
      const res = await fetch(url);
      const data = await res.json();
      if (data.Note || data.Information) {
        // Rate limited - wait and retry (short wait, governor handles pacing)
        if (i < retries) {
          await sleep(5000);
          continue;
        }
      }
      return data;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(2000);
    }
  }
}

// Compute score from indicators (matching main scanner logic)
function computeScore(indicators: Record<string, any>): { score: number; direction: string; signals: { bullish: number; bearish: number; neutral: number } } {
  let bullishSignals = 0;
  let bearishSignals = 0;
  let neutralSignals = 0;
  
  const price = indicators.price;
  const ema200 = indicators.ema200;
  const rsi = indicators.rsi;
  const macd = indicators.macd;
  const macdSignal = indicators.macdSignal;
  const adx = indicators.adx;
  const stochK = indicators.stochK;
  const stochD = indicators.stochD;
  const aroonUp = indicators.aroonUp;
  const aroonDown = indicators.aroonDown;
  const cci = indicators.cci;

  // 1. Trend vs EMA200
  if (price && ema200) {
    if (price > ema200 * 1.01) { bullishSignals += 2; }
    else if (price < ema200 * 0.99) { bearishSignals += 2; }
    else { neutralSignals += 1; }
  }
  
  // 2. RSI
  if (rsi !== undefined) {
    if (rsi >= 55 && rsi <= 70) { bullishSignals += 1; }
    else if (rsi > 70) { bearishSignals += 1; }
    else if (rsi <= 45 && rsi >= 30) { bearishSignals += 1; }
    else if (rsi < 30) { bullishSignals += 1; }
    else { neutralSignals += 1; }
  }

  // 3. MACD
  if (macd !== undefined && macdSignal !== undefined) {
    if (macd > macdSignal) { bullishSignals += 1; }
    else { bearishSignals += 1; }
    
    if (macd > 0) { bullishSignals += 0.5; }
    else { bearishSignals += 0.5; }
  }

  // 4. ADX
  if (adx !== undefined) {
    if (adx > 25) {
      if (bullishSignals > bearishSignals) bullishSignals += 1;
      else if (bearishSignals > bullishSignals) bearishSignals += 1;
    } else {
      neutralSignals += 1;
    }
  }

  // 5. Stochastic
  if (stochK !== undefined) {
    if (stochK > 80) { bearishSignals += 1; }
    else if (stochK < 20) { bullishSignals += 1; }
    else if (stochK >= 50) { bullishSignals += 0.5; }
    else { bearishSignals += 0.5; }
  }

  // 6. Aroon
  if (aroonUp !== undefined && aroonDown !== undefined) {
    if (aroonUp > aroonDown && aroonUp > 70) { bullishSignals += 1; }
    else if (aroonDown > aroonUp && aroonDown > 70) { bearishSignals += 1; }
    else { neutralSignals += 0.5; }
  }

  // 7. CCI
  if (cci !== undefined) {
    if (cci > 100) { bullishSignals += 1; }
    else if (cci > 0) { bullishSignals += 0.5; }
    else if (cci < -100) { bearishSignals += 1; }
    else { bearishSignals += 0.5; }
  }

  // Calculate direction (same threshold as main scanner)
  let direction: string;
  if (bullishSignals > bearishSignals * 1.3) {
    direction = 'bullish';
  } else if (bearishSignals > bullishSignals * 1.3) {
    direction = 'bearish';
  } else {
    direction = 'neutral';
  }

  // Calculate score (0-100)
  let score = 50;
  const signalDiff = bullishSignals - bearishSignals;
  const maxSignals = 8.5; // True max bullish or bearish signals
  score += (signalDiff / maxSignals) * 50;
  score = Math.max(1, Math.min(100, Math.round(score)));

  return {
    score,
    direction,
    signals: {
      bullish: Math.round(bullishSignals),
      bearish: Math.round(bearishSignals),
      neutral: Math.round(neutralSignals)
    }
  };
}

async function scanEquity(symbol: string, apiKey: string, overlay: RegimeOverlayInputs | null = null): Promise<any | null> {
  try {
    const baseUrl = "https://www.alphavantage.co/query";

    // One request: full daily history (split-adjusted locally). Indicators are computed with the canonical
    // lib/ta/core maths (Wilder ADX/ATR, TradingView EMA/Stochastic) — the same functions the scanner, bulk
    // scanner, scan-universe and Golden Egg use — instead of seven separate Alpha Vantage indicator endpoints
    // whose Stochastic (5/3/3 slow) and warm-up rules differed from every other page.
    const priceUrl = `${baseUrl}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&entitlement=realtime&apikey=${apiKey}`;
    const priceData = await fetchWithRetry(priceUrl);
    await sleep(RATE_LIMIT_DELAY);

    const bars = parseAlphaVantageDailyBars(priceData).filter(b => isCompletedDailyBar('equity', b.t));
    if (bars.length < 2) return null;

    const price = bars[bars.length - 1].close;
    const prevClose = bars[bars.length - 2].close;
    const changePercent = ((price - prevClose) / prevClose) * 100;

    const indicators: Record<string, any> = { price, ...computeDailyIndicators(bars) };
    const sanity = ema200SanityFailure(price, indicators.ema200);
    if (sanity) {
      console.error(`Dropping equity ${symbol}: EMA200 sanity check failed: ${sanity}`);
      return null;
    }
    // Canonical verdict (primary label; the signal-count score below stays as the legacy/secondary value).
    const canonical = canonicalForDailyPick(bars, { symbol, assetClass: 'equity', overlay });
    if (canonical) indicators.canonical = compactCanonical(canonical);

    const { score, direction, signals } = computeScore(indicators);

    return {
      symbol,
      asset_class: 'equity',
      score,
      direction,
      signals_bullish: signals.bullish,
      signals_bearish: signals.bearish,
      signals_neutral: signals.neutral,
      price,
      change_percent: changePercent,
      indicators
    };
  } catch (e) {
    console.error(`Error scanning ${symbol}:`, e);
    return null;
  }
}

async function scanCrypto(symbol: string, apiKey: string, overlay: RegimeOverlayInputs | null = null): Promise<any | null> {
  try {
    // Both the displayed price and canonical levels use the same completed daily candle.
    const outcome = await scanCryptoDailyIndicators(symbol, null);
    const changePercent = outcome.ok && outcome.bars.length > 1
      ? (outcome.price / outcome.bars[outcome.bars.length - 2].close - 1) * 100 : null;
    if (!outcome.ok) {
      // Includes the EMA200 sanity guard (price vs EMA200 more than 5x apart)
      console.error(`Dropping crypto ${symbol}: ${outcome.reason}`);
      return null;
    }
    const { price } = outcome;
    const indicators: Record<string, any> = { ...outcome.indicators };
    const canonical = canonicalForDailyPick(outcome.bars, { symbol, assetClass: 'crypto', overlay });
    if (canonical) indicators.canonical = compactCanonical(canonical);

    const { score, direction, signals } = computeScore(indicators);

    return {
      symbol,
      asset_class: 'crypto',
      score,
      direction,
      signals_bullish: signals.bullish,
      signals_bearish: signals.bearish,
      signals_neutral: signals.neutral,
      price,
      change_percent: changePercent,
      indicators
    };
  } catch (e) {
    console.error(`Error scanning crypto ${symbol}:`, e);
    return null;
  }
}

async function scanForex(symbol: string, apiKey: string, overlay: RegimeOverlayInputs | null = null): Promise<any | null> {
  try {
    const baseUrl = "https://www.alphavantage.co/query";
    
    // Fetch daily forex bars (full history so EMA200 is real) and compute the same lib/ta/core indicator set as the
    // equity and crypto paths. Before Sep 2026 this path stored EMA50 under `ema200` ("proxy for scoring") and used a
    // simple-average RSI, so forex daily picks were scored on a different, mislabeled trend line.
    const priceUrl = `${baseUrl}?function=FX_DAILY&from_symbol=${symbol}&to_symbol=USD&outputsize=full&apikey=${apiKey}`;
    const priceData = await fetchWithRetry(priceUrl);
    await sleep(RATE_LIMIT_DELAY);

    const bars = parseAlphaVantageDailyBars(priceData).filter(b => isCompletedDailyBar('forex', b.t));
    if (bars.length < 2) return null;

    const price = bars[bars.length - 1].close;
    const prevClose = bars[bars.length - 2].close;
    const changePercent = ((price - prevClose) / prevClose) * 100;

    // EMA200 is omitted (not substituted) when fewer than 200 bars exist.
    const indicators: Record<string, any> = { price, ...computeDailyIndicators(bars) };
    const canonical = canonicalForDailyPick(bars, { symbol: `${symbol}/USD`, assetClass: 'forex', overlay });
    if (canonical) indicators.canonical = compactCanonical(canonical);

    const { score, direction, signals } = computeScore(indicators);

    return {
      symbol: `${symbol}/USD`,
      asset_class: 'forex',
      score,
      direction,
      signals_bullish: signals.bullish,
      signals_bearish: signals.bearish,
      signals_neutral: signals.neutral,
      price,
      change_percent: changePercent,
      indicators
    };
  } catch (e) {
    console.error(`Error scanning forex ${symbol}:`, e);
    return null;
  }
}

// Accept both GET (for cron-job.org) and POST
export async function GET(req: NextRequest) {
  return runWithAvBudget({ lane: 'scheduled', feature: 'daily-scan' }, () => runDailyScan(req));
}

export async function POST(req: NextRequest) {
  return runWithAvBudget({ lane: 'scheduled', feature: 'daily-scan' }, () => runDailyScan(req));
}

async function runDailyScan(req: NextRequest) {
  try {
    // Optional secret check - via header or bearer token
    if (!verifyCronAuth(req) && !verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "API key not configured" });
    }

    // Optional ?assets=crypto (comma list of equity,crypto,forex): refresh only those asset classes for the current
    // session date, leaving the other rows in place. Crypto's daily candle closes at 00:00 UTC, 2.5 h after the 21:30 UTC
    // run, so a crypto-only run shortly after 00:00 UTC keeps crypto rows on the latest completed candle.
    const requested = parseDailyScanAssets(new URL(req.url).searchParams.get('assets'));
    if (requested && requested.length === 0) {
      return NextResponse.json({ success: false, error: "assets must list equity and/or crypto" }, { status: 400 });
    }
    const wants = (assetClass: DailyScanAsset) => !requested || requested.includes(assetClass);

    const results: any[] = [];
    const errors: string[] = [];
    const deadline = Date.now() + 250_000; // 250s hard budget (curl max-time is 290s)
    const hasTime = () => Date.now() < deadline;
    // Regime overlay inputs (VIX / credit / M2 / SPY-QQQ trend) once per run; fails soft to "no overlay".
    const overlay = await loadRegimeOverlayInputs().catch(() => null);

    // Scan equities (top 15 — bail early if approaching timeout)
    console.log("Starting equity scan...");
    const equitiesToScan = wants('equity') ? EQUITY_UNIVERSE.slice(0, 15) : [];
    for (const symbol of equitiesToScan) {
      if (!hasTime()) { console.log(`Time budget exhausted at equity:${symbol}`); break; }
      const result = await scanEquity(symbol, apiKey, overlay);
      if (result) results.push(result);
      else errors.push(`equity:${symbol}`);
    }

    // Scan crypto (top 5 — indicators from CoinGecko daily OHLC, computed locally)
    console.log("Starting crypto scan...");
    const cryptoToScan = wants('crypto') ? CRYPTO_UNIVERSE.slice(0, 5) : [];
    for (const symbol of cryptoToScan) {
      if (!hasTime()) { console.log(`Time budget exhausted at crypto:${symbol}`); break; }
      const result = await scanCrypto(symbol, apiKey, overlay);
      if (result) results.push(result);
      else errors.push(`crypto:${symbol}`);
    }

    // Store results in database. scan_date = the US market session the data belongs to (America/New_York calendar):
    // the 21:30 UTC run (7:30 AM AEST) is dated with the session that just closed, and weekend/holiday re-runs keep
    // that session's date instead of inventing a Saturday. (It used to be the server's UTC calendar day.)
    const today = latestUsSessionDate(Date.now());
    const runId = randomUUID();
    
    // Insert new results. score/direction columns carry the canonical verdict (0 = BLOCK); the legacy signal-count
    // values are kept in indicators.legacy (see lib/scoring/canonical/dailyPick).
    for (const r of results.map(withCanonicalColumns)) {
      const publication = dailyPublication(r.asset_class, r.indicators);
      r.indicators.data_as_of = publication.dataAsOf;
      r.indicators.run_id = runId;
      await q(`
        INSERT INTO daily_picks (
          asset_class, symbol, score, direction,
          signals_bullish, signals_bearish, signals_neutral,
          price, change_percent, indicators, scan_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (asset_class, symbol, scan_date) DO NOTHING
      `, [
        r.asset_class,
        r.symbol,
        r.score,
        r.direction,
        r.signals_bullish,
        r.signals_bearish,
        r.signals_neutral,
        r.price,
        r.change_percent,
        JSON.stringify(r.indicators),
        publication.scanDate
      ]);
    }

    // Published picks are retained; reruns never rewrite created_at or delete prior rows.

    return NextResponse.json({
      success: true,
      scanDate: today,
      assets: requested ?? DAILY_SCAN_ASSETS,
      scanned: results.length,
      errors: errors.length,
      errorSymbols: errors,
      topPicks: Object.fromEntries((['equity', 'crypto'] as const).filter((ac) => wants(ac)).map((ac) => {
        const rows = results.filter(r => r.asset_class === ac).map((r) => ({ ...r, canonical: r.indicators?.canonical ?? null }));
        return [ac, selectDailyPicks(rows, 1).top[0] ?? null];
      })),
    });

  } catch (error) {
    console.error("Daily scan error:", error);
    const msg = error instanceof Error ? error.message : "Scan failed";
    await alertCronFailure('scan-daily', msg);
    // Return 200 with error details — prevents cron exit-22 for transient failures
    return NextResponse.json({ 
      success: false, 
      error: msg 
    });
  }
}
