import { beforeEach, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({auth:vi.fn(),automation:vi.fn(),setAutomation:vi.fn(),state:vi.fn(),baseState:vi.fn(),setActive:vi.fn(),ensureBase:vi.fn(),cycle:vi.fn(),baseCycle:vi.fn()}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:h.auth}));
vi.mock('@/lib/admin/cryptoAutomation',()=>({cryptoAutomationState:h.automation,setCryptoAutomation:h.setAutomation}));
vi.mock('@/lib/admin/cryptoPaper',()=>({cryptoPaperState:h.state,setCryptoPaperActive:h.setActive,runCryptoPaperCycle:h.cycle,cryptoPaperTradeLog:vi.fn()}));
vi.mock('@/lib/admin/cryptoPaperBase',()=>({cryptoBaseSleeveState:h.baseState,ensureBaseSleeve:h.ensureBase,runCryptoBaseSleeveCycle:h.baseCycle}));
vi.mock('@/lib/admin/cryptoMarketsPause',()=>({cryptoMarketsPaused:()=>false,pausedCryptoMarketsBody:()=>({})}));
import {POST} from '@/app/api/admin/crypto-markets/paper/route';
const request=(action:string)=>new Request('https://marketscannerpros.app/api/admin/crypto-markets/paper',{method:'POST',body:JSON.stringify({action})});
beforeEach(()=>{Object.values(h).forEach(mock=>mock.mockReset());h.auth.mockResolvedValue({ok:true,workspaceId:'fixture'});h.automation.mockResolvedValue({enabled:true});h.state.mockResolvedValue({portfolio:{id:'saved'},positions:[],trades:[],journal:[]});h.baseState.mockResolvedValue({portfolio:null});h.setActive.mockResolvedValue('paper');h.ensureBase.mockResolvedValue('base');h.cycle.mockResolvedValue({ok:true});h.baseCycle.mockResolvedValue({ok:true});});
it.each(['auto_enable','auto_pause','enable','pause','cycle'])('%s remains confirmed if its account snapshot fails',async(action)=>{
 h.state.mockRejectedValue(Error('private provider URL'));
 const response=await POST(request(action));const body=await response.json();
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(body.actionResult).toMatchObject({action,status:'completed'});expect(body.snapshot.status).toBe('unavailable');expect(body.portfolio).toBeUndefined();expect(JSON.stringify(body)).not.toContain('private provider URL');
 expect(h.setAutomation).toHaveBeenCalledTimes(action.startsWith('auto_')?1:0);expect(h.cycle).toHaveBeenCalledTimes(['enable','cycle'].includes(action)?1:0);
});
it.each(['automation','baseState'])('a failed %s read does not obscure a completed setting change',async(key)=>{
 h[key as 'automation'|'baseState'].mockRejectedValue(Error('fixture'));const body=await(await POST(request('auto_enable'))).json();expect(body.actionResult.status).toBe('completed');expect(body.snapshot.status).toBe('unavailable');expect(h.setAutomation).toHaveBeenCalledOnce();
});
it('successful action and snapshot retain the existing account response',async()=>{const body=await(await POST(request('enable'))).json();expect(body).toMatchObject({portfolio:{id:'saved'},automation:{enabled:true},snapshot:{status:'available'},actionResult:{status:'completed'}});expect(h.setActive).toHaveBeenCalledWith('fixture',true);});
it('a setter exception reports unknown outcome without claiming rollback or retrying',async()=>{h.setAutomation.mockRejectedValue(Error('secret detail'));const response=await POST(request('auto_enable'));const body=await response.json();expect(response.status).toBe(503);expect(body.actionResult).toMatchObject({status:'unknown',steps:[{name:'background_scans',status:'unconfirmed'}]});expect(h.setAutomation).toHaveBeenCalledOnce();expect(h.state).not.toHaveBeenCalled();expect(JSON.stringify(body)).not.toContain('secret detail');});
it('keeps completed settings visible if a later cycle throws',async()=>{h.cycle.mockRejectedValue(Error('fixture'));const response=await POST(request('enable'));expect(response.status).toBe(503);expect((await response.json()).actionResult.steps).toEqual([{name:'paper_entries',status:'completed'},{name:'base_entries',status:'completed'},{name:'paper_cycle',status:'unconfirmed'}]);expect(h.baseCycle).not.toHaveBeenCalled();});
it.each(['ensureBase','baseCycle'])('reports a partial outcome when %s throws instead of swallowing it',async(key)=>{h[key as 'ensureBase'|'baseCycle'].mockRejectedValue(Error('fixture'));const body=await(await POST(request('enable'))).json();expect(body.actionResult.status).toBe('partial');expect(body.actionResult.steps.some((s:{status:string})=>s.status==='unconfirmed')).toBe(true);expect(body.snapshot.status).toBe('available');});
it('skipped cycles do not claim execution',async()=>{h.cycle.mockResolvedValue({skipped:true,reason:'busy'});h.baseCycle.mockResolvedValue({skipped:true,reason:'busy'});expect((await(await POST(request('cycle'))).json()).actionResult.status).toBe('skipped');});
it('an explicitly unhealthy cycle does not claim complete success',async()=>{h.cycle.mockResolvedValue({monitorHealthy:false});expect((await(await POST(request('cycle'))).json()).actionResult.status).toBe('partial');});
it('authorization and invalid input stop before effects or snapshots',async()=>{h.auth.mockResolvedValue({ok:false});expect((await POST(request('enable'))).status).toBe(403);h.auth.mockResolvedValue({ok:true,workspaceId:'fixture'});expect((await POST(request('invalid'))).status).toBe(400);for(const key of ['state','setActive','setAutomation','cycle'] as const)expect(h[key]).not.toHaveBeenCalled();});
