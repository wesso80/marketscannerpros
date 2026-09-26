/**
 * GET /api/share/radar/latest.png | /api/share/radar/YYYY-MM-DD.png
 *
 * Public 1200×675 PNG teaser of the MSP Radar daily report for social posts (Metricool / X). Reads one persisted
 * report row (lib/share/radarCard.ts lists exactly which fields); no live data calls. Plain-text 400/404 otherwise.
 */
import { q } from '@/lib/db';
import { loadRadarCardModel, RadarCard } from '@/lib/share/radarCard';
import { CACHE_DATED, CACHE_LATEST, cachedPng, renderPng, shareError } from '@/lib/share/respond';
import { parsePngFile, parseShareDate } from '@/lib/share/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const name = parsePngFile((await params).file);
  const date = name && name !== 'latest' ? parseShareDate(name) : null;
  if (!name || (name !== 'latest' && !date)) return shareError(400, 'Use /api/share/radar/latest.png or /api/share/radar/YYYY-MM-DD.png');
  const key = `radar:${date ?? 'latest'}`;
  const hit = cachedPng(key);
  if (hit) return hit;
  try {
    const m = await loadRadarCardModel(q, date);
    if (!m) return shareError(404, date ? `No MSP Radar report for ${date}` : 'No MSP Radar report available');
    return await renderPng(key, <RadarCard m={m} />, {
      cacheControl: date ? CACHE_DATED : CACHE_LATEST,
      ttlMs: date ? 6 * 3_600_000 : 10 * 60_000,
      filename: `msp-radar-${m.sessionDate}.png`,
    });
  } catch (e) {
    console.error('[share/radar]', e instanceof Error ? e.message : e);
    return shareError(500, 'Share card could not be rendered');
  }
}
