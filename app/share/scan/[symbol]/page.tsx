import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 600; // ISR — 10 min freshness is fine for share cards

type Side = 'LONG' | 'SHORT' | 'WATCH';

interface ShareData {
  symbol: string;
  side: Side;
  score: number | null;
  price: number | null;
  changePct: number | null;
  float: string | null;
  shortPct: number | null;
  sector: string | null;
  headline: string;
  fetchedAt: string;
  source: 'daily_picks' | 'company_overview' | 'symbol_only';
}

function formatFloat(shares: number | null): string | null {
  if (shares == null) return null;
  if (shares >= 1_000_000_000) return `${(shares / 1_000_000_000).toFixed(1)}B`;
  if (shares >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`;
  if (shares >= 1_000) return `${(shares / 1_000).toFixed(1)}K`;
  return String(shares);
}

async function loadShare(rawSymbol: string): Promise<ShareData | null> {
  const symbol = rawSymbol.toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
  if (!symbol) return null;

  // Prefer a freshly scored daily_picks row
  const picks = await q<{
    symbol: string;
    score: number;
    direction: string;
    price: string | null;
    change_percent: string | null;
    scan_date: Date | string;
    asset_class: string;
  }>(
    `SELECT symbol, score, direction, price, change_percent, scan_date, asset_class
     FROM daily_picks
     WHERE symbol = $1
     ORDER BY scan_date DESC
     LIMIT 1`,
    [symbol],
  );

  // Fundamentals overlay (low-float context, sector). Schema tolerant: if
  // migration 097 hasn't been applied yet, shares_float / short_pct_float
  // columns won't exist — the catch falls back to symbol-only metadata so
  // the page still renders.
  let fund: Array<{
    sector: string | null;
    shares_float: string | null;
    short_pct_float: string | null;
    fetched_at: Date | string | null;
    name: string | null;
  }> = [];
  try {
    fund = await q<{
      sector: string | null;
      shares_float: string | null;
      short_pct_float: string | null;
      fetched_at: Date | string | null;
      name: string | null;
    }>(
      `SELECT sector, shares_float, short_pct_float, fetched_at, name
         FROM company_overview
        WHERE symbol = $1`,
      [symbol],
    );
  } catch (err) {
    console.warn(`[share/scan] company_overview lookup failed for ${symbol}:`, err);
  }

  const pick = picks[0];
  const f = fund[0];
  if (!pick && !f) return null;

  const side: Side = pick
    ? pick.direction === 'bullish'
      ? 'LONG'
      : pick.direction === 'bearish'
        ? 'SHORT'
        : 'WATCH'
    : 'WATCH';

  const sharesFloat = f?.shares_float ? Number(f.shares_float) : null;
  const shortPct = f?.short_pct_float ? Number(f.short_pct_float) : null;

  let headline = `${symbol} — research snapshot`;
  if (sharesFloat && sharesFloat < 20_000_000) {
    headline = `${symbol} flagged as low-float (${formatFloat(sharesFloat)} shares${shortPct ? `, ${shortPct.toFixed(1)}% short` : ''})`;
  } else if (pick) {
    headline = `${symbol} scored ${pick.score}/100 ${side === 'LONG' ? 'long' : side === 'SHORT' ? 'short' : 'watch'} on ${pick.scan_date}`;
  } else if (f?.name) {
    headline = `${f.name} — fundamentals snapshot`;
  }

  const rawFetched = f?.fetched_at ?? pick?.scan_date ?? new Date();
  const fetchedAt =
    rawFetched instanceof Date
      ? rawFetched.toISOString()
      : String(rawFetched);

  return {
    symbol,
    side,
    score: pick?.score ?? null,
    price: pick?.price ? Number(pick.price) : null,
    changePct: pick?.change_percent ? Number(pick.change_percent) : null,
    float: formatFloat(sharesFloat),
    shortPct,
    sector: f?.sector ?? null,
    headline,
    fetchedAt,
    source: pick ? 'daily_picks' : f ? 'company_overview' : 'symbol_only',
  };
}

function ogUrl(d: ShareData): string {
  const sp = new URLSearchParams({ symbol: d.symbol, side: d.side });
  if (d.score != null) sp.set('score', String(d.score));
  if (d.price != null) sp.set('price', d.price.toFixed(2));
  if (d.float) sp.set('float', d.float);
  if (d.shortPct != null) sp.set('shortPct', d.shortPct.toFixed(1));
  if (d.sector) sp.set('sector', d.sector);
  sp.set('headline', d.headline);
  return `https://marketscannerpros.app/api/og/scan?${sp.toString()}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Metadata> {
  const { symbol } = await params;
  const data = await loadShare(symbol);
  if (!data) {
    return { title: 'Symbol not found' };
  }
  const url = `https://marketscannerpros.app/share/scan/${data.symbol}`;
  const og = ogUrl(data);
  return {
    title: `${data.symbol} — ${data.side} signal`,
    description: data.headline,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${data.symbol} — ${data.side}`,
      description: data.headline,
      images: [{ url: og, width: 1200, height: 630, alt: `${data.symbol} ${data.side}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${data.symbol} — ${data.side}`,
      description: data.headline,
      images: [og],
    },
  };
}

export default async function ShareScanPage(
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const data = await loadShare(symbol);
  if (!data) notFound();

  const sideColor =
    data.side === 'LONG' ? 'var(--msp-bull)' : data.side === 'SHORT' ? 'var(--msp-bear)' : 'var(--msp-warn)';

  return (
    <main style={{ minHeight: '100vh', background: 'var(--msp-bg)', color: '#F8FAFC', padding: '48px 20px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--msp-flat)' }}>
          MarketScanner Pros · shared snapshot
        </div>
        <h1 style={{ fontSize: 64, margin: '8px 0 4px', fontWeight: 800 }}>{data.symbol}</h1>
        <div style={{ display: 'inline-block', padding: '6px 14px', border: `2px solid ${sideColor}`, color: sideColor, borderRadius: 999, fontWeight: 700, letterSpacing: '0.12em' }}>
          {data.side}
        </div>
        <p style={{ fontSize: 22, color: 'var(--msp-text)', marginTop: 20, lineHeight: 1.4 }}>{data.headline}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginTop: 28 }}>
          {data.score != null && <Stat label="Opp Score" value={`${data.score}/100`} />}
          {data.price != null && <Stat label="Last Price" value={`$${data.price.toFixed(2)}`} />}
          {data.changePct != null && <Stat label="Change" value={`${data.changePct >= 0 ? '+' : ''}${data.changePct.toFixed(2)}%`} />}
          {data.float && <Stat label="Float" value={data.float} />}
          {data.shortPct != null && <Stat label="Short %" value={`${data.shortPct.toFixed(1)}%`} />}
          {data.sector && <Stat label="Sector" value={data.sector} />}
        </div>

        <div style={{ marginTop: 36, padding: '18px 22px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14 }}>
          <div style={{ fontSize: 14, color: 'var(--msp-flat)', marginBottom: 8 }}>What confirms · What invalidates</div>
          <div style={{ fontSize: 16, color: 'var(--msp-text)' }}>
            Rising RVOL with price holding above prior swing confirms. A float revision up (offering / unlock) or
            short-interest contraction invalidates. Low-float names cut both ways — same tightness that fuels
            squeezes fuels gaps down.
          </div>
        </div>

        <div style={{ marginTop: 36, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/pricing" style={{ padding: '14px 22px', background: 'var(--msp-bull)', color: 'var(--msp-bg)', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>
            Get the full scanner →
          </Link>
          <Link href={`/tools/scanner?symbol=${data.symbol}`} style={{ padding: '14px 22px', border: '1px solid rgba(255,255,255,0.18)', color: '#F8FAFC', borderRadius: 10, fontWeight: 600, textDecoration: 'none' }}>
            Open {data.symbol} in MSP
          </Link>
        </div>

        <p style={{ marginTop: 32, fontSize: 12, color: 'var(--msp-text-muted)', lineHeight: 1.6 }}>
          Source: {data.source.replace('_', ' ')} · snapshot from{' '}
          {new Date(data.fetchedAt).toISOString().slice(0, 10)}.
          Educational research only. Not investment advice. No order routing. Past performance does not predict future returns.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--msp-flat)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}
