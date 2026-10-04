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
