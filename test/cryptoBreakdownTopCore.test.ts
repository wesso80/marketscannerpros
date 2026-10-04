import {expect,it,vi} from 'vitest';
import {buildTop} from '@/lib/crypto/breakdown/top';
import {baseBreakoutV1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {levels} from '@/lib/crypto/breakdown/levels';
import {SECTION_KEYS,type Breakdown,type DailyBar,type Metric} from '@/lib/crypto/breakdown/types';
export const bars:DailyBar[]=Array.from({length:120},(_,i)=>({t:new Date(Date.UTC(2026,5,i+1)).toISOString(),close:10,high:11,low:9,volume:100}));
export const m=(label:string,value:Metric['value'],source='CoinGecko'):Metric=>({label,value,source,asOf:'2026-10-04T01:00:00Z',basis:'spot',status:'Live'});
export function input(){
 const sections=Object.fromEntries(SECTION_KEYS.map(k=>[k,{value:{metrics:[],notes:[]},source:'CoinGecko aggregate daily OHLC',asOf:bars.at(-1)!.t,basis:'Completed UTC day',status:'Last close'}])) as Breakdown['sections'];
 sections.price.value!.metrics=[m('Spot',14.09),m('Change vs 24h ago',1.36)];
 sections.supply.value!.metrics=[m('Market-cap rank',13)];
 return {symbol:'LINK',name:'Chainlink',rank:13,bars,rule:baseBreakoutV1(bars),levels:levels(bars),sections};
}
it('projects existing observations without calls or modified input and retains only ninety chart bars',()=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);const i=input(),before=JSON.stringify(i),t=buildTop(i);
 expect(t.stage).toBe(i.rule.stage);expect(t.chart.bars).toEqual(bars.slice(-90).map(({t,close,high,low})=>({t,close,high,low})));
 expect(t.spot).toEqual(i.sections.price.value!.metrics[0]);expect(t.rank?.value).toBe(13);expect(JSON.stringify(i)).toBe(before);expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals();
});

import {verdictLine,ruleChips} from '@/lib/crypto/breakdown/top';
import {V1} from '@/lib/crypto/breakdown/baseBreakoutV1';
it('uses the locked rule results, constants and common rounding for the LINK-like verdict and chips',()=>{
 const rule={...input().rule,stage:'NO BASE' as const,rangePct:91.5633,volumeRatio:.5759,closeRatio:.91386,extension:-1.6225,passes:[false,false,false,true]};
 expect(verdictLine(rule)).toContain(`No base: range 91.6% vs the ${V1.maxRangePct}% limit. Volume 0.58x`);
 expect(ruleChips(rule).map(c=>c.pass)).toEqual(rule.passes);expect(ruleChips(rule).map(c=>c.value)).toEqual(['91.6%','0.58x','0.914','-1.62 ATR']);
});
it('describes WATCH distance and price and uses dashes instead of failures for missing values',()=>{
 const rule={...input().rule,distancePct:-2,requiredClose:10.2};expect(verdictLine(rule)).toContain('2.0% below');expect(verdictLine(rule)).toContain('$10.20');
 const empty=baseBreakoutV1([]);expect(ruleChips(empty).every(c=>c.pass===null&&c.value==='—')).toBe(true);expect(verdictLine(empty)).toContain(`needs ${V1.baseDays+1}`);
});

import fs from 'node:fs';
import path from 'node:path';
it('keeps top components fluid and section header tap targets at least forty pixels',()=>{
 const dir=path.join(process.cwd(),'components/crypto/top');for(const name of fs.readdirSync(dir)){
  const source=fs.readFileSync(path.join(dir,name),'utf8');expect(source).not.toMatch(/minWidth\s*:/);for(const match of source.matchAll(/min-w-\[(\d+)px\]/g))expect(Number(match[1])).toBeLessThanOrEqual(360);
 }
 expect(fs.readFileSync('components/crypto/SectionShell.tsx','utf8')).toContain('min-h-10');
});
