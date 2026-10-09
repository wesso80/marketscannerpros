import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadShare } from '@/lib/og/scanShareData';
import { scanOgImageUrl } from '@/lib/og/scanOg';

export const runtime = 'nodejs';
export const revalidate = 600; // ISR — 10 min freshness is fine for share cards

export async function generateMetadata(
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Metadata> {
  const { symbol } = await params;
  const data = await loadShare(symbol);
  if (!data) {
    return { title: 'Symbol not found' };
  }
  const url = `https://marketscannerpros.app/share/scan/${data.symbol}`;
  // Image text is derived server-side from the same stored data (no free text in the URL).
  const og = scanOgImageUrl(data.symbol);
  return {
    title: `${data.symbol} — study snapshot`,
    description: data.headline,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${data.symbol} — research snapshot`,
      description: data.headline,
      images: [{ url: og, width: 1200, height: 630, alt: `${data.symbol} research snapshot` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${data.symbol} — research snapshot`,
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

  return (
    <main style={{ minHeight: '100vh', background: 'var(--msp-bg)', color: '#F8FAFC', padding: '48px 20px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--msp-flat)' }}>
          MarketScannerPros · shared study snapshot
        </div>
        <h1 style={{ fontSize: 64, margin: '8px 0 4px', fontWeight: 800 }}>{data.symbol}</h1>
        <p style={{ fontSize: 22, color: 'var(--msp-text)', marginTop: 20, lineHeight: 1.4 }}>{data.headline}</p>
        <p style={{ fontSize: 13, color: 'var(--msp-text-muted)', marginTop: 6 }}>Measured values only. Not a rating, ranking or recommendation.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginTop: 28 }}>
          {data.price != null && <Stat label={data.scanDate ? `Price (scan ${data.scanDate})` : 'Price'} value={`$${data.price.toFixed(2)}`} />}
          {data.changePct != null && <Stat label="Session change" value={`${data.changePct >= 0 ? '+' : ''}${data.changePct.toFixed(2)}%`} />}
          {data.float && <Stat label="Float" value={data.float} />}
          {data.shortPct != null && <Stat label="Short %" value={`${data.shortPct.toFixed(1)}%`} />}
          {data.sector && <Stat label="Sector" value={data.sector} />}
        </div>

        <div style={{ marginTop: 36, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/pricing" style={{ padding: '14px 22px', background: 'var(--msp-bull)', color: 'var(--msp-bg)', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>
            See the research workspace →
          </Link>
          <Link href={`/tools/scanner?symbol=${data.symbol}`} style={{ padding: '14px 22px', border: '1px solid rgba(255,255,255,0.18)', color: '#F8FAFC', borderRadius: 10, fontWeight: 600, textDecoration: 'none' }}>
            Open {data.symbol} in MarketScannerPros
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
