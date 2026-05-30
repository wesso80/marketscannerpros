import { Metadata } from 'next';
import Link from 'next/link';
import { q } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 3600; // ISR — hourly

interface Pick {
  rank: number;
  asset_class: string;
  symbol: string;
  score: number;
  direction: string;
  price: number | null;
  change_percent: number | null;
  sector: string | null;
  shares_float: number | null;
  short_pct_float: number | null;
}

interface DayData {
  scan_date: string;
  picks: Pick[];
}

function formatFloat(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function toDateString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return '';
}

async function loadLatest(): Promise<DayData | null> {
  const latest = await q<{ scan_date: unknown }>(
    `SELECT scan_date FROM daily_picks ORDER BY scan_date DESC LIMIT 1`,
  );
  if (latest.length === 0) return null;
  const scan_date = toDateString(latest[0].scan_date);

  // Try the enriched query first (requires migration 097). If shares_float /
  // short_pct_float columns don't exist yet, fall back to the picks-only
  // query so the page still renders during phased rollout.
  let rows: Array<{
    asset_class: string;
    symbol: string;
    score: number;
    direction: string;
    price: string | null;
    change_percent: string | null;
    sector: string | null;
    shares_float: string | null;
    short_pct_float: string | null;
  }>;
  try {
    rows = await q(
      `SELECT dp.asset_class, dp.symbol, dp.score, dp.direction,
              dp.price, dp.change_percent,
              co.sector, co.shares_float, co.short_pct_float
         FROM daily_picks dp
         LEFT JOIN company_overview co ON co.symbol = dp.symbol
        WHERE dp.scan_date = $1
        ORDER BY dp.score DESC
        LIMIT 10`,
      [scan_date],
    );
  } catch (err) {
    console.warn('[daily-pick] enriched query failed, falling back:', err);
    const fallback = await q<{
      asset_class: string;
      symbol: string;
      score: number;
      direction: string;
      price: string | null;
      change_percent: string | null;
    }>(
      `SELECT asset_class, symbol, score, direction, price, change_percent
         FROM daily_picks
        WHERE scan_date = $1
        ORDER BY score DESC
        LIMIT 10`,
      [scan_date],
    );
    rows = fallback.map((r) => ({
      ...r,
      sector: null,
      shares_float: null,
      short_pct_float: null,
    }));
  }

  return {
    scan_date,
    picks: rows.map((r, i) => ({
      rank: i + 1,
      asset_class: r.asset_class,
      symbol: r.symbol,
      score: r.score,
      direction: r.direction,
      price: r.price ? Number(r.price) : null,
      change_percent: r.change_percent ? Number(r.change_percent) : null,
      sector: r.sector,
      shares_float: r.shares_float ? Number(r.shares_float) : null,
      short_pct_float: r.short_pct_float ? Number(r.short_pct_float) : null,
    })),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await loadLatest();
  const dateStr = data?.scan_date ?? new Date().toISOString().slice(0, 10);
  const topSymbols = (data?.picks ?? []).slice(0, 3).map((p) => p.symbol).join(', ') || 'today';
  const title = `Daily Picks — ${dateStr} (${topSymbols})`;
  const description = `Top scanner-ranked stocks and crypto for ${dateStr}: ${topSymbols}. Educational technical-analysis snapshots updated daily.`;
  const url = 'https://marketscannerpros.app/daily-pick';
  const og = `https://marketscannerpros.app/api/og/scan?symbol=DAILY&side=WATCH&headline=${encodeURIComponent('Top picks for ' + dateStr)}&sub=${encodeURIComponent(topSymbols)}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': [
          { url: `${url}/feed.xml`, title: 'MarketScanner Pros — Daily Picks RSS' },
        ],
      },
    },
    openGraph: { type: 'article', url, title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
  };
}

export default async function DailyPickPage() {
  const data = await loadLatest();

  if (!data || data.picks.length === 0) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <h1 style={h1Style}>Daily Picks</h1>
          <p style={{ color: '#94A3B8' }}>
            No picks scored yet for the latest session — check back after the next scanner run.
          </p>
        </div>
      </main>
    );
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `MarketScanner Pros Daily Picks ${data.scan_date}`,
    dateModified: data.scan_date,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: data.picks.length,
    itemListElement: data.picks.map((p) => ({
      '@type': 'ListItem',
      position: p.rank,
      url: `https://marketscannerpros.app/share/scan/${p.symbol}`,
      name: `${p.symbol} (${p.direction}, score ${p.score})`,
    })),
  };

  return (
    <main style={pageStyle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={containerStyle}>
        <div style={{ color: '#94A3B8', fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          MarketScanner Pros · Daily Picks
        </div>
        <h1 style={h1Style}>Top {data.picks.length} picks · {data.scan_date}</h1>
        <p style={{ color: '#CBD5E1', fontSize: 17, lineHeight: 1.6, marginTop: 6, maxWidth: 760 }}>
          Highest-scoring symbols across our equity and crypto scanners for the most recent session.
          Each row is a technical research snapshot — not a recommendation. Click any row for the full
          shareable card.
        </p>

        <div style={{ marginTop: 28, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={rowHeaderStyle}>
            <div style={{ ...cellStyle, width: 60 }}>#</div>
            <div style={{ ...cellStyle, flex: 1 }}>Symbol</div>
            <div style={{ ...cellStyle, width: 90 }}>Side</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Score</div>
            <div style={{ ...cellStyle, width: 110, textAlign: 'right' as const }}>Price</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Chg %</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Float</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Short %</div>
          </div>
          {data.picks.map((p) => {
            const side = p.direction === 'bullish' ? 'LONG' : p.direction === 'bearish' ? 'SHORT' : 'WATCH';
            const sideColor = side === 'LONG' ? '#10B981' : side === 'SHORT' ? '#EF4444' : '#F59E0B';
            return (
              <Link
                key={`${p.asset_class}-${p.symbol}`}
                href={`/share/scan/${p.symbol}`}
                style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ ...cellStyle, width: 60, color: '#64748B' }}>{p.rank}</div>
                <div style={{ ...cellStyle, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 17 }}>{p.symbol}</span>
                  {p.sector && <span style={{ color: '#64748B', marginLeft: 8, fontSize: 12 }}>{p.sector}</span>}
                </div>
                <div style={{ ...cellStyle, width: 90 }}>
                  <span style={{ color: sideColor, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em' }}>{side}</span>
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, fontWeight: 700 }}>{p.score}</div>
                <div style={{ ...cellStyle, width: 110, textAlign: 'right' as const }}>
                  {p.price != null ? `$${p.price.toFixed(2)}` : '—'}
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: p.change_percent != null && p.change_percent >= 0 ? '#10B981' : '#EF4444' }}>
                  {p.change_percent != null ? `${p.change_percent >= 0 ? '+' : ''}${p.change_percent.toFixed(2)}%` : '—'}
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: '#CBD5E1' }}>
                  {formatFloat(p.shares_float) ?? '—'}
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: '#CBD5E1' }}>
                  {p.short_pct_float != null ? `${p.short_pct_float.toFixed(1)}%` : '—'}
                </div>
              </Link>
            );
          })}
        </div>

        <div style={{ marginTop: 32, padding: '20px 22px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: '#F8FAFC' }}>Want the full scanner?</h2>
          <p style={{ margin: '8px 0 16px', color: '#CBD5E1' }}>
            Picks above are a daily snapshot. The full MSP scanner runs across thousands of symbols
            with custom filters (RVOL, low-float, regime, options flow), backtesting, and a trade journal.
          </p>
          <Link href="/pricing" style={{ display: 'inline-block', padding: '12px 22px', background: '#10B981', color: '#0F172A', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>
            See pricing →
          </Link>
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: '#64748B', lineHeight: 1.6 }}>
          Educational research only. Not investment advice. No order routing. Past performance does not
          predict future returns. Float / short data sourced from Alpha Vantage OVERVIEW; price data is
          end-of-day from MSP's daily cache.
        </p>
      </div>
    </main>
  );
}

const pageStyle = { minHeight: '100vh', background: '#0F172A', color: '#F8FAFC', padding: '48px 20px' };
const containerStyle = { maxWidth: 1000, margin: '0 auto' };
const h1Style = { fontSize: 40, margin: '6px 0 12px', fontWeight: 800, lineHeight: 1.15 };
const cellStyle = { padding: '12px 14px', fontSize: 14, display: 'flex', alignItems: 'center' };
const rowHeaderStyle = { display: 'flex', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94A3B8', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' as const };
const rowStyle = { display: 'flex', borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 120ms' };
