import {it,expect} from 'vitest';
import {applyForwardScores,forwardHeadline,jevForwardSummary,persistForwardScores,type ForwardRow} from '../../lib/admin/cryptoForwardScore';
const at='2026-09-30T20:00:00.000Z';
const watch=(n=29)=>Array.from({length:n},(_,i)=>({id:`coin-${i}`,symbol:`W${i}`,stage:'VOLUME_WATCH' as const,close:1+i/10,asOf:at}));
it('enrolls every volume-watch name from one saved scan and leaves paper setups out',()=>{
 const four={rows:[...watch(),{id:'mom',symbol:'MOM',stage:'MOMENTUM_VOLUME',close:5,asOf:at},{id:'none',symbol:'NO',stage:'NO_SIGNAL',close:2,asOf:at},{id:'ext',symbol:'EXT',stage:'EXTENDED',close:3,asOf:at}]};
 const early={rows:[{id:'early',symbol:'EARLY',stage:'EARLY_WATCH',close:4,asOf:'2026-09-30T21:00:00.000Z'}]};
 const rows=applyForwardScores([],four,early);
 expect(rows).toHaveLength(31);
 expect(rows.filter(r=>r.bucket==='VOLUME_WATCH')).toHaveLength(29);
 expect(rows.map(r=>r.symbol)).not.toContain('MOM');
 expect(rows.find(r=>r.symbol==='EXT')?.bucket).toBe('EXTENDED');
 expect(rows.find(r=>r.symbol==='EARLY')?.signalPrice).toBe(4);
 expect(rows.every(r=>r.next4h.status==='waiting'&&r.day.status==='waiting')).toBe(true);
 expect(forwardHeadline(rows)).toBe('31 saved. Resolved 0. No win rate.');
 expect(forwardHeadline(rows)).not.toMatch(/edge/i);
 expect(applyForwardScores(rows,four,early)).toHaveLength(31);
});
it('fills the next 4h close and the 24h mark from later saved closes, without a win rate under 30',()=>{
 const signal='2026-09-30T20:00:00.000Z';
 const seeded=applyForwardScores([],{rows:[{id:'axs',symbol:'AXS',stage:'VOLUME_WATCH',close:2,asOf:signal}]},null);
 const next4=applyForwardScores(seeded,{rows:[{id:'axs',symbol:'AXS',stage:'NO_SIGNAL',close:2.2,asOf:'2026-10-01T00:00:00.000Z'}]},null);
 expect(next4[0].next4h).toMatchObject({status:'filled',price:2.2});
 expect((next4[0].next4h as {changePct:number}).changePct).toBeCloseTo(10,9);
 expect(next4[0].day.status).toBe('waiting');
 const day=applyForwardScores(next4,{rows:[{id:'axs',symbol:'AXS',stage:'NO_SIGNAL',close:1.8,asOf:'2026-10-01T20:00:00.000Z'}]},null);
 expect(day[0].day).toMatchObject({status:'filled',price:1.8});
 expect((day[0].day as {changePct:number}).changePct).toBeCloseTo(-10,9);
 expect(forwardHeadline(day)).toBe('1 saved. Resolved 1. No win rate.');
 const many=Array.from({length:30},(_,i)=>({...day[0],id:`c${i}`,symbol:`C${i}`,next4h:day[0].next4h,day:day[0].day})) as ForwardRow[];
 expect(forwardHeadline(many)).toBe('30 saved. Resolved 30.');
 expect(forwardHeadline(many)).not.toMatch(/%|edge|win rate/i);
});
it('keeps the Jev probabilities on the forward row and backfills them onto an earlier enroll',()=>{
 const jev={rule:'jev-shadow-v1' as const,status:'scored' as const,chase:.2,flowAgrees:.8,btcHeadwind:.15,btcTrend:'UP',flowStamp:'aggressive buying',model:'typesafe-ai/jev',checkedAt:at};
 const seeded=applyForwardScores([],{rows:[{id:'axs',symbol:'AXS',stage:'VOLUME_WATCH',close:2,asOf:at,jev}]},null);
 expect(seeded[0].jev).toMatchObject({chase:.2,flowAgrees:.8,btcHeadwind:.15});
 expect(seeded.map(r=>r.symbol)).not.toContain('MOM');
 const bare=applyForwardScores([],{rows:[{id:'ext',symbol:'EXT',stage:'EXTENDED',close:3,asOf:at}]},null);
 expect(bare[0].jev).toBeUndefined();
 const filled=applyForwardScores(bare,{rows:[{id:'ext',symbol:'EXT',stage:'EXTENDED',close:3,asOf:at,jev}]},null);
 expect(filled[0].jev).toMatchObject({status:'scored',chase:.2});
 expect(forwardHeadline(filled)).toBe('1 saved. Resolved 0. No win rate.');
});
it('marks a checkpoint missed when the saved close has already passed it',()=>{
 const seeded=applyForwardScores([],{rows:[{id:'mew',symbol:'MEW',stage:'EXTENDED',close:1,asOf:'2026-09-30T20:00:00.000Z'}]},null);
 const missed=applyForwardScores(seeded,{rows:[{id:'mew',symbol:'MEW',stage:'NO_SIGNAL',close:1.1,asOf:'2026-10-01T04:00:00.000Z'}]},null);
 expect(missed[0].next4h.status).toBe('missed');
});
it('stores the saved volume-watch scan through one redis read',async()=>{
 const saved:Record<string,unknown>={'admin:crypto-markets:momentum-volume:v1':{rows:watch()}};
 const redis={get:async(k:string)=>saved[k]??null,set:async(k:string,v:unknown)=>{saved[k]=v;return 'OK';}};
 const first=await persistForwardScores(redis as never);
 expect(first.book.rows.filter(r=>r.bucket==='VOLUME_WATCH')).toHaveLength(29);
 expect(first.headline).toContain('No win rate.');
 expect(first).not.toHaveProperty('winRate');
 expect(first.jev.coverage).toEqual({scored:0,unavailable:0,unscored:29,reasons:{}});
 expect(first.jev.note).toBe('No scored Jev rows saved yet.');
 const second=await persistForwardScores(redis as never);
 expect(second.book.rows).toHaveLength(29);
});
it('splits saved Jev answers against the saved marks, flags thin sides, and never names a win rate',()=>{
 const stamp=(chase:number)=>({rule:'jev-shadow-v2' as const,status:'scored' as const,chase,flowAgrees:.8,btcHeadwind:.1,btcTrend:'UP',flowStamp:'aggressive buying',model:'typesafe-ai/jev',checkedAt:at});
 const filled=(changePct:number)=>({status:'filled' as const,price:1,at,changePct});
 const rows:ForwardRow[]=[
  {id:'a',symbol:'A',bucket:'VOLUME_WATCH',signalAt:at,signalPrice:1,next4h:filled(2),day:filled(4),jev:stamp(.9)},
  {id:'b',symbol:'B',bucket:'VOLUME_WATCH',signalAt:at,signalPrice:1,next4h:filled(-1),day:{status:'waiting'},jev:stamp(.7)},
  {id:'c',symbol:'C',bucket:'EXTENDED',signalAt:at,signalPrice:1,next4h:filled(3),day:filled(-2),jev:stamp(.2)},
  {id:'d',symbol:'D',bucket:'EXTENDED',signalAt:at,signalPrice:1,next4h:{status:'missed'},day:{status:'waiting'},jev:{...stamp(.2),status:'unavailable',chase:null,flowAgrees:null,btcHeadwind:null,reason:'timeout'}},
  {id:'e',symbol:'E',bucket:'EARLY_WATCH',signalAt:at,signalPrice:1,next4h:{status:'waiting'},day:{status:'waiting'}},
 ];
 const s=jevForwardSummary(rows);
 expect(s.coverage).toEqual({scored:3,unavailable:1,unscored:1,reasons:{timeout:1}});
 const high=s.sides.find(x=>x.label==='chase ≥0.50'),low=s.sides.find(x=>x.label==='chase <0.50');
 expect(high).toMatchObject({rows:2,filled4h:2,avg4hPct:.5,up4hShare:.5,filled24h:1,avg24hPct:4,up24hShare:1,thin:true});
 expect(low).toMatchObject({rows:1,filled4h:1,avg4hPct:3,up4hShare:1,filled24h:1,avg24hPct:-2,up24hShare:0,thin:true});
 expect(s.sides.find(x=>x.label==='flow agrees ≥0.50')?.rows).toBe(3);
 expect(s.sides.some(x=>x.label.startsWith('flow agrees <'))).toBe(false);
 expect(s.note).toContain('Every side is under 30 filled marks');
 expect(JSON.stringify(s)).not.toMatch(/win ?rate|edge/i);
});
