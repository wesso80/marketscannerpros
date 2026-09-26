/**
 * GET /api/share/m2/latest.png
 *
 * Public 1200×675 PNG of the latest Global M2 reading for social posts (Metricool / X). Built from the persisted
 * monthly store only (lib/share/m2Card.ts): no central-bank or Alpha Vantage calls on any request.
 * 503 (plain text) when nothing has been ingested yet.
 */
import { loadM2CardModel, M2Card } from '@/lib/share/m2Card';
import { CACHE_M2, cachedPng, renderPng, shareError } from '@/lib/share/respond';
import { parsePngFile } from '@/lib/share/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  if (parsePngFile((await params).file) !== 'latest') return shareError(400, 'Use /api/share/m2/latest.png');
  const key = 'm2:latest';
  const hit = cachedPng(key);
  if (hit) return hit;
  try {
    const m = await loadM2CardModel();
    if (!m) return shareError(503, 'Global M2 has not been ingested yet (run the global-m2-ingest cron)');
    return await renderPng(key, <M2Card m={m} />, { cacheControl: CACHE_M2, ttlMs: 6 * 3_600_000, filename: 'msp-global-m2.png' });
  } catch (e) {
    console.error('[share/m2]', e instanceof Error ? e.message : e);
    return shareError(500, 'Share card could not be rendered');
  }
}
