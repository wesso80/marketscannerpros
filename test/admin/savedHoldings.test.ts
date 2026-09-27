import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({q:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/db',()=>({q:m.q}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:m.auth}));
import {GET} from '@/app/api/admin/portfolio-lab/holdings/route';
const request=()=>new NextRequest('https://marketscannerpros.app/api/admin/portfolio-lab/holdings');
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true,workspaceId:'private-test'});});
describe('saved holdings feed',()=>{
 it('requires authenticated workspace before reading holdings',async()=>{m.auth.mockResolvedValue({ok:false});expect((await GET(request())).status).toBe(403);expect(m.q).not.toHaveBeenCalled();});
 it('scopes holdings and linked journal to the workspace and handles option units',async()=>{
 m.q.mockResolvedValue([{id:1,symbol:'TEST',side:'LONG',quantity:'2',entry_price:'3',current_price:'4',trade_type:'Options'}]);
 const r=await GET(request()),j=await r.json();expect(j.exposure).toBe(800);expect(j.unrealizedPnl).toBe(200);expect(m.q.mock.calls[0][1]).toEqual(['private-test']);expect(m.q.mock.calls[0][0]).toContain('j.workspace_id=p.workspace_id');expect(r.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it('does not fabricate values for unsupported futures',async()=>{m.q.mockResolvedValue([{id:2,side:'LONG',quantity:1,entry_price:20000,current_price:21000,trade_type:'Futures'}]);const j=await(await GET(request())).json();expect(j.exposure).toBeNull();expect(j.unrealizedPnl).toBeNull();});
 it('reports read errors instead of showing an empty portfolio',async()=>{m.q.mockRejectedValue(Error('offline'));expect((await GET(request())).status).toBe(503);});
});
