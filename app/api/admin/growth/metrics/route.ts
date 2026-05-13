import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { listPerformance } from '@/lib/growth/db';
import { wrapTruth } from '@/lib/admin';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam && Number.isFinite(Number(limitParam)) ? Number(limitParam) : 50;
  const workspaceId = 'admin';

  try {
    const rows = await listPerformance(workspaceId, limit);
    const haveMetrics = rows.filter((r) => r.snapshot_at != null).length;
    return NextResponse.json({
      rows,
      truth: wrapTruth(
        { source: 'admin:postgres', haveMetrics, total: rows.length },
        {
          source: 'admin:postgres',
          freshness: haveMetrics > 0 ? 'real-time' : 'stale',
          simulated: false,
          missingFields: haveMetrics === 0 ? ['social_post_metrics'] : [],
          confidence: haveMetrics > 0 ? 'high' : 'low',
          confidenceReason:
            haveMetrics === 0
              ? 'No metrics snapshots yet — connect platform metrics pull to populate social_post_metrics.'
              : `${haveMetrics}/${rows.length} posts have metrics.`,
        },
      ),
    });
  } catch (err: any) {
    if (err.message?.includes('does not exist')) {
      return NextResponse.json({ rows: [], message: 'social_post_metrics table not created yet — run migration 076.' });
    }
    console.error('[growth/metrics] failed:', err);
    return NextResponse.json({ error: 'failed to load metrics', details: err.message }, { status: 500 });
  }
}
