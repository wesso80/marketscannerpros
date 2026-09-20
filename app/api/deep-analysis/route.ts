/**
 * Golden Egg Deep Analyst
 *
 * GET /api/deep-analysis?symbol=META[&type=equity|crypto][&timeframe=daily]
 *
 * Consumes the canonical Golden Egg packet (lib/goldenEgg/engine) — it does NOT refetch price, indicators or options.
 * It enriches the packet with symbol-relevant news, earnings and fundamentals context, and asks the model to
 * INTERPRET the packet in a fixed research format. The Golden Egg verdict stays canonical; there is no second
 * directional engine.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { deepAnalysisLimiter, getClientIP } from '@/lib/rateLimit';
import { avFetch } from '@/lib/avRateGovernor';
import { getGlobalData } from '@/lib/coingecko';
import { detectAssetClass } from '@/lib/goldenEggFetchers';
import { computeGoldenEgg } from '@/lib/goldenEgg/engine';
import { getEarningsHistory, getFundamentalsSummary, type EarningsHistory, type FundamentalsSummary } from '@/lib/goldenEgg/companyOverview';
import { filterRelevantNews, summarizeNews, avTickerKey, type RelevantArticle } from '@/lib/goldenEgg/newsRelevance';
import { formatUsdShort } from '@/lib/goldenEgg/semantics';
import type { GoldenEggPayload, GoldenEggCanonical } from '@/src/features/goldenEgg/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function isLocalDeepAnalysisDemoAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.LOCAL_DEMO_MARKET_DATA === 'true';
}

// ── News (ticker-relevant only) ─────────────────────────────────────────
async function fetchRelevantNews(symbol: string, assetClass: 'equity' | 'crypto' | 'forex'): Promise<{ items: RelevantArticle[]; considered: number; provider: string }> {
  if (!ALPHA_VANTAGE_API_KEY) return { items: [], considered: 0, provider: 'unavailable' };
  const key = avTickerKey(symbol, assetClass);
  const data = await avFetch<any>(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(key)}&limit=50&sort=LATEST&apikey=${ALPHA_VANTAGE_API_KEY}`, `NEWS ${key}`);
  const feed = Array.isArray(data?.feed) ? data.feed : [];
  return { items: filterRelevantNews(feed, symbol, assetClass), considered: feed.length, provider: 'alpha_vantage NEWS_SENTIMENT (ticker-filtered, relevance ≥ 0.35)' };
}

// ── Crypto market sentiment proxy (unchanged formula, labelled as a proxy) ─
async function fetchCryptoSentiment() {
  try {
    const global = await getGlobalData();
    const mcapChange = Number(global?.market_cap_change_percentage_24h_usd || 0);
    const stableDom = Number(global?.market_cap_percentage?.usdt || 0) + Number(global?.market_cap_percentage?.usdc || 0);
    const value = Math.max(0, Math.min(100, Math.round(50 + mcapChange * 4 - Math.max(0, stableDom - 7.5) * 6)));
    const classification = value < 20 ? 'Extreme Fear' : value < 40 ? 'Fear' : value < 60 ? 'Neutral' : value < 80 ? 'Greed' : 'Extreme Greed';
    return { value, classification, basis: 'MSP proxy from 24h total-cap change and stablecoin dominance (not the alternative.me index)' };
  } catch { return null; }
}

// ── Analyst structured output ───────────────────────────────────────────
interface AnalystSections {
  thesis: string;
  supports: string[];
  against: string[];
  primaryBlocker: string;
  confirms: string[];
  invalidates: string[];
  catalysts: string[];
  changesView: string[];
  reading: string; // 1–2 sentence conditional summary
}

function fmtNum(v: number | null | undefined, d = 2): string { return v == null || !Number.isFinite(v) ? 'n/a' : v.toFixed(d); }
function fmtPx(v: number | null | undefined): string { if (v == null || !Number.isFinite(v)) return 'n/a'; return Math.abs(v) >= 1 ? `$${v.toFixed(2)}` : `$${v.toPrecision(4)}`; }

/** Deterministic fallback analyst (no LLM) built only from the packet — also used as the grounding contract for the model. */
function buildDeterministicAnalyst(c: GoldenEggCanonical, ge: GoldenEggPayload, news: RelevantArticle[], fundamentals: FundamentalsSummary | null): AnalystSections {
  const dir = c.verdict.direction;
  const dirWord = dir === 'LONG' ? 'bullish' : dir === 'SHORT' ? 'bearish' : 'neutral';
  const supports: string[] = [];
  const against: string[] = [];
  if (c.scores.structure >= 65) supports.push(`Structure ${c.scores.structure}/100 — ${c.scores.notes.structure[0] ?? 'price aligned with the 20/50-bar means'}`);
  else against.push(`Structure ${c.scores.structure}/100 — ${c.scores.notes.structure[0] ?? 'alignment mixed'}`);
  if (c.scores.momentum >= 65) supports.push(`Momentum ${c.scores.momentum}/100 — RSI ${fmtNum(c.indicators.rsi, 1)}, MACD hist ${fmtNum(c.indicators.macdHist, 3)}`);
  else if (c.scores.momentum < 45) against.push(`Momentum ${c.scores.momentum}/100 — RSI ${fmtNum(c.indicators.rsi, 1)}`);
  if (c.scores.flow >= 60) supports.push(`Flow ${c.scores.flow}/100 — ${c.scores.notes.flow[0] ?? 'positioning supportive'}`);
  else if (c.scores.flow < 50) against.push(`Flow ${c.scores.flow}/100 — ${c.scores.notes.flow[0] ?? 'positioning not supportive'}`);
  if (c.indicators.ema200 != null) (c.price > c.indicators.ema200 === (dir !== 'SHORT') ? supports : against).push(`Price ${c.price > c.indicators.ema200 ? 'above' : 'below'} EMA200 ${fmtPx(c.indicators.ema200)}`);
  if (c.extension.label !== 'normal') against.push(`Extension ${c.extension.label} — RSI ${fmtNum(c.indicators.rsi, 1)}, stochastic ${fmtNum(c.indicators.stochK, 0)}${c.extension.dveExhaustion != null && c.extension.dveExhaustion >= 60 ? `, DVE exhaustion ${Math.round(c.extension.dveExhaustion)}/100` : ''}`);
  if (c.timing.relation === 'conflict') against.push(`Time confluence ${c.timing.direction} (${c.timing.signalStrength}) opposes the ${dirWord} read${c.timing.eligibleForHardGate ? ' and gates the verdict' : ' — below hard-gate thresholds'}`);
  if (c.timing.relation === 'supportive') supports.push(`Time confluence ${c.timing.direction} (${c.timing.signalStrength}) agrees`);
  if (c.crossMarket.alignment === 'supportive') supports.push(`Cross-market supportive — ${c.crossMarket.summary}`);
  if (c.crossMarket.alignment === 'headwind') against.push(`Cross-market headwind — ${c.crossMarket.summary}`);
  if (c.dataTrust.level !== 'GOOD') against.push(`Data trust ${c.dataTrust.label}: ${c.dataTrust.reasons.join('; ')}`);
  for (const r of c.scores.notes.risk) if (!/no material risk flags/.test(r)) against.push(`Risk: ${r}`);
  if (c.derivatives && c.derivatives.crowding !== 'neutral') against.push(`Derivatives ${c.derivatives.crowding.replace('_', ' ')} — funding ${c.derivatives.fundingRatePercent >= 0 ? '+' : ''}${c.derivatives.fundingRatePercent.toFixed(4)}% per ~8h`);
  if (c.options && c.options.quality.level !== 'GOOD') against.push(`Options chain ${c.options.quality.level.toLowerCase()} on ${c.options.expiry}: ${c.options.quality.reasons[0]}`);
  if (fundamentals) {
    if (fundamentals.earningsGrowthYoy != null && fundamentals.earningsGrowthYoy < 0) against.push(`Earnings −${Math.abs(fundamentals.earningsGrowthYoy * 100).toFixed(1)}% YoY (latest quarter) — fundamental headwind for a ${dirWord} read`);
    if (fundamentals.revenueGrowthYoy != null && fundamentals.revenueGrowthYoy > 0.1) supports.push(`Revenue +${(fundamentals.revenueGrowthYoy * 100).toFixed(1)}% YoY (latest quarter)`);
    if (fundamentals.daysToEarnings != null && fundamentals.daysToEarnings >= 0 && fundamentals.daysToEarnings <= 14) against.push(`Earnings ${fundamentals.nextEarningsDate} in ${fundamentals.daysToEarnings} days — event risk`);
  }
  const catalysts: string[] = news.length
    ? news.slice(0, 5).map((n) => `[${n.catalyst}] ${n.title} — ${n.catalystReason} (${n.source}, relevance ${n.relevance.toFixed(2)})`)
    : ['No material symbol-specific news identified.'];
  if (fundamentals?.nextEarningsDate) catalysts.push(`[EVENT_RISK] Next earnings ${fundamentals.nextEarningsDate}${fundamentals.daysToEarnings != null ? ` (${fundamentals.daysToEarnings} days)` : ''}`);
  const changesView = [
    ...c.invalidation.map((t) => `Weakens: ${t}`),
    ...(c.timing.relation === 'conflict' ? ['Strengthens: time confluence flipping to agree or falling below gate thresholds'] : []),
    ...(c.scores.flow < 60 ? ['Strengthens: positioning turning supportive (P/C or funding moving with the direction)'] : []),
    ...(c.dataTrust.level !== 'GOOD' ? ['Strengthens: data trust returning to GOOD'] : []),
  ];
  const assess = c.verdict.assessment === 'ALIGNED' ? 'aligned' : c.verdict.assessment === 'NOT_ALIGNED' ? 'not aligned' : 'in watch mode';
  return {
    thesis: `${c.symbol} (${c.assetClass}, ${c.timeframe}) is ${assess} with a ${dirWord} bias: ${c.verdict.setupType.replace('_', ' ')} setup — ${c.verdict.setupNote}. Confluence ${c.verdict.confluence}/100 (evidence alignment, not a probability).`,
    supports: supports.length ? supports : ['No component clears the supportive threshold.'],
    against: against.length ? against : ['No material evidence against the read at current inputs.'],
    primaryBlocker: c.verdict.primaryBlocker ?? 'None flagged by the Golden Egg engine.',
    confirms: c.confirmation,
    invalidates: c.invalidation,
    catalysts,
    changesView,
    reading: `If ${c.confirmation[0] ? c.confirmation[0].charAt(0).toLowerCase() + c.confirmation[0].slice(1).replace(/\.$/, '') : 'the reference condition prints'}, the ${dirWord} scenario would gain support; if ${c.invalidation[0] ? c.invalidation[0].charAt(0).toLowerCase() + c.invalidation[0].slice(1).replace(/\.$/, '') : 'invalidation prints'}, it is off the table. Educational research only.`,
  };
}

