import {describe,expect,it} from 'vitest';
import {evidenceStatus,selectOutcomeCohort,parseCohort,type EvidenceRecord} from '@/lib/admin/verifiedOutcomes';
import {evidence} from './fixtures/outcomeEvidence';
describe('recorded outcome provenance',()=>{
 it('recognises internally consistent versioned evidence, including short direction and delayed daily bars',()=>{
  expect(evidenceStatus(evidence())).toBe('verified');
  const e=evidence();Object.assign(e,{direction:'SHORT',observedPrice:98,pctMove:-2,observedAt:'2026-10-03T12:00:00Z',processedAt:'2026-10-03T12:03:00Z'});Object.assign(e.provenance!,e,{provenance:undefined,barSource:'daily'});
  expect(evidenceStatus(e)).toBe('verified');
 });
 it('never attributes missing, legacy, expiry or unknown-version records from their date',()=>{
  expect(evidenceStatus({...evidence(),provenance:null})).toBe('unknown');
  for(const field of ['writer','method','horizon']){const e=evidence();e.provenance![field]='other';expect(evidenceStatus(e)).toBe('unknown');}
 });
 it.each(['direction','outcome','pctMove','observedAt','processedAt','entryPrice'])('rejects changed stored %s despite the method marker',field=>{
  const e=evidence();(e as Record<string,unknown>)[field]=field==='pctMove'?0.5:'wrong';expect(evidenceStatus(e)).toBe('inconsistent');
 });
 it('rejects impossible observation chronology and a forged outcome matching neither price nor method',()=>{
  const e=evidence();e.observedAt='2026-10-01T13:00:00Z';e.provenance!.observedAt=e.observedAt;expect(evidenceStatus(e)).toBe('inconsistent');
  const b=evidence();b.outcome='neutral';b.provenance!.outcome='neutral';expect(evidenceStatus(b)).toBe('inconsistent');
  const c=evidence();delete c.provenance!.thresholdPct;expect(evidenceStatus(c)).toBe('inconsistent');
 });
 it('reconciles every input and keeps uncertainty selectable without falling back to all history',()=>{
  const a={provenance_evidence:evidence()},b={provenance_evidence:undefined},c={provenance_evidence:{...evidence(),pctMove:0.5}};
  const verified=selectOutcomeCohort([a,b,c],'verified');expect(verified.rows).toEqual([a]);
  expect(verified.summary).toEqual({cohort:'verified',total:3,verified:1,unknown:1,inconsistent:1,selected:1});
  expect(selectOutcomeCohort([a,b,c],'unverified').rows).toEqual([b,c]);
  expect(selectOutcomeCohort([b],'verified').rows).toEqual([]);
  expect(parseCohort('unexpected')).toBe('all');
 });
});
