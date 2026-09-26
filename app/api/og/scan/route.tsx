import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import {
  buildScanOgModel, OG_SCAN_HEIGHT, OG_SCAN_WIDTH, type OgSide, type ScanOgModel,
} from '@/lib/og/scanOg';
import { loadShare } from '@/lib/og/scanShareData';
import { loadLatestDailyPicks } from '@/lib/og/dailyPicksLatest';
import { shareCardFonts } from '@/lib/share/font';

// Node runtime: the text is built from the database (daily_picks / company_overview), not from the query string.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/og/scan?symbol=<SYMBOL|DAILY>[&date=YYYY-MM-DD]
 *
 * 1200x630 PNG for X / Open Graph cards on /share/scan/[symbol] and /daily-pick. Only `symbol` (validated) and
 * `date` (validated; only makes the URL change daily) are read. Every word on the image comes from stored data via
 * lib/og/scanOg.ts; old URLs that still carry headline/sub/score/price keep working, but those values are ignored.
 * Bad input: 400 text. Unknown symbol / no picks: 404 text. Data error: 503 text.
 */

// Site palette as literal colours (satori cannot resolve CSS variables).
const C = { bg: '#0F172A', text: '#F8FAFC', body: '#CBD5E1', muted: '#94A3B8', line: 'rgba(255,255,255,0.08)' };
const ACCENT: Record<OgSide, string> = { LONG: '#10B981', SHORT: '#EF4444', WATCH: '#F59E0B' };
const CACHE_CONTROL = 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400';

// Render has no CDN in front of the web service, so keep recent PNGs in memory (bounded).
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 64;
const cache = new Map<string, { at: number; png: ArrayBuffer }>();

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' },
  });
}

function png(body: ArrayBuffer, hit: boolean): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': CACHE_CONTROL,
      'x-content-type-options': 'nosniff',
      'x-og-cache': hit ? 'hit' : 'miss',
    },
  });
}

export async function GET(req: NextRequest | Request) {
  const result = await buildScanOgModel(new URL(req.url).searchParams, { loadShare, loadLatestDailyPicks });
  if (result.status !== 200) return text(result.status, result.error);

  const now = Date.now();
  const cached = cache.get(result.key);
  if (cached && now - cached.at < CACHE_TTL_MS) return png(cached.png, true);

  const image = new ImageResponse(<ScanOgCard m={result.model} />, {
    width: OG_SCAN_WIDTH, height: OG_SCAN_HEIGHT,
    // Unkerned Noto Sans so drawn words match satori's layout (no stray gap after "WATCH"); see lib/share/font.ts.
    fonts: shareCardFonts(),
  });
  const body = await image.arrayBuffer();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(result.key, { at: now, png: body });
  return png(body, false);
}

function ScanOgCard({ m }: { m: ScanOgModel }) {
  const accent = ACCENT[m.side];
  return (
    <div style={{ width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #0F172A 0%, #111827 60%, #0B1220 100%)', color: C.text, padding: '56px 64px 56px 52px', borderLeft: `12px solid ${accent}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', color: C.muted, fontSize: 22, letterSpacing: '0.08em' }}>
          <div style={{ display: 'flex', width: 10, height: 10, background: accent, borderRadius: 5, marginRight: 14 }} />
          MARKETSCANNER PROS
        </div>
        <div style={{ display: 'flex', padding: '10px 18px', border: `2px solid ${accent}`, color: accent, borderRadius: 999, fontSize: 22, letterSpacing: '0.12em' }}>
          {m.side}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
        <div style={{ display: 'flex', fontSize: 132, lineHeight: 1, letterSpacing: '-0.03em', color: C.text }}>{m.symbol}</div>
        <div style={{ display: 'flex', fontSize: 38, color: C.body, lineHeight: 1.25, maxWidth: '1070px', marginTop: 14 }}>{m.headline}</div>
      </div>
      {m.stats.length > 0 && (
        <div style={{ display: 'flex', marginTop: 'auto', marginBottom: 24 }}>
          {m.stats.map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 22px', minWidth: 170, marginRight: 20 }}>
              <div style={{ display: 'flex', fontSize: 16, letterSpacing: '0.12em', color: C.muted }}>{s.label.toUpperCase()}</div>
              <div style={{ display: 'flex', fontSize: 36, color: C.text, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: `1px solid ${C.line}`, color: C.muted, fontSize: 22, marginTop: m.stats.length > 0 ? 0 : 'auto' }}>
        <div style={{ display: 'flex' }}>{m.sub}</div>
        <div style={{ display: 'flex', color: accent }}>marketscannerpros.app</div>
      </div>
    </div>
  );
}
