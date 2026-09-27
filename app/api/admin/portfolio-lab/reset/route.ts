import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {validAdminMutationOrigin} from '@/lib/admin/mutationOrigin';
import {tx} from '@/lib/db';
import {ARCA_DEFAULT_PORTFOLIO_NAME,ARCA_DEFAULT_STARTING_BALANCE,ARCA_DEFAULT_SETTINGS,ARCA_BASE_CURRENCY} from '@/lib/admin/portfolio-lab/constants';
export const dynamic='force-dynamic';
/** Archive rather than delete. All historical rows retain their original portfolio ID. */
export async function POST(req:NextRequest){
 const headers={'Cache-Control':'private, no-store'};
 const auth=await requireAdmin(req);
 if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403,headers});
 if(!validAdminMutationOrigin(req.headers.get('origin'),req.nextUrl.origin))return NextResponse.json({error:'Origin rejected'},{status:403,headers});
 const body=await req.json().catch(()=>({}));
 if(typeof body.portfolioId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.portfolioId))return NextResponse.json({error:'Current portfolio ID required'},{status:400,headers});
 try{
  const result=await tx(async client=>{
   const current=(await client.query(`SELECT id,mode FROM arca_portfolios WHERE workspace_id=$1 AND name=$2 FOR UPDATE`,[auth.workspaceId,ARCA_DEFAULT_PORTFOLIO_NAME])).rows[0];
   if(!current||current.id!==body.portfolioId||current.mode!=='SIMULATED')return null;
   const archiveName=ARCA_DEFAULT_PORTFOLIO_NAME+' — archived '+current.id;
   await client.query(`UPDATE arca_portfolios SET name=$1,status='ARCHIVED',updated_at=NOW() WHERE id=$2 AND workspace_id=$3`,[archiveName,current.id,auth.workspaceId]);
   const fresh=(await client.query(`INSERT INTO arca_portfolios (workspace_id,name,mode,starting_balance,current_cash,realised_pnl,unrealised_pnl,total_equity,base_currency,status,settings_json)
     VALUES ($1,$2,'SIMULATED',$3,$3,0,0,$3,$4,'PAUSED',$5::jsonb) RETURNING id,status,starting_balance`,
     [auth.workspaceId,ARCA_DEFAULT_PORTFOLIO_NAME,ARCA_DEFAULT_STARTING_BALANCE,ARCA_BASE_CURRENCY,JSON.stringify(ARCA_DEFAULT_SETTINGS)])).rows[0];
   return {portfolio:fresh,archivedPortfolioId:current.id,archiveName};
  });
  if(!result)return NextResponse.json({error:'The paper account changed. Reload before resetting.'},{status:409,headers});
  return NextResponse.json({...result,message:'Paper account reset to $200,000 and paused. Previous ledger archived; personal holdings unchanged.'},{headers});
 }catch{return NextResponse.json({error:'Reset failed; the transaction was rolled back.'},{status:503,headers});}
}
