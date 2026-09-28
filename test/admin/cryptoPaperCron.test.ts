vi.mock('@/lib/admin/cryptoAutomation',()=>({runCryptoAutomation:vi.fn(async()=>({enabled:false,skipped:true}))}));
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('@/lib/adminAuth',()=>({requireAdmin:vi.fn(async()=>({ok:false}))}));
vi.mock('@/lib/admin/cryptoPaper',()=>({runCryptoPaperAll:vi.fn(async()=>({ok:true,accounts:0}))}));
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
vi.mock('@/lib/admin/portfolio-lab/simulateCycle',()=>({simulateArcaCycle:vi.fn()}));
vi.mock('@/lib/admin/notifyAdmin',()=>({notifyAdmin:vi.fn()}));
import {runCryptoPaperAll} from '@/lib/admin/cryptoPaper';
import {q} from '@/lib/db';
import {simulateArcaCycle} from '@/lib/admin/portfolio-lab/simulateCycle';
import {POST} from '@/app/api/cron/arca-cycle/route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('ADMIN_DISCOVERY_ONLY','true');vi.stubEnv('CRON_SECRET','test-only-secret');});
afterEach(()=>vi.unstubAllEnvs());
it('rejects unauthenticated cron before any work',async()=>{
 expect((await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST'}))).status).toBe(401);expect(runCryptoPaperAll).not.toHaveBeenCalled();
});
it('runs only the crypto paper cycle while other admin jobs are paused',async()=>{
 expect((await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST',headers:{'x-cron-secret':'test-only-secret'}}))).status).toBe(200);
 expect(runCryptoPaperAll).toHaveBeenCalledOnce();expect(q).not.toHaveBeenCalled();expect(simulateArcaCycle).not.toHaveBeenCalled();
});
it('reports paper failure as a failed cron',async()=>{
 vi.mocked(runCryptoPaperAll).mockRejectedValueOnce(Error('db offline'));
 expect((await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST',headers:{'x-cron-secret':'test-only-secret'}}))).status).toBe(503);
});
