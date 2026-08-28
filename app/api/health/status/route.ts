import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

/**
 * GET /api/health/status
 * Deep health check — verifies all dependencies and returns aggregate status.
 * Used by uptime monitors for SLA alerting.
 *
 * Security: this endpoint is unauthenticated (uptime monitors need it), so it
 * MUST NOT leak internal detail — raw error strings can expose connection
 * targets/stack internals and the list of expected env-var names is a
 * reconnaissance aid. Detailed failures are logged server-side only; callers
 * receive booleans + latency.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number }> = {};

  // 1. Database
  try {
    const { q } = await import('@/lib/db');
    const start = Date.now();
    await q('SELECT 1');
    checks.database = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    console.error('[health/status] database check failed:', err instanceof Error ? err.message : String(err));
    checks.database = { ok: false };
  }

  // 2. Redis
  try {
    const redis = getRedis();
    if (redis) {
      const start = Date.now();
      await redis.ping();
      checks.redis = { ok: true, latencyMs: Date.now() - start };
    } else {
      checks.redis = { ok: false };
    }
  } catch (err) {
    console.error('[health/status] redis check failed:', err instanceof Error ? err.message : String(err));
    checks.redis = { ok: false };
  }

  // 3. Environment — report only an aggregate boolean, never the specific
  // missing var names (reconnaissance aid for attackers).
  const requiredEnvs = ['APP_SIGNING_SECRET', 'STRIPE_SECRET_KEY', 'DATABASE_URL', 'ALPHA_VANTAGE_API_KEY'];
  const missingEnvs = requiredEnvs.filter((k) => !process.env[k]);
  if (missingEnvs.length > 0) {
    console.error(`[health/status] missing env vars: ${missingEnvs.join(', ')}`);
  }
  checks.environment = { ok: missingEnvs.length === 0 };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: allOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    },
  );
}
