/**
 * GET /api/share/setup/<SYMBOL>.png[?date=YYYY-MM-DD]
 *
 * Public 1200×675 PNG of one ticker's stored daily-scan setup (verdict, score, reference levels) for social posts
 * (Metricool / X). Reads daily_picks only (lib/share/setupCard.ts); no live market-data calls. Without a date the
 * latest row is used only if it is at most 7 days old. Plain-text 400/404 otherwise.
 */
import { q } from '@/lib/db';
import { loadSetupCardModel, SetupCard } from '@/lib/share/setupCard';
import { CACHE_DATED, CACHE_LATEST, cachedPng, renderPng, shareError } from '@/lib/share/respond';
import { parsePngFile, parseShareDate, parseShareSymbol } from '@/lib/share/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const symbol = parseShareSymbol(parsePngFile((await params).file));
  const rawDate = new URL(req.url).searchParams.get('date');
  const date = rawDate == null ? null : parseShareDate(rawDate);
  if (!symbol || (rawDate != null && !date)) return shareError(400, 'Use /api/share/setup/<SYMBOL>.png with an optional ?date=YYYY-MM-DD');
  const key = `setup:${symbol}:${date ?? 'latest'}`;
  const hit = cachedPng(key);
  if (hit) return hit;
  try {
    const m = await loadSetupCardModel(q, symbol, date);
    if (!m) return shareError(404, date ? `No stored setup for ${symbol} on ${date}` : `No setup for ${symbol} in the last 7 days of scans`);
    return await renderPng(key, <SetupCard m={m} />, {
      cacheControl: date ? CACHE_DATED : CACHE_LATEST,
      ttlMs: date ? 6 * 3_600_000 : 10 * 60_000,
      filename: `msp-setup-${symbol}-${m.scanDate}.png`,
    });
  } catch (e) {
    console.error('[share/setup]', e instanceof Error ? e.message : e);
    return shareError(500, 'Share card could not be rendered');
  }
}
