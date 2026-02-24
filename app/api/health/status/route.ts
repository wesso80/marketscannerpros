import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

/**
 * GET /api/health/status
 * Deep health check — verifies all dependencies and returns aggregate status.
 * Used by uptime monitors for SLA alerting.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // 1. Database
  try {
    const { q } = await import('@/lib/db');
    const start = Date.now();
    await q('SELECT 1');
    checks.database = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Redis
  try {
    const redis = getRedis();
    if (redis) {
      const start = Date.now();
      await redis.ping();
      checks.redis = { ok: true, latencyMs: Date.now() - start };
    } else {
      checks.redis = { ok: false, error: 'Redis not configured' };
    }
  } catch (err) {
    checks.redis = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 3. Environment
  const requiredEnvs = ['APP_SIGNING_SECRET', 'STRIPE_SECRET_KEY', 'DATABASE_URL', 'ALPHA_VANTAGE_API_KEY'];
  const missingEnvs = requiredEnvs.filter((k) => !process.env[k]);
  checks.environment = { ok: missingEnvs.length === 0, error: missingEnvs.length > 0 ? `Missing: ${missingEnvs.join(', ')}` : undefined };

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
