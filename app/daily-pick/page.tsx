import { cache } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { canonicalLabel } from '@/lib/scoring/canonical/dailyPick';
import { formatSessionDate } from '@/lib/time/usSession';
import { formatFloat, loadLatestDailyPicks as loadLatest } from '@/lib/og/dailyPicksLatest';
import { scanOgImageUrl } from '@/lib/og/scanOg';

export const runtime = 'nodejs';
// Database-backed observations are resolved at request time, not during builds.
export const dynamic = 'force-dynamic';

const latestPickState = cache(async () => {
  try { return { data: await loadLatest(), unavailable: false }; }
  catch (error) {
    console.error('[daily-pick] Latest snapshot unavailable:', error);
    return { data: null, unavailable: true };
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const { data, unavailable } = await latestPickState();
  const dateStr = data?.scan_date ?? new Date().toISOString().slice(0, 10);
  const topSymbols = (data?.picks ?? []).slice(0, 3).map((p) => p.symbol).join(', ') || 'today';
  const title = unavailable ? 'Daily Picks unavailable · MarketScanner Pros' : `Daily Picks ${dateStr} · ${topSymbols} · MarketScanner Pros`;
  const description = `Top scanner-ranked stocks and crypto for the ${formatSessionDate(dateStr)} US session: ${topSymbols}. Educational technical-analysis snapshots updated daily.`;
  const url = 'https://marketscannerpros.app/daily-pick';
  // The card's text is built server-side from the same snapshot; the date only makes the URL change daily.
  const og = scanOgImageUrl('DAILY', data?.scan_date ?? null);
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
  const { data, unavailable } = await latestPickState();

  if (!data || data.picks.length === 0) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <h1 style={h1Style}>Daily Picks</h1>
          <p style={{ color: 'var(--msp-flat)' }}>
            {unavailable ? 'Daily picks are unavailable because the latest scanner snapshot could not be loaded. Refresh to retry.' : 'No picks scored yet for the latest session — check back after the next scanner run.'}
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
      name: `${p.symbol} (${p.direction}, ${canonicalLabel(p.canonical) ?? `score ${p.score}`})`,
    })),
  };

  return (
    <main style={pageStyle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={containerStyle}>
        <div style={{ color: 'var(--msp-flat)', fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          MarketScanner Pros · Daily Picks
        </div>
        <h1 style={h1Style}>Top {data.picks.length} picks · US session {formatSessionDate(data.scan_date)}</h1>
        <p style={{ color: 'var(--msp-flat)', fontSize: 14, marginTop: 4 }}>
          Dated by the US market session the data comes from (the last completed session when the scan ran, New York
          time). Crypto rows use the latest completed daily candle (UTC) at scan time.
        </p>
        <p style={{ color: 'var(--msp-text)', fontSize: 17, lineHeight: 1.6, marginTop: 6, maxWidth: 760 }}>
          Symbols from the most recent daily scan, ordered by the canonical verdict (PASS / WATCH / BLOCK, then grade
          and setup score). The older signal-count score is shown underneath as a secondary figure.
          Each row is a technical research snapshot — not a recommendation. Click any row for the full
          shareable card.
        </p>

        <div style={{ marginTop: 28, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={rowHeaderStyle}>
            <div style={{ ...cellStyle, width: 60 }}>#</div>
            <div style={{ ...cellStyle, flex: 1 }}>Symbol</div>
            <div style={{ ...cellStyle, width: 90 }}>Side</div>
            <div style={{ ...cellStyle, width: 150 }}>Verdict</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Score</div>
            <div style={{ ...cellStyle, width: 110, textAlign: 'right' as const }}>Price</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Chg %</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Float</div>
            <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const }}>Short %</div>
          </div>
          {data.picks.map((p) => {
            // Neutral is not labelled WATCH: WATCH is a canonical permission, shown in the Verdict column.
            const side = p.direction === 'bullish' ? 'LONG' : p.direction === 'bearish' ? 'SHORT' : 'NEUTRAL';
            const sideColor = side === 'LONG' ? 'var(--msp-bull)' : side === 'SHORT' ? 'var(--msp-bear)' : 'var(--msp-warn)';
            return (
              <Link
                key={`${p.asset_class}-${p.symbol}`}
                href={`/share/scan/${p.symbol}`}
                style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ ...cellStyle, width: 60, color: 'var(--msp-text-muted)' }}>{p.rank}</div>
                <div style={{ ...cellStyle, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 17 }}>{p.symbol}</span>
                  {p.sector && <span style={{ color: 'var(--msp-text-muted)', marginLeft: 8, fontSize: 12 }}>{p.sector}</span>}
                </div>
                <div style={{ ...cellStyle, width: 90 }}>
                  <span style={{ color: sideColor, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em' }}>{side}</span>
                </div>
                <div style={{ ...cellStyle, width: 150, fontSize: 12, fontWeight: 700, color: p.canonical?.permission === 'PASS' ? 'var(--msp-bull)' : p.canonical?.permission === 'BLOCK' ? 'var(--msp-bear)' : 'var(--msp-warn)' }}>
                  {canonicalLabel(p.canonical) ?? '—'}
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, fontWeight: 700, flexDirection: 'column' as const, alignItems: 'flex-end' }}>
                  <span>{p.score}</span>
                  {p.canonical && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--msp-text-muted)' }}>legacy {p.legacyScore}</span>}
                </div>
                <div style={{ ...cellStyle, width: 110, textAlign: 'right' as const }}>
                  {p.price != null ? `$${p.price.toFixed(2)}` : '—'}
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: p.change_percent != null && p.change_percent >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)' }}>
                  {p.change_percent != null ? `${p.change_percent >= 0 ? '+' : ''}${p.change_percent.toFixed(2)}%` : '—'}
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: 'var(--msp-text)' }}>
                  {formatFloat(p.shares_float) ?? '—'}
                </div>
                <div style={{ ...cellStyle, width: 90, textAlign: 'right' as const, color: 'var(--msp-text)' }}>
                  {p.short_pct_float != null ? `${p.short_pct_float.toFixed(1)}%` : '—'}
                </div>
              </Link>
            );
          })}
        </div>

        <div style={{ marginTop: 32, padding: '20px 22px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: '#F8FAFC' }}>Want the full scanner?</h2>
          <p style={{ margin: '8px 0 16px', color: 'var(--msp-text)' }}>
            Picks above are a daily snapshot. The full MSP scanner runs across thousands of symbols
            with custom filters (RVOL, low-float, regime, options flow), backtesting, and a trade journal.
          </p>
          <Link href="/pricing" style={{ display: 'inline-block', padding: '12px 22px', background: 'var(--msp-bull)', color: 'var(--msp-bg)', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>
            See pricing →
          </Link>
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--msp-text-muted)', lineHeight: 1.6 }}>
          Educational research only. Not investment advice. No order routing. Past performance does not
          predict future returns. Float / short data sourced from Alpha Vantage OVERVIEW; price data is
          end-of-day from MSP's daily cache.
        </p>
      </div>
    </main>
  );
}

const pageStyle = { minHeight: '100vh', background: 'var(--msp-bg)', color: '#F8FAFC', padding: '48px 20px' };
const containerStyle = { maxWidth: 1000, margin: '0 auto' };
const h1Style = { fontSize: 40, margin: '6px 0 12px', fontWeight: 800, lineHeight: 1.15 };
const cellStyle = { padding: '12px 14px', fontSize: 14, display: 'flex', alignItems: 'center' };
const rowHeaderStyle = { display: 'flex', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--msp-flat)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' as const };
const rowStyle = { display: 'flex', borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 120ms' };
