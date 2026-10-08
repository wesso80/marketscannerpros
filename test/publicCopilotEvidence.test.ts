import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { issueSymbolEvidence, verifyPageEvidence } from '@/lib/ai/publicCopilotEvidence';
import { validateCopilotAnswer } from '@/lib/ai/publicCopilotPolicy';
const packet = { contract:'public-symbol-v2',meta:{symbol:'AAPL',timeframe:'daily'},canonical:{price:123,missing:null} } as any;
beforeEach(()=>vi.stubEnv('APP_SIGNING_SECRET','isolated-fixture-secret'));
afterEach(()=>vi.unstubAllEnvs());
it('binds evidence to the account, exact bytes and expiration',()=>{
 const token=issueSymbolEvidence(packet,'account:a',1000)!;
 expect(verifyPageEvidence(token,'account:a',1001)?.symbol).toBe('AAPL');
 expect(verifyPageEvidence(token,'account:b',1001)).toBeNull();
 expect(verifyPageEvidence(token+'x','account:a',1001)).toBeNull();
 expect(verifyPageEvidence(token,'account:a',1801000)).toBeNull();
 expect(verifyPageEvidence('forged','account:a')).toBeNull();
});
it('keeps null values and declares disconnected sections; never signs a demo or absent contract',()=>{
 const e=verifyPageEvidence(issueSymbolEvidence(packet,'a',1000),'a',1001)!;
 expect(e.observations.some(o=>o.value===null)).toBe(true);
 expect(e.missing.join()).toContain('not connected');
 expect(issueSymbolEvidence({...packet,canonical:null},'a')).toBeNull();
 expect(issueSymbolEvidence({...packet,contract:'private'},'a')).toBeNull();
 vi.stubEnv('APP_SIGNING_SECRET','');expect(issueSymbolEvidence(packet,'a')).toBeNull();
});
it('requires real citations and rejects unsupported numbers, advice and missing observations',()=>{
 const e=verifyPageEvidence(issueSymbolEvidence(packet,'a',1000),'a',1001)!;
 const id=e.observations.find(o=>o.value===123)!.id;
 const answer=(text:string,ids=[id],kind='observation')=>({statements:[{kind,text,evidenceIds:ids}]});
 expect(validateCopilotAnswer(answer('The recorded price is 123.'),e)).toContain('123');
 expect(validateCopilotAnswer(answer('The recorded price is 999.'),e)).toBeNull();
 expect(validateCopilotAnswer(answer('Price is recorded.',['made-up']),e)).toBeNull();
 expect(validateCopilotAnswer(answer('Price is recorded.',[]),e)).toBeNull();
 expect(validateCopilotAnswer(answer('You should buy now.'),e)).toBeNull();
 expect(validateCopilotAnswer(answer('Correlation describes co-movement.',[],'explanation'),e)).toContain('EXPLANATION');
});