function buildPacketPrompt(c: GoldenEggCanonical, ge: GoldenEggPayload, news: RelevantArticle[], fundamentals: FundamentalsSummary | null, earnings: EarningsHistory | null, cryptoSentiment: { value: number; classification: string; basis: string } | null): string {
  const L: string[] = [];
  L.push(`GOLDEN EGG CANONICAL PACKET — ${c.symbol} (${c.assetClass}, timeframe ${c.timeframe}, bars ${c.barInterval ?? 'n/a'})`);
  L.push(`Price ${fmtPx(c.price)} as of ${c.priceTs}; last completed bar ${c.lastCompletedBarAt ?? 'n/a'}; history ${c.historyBars} bars; source ${c.source ?? 'n/a'}.`);
  L.push(`VERDICT: ${c.verdict.assessment} · direction ${c.verdict.direction} · confluence ${c.verdict.confluence}/100 (evidence alignment, NOT a probability) · grade ${c.verdict.grade}`);
  L.push(`Setup: ${c.verdict.setupType} — ${c.verdict.setupNote}`);
  L.push(`Primary driver: ${c.verdict.primaryDriver}`);
  L.push(`Primary blocker: ${c.verdict.primaryBlocker ?? 'none flagged'}`);
  L.push(`Scores: structure ${c.scores.structure}, flow ${c.scores.flow}, momentum ${c.scores.momentum}, risk quality ${c.scores.riskQuality} (100 = clean; risk is never bullish evidence).`);
  L.push(`  structure notes: ${c.scores.notes.structure.join('; ') || 'none'}`);
  L.push(`  flow notes: ${c.scores.notes.flow.join('; ') || 'none'}`);
  L.push(`  momentum notes: ${c.scores.notes.momentum.join('; ') || 'none'}`);
  L.push(`  risk notes: ${c.scores.notes.risk.join('; ')}`);
  L.push(`Indicators (computed on ${c.indicators.computedOn}): RSI ${fmtNum(c.indicators.rsi, 1)}, ADX ${fmtNum(c.indicators.adx, 1)} (trend STRENGTH only, not direction), ATR ${fmtNum(c.indicators.atr, 4)} (${fmtNum(c.indicators.atrPct, 2)}%), EMA20 ${fmtPx(c.indicators.ema20)}, EMA50 ${fmtPx(c.indicators.ema50)}, EMA200 ${fmtPx(c.indicators.ema200)}, SMA20 ${fmtPx(c.indicators.sma20)}, SMA50 ${fmtPx(c.indicators.sma50)}, MACD hist ${fmtNum(c.indicators.macdHist, 4)}, stochastic ${fmtNum(c.indicators.stochK, 0)}.`);
  L.push(`Extension: ${c.extension.label}; RSI extended ${c.extension.rsiExtended}; stochastic extended ${c.extension.stochExtended}; DVE exhaustion ${c.extension.dveExhaustion ?? 'n/a'}/100; DVE signal ${c.extension.dveSignal ?? 'none'}${c.extension.dveSignalStrength ? ` (strength ${c.extension.dveSignalStrength})` : ''}.`);
  L.push(`Data trust: ${c.dataTrust.label}${c.dataTrust.reasons.length ? ` — ${c.dataTrust.reasons.join('; ')}` : ''}; freshness ${c.dataTrust.freshness}.`);
  L.push(`Liquidity: avg dollar volume ${c.liquidity.advUsd != null ? formatUsdShort(c.liquidity.advUsd) : 'n/a'} (${c.liquidity.volumeBasis ?? 'n/a'}).`);
  L.push(`Time confluence: relation ${c.timing.relation}, valid ${c.timing.valid}, hard-gate eligible ${c.timing.eligibleForHardGate}, direction ${c.timing.direction}, strength ${c.timing.signalStrength}, session ${c.timing.sessionState}. ${c.timing.reasons.join('; ')}`);
  L.push(`Cross-market (${c.crossMarket.alignment}): ${c.crossMarket.summary}`);
  for (const i of c.crossMarket.items) L.push(`  ${i.symbol} ${i.label}: ${i.trend} — ${i.detail} → ${i.relation}`);
  if (c.derivatives) L.push(`Derivatives: funding ${c.derivatives.fundingRatePercent >= 0 ? '+' : ''}${c.derivatives.fundingRatePercent.toFixed(4)}% per ${c.derivatives.fundingInterval} (annualised ${c.derivatives.annualizedPct.toFixed(1)}%), OI ${formatUsdShort(c.derivatives.openInterestUsd)}, perp volume ${formatUsdShort(c.derivatives.perpVolume24hUsd)}, ${c.derivatives.exchanges} venues, crowding ${c.derivatives.crowding}. ${c.derivatives.note}`);
  if (c.options) L.push(`Options (expiry ${c.options.expiry}, ${c.options.daysToExpiry} DTE, snapshot ${c.options.snapshotTs}): P/C OI ${c.options.putCallOi}, avg IV ${c.options.avgIvPct ?? 'n/a'}%, expected move ±${c.options.expectedMovePct ?? 'n/a'}%, max pain ${c.options.maxPain ?? 'n/a'}, call wall ${c.options.callWall ? `${c.options.callWall.strike} (${c.options.callWall.relation} spot)` : 'n/a'}, put wall ${c.options.putWall ? `${c.options.putWall.strike} (${c.options.putWall.relation} spot)` : 'n/a'}, dealer gamma ${c.options.dealerGamma}, unusual activity ${c.options.unusualActivity}, chain quality ${c.options.quality.level}${c.options.quality.reasons.length ? ` (${c.options.quality.reasons.join('; ')})` : ''}. IV rank unavailable (no IV history).`);
  L.push(`Levels: reference ${fmtPx(c.levels.reference.price)} [${c.levels.reference.basis}] — ${c.levels.reference.label}`);
  L.push(`  invalidation ${fmtPx(c.levels.invalidation.price)} [${c.levels.invalidation.basis}, ${c.levels.invalidation.distanceAtr ?? 'n/a'} ATR] — ${c.levels.invalidation.label}`);
  L.push(`  reaction zones: ${c.levels.zones.map((z) => `${fmtPx(z.price)} [${z.basis}${z.rMultiple != null ? `, ${z.rMultiple}R` : ''}: ${z.label}]`).join(' · ')}; illustrative R ${c.levels.illustrativeR ?? 'n/a'}`);
  L.push(`Confirmation (engine): ${c.confirmation.join(' | ')}`);
  L.push(`Invalidation (engine): ${c.invalidation.join(' | ')}`);
  L.push(`Flip conditions: ${ge.layer1.flipConditions.map((f) => `[${f.severity}] ${f.text}`).join(' | ') || 'none (aligned)'}`);
  if (fundamentals) {
    L.push(`FUNDAMENTALS (${fundamentals.period.summary}): ${fundamentals.name ?? c.symbol}, ${fundamentals.sector ?? 'n/a'} / ${fundamentals.industry ?? 'n/a'}; market cap ${fundamentals.marketCap != null ? formatUsdShort(fundamentals.marketCap) : 'n/a'}; ${fundamentals.multiple.label} — ${fundamentals.multiple.detail}; profit margin ${fundamentals.profitMargin != null ? (fundamentals.profitMargin * 100).toFixed(1) + '%' : 'n/a'} TTM; revenue growth ${fundamentals.revenueGrowthYoy != null ? (fundamentals.revenueGrowthYoy * 100).toFixed(1) + '% YoY' : 'n/a'}; earnings growth ${fundamentals.earningsGrowthYoy != null ? (fundamentals.earningsGrowthYoy * 100).toFixed(1) + '% YoY' : 'n/a'} (latest quarter).`);
    L.push(`  Analyst consensus (context only, NOT a signal): target ${fmtPx(fundamentals.analystTarget)} from ${fundamentals.analystCount ?? 'n/a'} analysts${fundamentals.ratings ? ` (SB ${fundamentals.ratings.strongBuy} / B ${fundamentals.ratings.buy} / H ${fundamentals.ratings.hold} / S ${fundamentals.ratings.sell} / SS ${fundamentals.ratings.strongSell})` : ''}.`);
    L.push(`  Earnings: next ${fundamentals.nextEarningsDate ?? 'not scheduled within 3 months'}${fundamentals.daysToEarnings != null ? ` (${fundamentals.daysToEarnings} days)` : ''}; last reported quarter ${fundamentals.lastReportedQuarter ?? 'n/a'}${earnings?.lastReported ? ` — EPS ${fmtNum(earnings.lastReported.reportedEPS)} vs est ${fmtNum(earnings.lastReported.estimatedEPS)} (${earnings.lastReported.beat ? 'beat' : 'miss'}); beat rate ${earnings.beatRate?.toFixed(0) ?? 'n/a'}% over ${earnings.recentQuarters.length} quarters` : ''}.`);
  }
  if (c.network) {
    L.push(`NETWORK / MARKET STRUCTURE: market cap ${c.network.marketCap != null ? formatUsdShort(c.network.marketCap) : 'n/a'} (rank #${c.network.marketCapRank ?? 'n/a'}); circulating ${c.network.circulatingSupply?.toLocaleString() ?? 'n/a'} / max ${c.network.maxSupply?.toLocaleString() ?? 'uncapped or unknown'}; FDV ${c.network.fdv != null ? formatUsdShort(c.network.fdv) : 'n/a'} (${c.network.fdvBasis}); spot volume 24h ${c.network.spotVolume24h != null ? formatUsdShort(c.network.spotVolume24h) : 'n/a'}; distance from ATH ${c.network.distanceFromAthPct ?? 'n/a'}%; 7d ${c.network.change7dPct?.toFixed(1) ?? 'n/a'}%, 30d ${c.network.change30dPct?.toFixed(1) ?? 'n/a'}%. Relative strength: ${c.network.relative.map((r) => `${r.benchmark} ${r.ratio} (${r.label}, ${r.window})`).join(', ') || 'n/a'}. ${c.network.notes.join(' ')}`);
    if (cryptoSentiment) L.push(`Crypto market sentiment proxy: ${cryptoSentiment.value} (${cryptoSentiment.classification}) — ${cryptoSentiment.basis}. Treat as context, not a contrarian signal.`);
  }
  const ns = summarizeNews(news);
  L.push(`NEWS (symbol-specific only): ${ns.headline}`);
  for (const n of news.slice(0, 6)) L.push(`  [${n.catalyst}: ${n.catalystReason}] ${n.title} — ${n.source}, ${n.publishedAt ?? 'n/a'}, ticker sentiment ${n.sentiment} (relevance ${n.relevance.toFixed(2)}). ${n.summary.slice(0, 160)}`);
  return L.join('\n');
}

