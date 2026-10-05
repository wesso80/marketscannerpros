// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import CryptoBreakdown from '@/components/crypto/CryptoBreakdown';
import CryptoTop from '@/components/crypto/top/CryptoTop';
import EquityTop from '@/components/crypto/top/EquityTop';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import {SymbolSnapshotHeader} from '@/components/market/SymbolSnapshotHeader';
import {buildTop} from '@/lib/crypto/breakdown/top';
import {baseBreakoutV1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {levels} from '@/lib/crypto/breakdown/levels';
import {SECTION_KEYS,type Breakdown,type DailyBar} from '@/lib/crypto/breakdown/types';
import type {GoldenEggPayload} from '@/src/features/goldenEgg/types';
const daily:DailyBar[]=Array.from({length:90},(_,i)=>({t:new Date(Date.UTC(2026,6,i+1)).toISOString(),close:10,high:11,low:9,volume:100}));
function crypto():Breakdown{
 const sections=Object.fromEntries(SECTION_KEYS.map(k=>[k,{value:{metrics:[{label:'Recorded value',value:10,source:'CoinGecko',asOf:daily.at(-1)!.t,basis:'Completed UTC day',status:'Last close'}],notes:[]},source:'CoinGecko daily bars',asOf:daily.at(-1)!.t,basis:'Completed UTC day',status:'Last close'}])) as Breakdown['sections'];
 const d:Breakdown={symbol:'BTC',name:'Bitcoin',coinId:'bitcoin',rank:1,identityMatches:1,generatedAt:daily.at(-1)!.t,sections,budget:{capped:false,breakdownToday:0,appToday:0,accounting:'reserved HTTP-attempt ceiling'}};
 d.top=buildTop({...d,bars:daily,rule:baseBreakoutV1(daily),levels:levels(daily)});return d;
}
function equity(symbol:string):GoldenEggPayload{return {meta:{symbol,assetClass:'equity',price:10,asOfTs:daily.at(-1)!.t,timeframe:'daily'},layer1:{assessment:'WATCH',confluenceScore:61,grade:'B'},layer2:{setup:{thesis:'Price remains inside the recorded range.',keyLevels:[{label:'Support',price:9,kind:'support'},{label:'Resistance',price:11,kind:'resistance'}]}},canonicalVerdict:{score:62,grade:'B',permission:'WATCH',factors:[{name:'Trend',value:.5,pass:true}]}} as GoldenEggPayload;}
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({ok:true,candles:daily.map(b=>({t:b.t,c:b.close,h:b.high,l:b.low}))})})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each(['AAPL','NVDA'])('uses the shared chart, rule chips and stat tiles for %s without mutating its verdict',async symbol=>{
 const payload=equity(symbol),before=JSON.stringify(payload);const {container}=render(<EquityTop data={payload} assessment="WATCH"/>);
 await screen.findByRole('img');expect(container.querySelector('[data-symbol-summary]')).toBeTruthy();expect(container.querySelector('[data-rule-chip]')).toBeTruthy();expect(container.querySelector('[data-symbol-stats]')).toBeTruthy();expect(container.querySelector('[data-base-box]')).toBeNull();expect(JSON.stringify(payload)).toBe(before);
 expect(fetch).toHaveBeenCalledTimes(1);expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('timeframe=daily');
});
it('preserves BTC rule stage and verdict inputs, with shared parts and no per-card source stamps',()=>{
 const d=crypto(),before=JSON.stringify(d);const {container}=render(<CryptoTop data={d} showSource={false}/>);
 expect(container.querySelector('[data-symbol-summary]')).toBeTruthy();expect(container.querySelector('[data-stage-badge]')?.textContent).toBe(d.top!.stage);expect(container.querySelectorAll('[data-rule-chip]')).toHaveLength(4);expect(container.querySelectorAll('[data-top-source]')).toHaveLength(0);expect(JSON.stringify(d)).toBe(before);
});
it('compact crypto uses closed native folds and one source line, evidence opens on demand',async()=>{
 const d=crypto();vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>d} as Response);
 const {container}=render(<CryptoBreakdown compact symbol="BTC" timeframe="daily"/>);await screen.findByText(d.top!.stage);
 expect(container.querySelectorAll('details')).toHaveLength(4);expect([...container.querySelectorAll('details')].every(d=>!d.open)).toBe(true);expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);expect(container.querySelectorAll('[data-top-source]')).toHaveLength(0);
 const button=screen.getByRole('button',{name:/Evidence and data checks/});expect(button.getAttribute('aria-expanded')).toBe('false');fireEvent.click(button);expect(button.getAttribute('aria-expanded')).toBe('true');
 expect(container.textContent).not.toMatch(/UNKNOWN|Unknown|Unavailable|Awaiting data|N\/A|n\/a|DEGRADED|undefined|NaN|—/);
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('folded heavy tools do not mount or fetch until explicitly opened',async()=>{
 const mounted=vi.fn();function Tool(){mounted();return <p>Heavy detail</p>;}
 const {container}=render(<CollapsibleSection deferMount title="Options"><Tool/></CollapsibleSection>);
 expect(mounted).not.toHaveBeenCalled();const fold=container.querySelector('details')!;fold.open=true;fireEvent(fold,new Event('toggle'));await screen.findByText('Heavy detail');expect(mounted).toHaveBeenCalled();
});
it.each([true,false])('compact header omits absent quote and raw trust labels (quiet=%s)',quiet=>{
 const {container}=render(<SymbolSnapshotHeader compact quiet={quiet} symbol="AAPL" asset="equity" timeframe="daily" stamp={{assetType:'equity',price:null,priceBasis:'unknown'}} pick={null}/>);
 expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);expect(container.textContent).not.toMatch(/unknown|Unknown|MISSING|Awaiting data|\$0\.00/);
});
it('paid failed crypto feed is an amber fault, never an upgrade card',async()=>{
 vi.mocked(fetch).mockResolvedValue({ok:false,status:503} as Response);render(<CryptoBreakdown compact symbol="BTC" timeframe="daily"/>);
 expect((await screen.findByRole('alert')).textContent).toContain('Crypto data feed failed');expect(screen.queryByText('Unlock with Pro')).toBeNull();
});
