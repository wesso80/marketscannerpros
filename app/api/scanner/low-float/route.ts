import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasAccess(tier: string | undefined): boolean {
  return tier === 'pro' || tier === 'pro_trader';
}

/**
 * GET /api/scanner/low-float
 *
 * Query US equities by float size using cached Alpha Vantage OVERVIEW data
 * (refreshed nightly by the refresh-fundamentals cron). Joined against the
 * latest daily_prices row for price/volume context.
 *
 * Query params:
 *   maxFloat   number  upper bound on shares_float (default 20,000,000)
 *   minFloat   number  lower bound on shares_float (default 0)
 *   minVolume  number  require last close-day volume >= this
 *   minShortPct number short_pct_float >= this (e.g. 10 for ≥10%)
 *   category   string  micro|low|mid|normal (overrides max/min when set)
 *   sector     string  filter by sector name (exact match)
 *   limit      number  max rows (default 100, hard cap 500)
 *
 * Returns Opportunity Score (0–100) computed from float-tightness and short
 * interest, with explicit confidence + data-freshness reporting per the
 * AI Output Standards rule.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Please log in' }, { status: 401 });
  }
  if (!hasAccess(session.tier)) {
    return NextResponse.json(
      { error: 'Pro subscription required for low-float scanning' },
      { status: 403 },
    );
  }

  const ip = getClientIP(req);
  if (!apiLimiter.check(ip).allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const sp = new URL(req.url).searchParams;
  const category = sp.get('category');
  const sector = sp.get('sector');
  const minFloat = Number(sp.get('minFloat')) || 0;
  const maxFloat = Number(sp.get('maxFloat')) || 20_000_000;
  const minVolume = Number(sp.get('minVolume')) || 0;
  const minShortPct = Number(sp.get('minShortPct')) || 0;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 100, 1), 500);

  const where: string[] = ['co.shares_float IS NOT NULL'];
  const params: any[] = [];
  let p = 1;

  if (category && ['micro', 'low', 'mid', 'normal'].includes(category)) {
    where.push(`co.float_category = $${p++}`);
    params.push(category);
  } else {
    where.push(`co.shares_float BETWEEN $${p++} AND $${p++}`);
    params.push(minFloat, maxFloat);
  }
  if (sector) {
    where.push(`co.sector = $${p++}`);
    params.push(sector);
  }
  if (minShortPct > 0) {
    where.push(`co.short_pct_float >= $${p++}`);
    params.push(minShortPct);
  }
  if (minVolume > 0) {
    where.push(`dp.volume >= $${p++}`);
    params.push(minVolume);
  }

  const rows = await q<{
    symbol: string;
    name: string | null;
    sector: string | null;
    industry: string | null;
    market_cap: string | null;
    shares_float: string | null;
    shares_outstanding: string | null;
    short_pct_float: string | null;
    short_ratio: string | null;
    float_category: string | null;
    last_close: string | null;
    last_volume: string | null;
    bar_date: string | null;
    fetched_at: string;
  }>(
    `
    WITH latest_bar AS (
      SELECT DISTINCT ON (ticker)
        ticker, bar_date, close, volume
      FROM daily_prices
      ORDER BY ticker, bar_date DESC
    )
    SELECT
      co.symbol,
      co.name,
      co.sector,
      co.industry,
      co.market_cap,
      co.shares_float,
      co.shares_outstanding,
      co.short_pct_float,
      co.short_ratio,
      co.float_category,
      dp.close      AS last_close,
      dp.volume     AS last_volume,
      dp.bar_date   AS bar_date,
      co.fetched_at AS fetched_at
    FROM company_overview co
    LEFT JOIN latest_bar dp ON dp.ticker = co.symbol
    WHERE ${where.join(' AND ')}
    ORDER BY co.shares_float ASC NULLS LAST
    LIMIT ${limit}
    `,
    params,
  );

  // Opportunity scoring — float-tightness (60) + short interest (40).
  // Kept deterministic; no model inference. Evidence quality reflects how
  // fresh the underlying data is and whether short interest is populated.
  const now = Date.now();
  const enriched = rows.map((r) => {
    const floatN = r.shares_float ? Number(r.shares_float) : null;
    const shortPct = r.short_pct_float ? Number(r.short_pct_float) : null;
    const volume = r.last_volume ? Number(r.last_volume) : null;

    let floatScore = 0;
    if (floatN != null) {
      if (floatN < 5_000_000) floatScore = 60;
      else if (floatN < 10_000_000) floatScore = 50;
      else if (floatN < 20_000_000) floatScore = 35;
      else if (floatN < 50_000_000) floatScore = 20;
      else floatScore = 5;
    }

    let shortScore = 0;
    if (shortPct != null) {
      if (shortPct >= 30) shortScore = 40;
      else if (shortPct >= 20) shortScore = 30;
      else if (shortPct >= 10) shortScore = 20;
      else if (shortPct >= 5) shortScore = 10;
      else shortScore = 0;
    }

    const opportunityScore = floatScore + shortScore;

    const fetchedAgeHr = (now - new Date(r.fetched_at).getTime()) / 3_600_000;
    const evidenceQualityScore =
      (floatN != null ? 50 : 0) +
      (shortPct != null ? 30 : 0) +
      (volume != null ? 10 : 0) +
      (fetchedAgeHr < 36 ? 10 : 0);

    const confidence: 'high' | 'medium' | 'low' =
      evidenceQualityScore >= 80 ? 'high' : evidenceQualityScore >= 50 ? 'medium' : 'low';

    return {
      symbol: r.symbol,
      name: r.name,
      sector: r.sector,
      industry: r.industry,
      market_cap: r.market_cap ? Number(r.market_cap) : null,
      shares_float: floatN,
      shares_outstanding: r.shares_outstanding ? Number(r.shares_outstanding) : null,
      short_pct_float: shortPct,
      short_ratio: r.short_ratio ? Number(r.short_ratio) : null,
      float_category: r.float_category,
      last_close: r.last_close ? Number(r.last_close) : null,
      last_volume: volume,
      bar_date: r.bar_date,
      opportunity_score: opportunityScore,
      evidence_quality_score: evidenceQualityScore,
      confidence,
      data: {
        source: 'alpha_vantage_overview',
        fetched_at: r.fetched_at,
        age_hours: Math.round(fetchedAgeHr * 10) / 10,
        stale: fetchedAgeHr > 48,
      },
    };
  });

  enriched.sort((a, b) => b.opportunity_score - a.opportunity_score);

  return NextResponse.json({
    success: true,
    filters: { category, sector, minFloat, maxFloat, minVolume, minShortPct, limit },
    count: enriched.length,
    results: enriched,
    meta: {
      source: 'alpha_vantage_overview + daily_prices',
      what_confirms: 'Rising RVOL + price holding above prior swing on the symbol',
      what_invalidates: 'Float number revised up (offering / unlock) or short_pct falling',
      main_risk: 'Low-float names cut both ways — same tightness that fuels squeezes fuels gaps down',
      disclaimer: 'Research only. No order routing.',
    },
  });
}