const ANALYST_SYSTEM = `You are the Golden Egg Deep Analyst for MarketScanner Pros. You INTERPRET a canonical research packet; you never replace its facts.

HARD RULES
- Use ONLY the numbers and statements in the packet. Do not invent catalysts, earnings facts, institutional activity, support/resistance, analyst views, probabilities or news. If something is not in the packet, say it is not available.
- The Golden Egg verdict, direction, blocker and levels are canonical. You may add nuance, but if you disagree you must say exactly which packet fact drives the disagreement.
- ADX measures trend STRENGTH, never direction. RSI/stochastic extremes mean strong momentum AND extension risk at the same time.
- Confluence is evidence alignment, not a probability. Never use "high probability", "likely to rally", "should break out", "expected to rise", "strong chance" or any win-rate language.
- No trade instructions, no BUY/SELL/HOLD, no "traders should". Conditional research language only ("if X prints, the read strengthens").
- Analyst targets and consensus are context, not signals. Catalysts keep the class given in the packet (POSITIVE / NEGATIVE / MIXED / NEUTRAL / EVENT_RISK); a capital raise is not bullish because it is news.
- When the packet says data trust is not GOOD, say so in the thesis and keep every conclusion tentative.

OUTPUT — exactly these headings, in this order, plain text, ≤ 420 words total:
THESIS
WHAT SUPPORTS IT
WHAT ARGUES AGAINST IT
PRIMARY BLOCKER
WHAT CONFIRMS
WHAT INVALIDATES
CATALYSTS / EVENT RISK
WHAT WOULD CHANGE THE VIEW
Use short bullet lines ("- ") under each heading except THESIS and PRIMARY BLOCKER (one or two sentences each). Quote the packet numbers you rely on inline; do not append source tags such as "(Packet)".`;

