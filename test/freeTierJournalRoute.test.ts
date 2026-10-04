import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({count:0,tier:'free',queries:[] as string[]}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>({workspaceId:'workspace',tier:'free',cid:'user'})}));
vi.mock('@/lib/entitlements',()=>({getEffectiveTier:async()=>state.tier}));
vi.mock('@/lib/universe/personalUniverse',()=>({getKillSwitchState:async()=>({enabled:false})}));
vi.mock('@/lib/db',()=>({atomicQueries:async(work:()=>Promise<unknown>)=>work(),q:async(sql:string)=>{
 state.queries.push(sql);
 if(sql.includes('COUNT(*)'))return [{count:String(state.count)}];
 if(sql.includes('INSERT INTO journal_entries'))return [{id:++state.count}];
 return [];
}}));
import { POST } from '@/app/api/journal/add-trade/route';
const request=()=>new NextRequest('https://example.test/api/journal/add-trade',{method:'POST',body:JSON.stringify({symbol:'AAPL',side:'LONG',entryPrice:100,quantity:1,tradeType:'Spot',tradeDate:'2026-10-04'})});
beforeEach(()=>{state.count=0;state.tier='free';state.queries=[];});
it('permits five manual entries and rejects the sixth before insertion',async()=>{
 for(let i=0;i<5;i++)expect((await POST(request())).status).toBe(201);
 const response=await POST(request());expect(response.status).toBe(403);expect((await response.json()).limitReached).toBe(true);expect(state.count).toBe(5);
 expect(state.queries.some(sql=>sql.includes('pg_advisory_xact_lock'))).toBe(true);
});
it('paid accounts retain the existing uncapped insert path',async()=>{
 state.tier='pro';state.count=100;expect((await POST(request())).status).toBe(201);
 expect(state.queries.some(sql=>sql.includes('COUNT(*)'))).toBe(false);
});
