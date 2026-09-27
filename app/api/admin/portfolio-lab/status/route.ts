import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { validAdminMutationOrigin } from '@/lib/admin/mutationOrigin';
import { tx } from '@/lib/db';
import { ARCA_DEFAULT_PORTFOLIO_NAME } from '@/lib/admin/portfolio-lab/constants';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403, headers });
  if (!validAdminMutationOrigin(req.headers.get('origin'), req.nextUrl.origin)) return NextResponse.json({ error: 'Origin rejected' }, { status: 403, headers });
  const body = await req.json().catch(() => ({}));
  if (!['ACTIVE', 'PAUSED'].includes(body.status) || typeof body.portfolioId !== 'string') return NextResponse.json({ error: 'Current paper account and ACTIVE/PAUSED status required' }, { status: 400, headers });
  try {
    const portfolio = await tx(async client => {
      const current = (await client.query(`SELECT id,status FROM arca_portfolios WHERE id=$1 AND workspace_id=$2 AND name=$3 AND mode='SIMULATED' AND status IN ('ACTIVE','PAUSED') FOR UPDATE`, [body.portfolioId, auth.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME])).rows[0];
      if (!current) return null;
      if (current.status !== body.status) {
        await client.query(`UPDATE arca_portfolios SET status=$1,updated_at=NOW() WHERE id=$2 AND workspace_id=$3`, [body.status, current.id, auth.workspaceId]);
        await client.query(`INSERT INTO arca_trade_journal (workspace_id,portfolio_id,journal_type,title,arca_reasoning) VALUES ($1,$2,'REVIEW',$3,$4)`, [auth.workspaceId, current.id, `Paper account ${body.status === 'ACTIVE' ? 'resumed' : 'paused'}`, 'Operator changed simulated account status. Existing risk limits and strategy rules retained.']);
      }
      return { id: current.id, status: body.status };
    });
    if (!portfolio) return NextResponse.json({ error: 'Current paper account unavailable; reload.' }, { status: 409, headers });
    return NextResponse.json({ portfolio, message: body.status === 'ACTIVE' ? 'Paper account active. Scheduled paper cycles will resume with existing rules.' : 'Paper account paused. New cycles will skip this account.' }, { headers });
  } catch { return NextResponse.json({ error: 'Status change failed; transaction rolled back.' }, { status: 503, headers }); }
}