async function generateAnalyst(prompt: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: ANALYST_SYSTEM }, { role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2,
      }),
    });
    const result = await res.json();
    return result.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[deep-analysis] analyst generation failed:', err);
    return null;
  }
}

/** Post-check: the model must not introduce probability/instruction language; strip offending lines rather than trust them. */
const FORBIDDEN = /\b(high probability|likely to (rally|rise|fall|break)|should (break|rise|fall|rally|move)|expected to (rise|fall|rally|break)|strong chance|will (rally|rise|fall|break)|buy|sell|hold|accumulate|traders should|investors should|we recommend)\b/i;
function sanitizeAnalyst(text: string | null): { text: string | null; removedLines: number } {
  if (!text) return { text: null, removedLines: 0 };
  const lines = text.split('\n');
  const kept = lines.filter((l) => !FORBIDDEN.test(l));
  return { text: kept.join('\n'), removedLines: lines.length - kept.length };
}

// ── Legacy-shaped mirrors so the existing Deep Analysis UI renders from canonical values ───────────
function legacyPrice(c: GoldenEggCanonical) {
  const prev = c.price / (1 + c.changePct / 100);
  return { price: c.price, change: c.price - prev, changePercent: c.changePct, high24h: c.price, low24h: c.price, volume: c.liquidity.volume ?? 0, source: 'golden_egg_canonical', priceTs: c.priceTs, lastCompletedBarAt: c.lastCompletedBarAt, barInterval: c.barInterval };
}
function legacyIndicators(c: GoldenEggCanonical) {
  const i = c.indicators;
  return {
    rsi: i.rsi, macd: i.macd, macdSignal: i.macdSignal, macdHist: i.macdHist, sma20: i.sma20, sma50: i.sma50, ema20: i.ema20, ema50: i.ema50, ema200: i.ema200,
    bbUpper: null, bbMiddle: null, bbLower: null, adx: i.adx, stochK: i.stochK, stochD: null, atr: i.atr, atrPct: i.atrPct,
    volumeRatio: c.liquidity.volume != null && c.liquidity.avgVolume ? c.liquidity.volume / c.liquidity.avgVolume : null,
    priceVsSma20: i.sma20 ? ((c.price - i.sma20) / i.sma20) * 100 : null,
    priceVsSma50: i.sma50 ? ((c.price - i.sma50) / i.sma50) * 100 : null,
    source: 'golden_egg_canonical', computedOn: i.computedOn,
  };
}
function legacyOptions(c: GoldenEggCanonical) {
  if (!c.options) return null;
  const o = c.options;
  const top = (t: NonNullable<typeof o.topCall> | null, relation: string | undefined) => t ? { strike: t.strike, openInterest: t.oi, volume: t.volume, impliedVolatility: t.iv, delta: t.delta, gamma: t.gamma, theta: t.theta, vega: t.vega, relation } : null;
  return {
    expiryDate: o.expiry, expiryFormatted: o.expiry, daysToExpiry: o.daysToExpiry, snapshotTs: o.snapshotTs, currentPrice: c.price,
    highestOICall: top(o.topCall, o.callWall?.relation),
    highestOIPut: top(o.topPut, o.putWall?.relation),
    totalCallOI: o.totalCallOi, totalPutOI: o.totalPutOi, putCallRatio: o.putCallOi, maxPain: o.maxPain,
    // avgIV stays DECIMAL (0.35 = 35%) for the legacy renderer, which multiplies by 100.
    avgIV: o.avgIvPct != null ? o.avgIvPct / 100 : null, ivRank: null, expectedMovePct: o.expectedMovePct, unusualActivity: o.unusualActivity, dealerGamma: o.dealerGamma,
    sentiment: o.putCallOi > 1.2 ? 'Bearish' : o.putCallOi < 0.8 ? 'Bullish' : 'Neutral', quality: o.quality, notes: o.notes, source: 'golden_egg_canonical',
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const ip = getClientIP(request);
    const rl = deepAnalysisLimiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: `Rate limit exceeded. Try again in ${rl.retryAfter}s` }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
    }
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return NextResponse.json({ success: false, error: 'Please log in to use Golden Egg Deep Analysis' }, { status: 401 });
    if (!hasProTraderAccess(session.tier)) return NextResponse.json({ success: false, error: 'Pro Trader subscription required for Golden Egg Deep Analysis' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();
    if (!symbol) return NextResponse.json({ success: false, error: 'Symbol is required' });
    const timeframe = (searchParams.get('timeframe') || 'daily').toLowerCase();
    const assetClass = detectAssetClass(symbol, searchParams.get('type') || undefined);
    const assetType: 'crypto' | 'forex' | 'stock' = assetClass === 'crypto' ? 'crypto' : assetClass === 'forex' ? 'forex' : 'stock';

    // 1) Canonical packet (shared with /api/golden-egg — same cache, same numbers).
    let ge: GoldenEggPayload;
    let geMeta: { cached: boolean; localDemo: boolean; warnings: string[] };
    try {
      const r = await computeGoldenEgg({ symbol, timeframe, assetClass, workspaceId: session.workspaceId });
      ge = r.payload; geMeta = { cached: r.cached, localDemo: r.localDemo, warnings: r.warnings };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Golden Egg unavailable';
      if (isLocalDeepAnalysisDemoAllowed()) return NextResponse.json({ success: false, localDemo: true, error: `Golden Egg packet unavailable locally: ${msg}` });
      return NextResponse.json({ success: false, error: `Unable to build the Golden Egg packet for ${symbol}: ${msg}` });
    }
    const c = ge.canonical;
    if (!c) return NextResponse.json({ success: false, error: 'Golden Egg packet has no canonical block (demo payload) — Deep Analyst requires live data.' , localDemo: geMeta.localDemo });

    // 2) Enrichment only: relevant news, earnings, fundamentals, crypto sentiment proxy.
    const [newsRes, fundamentals, earnings, cryptoSentiment] = await Promise.all([
      fetchRelevantNews(symbol, assetClass).catch(() => ({ items: [] as RelevantArticle[], considered: 0, provider: 'unavailable' })),
      assetClass === 'equity' ? getFundamentalsSummary(symbol).catch(() => null) : Promise.resolve(null),
      assetClass === 'equity' ? getEarningsHistory(symbol).catch(() => null) : Promise.resolve(null),
      assetClass === 'crypto' ? fetchCryptoSentiment() : Promise.resolve(null),
    ]);
    const news = newsRes.items;

    // 3) Analyst: deterministic sections from the packet + model interpretation constrained to the packet.
    const deterministic = buildDeterministicAnalyst(c, ge, news, fundamentals);
    const prompt = buildPacketPrompt(c, ge, news, fundamentals, earnings, cryptoSentiment);
    const raw = await generateAnalyst(prompt);
    const sanitized = sanitizeAnalyst(raw);

    const newsSummary = summarizeNews(news);
    const responseTime = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      symbol,
      assetType,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      localDemo: geMeta.localDemo || undefined,
      warnings: geMeta.warnings.length ? geMeta.warnings : undefined,
      // Canonical facts — the ONLY technical source for this response.
      goldenEgg: {
        cached: geMeta.cached,
        verdict: c.verdict,
        dataTrust: c.dataTrust,
        scores: c.scores,
        timing: c.timing,
        levels: c.levels,
        confirmation: c.confirmation,
        invalidation: c.invalidation,
        extension: c.extension,
        crossMarket: c.crossMarket,
        derivatives: c.derivatives,
        options: c.options,
        fundamentals: c.fundamentals,
        network: c.network,
        priceTs: c.priceTs,
        lastCompletedBarAt: c.lastCompletedBarAt,
        barInterval: c.barInterval,
        timeframe: c.timeframe,
        flipConditions: ge.layer1.flipConditions,
      },
      analyst: {
        sections: deterministic,
        narrative: sanitized.text,
        narrativeSource: sanitized.text ? 'gpt-4o (packet-constrained)' : 'unavailable',
        removedLines: sanitized.removedLines,
        grounding: 'Every technical number comes from the Golden Egg canonical packet; news is ticker-filtered (relevance ≥ 0.35); fundamentals are the shared Alpha Vantage OVERVIEW snapshot.',
      },
      // Legacy-shaped mirrors of canonical values so the existing UI renders without a second pipeline.
      price: legacyPrice(c),
      indicators: legacyIndicators(c),
      company: fundamentals ? {
        name: fundamentals.name, description: '', sector: fundamentals.sector, industry: fundamentals.industry, marketCap: fundamentals.marketCap != null ? String(fundamentals.marketCap) : null,
        peRatio: fundamentals.pe, forwardPE: fundamentals.forwardPe, peg: fundamentals.peg, eps: fundamentals.eps, dividendYield: null, week52High: null, week52Low: null,
        targetPrice: fundamentals.analystTarget, analystCount: fundamentals.analystCount,
        strongBuy: fundamentals.ratings?.strongBuy ?? 0, buy: fundamentals.ratings?.buy ?? 0, hold: fundamentals.ratings?.hold ?? 0, sell: fundamentals.ratings?.sell ?? 0, strongSell: fundamentals.ratings?.strongSell ?? 0,
        multiple: fundamentals.multiple, period: fundamentals.period, revenueGrowthYoy: fundamentals.revenueGrowthYoy, earningsGrowthYoy: fundamentals.earningsGrowthYoy, profitMargin: fundamentals.profitMargin,
      } : null,
      news: news.map((n) => ({ title: n.title, summary: n.summary, source: n.source, sentiment: n.sentiment, sentimentScore: n.sentimentScore, url: n.url, publishedAt: n.publishedAt, relevance: n.relevance, catalyst: n.catalyst, catalystReason: n.catalystReason })),
      newsMeta: { considered: newsRes.considered, relevant: news.length, provider: newsRes.provider, headline: newsSummary.headline, positive: newsSummary.positive, negative: newsSummary.negative, eventRisk: newsSummary.eventRisk },
      cryptoData: assetClass === 'crypto' ? { fearGreed: cryptoSentiment ? { value: cryptoSentiment.value, classification: cryptoSentiment.classification, basis: cryptoSentiment.basis } : null, marketData: c.network ? { marketCapRank: c.network.marketCapRank, marketCap: c.network.marketCap, totalVolume: c.network.spotVolume24h, circulatingSupply: c.network.circulatingSupply, maxSupply: c.network.maxSupply, fdv: c.network.fdv, ath: c.network.ath, athChangePercent: c.network.distanceFromAthPct } : null } : null,
      earnings: earnings ? {
        nextEarningsDate: fundamentals?.nextEarningsDate ?? null, daysToEarnings: fundamentals?.daysToEarnings ?? null,
        lastReportedDate: earnings.lastReported?.reportedDate ?? null, lastReportedQuarter: earnings.lastReported?.fiscalDateEnding ?? null,
        lastReportedEPS: earnings.lastReported?.reportedEPS ?? null, lastEstimatedEPS: earnings.lastReported?.estimatedEPS ?? null,
        lastSurprise: earnings.lastReported?.surprise ?? null, lastSurprisePercent: earnings.lastReported?.surprisePercent ?? null, lastBeat: earnings.lastReported?.beat ?? null,
        beatRate: earnings.beatRate, recentQuarters: earnings.recentQuarters, annualEPS: earnings.annualEPS,
      } : null,
      optionsData: legacyOptions(c),
      // Subordinate to Golden Egg: mirrors the canonical verdict, never a competing engine.
      signals: {
        signal: `${c.verdict.assessment} · ${c.verdict.direction === 'LONG' ? 'BULLISH BIAS' : c.verdict.direction === 'SHORT' ? 'BEARISH BIAS' : 'NEUTRAL'}`,
        score: c.verdict.confluence,
        reasons: [...deterministic.supports.map((s) => `+ ${s}`), ...deterministic.against.map((s) => `− ${s}`)],
        bullishCount: deterministic.supports.length,
        bearishCount: deterministic.against.length,
        source: 'golden_egg_canonical',
      },
      aiAnalysis: sanitized.text,
    });
  } catch (error) {
    console.error('Deep analysis error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Analysis failed' }, { status: 500 });
  }
}
