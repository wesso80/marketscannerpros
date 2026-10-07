import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {scannerDataAudit} from '@/lib/admin/scannerDataAudit';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
/** GET /api/admin/scanner-data-audit — READ-ONLY: how much stored history the scanner's setups can be tested on. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json({ok:true,...await scannerDataAudit(new URL(req.url).searchParams.get('refresh')==='1')},{headers:{'Cache-Control':'no-store'}});}
 catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message.slice(0,200):'Audit failed'},{status:503});}
}
