import { expect, it } from 'vitest';
import { renderCopilotObservation } from '@/lib/ai/copilotPresentation';
import type { PageEvidence } from '@/lib/ai/publicCopilotEvidence';
const evidence = (rows: Array<[string, string | number | boolean | null]>): PageEvidence => ({
 version:'copilot-evidence-v1',page:'/tools/golden-egg',symbol:'AAPL',timeframe:'daily',
 capturedAt:'2026-10-08T01:00:00Z',missing:[],observations:rows.map(([field,value],i)=>({id:`e${i}`,field,value})),
});
const render = (e: PageEvidence) => renderCopilotObservation(e.observations[0],e);
it('labels a completed-bar measurement with its unit and exact observation date',()=>{
 const result=render(evidence([['symbol.priceEvidence.atrPct',-2.5],['symbol.priceEvidence.basis.lastCompletedBar','2026-10-06']]));
 expect(result).toContain('Average true range: -2.5%');
 expect(result).toContain('Completed daily bar: 2026-10-06');
 expect(result).toContain('Snapshot captured: 2026-10-08T01:00:00Z');
 expect(result).toContain('[e0, e1]');
});
it('does not substitute snapshot capture for a missing observation time or assume a currency',()=>{
 const result=render(evidence([['symbol.canonical.price',123]]));
 expect(result).toContain('Price: 123 quote currency not supplied');
 expect(result).toContain('Observation time: not supplied');
 expect(result).not.toContain('USD');
});
it('preserves zero and distinguishes missing values',()=>{
 expect(render(evidence([['symbol.priceEvidence.bbwp',0]]))).toContain('0 percentile points');
 expect(render(evidence([['symbol.priceEvidence.bbwp',null]]))).toContain('Not available (missing; not zero)');
});
it('keeps the options observation date and expiry separate from the price date',()=>{
 const result=render(evidence([['options.openInterest.putCall',0.91],['options.chain.lastUpdated','2026-10-06'],['options.chain.expiry','2026-10-09'],['symbol.canonical.priceTs','2026-10-08T00:00:00Z']]));
 expect(result).toContain('Put/call open-interest ratio: 0.91 ratio');
 expect(result).toContain('Chain last updated: 2026-10-06');
 expect(result).toContain('Expiry: 2026-10-09');
 expect(result).not.toContain('2026-10-08T00:00:00Z');
});
it.each(['Buy now','2026-02-30','2026-10-06 Buy now'])('rejects invalid or injected dates: %s',value=>{
 const result=render(evidence([['symbol.canonical.price',123],['symbol.canonical.priceTs',value]]));
 expect(result).toContain('Observation time: not supplied');
 expect(result).not.toContain(value);
});
it('does not echo arbitrary source strings or assume unknown-field units',()=>{
 expect(render(evidence([['news.headline','Buy now']]))).not.toContain('Buy now');
 const result=render(evidence([['crypto.unknownMetric',42]]));
 expect(result).toContain('crypto / unknown Metric');
 expect(result).toContain('42 (unit not specified)');
 expect(result).not.toContain('Snapshot captured');
});
it('formats explicit USD measurements without rescaling',()=>{
 expect(render(evidence([['symbol.canonical.derivatives.openInterestUsd',1250000]]))).toContain('1250000 USD');
});
