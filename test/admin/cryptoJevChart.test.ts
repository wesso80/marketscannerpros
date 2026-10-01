import {afterEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {CHART_MIN_BARS,CHART_QUESTIONS,chartState,scoreChartRows,unavailableChart} from '@/lib/admin/cryptoJevChart';
import {CHART_IDS,chartFromReason,chartSideLabel,chartText} from '@/lib/admin/cryptoJevEvidence';
import {buildCalibration,paperObservations} from '@/lib/admin/cryptoCalibration';
const now=Date.UTC(2026,9,1,8,5),savedKey=process.env.AI_GATEWAY_API_KEY;
const H4=4*3600000,t0=Date.UTC(2026,8,27,0);
/** Twenty quiet bars around 10 then a wide signal candle that closes near its high on 3x volume. */
function bars(){
 const out=[];
 for(let i=0;i<20;i++){const c=10+Math.sin(i)*.05;out.push({t:t0+i*H4,o:c-.02,h:c+.08,l:c-.08,c,v:100+(i%3)*5});}
 out.push({t:t0+20*H4,o:10.05,h:10.9,l:10.0,c:10.85,v:330});
 return out;
}
const row=(stage:string,extra:Record<string,unknown>={})=>({id:'qnt',symbol:'QNT',stage,asOf:'2026-10-01T04:00:00.000Z',kind:'BREAKOUT' as const,relativeVolume:3.1,changePct:8,trigger:10.1,close:10.85,atr:.2,bars:bars(),...extra});
afterEach(()=>{vi.unstubAllGlobals();if(savedKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=savedKey;});
it('derives a shape-only state from the stored candles: ATR units and ratios, no prices and no raw bars',()=>{
 const s=chartState(row('MOMENTUM_VOLUME'))!;
 expect(s).toMatchObject({stage:'MOMENTUM_VOLUME',kind:'BREAKOUT',bars:21,priorClosesAboveSma20:expect.any(Number),priorHighsAboveClose:0,nearestHighAboveCloseAtr:null,relativeVolume:3.1});
 expect(s.closePosition).toBeCloseTo(.94,1);
 expect(s.bodyShare).toBeCloseTo(.89,1);
 expect(s.rangeAtr).toBeCloseTo(4.5,1);
 expect(s.priorRangeAtr).toBeLessThan(2);
 expect(s.volumeVsPrevious).toBeCloseTo(330/105,1);
 expect(JSON.stringify(s)).not.toMatch(/"[ohlc]":|"t":|10\.85/);
});
it('needs 21 bars and a positive ATR; otherwise the state is null and the row is marked no-bars without a request',async()=>{
 expect(chartState(row('MOMENTUM_VOLUME',{bars:bars().slice(-5)}))).toBeNull();
 expect(chartState(row('MOMENTUM_VOLUME',{atr:0}))).toBeNull();
 process.env.AI_GATEWAY_API_KEY='test-key';
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const signalOnly=row('VOLUME_WATCH',{bars:undefined}),one=row('EXTENDED',{bars:bars().slice(-1)});
 await scoreChartRows([signalOnly,one],now);
 expect(signalOnly.chart).toEqual(unavailableChart(now,'no-bars',0));
 expect(one.chart).toEqual(unavailableChart(now,'no-bars',1));
 expect(fetch).not.toHaveBeenCalled();
 expect(CHART_MIN_BARS).toBe(21);
});
it('sends one request with the four fixed questions, stores the four probabilities, and does not re-send a scored row',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({model:'typesafe-ai/jev',answers:{cleanBase:{noul:.83},strongClose:{noul:.91},volumeExpansion:{noul:.88},overheadSupply:{noul:.07}}})}));
 vi.stubGlobal('fetch',fetch);
 const named=row('MOMENTUM_VOLUME'),silent=row('NO_SIGNAL');
 await scoreChartRows([named,silent],now);
 expect(named.chart).toMatchObject({rule:'jev-chart-v1',status:'scored',cleanBase:.83,strongClose:.91,volumeExpansion:.88,overheadSupply:.07,bars:21,model:'typesafe-ai/jev'});
 expect(named.stage).toBe('MOMENTUM_VOLUME');
 expect(silent.chart).toBeUndefined();
 expect(fetch).toHaveBeenCalledTimes(1);
 const body=JSON.parse(String(fetch.mock.calls[0][1].body));
 expect(body.questions).toEqual(CHART_QUESTIONS);
 expect(body.state).toEqual(chartState(named));
 await scoreChartRows([named],now);
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('a failed call is unavailable with its reason; without a key every eligible row is no-key and nothing is sent',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:503,json:async()=>({})})));
 const r=row('MOMENTUM_VOLUME');
 await scoreChartRows([r],now);
 expect(r.chart).toEqual(unavailableChart(now,'http-503',21));
 delete process.env.AI_GATEWAY_API_KEY;
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const k=row('MOMENTUM_VOLUME');
 await scoreChartRows([k],now);
 expect(k.chart).toEqual(unavailableChart(now,'no-key',21));
 expect(fetch).not.toHaveBeenCalled();
});
it('evidence helpers read the stamp from a paper createdReason and label sides at 0.50; the ledger grades chart.* fields',()=>{
 const stamp={...unavailableChart(now,undefined,21),status:'scored' as const,cleanBase:.7,strongClose:.4,volumeExpansion:.9,overheadSupply:.2,model:'typesafe-ai/jev'};
 const reason='crypto-v1|qnt|QNT-USD|2026-10-01T04:00:00.000Z|'+JSON.stringify({chart:stamp});
 expect(chartFromReason(reason)).toEqual(stamp);
 expect(chartSideLabel('cleanBase',stamp)).toBe('clean base ≥0.50');
 expect(chartSideLabel('strongClose',stamp)).toBe('strong close <0.50');
 expect(chartSideLabel('cleanBase',undefined)).toBe('NOT_RECORDED');
 expect(chartSideLabel('cleanBase',unavailableChart(now,'no-bars'))).toBe('Chart unavailable');
 expect(chartText(stamp,true)).toBe('base 0.70 · close 0.40 · vol 0.90 · overhead 0.20');
 expect(chartText(unavailableChart(now,'no-bars',1),true)).toBe('unavailable · no-bars');
 const obs=paperObservations([{r_multiple:'1.2',entry_time:'2026-10-01T05:00:00.000Z',exit_reason:'TAKE_PROFIT',instrument_type:'coinbase:QNT-USD',created_reason:reason}]);
 expect(obs[0].chart).toEqual(stamp);
 const ledger=buildCalibration(obs,[],{closedTrades:1,forwardRows:0},now);
 for(const id of CHART_IDS)expect(ledger.fields.some(f=>f.id===`chart.${id}`&&f.outcome==='paperR'&&f.ruleVersion==='jev-chart-v1')).toBe(true);
});
it('the chart confirmer stays evidence: no gate, no order, no recommendation, no provider other than the gateway',()=>{
 const src=readFileSync('lib/admin/cryptoJevChart.ts','utf8');
 expect(src).not.toMatch(/createSimulatedOrder|fillOrderAndOpenPosition|createRecommendation|coingecko|alphavantage|avFetch|stage\s*=\s*['"]/);
 expect(src).toMatch(/evidence only/i);
});
