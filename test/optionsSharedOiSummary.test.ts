import {describe,expect,it} from 'vitest';
import {summarizeOpenInterest,putCallTilt,oiBasisLabel,oiRowFromContract,OI_BASIS,type OiRow} from '@/lib/options/oiSummary';
import {summarizeChain,type RawContract} from '@/lib/goldenEgg/optionsChain';
import {analyzeOpenInterest} from '@/lib/options-confluence-analyzer';

const spot=333.63,expiry='2026-10-09',date='2026-10-06';
/** AAPL-like chain: normal near-spot OI plus a large deep out-of-the-money put hedge at 220 (34% below spot). */
function chain():RawContract[]{
 const rows:RawContract[]=[];
 for(let k=250;k<=420;k+=5){
  const d=Math.abs(k-spot);
  rows.push({contractID:`C${k}`,expiration:expiry,strike:k,type:'call',open_interest:Math.round(4000*Math.exp(-d/25)),bid:'1',ask:'1.1',implied_volatility:'0.3',delta:'0.5',gamma:'0.01',theta:'-0.1',vega:'0.2',date});
  rows.push({contractID:`P${k}`,expiration:expiry,strike:k,type:'put',open_interest:Math.round(2400*Math.exp(-d/25)),bid:'1',ask:'1.1',implied_volatility:'0.3',delta:'-0.5',gamma:'0.01',theta:'-0.1',vega:'0.2',date});
 }
 rows.push({contractID:'P220',expiration:expiry,strike:220,type:'put',open_interest:60000,bid:'0.05',ask:'0.07',implied_volatility:'0.6',date});
 return rows;
}
const rows=()=>chain().map(oiRowFromContract).filter((r):r is OiRow=>r!=null);

describe('shared open-interest summary',()=>{
 it('separates in-range and every-strike figures: the deep put moves only the every-strike ratio and wall',()=>{
  const s=summarizeOpenInterest(rows(),spot)!;
  expect(s.inRange.putCall!).toBeLessThan(s.allStrikes.putCall!);
  expect(s.walls.put!.strike).toBe(335);                  // largest put OI within ±15%
  expect(s.wallsAllStrikes.put!.strike).toBe(220);         // the hedge, labelled every-strike only
  expect(s.walls.put!.relation).toBe('above');
  expect(s.basis).toMatchObject({ratioRangePct:30,wallRangePct:15,version:OI_BASIS.version});
  expect(oiBasisLabel(s)).toMatch(/^strikes within ±30% of \$333\.63 \(\d+ of \d+ listed\)$/);
 });
 it('missing data stays missing: no call OI → ratio null (never 1.0); no strikes in range → walls null; bad spot → null',()=>{
  const puts=rows().filter(r=>r.type==='put');
  const s=summarizeOpenInterest(puts,spot)!;expect(s.inRange.putCall).toBeNull();expect(s.walls.call).toBeNull();
  expect(summarizeOpenInterest([{type:'call',strike:900,oi:10}],spot)!.walls.call).toBeNull();
  expect(summarizeOpenInterest(rows(),0)).toBeNull();
  expect(summarizeOpenInterest([{type:'call',strike:330,oi:null},{type:'put',strike:330,oi:null}],spot)!.maxPain).toBeNull();
 });
 it('one set of tilt cut-offs',()=>{
  expect(putCallTilt(0.58)).toBe('call-heavy');expect(putCallTilt(0.91)).toBe('balanced');expect(putCallTilt(1.2)).toBe('put-heavy');expect(putCallTilt(null)).toBeNull();
 });
});

describe('Symbol and the Options analysis report the same numbers for the same expiry',()=>{
 const now=Date.parse('2026-10-07T10:35:00Z');
 it('put/call, totals, walls and max pain match, and both state the basis',()=>{
  const sym=summarizeChain(chain(),spot,{nowMs:now,snapshotTs:date})!;
  const calls=chain().filter(c=>c.type==='call') as never[],puts=chain().filter(c=>c.type==='put') as never[];
  const opt=analyzeOpenInterest(calls,puts,spot,expiry)!;
  const shared=summarizeOpenInterest(rows(),spot)!;
  expect(sym.putCallOi).toBe(shared.inRange.putCall);expect(opt.pcRatio).toBe(shared.inRange.putCall);
  expect(sym.totalPutOi).toBe(opt.totalPutOI);expect(sym.totalCallOi).toBe(opt.totalCallOI);
  expect(sym.putWall!.strike).toBe(shared.walls.put!.strike);
  expect(opt.highOIStrikes.find(h=>h.type==='put')!.strike).toBe(shared.walls.put!.strike);
  expect(sym.topPut!.strike).toBe(sym.putWall!.strike);
  expect(sym.maxPain).toBe(shared.maxPain);
  if(opt.maxPainStrike!=null)expect(opt.maxPainStrike).toBe(shared.maxPain);
  expect(sym.oi?.basis.ratioRangePct).toBe(30);expect(opt.basis?.basis.ratioRangePct).toBe(30);
  expect(sym.sentiment).toBe('Bullish');expect(opt.sentiment).toBe('bullish'); // same cut-offs
 });
 it('no call open interest near spot: Symbol has no ratio and the Options analysis is unavailable',()=>{
  const onlyPuts=chain().filter(c=>c.type==='put');
  const sym=summarizeChain(onlyPuts,spot,{nowMs:now,snapshotTs:date})!;
  expect(sym.putCallOi).toBeNull();expect(sym.sentiment).toBe('Unavailable');
  expect(analyzeOpenInterest([],onlyPuts as never[],spot,expiry)).toBeNull();
 });
 it('a missing IV is never replaced: Greeks stay unestimated and estimated ones are flagged',()=>{
  const near=(c:RawContract)=>Math.abs(Number(c.strike)-spot)<=10;
  const noIv=chain().filter(near).map(c=>({...c,implied_volatility:undefined,delta:undefined,gamma:undefined,theta:undefined,vega:undefined}));
  const opt=analyzeOpenInterest(noIv.filter(c=>c.type==='call') as never[],noIv.filter(c=>c.type==='put') as never[],spot,expiry)!;
  for(const h of opt.highOIStrikes){expect(h.iv).toBeUndefined();expect(h.delta).toBeUndefined();expect(h.greeksEstimated).toBe(false);}
  const withIv=chain().filter(near).map(c=>({...c,delta:undefined,gamma:undefined,theta:undefined,vega:undefined}));
  const est=analyzeOpenInterest(withIv.filter(c=>c.type==='call') as never[],withIv.filter(c=>c.type==='put') as never[],spot,expiry)!;
  expect(est.highOIStrikes.every(h=>h.greeksEstimated===true&&typeof h.delta==='number')).toBe(true);
 });
});
