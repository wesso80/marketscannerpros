import {it,expect,vi} from 'vitest';
import {loadCopilotSections} from '@/lib/ai/loadCopilotSections';
it('loads read-only equity evidence without AI calls or state-writing options requests',async()=>{
 const fetcher=vi.fn(async()=>Response.json({copilotEvidenceToken:'signed-fixture'}));
 const result=await loadCopilotSections('AAPL','equity',new AbortController().signal,fetcher);
 expect(Object.keys(result.tokens)).toEqual(['chart','news','ownership','dve','options']);
 expect(fetcher).toHaveBeenCalledTimes(5);
 expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/options-scan|ai\/copilot|POST/);
});
it('keeps successful sections when a section fails or has no signed evidence',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({copilotEvidenceToken:'chart'})).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(Response.json({sections:{}}));
 const result=await loadCopilotSections('BTC','crypto',new AbortController().signal,fetcher);
 expect(result).toEqual({tokens:{chart:'chart'},unavailable:['news','crypto','dve']});
 expect(fetcher.mock.calls[2][0]).toContain('/api/crypto/breakdown');
});
