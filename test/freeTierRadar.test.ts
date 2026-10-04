import {expect,it,vi} from 'vitest';
import {radarPreview} from '@/lib/free/radarPreview';
import type {ReportStore} from '@/lib/jarvis/report/persistDailyReport';
it('exposes only latest metadata and earlier symbols, including failed latest sessions',async()=>{
 const latest={sessionDate:'2026-10-02',status:'FAILED',headline:'PRIVATE',reportJson:{candidates:[{symbol:'TODAY_SECRET',score:987654}],ops:{secret:true}}};
 const previous={sessionDate:'2026-10-01',reportJson:{candidates:[{symbol:'SPY',score:987654},{symbol:'AAPL'}]}};
 const store={listArchive:vi.fn(async()=>[latest]),getBySession:vi.fn(async(date:string)=>date===latest.sessionDate?latest:previous),neighbours:vi.fn(async()=>({previous:'2026-10-01',next:null}))} as unknown as ReportStore;
 const result=await radarPreview(store);
 expect(result).toEqual({sessionDate:'2026-10-02',status:'FAILED',candidateCount:1,previous:{sessionDate:'2026-10-01',symbols:['SPY','AAPL']}});
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE|TODAY_SECRET|987654|ops|headline|score/);
});
it('no reports means absent preview, never fabricated zero results',async()=>expect(await radarPreview({listArchive:async()=>[]} as unknown as ReportStore)).toBeNull());
