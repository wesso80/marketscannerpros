import {describe,it,expect} from 'vitest';
import {assessDailyBase,createBaseScan,type BaseScanRow} from '../../lib/admin/cryptoBaseScan';
const D=86400000,now=Date.UTC(2026,8,28,4);
const row:BaseScanRow={id:'test',symbol:'TEST',product:'TEST-USD',stage:'PENDING',reason:'',asOf:null,high:null,low:null,widthPct:null,gapPct:null,slopePct:null,contraction:null};
const bars=()=>Array.from({length:30},(_,i)=>({t:Date.UTC(2026,8,28)-(29-i)*D,o:100,h:102,l:98,c:100,v:i>=23?50:100}));
describe('daily base scan',()=>{
 it('finds flat bases with declining volume',()=>expect(assessDailyBase(row,bars(),now).stage).toBe('BASE'));
 it('rejects expanded price ranges and rising volume',()=>{
 const b=bars();b[29].h=130;expect(assessDailyBase(row,b,now).stage).toBe('NOT_BASE');
 expect(assessDailyBase(row,bars().map(b=>({...b,v:100})),now).stage).toBe('NOT_BASE');
 });
 it('does not invent evidence for missing, future or zero-volume bars',()=>{
 expect(assessDailyBase(row,bars().filter((_,i)=>i!==25),now).stage).toBe('UNAVAILABLE');
 expect(assessDailyBase(row,bars(),now-2*D).stage).toBe('UNAVAILABLE');
 expect(assessDailyBase(row,bars().map(b=>({...b,v:0})),now).stage).toBe('UNAVAILABLE');
 });
 it('does not call an unsupported or pegged coin a base',()=>{
 const coin={id:'usd1',symbol:'USD1',name:'USD1',stage:'WATCH' as const,price:1,volumeUsd:1e7,marketCapUsd:1e9,change1h:0,change24h:0,change7d:0,observedAt:new Date(now).toISOString(),reasons:[],fixedScanCovered:false,venues:[]};
 const scan=createBaseScan([coin,{...coin,id:'quant-network',symbol:'QNT',name:'Quant'}],new Date(now).toISOString(),now);
 expect(scan.rows.find(r=>r.id==='usd1')?.stage).toBe('EXCLUDED');
 expect(scan.rows.find(r=>r.id==='quant-network')?.stage).toBe('UNAVAILABLE');
 });
});
