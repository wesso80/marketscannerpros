vi.mock('@/lib/admin/cryptoAutomation',()=>({cryptoAutomationState:vi.fn(async()=>({enabled:false})),setCryptoAutomation:vi.fn()}));
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/adminAuth',()=>({requireAdmin:vi.fn()}));
vi.mock('@/lib/admin/cryptoPaper',()=>({cryptoPaperState:vi.fn(async()=>({portfolio:null})),setCryptoPaperActive:vi.fn(),runCryptoPaperCycle:vi.fn()}));
vi.mock('@/lib/admin/cryptoPaperBase',()=>({cryptoBaseSleeveState:vi.fn(async()=>({mode:'SIMULATED',portfolio:null,positions:[],trades:[]})),ensureBaseSleeve:vi.fn(),runCryptoBaseSleeveCycle:vi.fn()}));
import {requireAdmin} from '@/lib/adminAuth';
import {cryptoPaperState,setCryptoPaperActive,runCryptoPaperCycle} from '@/lib/admin/cryptoPaper';
import {ensureBaseSleeve,runCryptoBaseSleeveCycle} from '@/lib/admin/cryptoPaperBase';
import {GET,POST} from '@/app/api/admin/crypto-markets/paper/route';
const request=(action:string)=>new Request('https://example.test/api/admin/crypto-markets/paper',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireAdmin).mockResolvedValue({ok:true,workspaceId:'owner'});});
it('unauthorized reads and writes do no ledger work',async()=>{
 vi.mocked(requireAdmin).mockResolvedValue({ok:false});expect((await GET(request('cycle'))).status).toBe(403);expect((await POST(request('enable'))).status).toBe(403);expect(cryptoPaperState).not.toHaveBeenCalled();expect(setCryptoPaperActive).not.toHaveBeenCalled();
});
it('enables only the authenticated workspace and runs a cycle; the base-breakout sleeve follows',async()=>{
 expect((await POST(request('enable'))).status).toBe(200);expect(setCryptoPaperActive).toHaveBeenCalledWith('owner',true);expect(runCryptoPaperCycle).toHaveBeenCalledWith('owner');expect(ensureBaseSleeve).toHaveBeenCalledWith('owner',true);expect(runCryptoBaseSleeveCycle).toHaveBeenCalledWith('owner');
});
it('pause does not request market data',async()=>{
 await POST(request('pause'));expect(setCryptoPaperActive).toHaveBeenCalledWith('owner',false);expect(runCryptoPaperCycle).not.toHaveBeenCalled();expect(ensureBaseSleeve).toHaveBeenCalledWith('owner',false);expect(runCryptoBaseSleeveCycle).not.toHaveBeenCalled();
});
it('rejects unknown actions',async()=>{expect((await POST(request('reset'))).status).toBe(400);expect(setCryptoPaperActive).not.toHaveBeenCalled();});
it('kill switch enables the ledger without running an entry or exit cycle',async()=>{
 vi.stubEnv('CRYPTO_MARKETS_PAUSED','true');
 const res=await POST(request('enable'));
 expect(res.status).toBe(200);
 expect(await res.json()).toMatchObject({paused:true,skipped:true});
 expect(setCryptoPaperActive).toHaveBeenCalledWith('owner',true);
 expect(ensureBaseSleeve).toHaveBeenCalledWith('owner',true);
 expect(runCryptoPaperCycle).not.toHaveBeenCalled();
 expect(runCryptoBaseSleeveCycle).not.toHaveBeenCalled();
 vi.unstubAllEnvs();
});
