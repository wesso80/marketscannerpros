import {afterEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {JEV_QUESTIONS,jevState,scoreJevRows,unavailableJev} from '@/lib/admin/cryptoJev';
import {jevCoverage,jevDetail,jevFromReason,jevSideLabel} from '@/lib/admin/cryptoJevEvidence';
const now=Date.UTC(2026,9,1,8,5),savedKey=process.env.AI_GATEWAY_API_KEY;
const row=(stage:string)=>({id:'axs',symbol:'AXS',stage,asOf:'2026-10-01T04:00:00.000Z',kind:'BREAKOUT' as const,relativeVolume:2.2,changePct:3.1,trigger:10,close:12,atr:1,pair:{product:'AXS-USDT'},flowStamp:{stamp:'aggressive buying'}});
afterEach(()=>{vi.unstubAllGlobals();if(savedKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=savedKey;});
it('sends one request with the three fixed questions and does not send candles',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({model:'typesafe-ai/jev',answers:{chase:{type:'noul',noul:.22},flowAgrees:{noul:.81},btcHeadwind:{noul:.14}}})}));
 vi.stubGlobal('fetch',fetch);
 const named=row('VOLUME_WATCH'),silent=row('NO_SIGNAL'),pending={...row('PENDING'),asOf:null};
 await scoreJevRows([named,silent,pending], 'DOWN', now);
 expect(named.stage).toBe('VOLUME_WATCH');
 expect(named.jev).toMatchObject({rule:'jev-shadow-v2',status:'scored',chase:.22,flowAgrees:.81,btcHeadwind:.14,btcTrend:'DOWN',flowStamp:'aggressive buying',model:'typesafe-ai/jev'});
 expect(silent.jev).toBeUndefined();
 expect(pending.jev).toBeUndefined();
 expect(fetch).toHaveBeenCalledTimes(1);
 const body=JSON.parse(String(fetch.mock.calls[0][1].body));
 expect(body.model).toBe('typesafe-ai/jev');
 expect(body.questions).toEqual(JEV_QUESTIONS);
 expect(body.state).toEqual(jevState(named,'DOWN','aggressive buying'));
 expect(body.state.distancePastLevelAtr).toBe(2);
 expect(JSON.stringify(body.state)).not.toMatch(/candle|signal|headline/i);
 const again=fetch.mock.calls.length;
 await scoreJevRows([named],'DOWN',now);
 expect(fetch.mock.calls.length).toBe(again);
});
it('a failed call is unavailable with its reason and is not retried on a later pass',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 const fetch=vi.fn(async()=>({ok:false,status:500,json:async()=>({})}));
 vi.stubGlobal('fetch',fetch);
 const named=row('EARLY_WATCH');
 await scoreJevRows([named],'MIXED',now);
 expect(named.jev).toEqual(unavailableJev(now,'MIXED','aggressive buying','http-500'));
 expect(named.stage).toBe('EARLY_WATCH');
 await scoreJevRows([named],'MIXED',now);
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('a 429 is retried once after a wait, then recorded if it persists',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 vi.useFakeTimers();
 try{
  const fetch=vi.fn(async()=>({ok:false,status:429,json:async()=>({})}));
  vi.stubGlobal('fetch',fetch);
  const named=row('VOLUME_WATCH');
  const run=scoreJevRows([named],'UP',now);
  await vi.runAllTimersAsync();
  await run;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(named.jev).toMatchObject({status:'unavailable',reason:'http-429'});
 }finally{vi.useRealTimers();}
});
it('a malformed answer is recorded as a parse failure, not a score',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({model:'typesafe-ai/jev',answers:{chase:{noul:.2}}})})));
 const named=row('EXTENDED');
 await scoreJevRows([named],'UP',now);
 expect(named.jev).toMatchObject({status:'unavailable',reason:'parse',chase:null});
});
it('keeps the gateway usage figure when it is returned',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({model:'jev-1.13.0',answers:{chase:{noul:.2},flowAgrees:{noul:.7},btcHeadwind:{noul:.1}},usage:{input_tokens:312,output_tokens:20}})})));
 const named=row('MOMENTUM_VOLUME');
 await scoreJevRows([named],'UP',now);
 expect(named.jev).toMatchObject({status:'scored',model:'jev-1.13.0',inputTokens:312});
});
it('a missing gateway key leaves the row unscored and does not call Jev',async()=>{
 delete process.env.AI_GATEWAY_API_KEY;
 const fetch=vi.fn();
 vi.stubGlobal('fetch',fetch);
 const named=row('EXTENDED');
 await scoreJevRows([named],'UP',now);
 expect(fetch).not.toHaveBeenCalled();
 expect(named.jev).toBeUndefined();
 expect(named.stage).toBe('EXTENDED');
});
it('the paper planner, recommendations, and the scheduler do not call Jev',()=>{
 expect(readFileSync('lib/admin/cryptoPaperMarket.ts','utf8')).not.toMatch(/cryptoJev|ai-gateway|JEV_QUESTIONS/);
 expect(readFileSync('lib/admin/cryptoRecommendations.ts','utf8')).not.toMatch(/cryptoJev|ai-gateway|JEV_QUESTIONS/);
 expect(readFileSync('lib/admin/cryptoAutomation.ts','utf8')).not.toMatch(/cryptoJev|attachJevShadow|JEV_QUESTIONS/);
 expect(readFileSync('app/api/admin/crypto-markets/momentum/route.ts','utf8')).not.toMatch(/attachJevShadow|scoreJevRows/);
 expect(readFileSync('lib/admin/cryptoJevEvidence.ts','utf8')).not.toMatch(/fetch\(|getRedis|ai-gateway|from '\.\/cryptoBtcRegime'|from '\.\/cryptoFlow'/);
});
it('evidence helpers read a saved stamp without calling anything',()=>{
 const scored={rule:'jev-shadow-v2' as const,status:'scored' as const,chase:.72,flowAgrees:.31,btcHeadwind:.5,btcTrend:'UP',flowStamp:'aggressive buying',model:'typesafe-ai/jev',checkedAt:'2026-10-01T04:05:00.000Z'};
 expect(jevSideLabel('chase',scored)).toBe('chase ≥0.50');
 expect(jevSideLabel('flowAgrees',scored)).toBe('flow agrees <0.50');
 expect(jevSideLabel('btcHeadwind',scored)).toBe('btc headwind ≥0.50');
 expect(jevSideLabel('chase',unavailableJev(now,'UP','unavailable','timeout'))).toBe('Jev unavailable');
 expect(jevSideLabel('chase',undefined)).toBe('NOT_RECORDED');
 expect(jevFromReason('k|'+JSON.stringify({signal:{kind:'BREAKOUT'},jev:scored}))).toEqual(scored);
 expect(jevFromReason('k|'+JSON.stringify({signal:{kind:'BREAKOUT'}}))).toBeUndefined();
 expect(jevFromReason(null)).toBeUndefined();
 expect(jevDetail(unavailableJev(now,'DOWN','divergence','http-429'))).toContain('unavailable: http-429');
 expect(jevDetail(scored)).toContain('checked 2026-10-01T04:05:00.000Z');
 expect(jevCoverage([scored,undefined,unavailableJev(now,'UP','unavailable','timeout'),unavailableJev(now,'UP','unavailable','timeout')])).toEqual({scored:1,unavailable:2,unscored:1,reasons:{timeout:2}});
});
