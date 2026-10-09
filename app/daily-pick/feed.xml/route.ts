import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { toYmd } from '@/lib/time/usSession';

export const runtime = 'nodejs';
export const revalidate = 3600;

const SITE = 'https://marketscannerpros.app';

// DATE column → YYYY-MM-DD without a time-zone shift (see lib/time/usSession).
function toDateString(v: unknown): string {
  return toYmd(v) ?? '';
}

function toRfc822(v: unknown): string {
  const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : new Date();
  return d.toUTCString();
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Public feed (W3, 8 Oct): measured values only, no side, verdict, grade or score; each day listed A–Z. */
interface FeedRow {
  scan_date: unknown;
  asset_class: string;
  symbol: string;
  price: string | null;
  change_percent: string | null;
}

export async function GET() {
  let rows: FeedRow[] = [];
  try {
    rows = await q<FeedRow>(
      `SELECT scan_date, asset_class, symbol, price, change_percent
         FROM daily_picks
        WHERE scan_date >= CURRENT_DATE - INTERVAL '14 days'
          AND asset_class IN ('equity', 'crypto')
        ORDER BY scan_date DESC, symbol ASC
        LIMIT 200`,
    );
  } catch (err) {
    console.warn('[daily-pick/feed] query failed:', err);
  }

  const latestDate = rows.length > 0 ? toRfc822(rows[0].scan_date) : new Date().toUTCString();

  const items = rows.map((r) => {
    const dateStr = toDateString(r.scan_date);
    const price = r.price != null ? Number(r.price).toFixed(2) : null;
    const chg = r.change_percent != null ? Number(r.change_percent).toFixed(2) : null;
    const link = `${SITE}/share/scan/${encodeURIComponent(r.symbol)}`;
    const guid = `${SITE}/share/scan/${r.symbol}#${dateStr}`;
    const title = `${r.symbol} · daily scan snapshot (${dateStr})`;
    const descLines = [
      `Asset class: ${r.asset_class}`,
      price ? `Price: $${price}` : null,
      chg ? `Session change: ${chg}%` : null,
      `Scan date: ${dateStr}`,
      `Measured values only; not a rating, ranking or recommendation. Educational research only. Not investment advice.`,
    ].filter(Boolean) as string[];
    return `    <item>
      <title>${xmlEscape(title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">${xmlEscape(guid)}</guid>
      <pubDate>${toRfc822(r.scan_date)}</pubDate>
      <category>${xmlEscape(r.asset_class)}</category>
      <description>${xmlEscape(descLines.join(' · '))}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>MarketScannerPros — Daily scan observations</title>
    <link>${SITE}/daily-pick</link>
    <atom:link href="${SITE}/daily-pick/feed.xml" rel="self" type="application/rss+xml" />
    <description>Symbols stored by the MarketScannerPros daily scan, with measured price and session change, listed A–Z for each day. Not ratings, rankings or recommendations. Educational research only — not investment advice.</description>
    <language>en-au</language>
    <lastBuildDate>${latestDate}</lastBuildDate>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
