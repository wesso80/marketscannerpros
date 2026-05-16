/**
 * POST /api/jobs/email-best-opportunities
 *
 * Daily admin email digest: best crypto pick + best equity pick + best options play,
 * each with reasoning, confidence, what confirms, what invalidates, main risk, and
 * data-freshness/source attribution per AI Output Standards.
 *
 * Research-only. No order routing. Conservative scan context. Compliance: no broker
 * execution, data integrity (source/freshness/fallback), options-data-rules
 * (missing chain → reduces evidence quality, never fabricated).
 *
 * @internal PRIVATE — admin/cron auth required
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, verifyCronAuth } from '@/lib/adminAuth';
import { sendAlertEmail } from '@/lib/email';
import { runScan, type CandidatePipeline } from '@/lib/operator/orchestrator';
import { alphaVantageProvider } from '@/lib/operator/market-data';
import { DEFAULT_WATCHLISTS } from '@/lib/operator/watchlists';
import { DEFAULT_ADMIN_SCAN_CONTEXT } from '@/lib/admin/scan-context';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';
import type { RadarOpportunity, Market } from '@/types/operator';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET — friendly status response so opening the URL in a browser does not
 * show a confusing 405. The actual digest is POST-only and requires cron/admin auth.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/jobs/email-best-opportunities',
    method: 'POST only',
    description: 'Daily admin email digest — best crypto, best equity, best options play with reasoning.',
    auth: 'x-cron-secret header (Render cron) or admin session',
    body: {
      preview: 'boolean (optional)',
      to: 'string | string[] (optional, defaults to ADMIN_DAILY_BRIEF_EMAILS)',
      cryptoTimeframe: 'string (optional, default 1H)',
      equityTimeframe: 'string (optional, default 1D)',
      optionsSymbol: 'string (optional, defaults to top equity pick)',
    },
    note: 'This URL is intentionally not browser-accessible. Use the Render cron Trigger Run button or POST from a terminal.',
  });
}

interface PickReasoning {
  symbol: string;
  market: Market | 'OPTIONS';
  bias: string;
  permission: string;
  opportunityScore: number;     // 0-100
  evidenceQuality: number;      // 0-100
  confidence: string;           // qualitative
  playbook?: string;
  why: string[];                // reasonCodes / drivers
  whatConfirms: string;
  whatInvalidates: string;
  mainRisk: string;
  source: string;
  lastUpdated: string;
  freshness: 'fresh' | 'delayed' | 'stale' | 'unavailable';
  fallbackUsed: boolean;
  notes?: string[];
}

export async function POST(req: NextRequest) {
  const isCron = verifyCronAuth(req);
  const isAdmin = isCron ? false : (await requireAdmin(req)).ok;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const preview = Boolean(body.preview);
    const recipients = resolveRecipients(body.to);

    const cryptoTimeframe = typeof body.cryptoTimeframe === 'string' ? body.cryptoTimeframe : '1H';
    const equityTimeframe = typeof body.equityTimeframe === 'string' ? body.equityTimeframe : '1D';

    /* ── 1. Best crypto from crypto-majors radar ─────────────── */
    const cryptoWl = DEFAULT_WATCHLISTS['crypto-majors'];
    const cryptoScan = await runScan(
      { symbols: cryptoWl.symbols, market: cryptoWl.market, timeframe: cryptoTimeframe },
      DEFAULT_ADMIN_SCAN_CONTEXT,
      alphaVantageProvider,
    );
    const bestCrypto = pickTopRadar(cryptoScan.radar);
    const cryptoReasoning = bestCrypto
      ? radarToReasoning(bestCrypto, 'CRYPTO', 'CoinGecko OHLC + market_chart (Alpha Vantage fallback)')
      : pipelineToObservation(cryptoScan.pipelines, 'CRYPTO', 'CoinGecko OHLC + market_chart (Alpha Vantage fallback)');

    /* ── 2. Best equity from us-mega-cap ∪ us-momentum ───────── */
    const eqMega = DEFAULT_WATCHLISTS['us-mega-cap'];
    const eqMomo = DEFAULT_WATCHLISTS['us-momentum'];
    const equitySymbols = Array.from(new Set([...eqMega.symbols, ...eqMomo.symbols]));
    const equityScan = await runScan(
      { symbols: equitySymbols, market: 'EQUITIES', timeframe: equityTimeframe },
      DEFAULT_ADMIN_SCAN_CONTEXT,
      alphaVantageProvider,
    );
    const bestEquity = pickTopRadar(equityScan.radar);
    const equityReasoning = bestEquity
      ? radarToReasoning(bestEquity, 'EQUITIES', 'Alpha Vantage TIME_SERIES_DAILY/INTRADAY')
      : pipelineToObservation(equityScan.pipelines, 'EQUITIES', 'Alpha Vantage TIME_SERIES_DAILY/INTRADAY');

    /* ── 3. Best options play ────────────────────────────────── */
    // Use the top equity pick (or override). Options chain from Alpha Vantage; if
    // unavailable for the symbol, evidence quality is reduced — never fabricated.
    let optionsReasoning: PickReasoning | null = null;
    const optionsSymbol = (typeof body.optionsSymbol === 'string' && body.optionsSymbol)
      || bestEquity?.symbol
      || equityReasoning?.symbol
      || equityScan.radar[1]?.symbol
      || equityScan.pipelines[0]?.candidate.symbol
      || 'SPY';
    try {
      const setup = await optionsAnalyzer.analyzeForOptions(optionsSymbol, 'intraday_1h', undefined, 'equity');
      optionsReasoning = optionsSetupToReasoning(setup, optionsSymbol);
    } catch (err) {
      optionsReasoning = {
        symbol: optionsSymbol,
        market: 'OPTIONS',
        bias: 'unknown',
        permission: 'WAIT',
        opportunityScore: 0,
        evidenceQuality: 0,
        confidence: 'unavailable',
        why: ['options analysis failed'],
        whatConfirms: 'n/a — analysis did not complete',
        whatInvalidates: 'n/a — analysis did not complete',
        mainRisk: 'no qualifying options play; chain data missing or analyzer error',
        source: 'Alpha Vantage HISTORICAL_OPTIONS / REALTIME_OPTIONS',
        lastUpdated: new Date().toISOString(),
        freshness: 'unavailable',
        fallbackUsed: false,
        notes: [`Analyzer error: ${err instanceof Error ? err.message : 'Unknown'}`],
      };
    }

    const html = renderEmail({
      generatedAt: new Date().toISOString(),
      crypto: cryptoReasoning,
      equity: equityReasoning,
      options: optionsReasoning,
      cryptoTimeframe,
      equityTimeframe,
    });
    const subject = `${preview ? '[PREVIEW] ' : ''}MSP Best Picks — ${[
      cryptoReasoning && `Crypto:${cryptoReasoning.symbol}`,
      equityReasoning && `Eq:${equityReasoning.symbol}`,
      optionsReasoning && `Opt:${optionsReasoning.symbol}`,
    ].filter(Boolean).join(' · ')}`;

    const sent = await Promise.all(
      recipients.map((to) => sendAlertEmail({ to, subject, html })),
    );

    return NextResponse.json({
      ok: true,
      preview,
      recipients,
      sent,
      picks: { crypto: cryptoReasoning, equity: equityReasoning, options: optionsReasoning },
    });
  } catch (err: unknown) {
    console.error('[jobs:email-best-opportunities] Error:', err);
    return NextResponse.json(
      { error: 'Best opportunities email failed', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/* ────────────────────────── helpers ────────────────────────── */

function resolveRecipients(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input.join(',')
    : typeof input === 'string'
      ? input
      : process.env.ADMIN_DAILY_BRIEF_EMAILS || process.env.OPERATOR_BRIEF_EMAILS || 'wesso@marketscannerpros.app';
  return raw
    .split(',')
    .map((email) => email.trim())
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
}

function pickTopRadar(radar: RadarOpportunity[]): RadarOpportunity | null {
  // Filter out BLOCK; rank by permission tier then confidence × symbolTrust.
  const permissionWeight: Record<string, number> = {
    ALLOW: 4, ALLOW_REDUCED: 3, WAIT: 2, BLOCK: 0,
  };
  const ranked = radar
    .filter((r) => r.permission !== 'BLOCK')
    .map((r) => ({
      r,
      score: (permissionWeight[r.permission] ?? 1) * (r.confidenceScore || 0) * Math.max(0.1, r.symbolTrust || 0.5),
    }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.r ?? null;
}

function radarToReasoning(r: RadarOpportunity, market: Market, source: string): PickReasoning {
  const opportunityScore = Math.round((r.confidenceScore || 0) * 100);
  const evidenceQuality = Math.round((r.symbolTrust || 0) * 100);
  const confidence =
    r.permission === 'ALLOW' && r.confidenceScore >= 0.7 ? 'high — multi-factor alignment'
    : r.permission === 'ALLOW_REDUCED' || r.confidenceScore >= 0.5 ? 'moderate — partial alignment'
    : 'low — observation only';

  return {
    symbol: r.symbol,
    market,
    bias: r.direction,
    permission: r.permission,
    opportunityScore,
    evidenceQuality,
    confidence,
    playbook: r.playbook,
    why: r.reasonCodes?.length ? r.reasonCodes : ['no explicit reason codes returned'],
    whatConfirms: `Continued ${r.direction.toLowerCase()} structure on ${r.regime} regime with confidence ≥ ${(r.confidenceScore * 100).toFixed(0)}%`,
    whatInvalidates: `Loss of ${r.regime} regime, permission downgrade to BLOCK, or confidence falling below 50%`,
    mainRisk: r.permission === 'WAIT'
      ? 'Setup not yet permissioned for action — premature engagement risk'
      : `Regime shift, news catalyst against ${r.direction.toLowerCase()} bias, or symbol-trust degradation`,
    source,
    lastUpdated: new Date().toISOString(),
    freshness: 'fresh',
    fallbackUsed: false,
  };
}

/**
 * Observation-only fallback when the radar (post-BLOCK filter) is empty.
 * Selects the top pipeline by confidence × symbolTrust regardless of governance
 * permission, and labels it clearly as below execution threshold. Per
 * risk-language-private + ai-output-standards: evidence-backed, uncertainty-aware,
 * non-executional, with what-confirms / what-invalidates / main-risk preserved.
 */
function pipelineToObservation(
  pipelines: CandidatePipeline[],
  market: Market,
  source: string,
): PickReasoning | null {
  if (!pipelines.length) return null;
  const ranked = [...pipelines].sort((a, b) => {
    const sa = (a.verdict.confidenceScore || 0) * Math.max(0.1, a.verdict.evidence?.symbolTrust || 0.5);
    const sb = (b.verdict.confidenceScore || 0) * Math.max(0.1, b.verdict.evidence?.symbolTrust || 0.5);
    return sb - sa;
  });
  const p = ranked[0];
  const v = p.verdict;
  const g = p.governance;

  const opportunityScore = Math.round((v.confidenceScore || 0) * 100);
  // Below-threshold candidate → cap evidence quality at 50 (per ai-output-standards: never overstate confidence beyond source support).
  const evidenceQuality = Math.min(50, Math.round((v.evidence?.symbolTrust || 0) * 100));

  const govReasons: string[] = [
    ...(g.blockReasons || []).slice(0, 3),
    ...(g.throttleReasons || []).slice(0, 3),
    ...(v.reasonCodes || []).slice(0, 4),
  ];
  const why = govReasons.length
    ? govReasons
    : [`Pipeline produced no actionable reason codes — ${g.finalPermission} permission`];

  return {
    symbol: p.candidate.symbol,
    market,
    bias: p.candidate.direction,
    permission: `OBSERVATION (${g.finalPermission})`,
    opportunityScore,
    evidenceQuality,
    confidence: 'low — below execution threshold, observation only',
    playbook: p.candidate.playbook,
    why,
    whatConfirms: `Permission lifts to ALLOW or ALLOW_REDUCED with confidence ≥ 60% on ${v.regime} regime`,
    whatInvalidates: `${v.regime} regime breaks down or confidence falls below ${Math.max(20, opportunityScore - 10)}%`,
    mainRisk: g.finalPermission === 'BLOCK'
      ? `Setup is currently blocked by governance — engagement would violate risk policy`
      : `Setup is below execution threshold — premature engagement risk; insufficient evidence for sizing`,
    source,
    lastUpdated: new Date().toISOString(),
    freshness: 'fresh',
    fallbackUsed: true,
    notes: [
      'Observation fallback: radar returned no permissioned setup; this is the highest-ranked filtered candidate.',
      `Governance permission: ${g.finalPermission}. Not a recommendation — research only.`,
    ],
  };
}

function optionsSetupToReasoning(s: any, symbol: string): PickReasoning {
  const dq = s?.dataQuality ?? {};
  const chainAvailable = (dq.contractsCount?.calls ?? 0) + (dq.contractsCount?.puts ?? 0) > 0;
  const freshness: PickReasoning['freshness'] =
    !chainAvailable ? 'unavailable'
    : dq.freshness === 'FRESH' ? 'fresh'
    : dq.freshness === 'DELAYED' ? 'delayed'
    : 'stale';

  // Per options-data-rules: missing chain reduces evidence quality, never fabricated.
  let evidenceQuality = Math.round((s?.optionsQualityScore ?? 0));
  if (!chainAvailable) evidenceQuality = Math.min(evidenceQuality, 25);
  if (freshness === 'stale' || freshness === 'delayed') evidenceQuality = Math.min(evidenceQuality, 60);

  const opportunityScore = Math.round(((s?.compositeScore?.overall ?? s?.optionsQualityScore ?? 0)));

  const why: string[] = [];
  if (s?.qualityReasons?.length) why.push(...s.qualityReasons.slice(0, 5));
  if (s?.confluenceStack) why.push(`Confluence stack: ${s.confluenceStack}`);
  if (s?.signalStrength) why.push(`Signal strength: ${s.signalStrength}`);
  if (s?.primaryStrike?.strike) why.push(`Primary strike candidate: ${s.primaryStrike.strike}`);
  if (s?.primaryExpiration?.date) why.push(`Primary expiration candidate: ${s.primaryExpiration.date}`);
  if (!why.length) why.push('No qualifying signal — observation only');

  const tradeLevels = s?.tradeLevels ?? null;
  const whatConfirms = tradeLevels?.confirmationLevel
    ? `Underlying holds above/below ${tradeLevels.confirmationLevel} on ${s.direction} side`
    : `${s?.direction ?? 'directional'} confluence holds and signal strength remains ≥ ${s?.signalStrength ?? 'moderate'}`;
  const whatInvalidates = tradeLevels?.invalidationLevel
    ? `Underlying breaches ${tradeLevels.invalidationLevel}`
    : 'Loss of confluence stack or signal strength downgrade';

  const mainRisk = !chainAvailable
    ? 'Options chain data unavailable — no qualifying options play; evidence quality capped'
    : freshness !== 'fresh'
      ? `Options chain ${freshness} — IV/Greeks may not reflect current market`
      : 'Theta/IV crush, gap risk through invalidation level, liquidity at chosen strike';

  const grade = s?.optionsGrade ?? 'F';
  const confidence =
    grade === 'A+' || grade === 'A' ? 'high — institutional-grade setup'
    : grade === 'B' ? 'moderate — tradeable with caution'
    : grade === 'C' ? 'low — marginal evidence'
    : 'very low — observation only';

  return {
    symbol,
    market: 'OPTIONS',
    bias: s?.direction ?? 'neutral',
    permission: chainAvailable && grade !== 'F' ? 'ALLOW_REDUCED' : 'WAIT',
    opportunityScore,
    evidenceQuality,
    confidence,
    playbook: s?.strategyRecommendation?.strategy ?? s?.tradeQuality ?? 'options-confluence',
    why,
    whatConfirms,
    whatInvalidates,
    mainRisk,
    source: dq.optionsChainSource
      ? `Alpha Vantage options (${dq.optionsChainSource})`
      : 'Alpha Vantage HISTORICAL_OPTIONS / REALTIME_OPTIONS',
    lastUpdated: dq.lastUpdated ?? new Date().toISOString(),
    freshness,
    fallbackUsed: !chainAvailable,
    notes: [
      ...(s?.executionNotes ?? []).slice(0, 3),
      ...(s?.disclaimerFlags ?? []).slice(0, 3),
      !chainAvailable ? 'Per options-data-rules: missing chain reduces Evidence Quality Score — no proxy fabricated.' : null,
    ].filter(Boolean) as string[],
  };
}

/* ────────────────────────── email rendering ────────────────── */

function renderEmail(input: {
  generatedAt: string;
  crypto: PickReasoning | null;
  equity: PickReasoning | null;
  options: PickReasoning | null;
  cryptoTimeframe: string;
  equityTimeframe: string;
}): string {
  const { generatedAt, crypto, equity, options, cryptoTimeframe, equityTimeframe } = input;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MSP Best Picks</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0F172A;color:#E2E8F0;padding:24px;margin:0;">
  <div style="max-width:720px;margin:0 auto;">
    <h1 style="color:#10B981;font-size:22px;margin:0 0 6px 0;">MSP — Best Picks (Research Only)</h1>
    <p style="color:#94A3B8;font-size:12px;margin:0 0 20px 0;">
      Generated ${escapeHtml(generatedAt)} · Crypto TF ${escapeHtml(cryptoTimeframe)} · Equity TF ${escapeHtml(equityTimeframe)}<br/>
      Internal admin research — not a public recommendation, not financial advice, no order routing.
    </p>

    ${renderPickBlock('Best Crypto', crypto)}
    ${renderPickBlock('Best Equity', equity)}
    ${renderPickBlock('Best Options Play', options)}

    <p style="color:#64748B;font-size:11px;margin-top:24px;border-top:1px solid #1E293B;padding-top:12px;">
      Picks selected from the always-on operator radar (DEFAULT_ADMIN_SCAN_CONTEXT — zero equity, no broker connection).
      Scoring follows the AI Output Standards: Opportunity Score, Evidence Quality, Confidence, What confirms,
      What invalidates, Main risk. Options evidence quality is reduced when chain data is missing, delayed, or stale —
      no proxy values are fabricated. All data carries source attribution and freshness status per the data-integrity rule.
    </p>
  </div>
</body></html>`;
}

function renderPickBlock(title: string, p: PickReasoning | null): string {
  if (!p) {
    return `<section style="background:#0B1220;border:1px solid #1E293B;border-radius:10px;padding:16px;margin-bottom:16px;">
      <h2 style="color:#F1F5F9;font-size:16px;margin:0 0 8px 0;">${escapeHtml(title)}</h2>
      <p style="color:#94A3B8;font-size:13px;margin:0;">No qualifying candidate — radar returned no permissioned setups. Observation only.</p>
    </section>`;
  }
  const freshnessColor = p.freshness === 'fresh' ? '#10B981' : p.freshness === 'delayed' ? '#F59E0B' : '#EF4444';
  return `<section style="background:#0B1220;border:1px solid #1E293B;border-radius:10px;padding:16px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
      <h2 style="color:#F1F5F9;font-size:16px;margin:0;">
        ${escapeHtml(title)} — <span style="color:#10B981;">${escapeHtml(p.symbol)}</span>
        <span style="color:#94A3B8;font-size:12px;font-weight:normal;"> (${escapeHtml(p.market)} · ${escapeHtml(p.bias)})</span>
      </h2>
      <span style="font-size:11px;color:${freshnessColor};">● ${escapeHtml(p.freshness)}</span>
    </div>
    <table style="width:100%;font-size:13px;color:#CBD5E1;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:3px 0;width:170px;color:#94A3B8;">Permission</td><td>${escapeHtml(p.permission)}</td></tr>
      <tr><td style="padding:3px 0;color:#94A3B8;">Opportunity Score</td><td>${p.opportunityScore}/100</td></tr>
      <tr><td style="padding:3px 0;color:#94A3B8;">Evidence Quality</td><td>${p.evidenceQuality}/100</td></tr>
      <tr><td style="padding:3px 0;color:#94A3B8;">Confidence</td><td>${escapeHtml(p.confidence)}</td></tr>
      ${p.playbook ? `<tr><td style="padding:3px 0;color:#94A3B8;">Playbook</td><td>${escapeHtml(p.playbook)}</td></tr>` : ''}
    </table>
    <div style="margin-bottom:8px;">
      <div style="color:#94A3B8;font-size:12px;margin-bottom:4px;">Why (drivers)</div>
      <ul style="margin:0;padding-left:18px;color:#E2E8F0;font-size:13px;">
        ${p.why.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}
      </ul>
    </div>
    <table style="width:100%;font-size:13px;color:#CBD5E1;border-collapse:collapse;">
      <tr><td style="padding:3px 0;width:170px;color:#94A3B8;vertical-align:top;">What confirms</td><td>${escapeHtml(p.whatConfirms)}</td></tr>
      <tr><td style="padding:3px 0;color:#94A3B8;vertical-align:top;">What invalidates</td><td>${escapeHtml(p.whatInvalidates)}</td></tr>
      <tr><td style="padding:3px 0;color:#94A3B8;vertical-align:top;">Main risk</td><td>${escapeHtml(p.mainRisk)}</td></tr>
      <tr><td style="padding:3px 0;color:#94A3B8;vertical-align:top;">Source</td><td>${escapeHtml(p.source)}</td></tr>
      <tr><td style="padding:3px 0;color:#94A3B8;vertical-align:top;">Last updated</td><td>${escapeHtml(p.lastUpdated)}</td></tr>
      ${p.fallbackUsed ? `<tr><td style="padding:3px 0;color:#F59E0B;vertical-align:top;">Fallback</td><td style="color:#F59E0B;">Yes — see notes</td></tr>` : ''}
    </table>
    ${p.notes && p.notes.length ? `<div style="margin-top:8px;color:#94A3B8;font-size:12px;"><strong>Notes:</strong><ul style="margin:4px 0 0 0;padding-left:18px;">${p.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : ''}
  </section>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
