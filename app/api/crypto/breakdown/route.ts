import {NextRequest,NextResponse} from 'next/server';
import {getSessionFromCookie} from '@/lib/auth';
import {hasPaidSessionAccess} from '@/lib/proTraderAccess';
import {loadBreakdown} from '@/lib/crypto/breakdown/load';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const session=await getSessionFromCookie();
 if(!session?.workspaceId)return NextResponse.json({error:'Please log in'},{status:401});
 if(!hasPaidSessionAccess(session))return NextResponse.json({error:'Pro access required'},{status:403});
 const q=new URL(request.url).searchParams,symbol=q.get('symbol')?.trim()??'',id=q.get('id')??undefined;
 if(!/^[A-Za-z0-9][A-Za-z0-9/-]{0,39}$/.test(symbol)||id&&!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id))return NextResponse.json({error:'Invalid symbol or coin id'},{status:400});
 try{return NextResponse.json(await loadBreakdown(symbol,id),{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({error:'Crypto breakdown unavailable'},{status:503});}
}
