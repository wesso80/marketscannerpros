/**
 * Symbol AI summary (ticker research page, W3 Option 2).
 *
 * GET /api/deep-analysis?symbol=META[&type=equity|crypto][&timeframe=daily][&expiry=YYYY-MM-DD]
 *
 * Writes a plain-language summary of the SAME public evidence the Symbol page shows: the public Symbol packet
 * (lib/research/publicSymbolPacket), the research snapshot, the evidence summary and the symbol news grouped by event.
 * The model and the deterministic fallback receive only that evidence: no verdict, grade, permission, score, signal
 * count, sizing, playbook, third-party analyst rating/target/estimate or sentiment proxy. The model is told to describe,
 * never to forecast or recommend, and its output is checked line by line before it is returned.
 * The internal Golden Egg packet stays on the server.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { hasPaidSessionAccess } from '@/lib/proTraderAccess';
import { deepAnalysisLimiter, getClientIP } from '@/lib/rateLimit';
import { cryptoNewsName } from '@/lib/crypto/newsRelevance';
import { detectAssetClass } from '@/lib/goldenEggFetchers';
import { computeGoldenEgg } from '@/lib/goldenEgg/engine';
import { getFundamentalsSummary } from '@/lib/goldenEgg/companyOverview';
import { buildSymbolNews, fetchSymbolNewsFeed } from '@/lib/research/newsEvidence';
import { toPublicSymbolPacket } from '@/lib/research/publicSymbolPacket';
import { buildResearchSnapshot } from '@/lib/research/researchSnapshot';
import { buildVolatilityEvidence } from '@/lib/research/volatilityEvidence';
import { buildEvidenceSummary } from '@/lib/research/evidenceSummary';
import { PUBLIC_DEEP_ANALYSIS_CONTRACT, SUMMARY_SYSTEM, buildSummaryPrompt, sanitizeSummary, sectionsFrom } from '@/lib/research/symbolSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function generateSummary(prompt: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: prompt }], max_tokens: 500, temperature: 0.2 }),
    });
    const result = await res.json();
    return result.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[deep-analysis] summary generation failed:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = deepAnalysisLimiter.check(ip);
    if (!rl.allowed) return NextResponse.json({ success: false, error: `Rate limit exceeded. Try again in ${rl.retryAfter}s` }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) return NextResponse.json({ success: false, error: 'Please log in to use the Symbol AI summary' }, { status: 401 });
    if (!hasPaidSessionAccess(session)) return NextResponse.json({ success: false, error: 'Pro subscription required for the Symbol AI summary' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();
    if (!symbol) return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    const timeframe = (searchParams.get('timeframe') || 'daily').toLowerCase();
    const expiry = searchParams.get('expiry');
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return NextResponse.json({ success: false, error: 'Invalid expiry (expected YYYY-MM-DD)' }, { status: 400 });
    const assetClass = detectAssetClass(symbol, searchParams.get('type') || undefined);
    if (assetClass === 'forex') return NextResponse.json({ success: false, error: 'The Symbol AI summary covers equities and crypto' }, { status: 400 });

    // Same packet, cache and selected expiry as the Symbol page (W1); only its public projection is used here.
    let computed: Awaited<ReturnType<typeof computeGoldenEgg>>;
    try { computed = await computeGoldenEgg({ symbol, timeframe, assetClass, workspaceId: session.workspaceId, expiry }); }
    catch (e) { return NextResponse.json({ success: false, error: `Unable to build the Symbol evidence for ${symbol}: ${e instanceof Error ? e.message : 'unavailable'}` }, { status: 502 }); }
    const p = toPublicSymbolPacket(computed.payload);
    if (!p.canonical) return NextResponse.json({ success: false, localDemo: computed.localDemo || undefined, error: 'No live evidence for this symbol (demo payload); the AI summary needs live data.' });

    const [feed, fundamentals] = await Promise.all([
      fetchSymbolNewsFeed(symbol, assetClass),
      assetClass === 'equity' ? getFundamentalsSummary(symbol).catch(() => null) : Promise.resolve(null),
    ]);
    const news = buildSymbolNews(symbol, assetClass, feed, assetClass === 'equity' ? fundamentals?.name ?? null : cryptoNewsName(symbol));

    const snapshot = buildResearchSnapshot({ canonical: p.canonical, priceEvidence: p.priceEvidence, timingEvidence: p.timingEvidence, optionsRequest: p.optionsRequest });
    const volatility = p.priceEvidence ? buildVolatilityEvidence({ assetClass, priceEvidence: p.priceEvidence, options: p.canonical.options ? { expiry: p.canonical.options.expiry, snapshotTs: p.canonical.options.snapshotTs, daysToExpiry: p.canonical.options.daysToExpiry, avgIvPct: p.canonical.options.avgIvPct, expectedMovePct: p.canonical.options.expectedMovePct } : null }) : null;
    const ev = buildEvidenceSummary({
      symbol, assetClass, snapshot, priceEvidence: p.priceEvidence, volatility, timing: p.timingEvidence,
      options: p.canonical.options ? { expiry: p.canonical.options.expiry, snapshotTs: p.canonical.options.snapshotTs, putCallOi: p.canonical.options.putCallOi ?? null, avgIvPct: p.canonical.options.avgIvPct } : null,
      fundamentals: p.canonical.fundamentals ? { lastReportedQuarter: p.canonical.fundamentals.lastReportedQuarter, revenueGrowthYoy: p.canonical.fundamentals.revenueGrowthYoy, earningsGrowthYoy: p.canonical.fundamentals.earningsGrowthYoy } : null,
    });
    const sections = sectionsFrom(snapshot, ev, news);
    const prompt = buildSummaryPrompt(symbol, p, snapshot, sections, ev.independenceNote);
    const narrative = sanitizeSummary(await generateSummary(prompt));

    return NextResponse.json({
      success: true,
      contract: PUBLIC_DEEP_ANALYSIS_CONTRACT,
      symbol, assetClass, timeframe: p.meta.timeframe,
      generatedAt: new Date().toISOString(),
      dates: snapshot.dates,
      sections,
      independenceNote: ev.independenceNote,
      news: { status: news.status, headline: news.headline, provider: news.provider, rule: news.rule, fetchedAt: news.fetchedAt, events: news.events.length },
      narrative: narrative.text,
      narrativeSource: narrative.text ? 'gpt-4o, from the evidence sections only' : 'unavailable',
      removedLines: narrative.removedLines,
      localDemo: computed.localDemo || undefined,
      warnings: computed.warnings.length ? computed.warnings : undefined,
    });
  } catch (error) {
    console.error('Deep analysis error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Summary failed' }, { status: 500 });
  }
}
