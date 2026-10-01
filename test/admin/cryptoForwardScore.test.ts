import {it,expect} from 'vitest';
import {applyForwardScores,forwardHeadline,persistForwardScores,type ForwardRow} from '../../lib/admin/cryptoForwardScore';
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
 expect(next4[0].next4h).toMatchObject({status:'filled',price:2.2,changePct:10});
 expect(next4[0].day.status).toBe('waiting');
 const day=applyForwardScores(next4,{rows:[{id:'axs',symbol:'AXS',stage:'NO_SIGNAL',close:1.8,asOf:'2026-10-01T20:00:00.000Z'}]},null);
 expect(day[0].day).toMatchObject({status:'filled',price:1.8,changePct:-10});
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
 const second=await persistForwardScores(redis as never);
 expect(second.book.rows).toHaveLength(29);
});
