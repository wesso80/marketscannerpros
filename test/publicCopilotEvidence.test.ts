import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { issueSymbolEvidence, verifyPageEvidence, issueSectionEvidence, combinePageEvidence } from '@/lib/ai/publicCopilotEvidence';
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
it('combines exact sections and rejects other accounts, assets, symbols, expiry and duplicate sections',()=>{
 const p={...packet,meta:{...packet.meta,assetClass:'equity'},canonical:{options:{expiry:'2026-10-09'}}};
 const core=verifyPageEvidence(issueSymbolEvidence(p,'a',1000),'a',1001)!;
 const news=issueSectionEvidence('news','AAPL','equity',{headline:'Fixture'},'a',null,1000)!;
 expect(combinePageEvidence(core,[news],'a',1001)?.observations.some(o=>o.field==='news.headline')).toBe(true);
 expect(combinePageEvidence(core,[news,news],'a',1001)).toBeNull();
 for(const token of [issueSectionEvidence('news','BTC','crypto',{},'a',null,1000),issueSectionEvidence('news','AAPL','crypto',{},'a',null,1000),issueSectionEvidence('news','AAPL','equity',{},'other',null,1000),issueSectionEvidence('options','AAPL','equity',{},'a','2026-10-16',1000)])expect(combinePageEvidence(core,[token],'a',1001)).toBeNull();
});
it('preserves a full year of chart rows in a bounded token without sampling away points',()=>{
 const rows=Array.from({length:365},(_,i)=>[String(i),...Array.from({length:12},(_,j)=>(i+j)/3)]);
 const token=issueSectionEvidence('chart','AAPL','equity',{rows},'a',null,1000);
 expect(token).not.toBeNull();
 const section=verifyPageEvidence(token,'a',1001)!;
 expect(JSON.parse(section.observations[0].value as string)).toEqual(rows);
});
it('binds Volatility to the selected timeframe and preserves zero and missing values',()=>{
 const p={...packet,meta:{...packet.meta,assetClass:'equity'},canonical:{options:{expiry:'2026-10-09'}}};
 const core=verifyPageEvidence(issueSymbolEvidence(p,'a',1000),'a',1001)!;
 const make=(timeframe:string)=>issueSectionEvidence('dve','AAPL','equity',{timeframe,reading:{bbwp:0,rate:null}},'a','2026-10-09',1000)!;
 const combined=combinePageEvidence(core,[make('daily')],'a',1001)!;
 expect(combined.observations.find(o=>o.field==='dve.reading.bbwp')?.value).toBe(0);
 expect(combined.observations.find(o=>o.field==='dve.reading.rate')?.value).toBeNull();
 expect(combinePageEvidence(core,[make('weekly')],'a',1001)).toBeNull();
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
 expect(validateCopilotAnswer(answer(''),e)).toContain('123');
 expect(validateCopilotAnswer(answer('The recorded price is 999.'),e)).toBeNull();
 expect(validateCopilotAnswer(answer('Price is recorded.',['made-up']),e)).toBeNull();
 expect(validateCopilotAnswer(answer('Price is recorded.',[]),e)).toBeNull();
 expect(validateCopilotAnswer(answer('You should buy now.'),e)).toBeNull();
 expect(validateCopilotAnswer(answer('correlation',[],'explanation'),e)).toContain('EXPLANATION');
});
