import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getBarCacheStats } from '@/lib/barCache';
import { getAlphaVantageProviderStatus } from '@/lib/avRateGovernor';
import { getCoinGeckoProviderStatus } from '@/lib/coingecko';
import { q } from '@/lib/db';
import { wrapTruth } from '@/lib/admin';
import { logger, generateTraceId } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);

  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const startedAt = Date.now();
  try {
    let dbLatencyMs: number | null = null;
    let dbConnected = false;
    let lastSignalAt: string | null = null;
    let signalCount24h = 0;

    try {
      const dbStartedAt = Date.now();
      await q('SELECT 1');
      dbLatencyMs = Date.now() - dbStartedAt;
      dbConnected = true;
    } catch (err) {
      log.warn('diagnostics db ping failed', { error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const rows = await q(
        `SELECT MAX(signal_at) AS last_signal_at, COUNT(*)::int AS count_24h
         FROM ai_signal_log
         WHERE signal_at >= NOW() - INTERVAL '24 hours'`,
      );
      lastSignalAt = rows[0]?.last_signal_at ?? null;
      signalCount24h = Number(rows[0]?.count_24h ?? 0);
    } catch {
      // Migration may not exist yet in all environments.
    }

    const barCache = getBarCacheStats();
    const staleEntries = barCache.entries.filter((entry) => entry.stale).length;
    const [alphaVantage, coinGecko] = await Promise.all([
      getAlphaVantageProviderStatus(),
      Promise.resolve(getCoinGeckoProviderStatus()),
    ]);

    return NextResponse.json({
      ok: true,
      traceId,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      database: { connected: dbConnected, latencyMs: dbLatencyMs },
      scanners: {
        signalCount24h,
        lastSignalAt,
      },
      providers: {
        alphaVantage,
        coinGecko,
      },
      barCache: {
        size: barCache.size,
        maxEntries: barCache.maxEntries,
        staleEntries,
        freshest: barCache.entries.sort((a, b) => a.ageMs - b.ageMs).slice(0, 8),
      },
      truth: wrapTruth({}, { source: 'admin:diagnostics', freshness: 'real-time' }),
    });
  } catch (err) {
    log.error('diagnostics scanners failed', err);
    return NextResponse.json({ ok: false, traceId, error: 'Scanner diagnostics failed' }, { status: 500 });
  }
}
