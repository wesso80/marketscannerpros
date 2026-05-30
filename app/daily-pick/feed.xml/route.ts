import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 3600;

const SITE = 'https://marketscannerpros.app';

function toDateString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return '';
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

interface FeedRow {
  scan_date: unknown;
  asset_class: string;
  symbol: string;
  score: number;
  direction: string;
  price: string | null;
  change_percent: string | null;
}

export async function GET() {
  let rows: FeedRow[] = [];
  try {
    rows = await q<FeedRow>(
      `SELECT scan_date, asset_class, symbol, score, direction, price, change_percent
         FROM daily_picks
        WHERE scan_date >= CURRENT_DATE - INTERVAL '14 days'
        ORDER BY scan_date DESC, score DESC
        LIMIT 100`,
    );
  } catch (err) {
    console.warn('[daily-pick/feed] query failed:', err);
  }

  const latestDate = rows.length > 0 ? toRfc822(rows[0].scan_date) : new Date().toUTCString();

  const items = rows.map((r) => {
    const dateStr = toDateString(r.scan_date);
    const side = r.direction === 'bullish' ? 'LONG' : r.direction === 'bearish' ? 'SHORT' : 'WATCH';
    const price = r.price != null ? Number(r.price).toFixed(2) : null;
    const chg = r.change_percent != null ? Number(r.change_percent).toFixed(2) : null;
    const link = `${SITE}/share/scan/${encodeURIComponent(r.symbol)}`;
    const guid = `${SITE}/share/scan/${r.symbol}#${dateStr}`;
    const title = `${r.symbol} · ${side} · score ${r.score} (${dateStr})`;
    const descLines = [
      `Asset class: ${r.asset_class}`,
      `Side: ${side}`,
      `Score: ${r.score}`,
      price ? `Price: $${price}` : null,
      chg ? `Change: ${chg}%` : null,
      `Scan date: ${dateStr}`,
      `Educational research only. Not investment advice.`,
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
    <title>MarketScanner Pros — Daily Picks</title>
    <link>${SITE}/daily-pick</link>
    <atom:link href="${SITE}/daily-pick/feed.xml" rel="self" type="application/rss+xml" />
    <description>Top scanner-ranked equities and crypto from MarketScanner Pros, updated daily. Educational research only — not investment advice.</description>
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
