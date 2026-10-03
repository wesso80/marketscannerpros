import {expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const db=vi.hoisted(()=>({rows:new Map<string,any>()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>({workspaceId:'fixture',tier:'pro'})}));
vi.mock('@/lib/proTraderAccess',()=>({hasPaidSessionAccess:()=>true}));
vi.mock('@/lib/db',()=>({q:async(sql:string,p:any[])=>{
 if(sql.includes('SELECT id FROM watchlists'))return [{id:'w'}];
 if(sql.includes('COUNT(*)'))return [{count:db.rows.size}];
 if(sql.includes('MAX(sort_order)'))return [{next_order:db.rows.size}];
 if(sql.includes('INSERT INTO watchlist_items')){const existing=db.rows.get(p[2]);if(existing&&sql.includes('DO NOTHING'))return [];const row={symbol:p[2],notes:p[4],added_price:p[5]};db.rows.set(p[2],row);return [row];}
 if(sql.includes('FROM watchlist_items'))return db.rows.has(p[2])?[db.rows.get(p[2])]:[];
 return [];
}}));
import {fetchWatchlistQuotes} from '@/lib/watchlist/quotes';
import {POST} from '@/app/api/watchlists/items/route';
const save=(symbol:string,option?:any,notes='original')=>POST(new NextRequest('https://fixture/api/watchlists/items',{method:'POST',body:JSON.stringify({watchlistId:'w',symbol,assetType:option?'option':'equity',option,notes,addedPrice:1.29})}));
it('preserves stock and two contracts and reports duplicate without overwriting',async()=>{
 await save('AAPL');await save('AAPL',{expiration:'2026-10-05',strike:335,type:'call'});await save('AAPL',{expiration:'2026-10-05',strike:335,type:'put'});
 expect(db.rows.size).toBe(3);
 const duplicate=await save('AAPL',{expiration:'2026-10-05',strike:335,type:'put'},'replacement');
 expect((await duplicate.json()).alreadyExists).toBe(true);
 expect([...db.rows.values()].every(r=>r.notes==='original')).toBe(true);
});

it('never sends an option key through the underlying stock quote path',async()=>{
 const fetcher=vi.fn();
 expect(await fetchWatchlistQuotes([{symbol:'AAPL 2026-10-05 335C',asset_type:'option',current_price:333.69}],fetcher)).toEqual({});
 expect(fetcher).not.toHaveBeenCalled();
});
