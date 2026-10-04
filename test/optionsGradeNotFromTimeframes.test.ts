import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {gradeOptionsSetup,selectExpirationFromConfluence} from '@/lib/options-confluence-analyzer';
const read=(p:string)=>readFileSync(p,'utf8');
it('keeps the capped setup grade and uses only chain/IV/level reasons',()=>{
 const args={optionsGrade:'B' as const,ivRank:null,hasMeaningfulOI:true,quotedStrikes:20,freshness:'REALTIME',rr:2,agreement:90,caps:['Non-realtime options chain: options grade capped at B']};
 const a=gradeOptionsSetup(args),b=gradeOptionsSetup({...args,...{clusteredCount:6,pullBias:90,predictionConfidence:90}});
 expect(a).toEqual(b);expect(a.grade).toBe('B');expect(a.reasons.join(' ')).not.toMatch(/TF|confluence|cluster|bias|closing together/i);expect(a.reasons.join(' ')).toContain('IV rank n/a');
});
it('expiration confidence receives composite confidence without a cluster bonus',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05T15:43:00Z'));
 try { const f=(n:number)=>selectExpirationFromConfluence({decompression:{clusteredCount:n},prediction:{confidence:90}} as any,'intraday_1h','equity',['2026-10-09'],61);expect(f(0)).toEqual(f(6));expect(f(6)[0].confidenceScore).toBe(61); } finally {vi.useRealTimers();}
});
it('gate/risk/grade consumers do not read the removed scan grade',()=>{
 const s=read('lib/options-confluence-analyzer.ts');expect(s).not.toContain('gradeTradeQuality(');expect(s).toContain('tradeQuality: optionsGrade');expect(s).not.toContain("grade === 'C' || grade === 'F'");expect(s).not.toContain('(clusteredCount >= 2 ? 10 : 0)');expect(s).toContain('/ 0.45');
});
it('v21 and display labels no longer imply measured timeframe quality',()=>{
 expect(read('app/api/options-scan/route.ts')).toContain('const tfConfluenceScore = 50');
 expect(read('app/api/jobs/email-best-opportunities/route.ts')).not.toContain('Confluence stack:');
 expect(read('app/api/jobs/email-best-opportunities/route.ts')).not.toContain('Signal strength:');
 expect(read('app/api/jobs/email-best-opportunities/route.ts')).not.toMatch(/signal strength remains/);
 for(const name of ['StructureAlignmentCard','ConfluenceRadarCard'])expect(read(`components/msp/options/blocks/${name}.tsx`)).toContain('Multi-TF (not measured)');
 expect(read('components/options-terminal/OptionsConfluenceScanner.tsx')).toContain('Setup grade');
});
