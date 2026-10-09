import { cache } from 'react';
import { Metadata } from 'next';
import { formatSessionDate } from '@/lib/time/usSession';
import { loadLatestDailyPicks as loadLatest } from '@/lib/og/dailyPicksLatest';
import { scanOgImageUrl } from '@/lib/og/scanOg';
import DailyPickView from './DailyPickView';

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
  const count = data?.picks.length ?? 0;
  const title = unavailable ? 'Daily scan unavailable · MarketScannerPros' : `Daily scan observations ${dateStr} · MarketScannerPros`;
  const asOf = data?.pricesAsOfNote ? ` ${data.pricesAsOfNote}` : '';
  const description = `${count ? `${count} stocks and crypto` : 'Symbols'} stored by the daily scan for the ${formatSessionDate(dateStr)} US session, listed A–Z with measured price, session change, float and short interest.${asOf} Educational snapshots, not recommendations.`;
  const url = 'https://marketscannerpros.app/daily-scan';
  // The card's text is built server-side from the same snapshot; the date only makes the URL change daily.
  const og = scanOgImageUrl('DAILY', data?.scan_date ?? null);
  return {
    title: 'Daily scan observations',
    description,
    alternates: {
      canonical: url,
      types: {
        'application/rss+xml': [
          { url: `${url}/feed.xml`, title: 'MarketScannerPros — Daily scan RSS' },
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
          <h1 style={h1Style}>Daily scan observations</h1>
          <p style={{ color: 'var(--msp-flat)' }}>
            {unavailable ? 'Daily scan observations are unavailable because the latest snapshot could not be loaded. Refresh to retry.' : 'No observations stored yet for the latest session. Check back after the next scan.'}
          </p>
        </div>
      </main>
    );
  }

  return <DailyPickView data={data} />;
}

const pageStyle = { minHeight: '100vh', background: 'var(--msp-bg)', color: '#F8FAFC', padding: '48px 20px' };
const containerStyle = { maxWidth: 1000, margin: '0 auto' };
const h1Style = { fontSize: 40, margin: '6px 0 12px', fontWeight: 800, lineHeight: 1.15 };
