import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { positionUnits } from '@/lib/portfolio/positionValue';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const number = (v: unknown): number | null => v == null || !Number.isFinite(Number(v)) ? null : Number(v);
/** Saved holdings, not ARCA simulation and not a live broker balance. Read-only. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({error:'Unauthorized'}, {status:403,headers});
  try {
    const rows = await q<Record<string, unknown>>(`SELECT p.id,p.symbol,p.side,p.quantity,p.entry_price,p.current_price,p.entry_date,p.updated_at,
      j.trade_type,j.asset_class,j.stop_loss,j.target
      FROM portfolio_positions p LEFT JOIN journal_entries j ON j.id=p.journal_entry_id AND j.workspace_id=p.workspace_id
      WHERE p.workspace_id=$1 ORDER BY p.symbol,p.id`, [auth.workspaceId]);
    const positions = rows.map(p => {
      const quantity=number(p.quantity), entry=number(p.entry_price), mark=number(p.current_price);
      const supported = p.trade_type !== 'Futures' && (p.side === 'LONG' || p.side === 'SHORT');
      const units=quantity == null ? null : positionUnits({quantity,tradeType: String(p.trade_type || '')});
      const valued=supported && units != null && entry != null && entry>0 && mark != null && mark>0;
      return {id:p.id,symbol:p.symbol,side:p.side,quantity,entry,mark,tradeType:p.trade_type,assetClass:p.asset_class,
        stop:number(p.stop_loss),target:number(p.target),entryDate:p.entry_date,savedAt:p.updated_at,
        exposure:valued ? Math.abs(units*mark) : null,
        unrealizedPnl:valued ? (mark-entry)*units*(p.side==='LONG'?1:-1) : null,
        valuationStatus:valued?'SAVED_PRICE':'UNAVAILABLE'};
    });
    const complete=positions.every(p=>p.exposure!=null);
    return NextResponse.json({schemaVersion:'saved-holdings.v1',readOnly:true,source:'portfolio_positions + linked journal_entries',
      servedAt:new Date().toISOString(),positions,count:positions.length,
      exposure:complete?positions.reduce((s,p)=>s+p.exposure!,0):null,
      unrealizedPnl:complete?positions.reduce((s,p)=>s+p.unrealizedPnl!,0):null,
      limitations:['Saved records only; no broker reconciliation or live price refresh.', 'Saved time is not a provider price timestamp.', 'Exposure is not account equity. Futures valuation is unavailable without contract specifications.']}, {headers});
  } catch { return NextResponse.json({error:'Saved holdings could not be read. This does not mean the portfolio is empty.'},{status:503,headers}); }
}
