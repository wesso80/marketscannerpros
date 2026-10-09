import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {readFileSync} from 'node:fs';
const h=vi.hoisted(()=>({access:vi.fn(),analyze:vi.fn(),project:vi.fn(),sign:vi.fn()}));
vi.mock('@/lib/options/access',()=>({checkOptionsAccess:h.access}));
vi.mock('@/lib/options-confluence-analyzer',()=>({optionsAnalyzer:{analyzeForOptions:h.analyze}}));
vi.mock('@/lib/research/publicOptionsScan',()=>({toPublicOptionsEvidence:h.project}));
vi.mock('@/lib/ai/sectionEvidenceAccess',()=>({sectionEvidenceToken:h.sign}));
vi.mock('@/lib/rateLimit',()=>({apiLimiter:{check:()=>({allowed:true})},getClientIP:()=> 'fixture'}));
import {GET} from '@/app/api/research/options/route';
const request=(query='symbol=AAPL&expiry=2026-10-09')=>new NextRequest(`http://localhost/api/research/options?${query}`);
beforeEach(()=>{vi.clearAllMocks();h.access.mockResolvedValue({ok:true});h.analyze.mockResolvedValue({assetType:'equity',privateScore:'secret'});h.project.mockReturnValue({contract:'public-options-evidence-v1',chain:{expiry:'2026-10-09'}});h.sign.mockResolvedValue('signed');});
it('checks access and input before analysis',async()=>{
 h.access.mockResolvedValueOnce({ok:false,status:401});expect((await GET(request())).status).toBe(401);
 h.access.mockResolvedValueOnce({ok:false,status:403});expect((await GET(request())).status).toBe(403);
 expect((await GET(request('symbol=bad!'))).status).toBe(400);expect(h.analyze).not.toHaveBeenCalled();
});
it('returns only public evidence for the selected expiry with no state-machine orchestration',async()=>{
 const r=await GET(request());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
 expect(h.analyze).toHaveBeenCalledWith('AAPL','swing_1d','2026-10-09');
 expect(JSON.stringify(await r.json())).not.toContain('secret');
 const source=readFileSync('app/api/research/options/route.ts','utf8');expect(source).not.toMatch(/upsertStateMachine|getAdaptiveLayer|state-machine-store/);
});
it('hides provider errors',async()=>{
 h.analyze.mockRejectedValueOnce(Error('https://provider?apikey=secret'));
 const r=await GET(request());expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('secret');
});
