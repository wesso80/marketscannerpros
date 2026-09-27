import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({auth:vi.fn(),query:vi.fn(),tx:vi.fn()}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:m.auth}));
vi.mock('@/lib/db',()=>({tx:m.tx}));
import {POST} from '@/app/api/admin/portfolio-lab/reset/route';
const id='11111111-1111-4111-8111-111111111111';
const req=()=>new NextRequest('http://localhost:10000/api/admin/portfolio-lab/reset',{method:'POST',headers:{origin:'https://marketscannerpros.app','content-type':'application/json'},body:JSON.stringify({portfolioId:id})});
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true,workspaceId:'owner'});m.tx.mockImplementation(fn=>fn({query:m.query}));});
describe('paper reset archive transaction',()=>{
 it('archives the scoped paper account and creates a clean paused account without deleting history',async()=>{
  m.query.mockResolvedValueOnce({rows:[{id,mode:'SIMULATED'}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:'new',status:'PAUSED',starting_balance:'200000'}]});
  const r=await POST(req());expect(r.status).toBe(200);expect((await r.json()).archivedPortfolioId).toBe(id);
  expect(m.tx).toHaveBeenCalledTimes(1);expect(m.query.mock.calls[0][1][0]).toBe('owner');
  const sql=m.query.mock.calls.map(c=>c[0]).join('\n');expect(sql).toContain('FOR UPDATE');expect(sql).toContain("status='ARCHIVED'");expect(sql).toContain("'PAUSED'");expect(sql).not.toMatch(/DELETE|TRUNCATE|portfolio_positions|portfolio_closed/);
  expect(m.query.mock.calls[2][1][2]).toBe(200000);
 });
 it('rejects stale/replayed resets without mutations',async()=>{m.query.mockResolvedValue({rows:[{id:'different',mode:'SIMULATED'}]});expect((await POST(req())).status).toBe(409);expect(m.query).toHaveBeenCalledTimes(1);});
 it('requires authorization',async()=>{m.auth.mockResolvedValue({ok:false});expect((await POST(req())).status).toBe(403);expect(m.tx).not.toHaveBeenCalled();});
 it('surfaces transaction failure',async()=>{m.tx.mockRejectedValue(Error('rollback'));expect((await POST(req())).status).toBe(503);});
});
