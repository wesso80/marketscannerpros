vi.mock('@/lib/admin/cryptoOpsAlerts',()=>({reportCryptoCycleHealth:vi.fn(async()=>({ok:true}))}));
import {reportCryptoCycleHealth} from '@/lib/admin/cryptoOpsAlerts';
vi.mock('@/lib/admin/cryptoAutomation',()=>({runCryptoAutomation:vi.fn(async()=>({enabled:false,skipped:true}))}));
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
vi.mock('@/lib/adminAuth',()=>({requireAdmin:vi.fn(async()=>({ok:false}))}));
vi.mock('@/lib/admin/cryptoPaper',()=>({runCryptoPaperAll:vi.fn(async()=>({ok:true,accounts:0}))}));
vi.mock('@/lib/admin/cryptoPaperBase',()=>({runCryptoBaseSleeveAll:vi.fn(async()=>({ok:true,accounts:0}))}));
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
// Research-only cron steps (signal ledger replay, Variant E shadow) own their tables; mocked here like the paper cycle.
vi.mock('@/lib/admin/cryptoSignalLedger',()=>({resolveSkippedSignals:vi.fn(async()=>({ok:true,due:0,resolved:0}))}));
vi.mock('@/lib/admin/cryptoVariantE',()=>({runVariantEStep:vi.fn(async()=>({ok:true,skipped:'test'}))}));
vi.mock('@/lib/admin/portfolio-lab/simulateCycle',()=>({simulateArcaCycle:vi.fn()}));
vi.mock('@/lib/admin/notifyAdmin',()=>({notifyAdmin:vi.fn()}));
import {runCryptoAutomation} from '@/lib/admin/cryptoAutomation';
import {runCryptoPaperAll} from '@/lib/admin/cryptoPaper';
import {runCryptoBaseSleeveAll} from '@/lib/admin/cryptoPaperBase';
import {q} from '@/lib/db';
import {simulateArcaCycle} from '@/lib/admin/portfolio-lab/simulateCycle';
import {POST} from '@/app/api/cron/arca-cycle/route';
import {resolveSkippedSignals} from '@/lib/admin/cryptoSignalLedger';
import {runVariantEStep} from '@/lib/admin/cryptoVariantE';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('ADMIN_DISCOVERY_ONLY','true');vi.stubEnv('CRON_SECRET','test-only-secret');});
afterEach(()=>vi.unstubAllEnvs());
it('rejects unauthenticated cron before any work',async()=>{
 expect((await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST'}))).status).toBe(401);expect(runCryptoPaperAll).not.toHaveBeenCalled();
});
it('runs only the crypto paper cycle while other admin jobs are paused',async()=>{
 expect((await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST',headers:{'x-cron-secret':'test-only-secret'}}))).status).toBe(200);
 expect(runCryptoPaperAll).toHaveBeenCalledTimes(2);expect(runCryptoPaperAll).toHaveBeenNthCalledWith(1,true);expect(vi.mocked(runCryptoPaperAll).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runCryptoAutomation).mock.invocationCallOrder[0]);expect(vi.mocked(runCryptoAutomation).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runCryptoPaperAll).mock.invocationCallOrder[1]);expect(q).not.toHaveBeenCalled();expect(simulateArcaCycle).not.toHaveBeenCalled();
 // Research-only steps run after the paper entry cycle.
 expect(vi.mocked(runCryptoPaperAll).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(resolveSkippedSignals).mock.invocationCallOrder[0]);expect(runVariantEStep).toHaveBeenCalledTimes(1);
 // The base-breakout sleeve follows the same shape: exits before the scan, entries after it.
 expect(runCryptoBaseSleeveAll).toHaveBeenCalledTimes(2);expect(runCryptoBaseSleeveAll).toHaveBeenNthCalledWith(1,true);expect(vi.mocked(runCryptoBaseSleeveAll).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runCryptoAutomation).mock.invocationCallOrder[0]);expect(vi.mocked(runCryptoAutomation).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(runCryptoBaseSleeveAll).mock.invocationCallOrder[1]);
});
it('reports paper failure as a failed cron',async()=>{
 vi.mocked(runCryptoPaperAll).mockRejectedValueOnce(Error('db offline'));
 expect((await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST',headers:{'x-cron-secret':'test-only-secret'}}))).status).toBe(503);
});

it('a scan failure cannot prevent the initial exit pass or permit new entries',async()=>{
 vi.mocked(runCryptoAutomation).mockRejectedValueOnce(Error('scan offline'));
 const response=await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST',headers:{'x-cron-secret':'test-only-secret'}}));
 expect(response.status).toBe(503);expect(runCryptoPaperAll).toHaveBeenCalledTimes(1);expect(runCryptoPaperAll).toHaveBeenCalledWith(true);expect(runCryptoBaseSleeveAll).toHaveBeenCalledTimes(1);expect(runCryptoBaseSleeveAll).toHaveBeenCalledWith(true);
});

it('keeps paper work successful even if email delivery fails',async()=>{vi.mocked(reportCryptoCycleHealth).mockRejectedValueOnce(Error('email down'));const r=await POST(new NextRequest('https://example.test/api/cron/arca-cycle',{method:'POST',headers:{'x-cron-secret':'test-only-secret'}}));expect(r.status).toBe(200);expect((await r.json()).operationalAlerts.ok).toBe(false);});
