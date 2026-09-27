import { validAdminMutationOrigin } from '@/lib/admin/mutationOrigin';
import { NextRequest,NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { readSavedScan } from '@/lib/admin/sharedScan';
import { savePositionHistory,readPositionHistory } from '@/lib/admin/positionHistory';
import { createOperatorProvider } from '@/lib/operator/market-data';
import { computePositionTrend } from '@/lib/admin/positionTrend';
import { lastCompletedUsSessionDate } from '@/lib/time/usSession';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Explicit bounded history repair. Never runs discovery, orders, alerts, or bots. */
export async function POST(req:NextRequest){
 const headers={'Cache-Control':'private, no-store'};
 const auth=await requireAdmin(req);
 if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403,headers});
 if(!validAdminMutationOrigin(req.headers.get('origin'),req.nextUrl.origin))return NextResponse.json({error:'Origin mismatch'},{status:403,headers});
 const body=await req.json().catch(()=>({}));
 const offset=body.offset??0;
 if(!Number.isInteger(offset)||offset<0||offset>10000)return NextResponse.json({error:'Invalid offset'},{status:400,headers});
 try{
 const [equities,crypto,stored]=await Promise.all([readSavedScan({market:'EQUITIES',timeframe:'15m'}),readSavedScan({market:'CRYPTO',timeframe:'15m'}),readPositionHistory()]);
 const packets=[...equities.packets,...crypto.packets].sort((a,b)=>(a.market+':'+a.symbol).localeCompare(b.market+':'+b.symbol));
 const unique=[...new Map(packets.map(p=>[p.market+':'+p.symbol,p])).values()];
 const provider=createOperatorProvider({waitForToken:true});
 const results=[];
 for(const p of unique.slice(offset,offset+5)){
  const completed=p.market==='EQUITIES'?lastCompletedUsSessionDate(Date.now()):new Date(Date.now()-86400000).toISOString().slice(0,10);
  const hit=stored.find(h=>h.market===p.market&&h.symbol===p.symbol);
  if(hit&&Date.now()-Date.parse(hit.fetched_at)<6*3600000){results.push({symbol:p.symbol,cacheHit:true,...computePositionTrend(hit.bars,completed)});continue;}
  const bars=await provider.getDailyBars!(p.symbol,p.market === 'CRYPTO' ? 'CRYPTO' : 'EQUITIES');
  if(bars.length)await savePositionHistory(p.market,p.symbol,bars);
  const trend=computePositionTrend(bars,completed);
  results.push({symbol:p.symbol,...trend});
 }
 const next=offset+5<unique.length?offset+5:null;
 return NextResponse.json({results,next,total:unique.length,processed:Math.min(offset+5,unique.length)},{headers});
 }catch{return NextResponse.json({error:'History repair stopped; saved evidence is preserved.'},{status:503,headers});}
}
