import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn(),stored:vi.fn(),save:vi.fn(),daily:vi.fn()}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:m.auth}));
vi.mock('@/lib/admin/sharedScan',()=>({readSavedScan:m.read}));
vi.mock('@/lib/admin/positionHistory',()=>({readPositionHistory:m.stored,savePositionHistory:m.save}));
vi.mock('@/lib/operator/market-data',()=>({createOperatorProvider:()=>({getDailyBars:m.daily})}));
import {POST} from '@/app/api/admin/position-history/route';
const request=(body={},origin='https://marketscannerpros.app')=>new NextRequest('https://marketscannerpros.app/api/admin/position-history',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true,workspaceId:'test'});m.stored.mockResolvedValue([]);m.daily.mockResolvedValue([]);m.read.mockResolvedValue({packets:[]});});
describe('bounded manual history repair',()=>{
 it('rejects unauthenticated and cross-origin requests before provider calls',async()=>{m.auth.mockResolvedValueOnce({ok:false});expect((await POST(request())).status).toBe(403);expect((await POST(request({},'https://other.example'))).status).toBe(403);expect(m.daily).not.toHaveBeenCalled();});
 it('limits a batch to five unique market/symbol histories and reports failures honestly',async()=>{const packets=Array.from({length:8},(_,i)=>({market:'EQUITIES',symbol:'T'+i}));m.read.mockResolvedValue({packets});const j=await(await POST(request())).json();expect(m.daily).toHaveBeenCalledTimes(5);expect(j.next).toBe(5);expect(j.total).toBe(8);expect(j.results.every((r:{status:string})=>r.status==='unavailable')).toBe(true);expect(m.save).not.toHaveBeenCalled();});
 it('rejects invalid offsets',async()=>{expect((await POST(request({offset:-1}))).status).toBe(400);expect(m.daily).not.toHaveBeenCalled();});
});
