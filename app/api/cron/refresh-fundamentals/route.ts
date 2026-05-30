import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth, verifyAdminAuth } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { avFetch } from '@/lib/avRateGovernor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — bounded by symbol count + AV cap

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const TIME_BUDGET_MS = 270_000;

type AvOverview = Record<string, string | undefined> & { Symbol?: string };

function num(v: string | undefined | null): number | null {
  if (v == null || v === '' || v === 'None' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function floatCategory(sharesFloat: number | null): string | null {
  if (sharesFloat == null) return null;
  if (sharesFloat < 10_000_000) return 'micro';
  if (sharesFloat < 20_000_000) return 'low';
  if (sharesFloat < 50_000_000) return 'mid';
  return 'normal';
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req) && !verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!AV_KEY) {
    return NextResponse.json({ error: 'ALPHA_VANTAGE_API_KEY not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({} as any));
  const explicitSymbols: string[] = Array.isArray(body.symbols) ? body.symbols : [];
  const maxAgeHours = Number(body.maxAgeHours) || 20; // skip if refreshed within window

  const t0 = Date.now();
  const hasTime = () => Date.now() - t0 < TIME_BUDGET_MS;

  // Resolve target universe: explicit list overrides; otherwise pull enabled
  // equity symbols and prioritise rows not yet in company_overview or stale.
  let targets: string[];
  if (explicitSymbols.length > 0) {
    targets = explicitSymbols.map((s) => String(s).toUpperCase());
  } else {
    const rows = await q<{ symbol: string }>(
      `
      SELECT u.symbol
      FROM symbol_universe u
      LEFT JOIN company_overview co ON co.symbol = u.symbol
      WHERE u.asset_type = 'equity' AND u.enabled = TRUE
        AND (co.fetched_at IS NULL OR co.fetched_at < NOW() - ($1 || ' hours')::interval)
      ORDER BY u.tier ASC NULLS LAST, u.symbol ASC
      `,
      [String(maxAgeHours)],
    );
    targets = rows.map((r) => r.symbol);
  }

  const stats = {
    requested: targets.length,
    refreshed: 0,
    skipped: 0,
    errored: 0,
    aborted_for_time: false,
    sample_low_float: [] as Array<{ symbol: string; shares_float: number | null }>,
  };

  for (const symbol of targets) {
    if (!hasTime()) {
      stats.aborted_for_time = true;
      break;
    }

    try {
      const data = await avFetch<AvOverview>(
        `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`,
        `OVERVIEW ${symbol}`,
      );

      if (!data || !data.Symbol) {
        stats.skipped++;
        continue;
      }

      const sharesFloat = num(data.SharesFloat);
      const sharesOutstanding = num(data.SharesOutstanding);
      const sharesShort = num(data.SharesShort);
      const shortPctFloat = num(data.ShortPercentFloat);
      const shortRatio = num(data.ShortRatio);
      const insiderPct = num(data.PercentInsiders);
      const institutionPct = num(data.PercentInstitutions);
      const cat = floatCategory(sharesFloat);

      await q(
        `
        INSERT INTO company_overview (
          symbol, name, sector, industry, country, exchange, currency,
          description, market_cap, pe_ratio, peg_ratio, book_value,
          dividend_yield, eps, revenue_ttm, profit_margin, beta,
          high_52w, low_52w, shares_outstanding,
          shares_float, shares_short, short_pct_float, short_ratio,
          insider_pct, institution_pct, float_category,
          payload, fetched_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27,
          $28::jsonb, NOW()
        )
        ON CONFLICT (symbol) DO UPDATE SET
          name = EXCLUDED.name,
          sector = EXCLUDED.sector,
          industry = EXCLUDED.industry,
          country = EXCLUDED.country,
          exchange = EXCLUDED.exchange,
          currency = EXCLUDED.currency,
          description = EXCLUDED.description,
          market_cap = EXCLUDED.market_cap,
          pe_ratio = EXCLUDED.pe_ratio,
          peg_ratio = EXCLUDED.peg_ratio,
          book_value = EXCLUDED.book_value,
          dividend_yield = EXCLUDED.dividend_yield,
          eps = EXCLUDED.eps,
          revenue_ttm = EXCLUDED.revenue_ttm,
          profit_margin = EXCLUDED.profit_margin,
          beta = EXCLUDED.beta,
          high_52w = EXCLUDED.high_52w,
          low_52w = EXCLUDED.low_52w,
          shares_outstanding = EXCLUDED.shares_outstanding,
          shares_float = EXCLUDED.shares_float,
          shares_short = EXCLUDED.shares_short,
          short_pct_float = EXCLUDED.short_pct_float,
          short_ratio = EXCLUDED.short_ratio,
          insider_pct = EXCLUDED.insider_pct,
          institution_pct = EXCLUDED.institution_pct,
          float_category = EXCLUDED.float_category,
          payload = EXCLUDED.payload,
          fetched_at = NOW()
        `,
        [
          data.Symbol,
          data.Name ?? null,
          data.Sector ?? null,
          data.Industry ?? null,
          data.Country ?? null,
          data.Exchange ?? null,
          data.Currency ?? null,
          data.Description ?? null,
          num(data.MarketCapitalization),
          num(data.PERatio),
          num(data.PEGRatio),
          num(data.BookValue),
          num(data.DividendYield),
          num(data.EPS),
          num(data.RevenueTTM),
          num(data.ProfitMargin),
          num(data.Beta),
          num(data['52WeekHigh']),
          num(data['52WeekLow']),
          sharesOutstanding,
          sharesFloat,
          sharesShort,
          shortPctFloat,
          shortRatio,
          insiderPct,
          institutionPct,
          cat,
          JSON.stringify(data),
        ],
      );

      stats.refreshed++;
      if (cat === 'micro' || cat === 'low') {
        stats.sample_low_float.push({ symbol: data.Symbol, shares_float: sharesFloat });
      }
    } catch (err: any) {
      stats.errored++;
      console.warn(`[refresh-fundamentals] ${symbol} failed: ${err?.message ?? err}`);
    }
  }

  return NextResponse.json({
    success: true,
    duration_ms: Date.now() - t0,
    ...stats,
  });
}
