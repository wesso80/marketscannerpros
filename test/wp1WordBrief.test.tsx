// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {symbolDate,symbolText,symbolNumber} from '@/lib/presentation/symbolDisplay';
import CryptoBreakdown from '@/components/crypto/CryptoBreakdown';
import EquityTop from '@/components/crypto/top/EquityTop';
import {SymbolSnapshotHeader} from '@/components/market/SymbolSnapshotHeader';
import {buildTop} from '@/lib/crypto/breakdown/top';
import {baseBreakoutV1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {levels} from '@/lib/crypto/breakdown/levels';
import {SECTION_KEYS,type Breakdown,type DailyBar} from '@/lib/crypto/breakdown/types';
import {buildPayload} from '@/lib/goldenEgg/engine';
import {now,price,ind} from './fixtures/goldenEggTiming';
const forbidden=/\b(?:buy|sell|entry signal|likely|will|should|bullish|bearish|probability|Trade Ideas|Permission|Playbook|LONG|SHORT|watch for follow-through|Wait for decompression|Monitor for)\b/i;
const raw=/[A-Z]+_[A-Z_]+|time unknown|Degraded|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const bars:DailyBar[]=Array.from({length:90},(_,i)=>({t:new Date(Date.UTC(2026,6,i+1)).toISOString(),close:i%2?16:8,high:17,low:7,volume:100}));
const stamp={source:'CoinGecko daily bars',asOf:'2026-10-04T00:00:00.000Z',basis:'Completed UTC day',status:'Last close' as const};
function crypto(symbol:string):Breakdown{
 const sections=Object.fromEntries(SECTION_KEYS.map(key=>[key,{...stamp,value:{metrics:[{...stamp,label:'Change',value:249.3506,unit:'percent'},{...stamp,label:'Market cap',value:1089567600.7099,unit:'usd'},{...stamp,label:'Reference',value:.466412,unit:'price'},{...stamp,label:'Ratio',value:1.49333,unit:'ratio'},{...stamp,label:'Block reason',value:'NO_SETUP'}],notes:['Locked rule sha256 prefix 181d9024. Base low uses daily lows.']}}])) as Breakdown['sections'];
 const d:Breakdown={symbol,name:symbol,coinId:symbol.toLowerCase(),rank:4,identityMatches:1,generatedAt:stamp.asOf,sections,budget:{capped:false,breakdownToday:0,appToday:0,accounting:'reserved HTTP-attempt ceiling'}};
 d.top=buildTop({...d,bars,rule:baseBreakoutV1(bars),levels:levels(bars)});return d;
}
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn());});afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('formats measured numbers and observation dates without changing values',()=>{
 expect(symbolNumber(249.3506,'percent')).toBe('249.4%');expect(symbolNumber(1089567600.7099,'usd')).toBe('$1.09B');expect(symbolNumber(.466412,'price')).toBe('$0.4664');expect(symbolNumber(1.49333,'ratio')).toBe('1.49x');expect(symbolDate('2026-10-02',true)).toBe('Fri, 2 Oct');
});
it.each(['NO_SETUP','NO_STRUCTURAL_STOP','NO_VALIDATED_EDGE: TREND_CONTINUATION','RR_BELOW_MIN','NEW_UNMAPPED_REASON'])('maps %s to research wording',code=>{expect(symbolText(code)).not.toMatch(raw);expect(symbolText(code)).not.toMatch(forbidden);});
it.each(['NEAR','LINK','BTC'])('%s compact summary has one stage, readable detail, one source and no legacy/advice text',async symbol=>{
 const d=crypto(symbol),before=JSON.stringify(d);vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>d} as Response);
 const {container}=render(<CryptoBreakdown compact symbol={symbol} timeframe="daily"/>);await screen.findByText('NO BASE');
 const top=container.querySelector('[data-symbol-summary]')!;expect(top.textContent?.match(/no base/gi)).toHaveLength(1);
 expect(container.textContent).not.toMatch(/WATCH.*LONG|Grade B|WATCHING|Assessment: Watch/);
 expect(container.textContent).not.toMatch(forbidden);expect(container.textContent).not.toMatch(raw);
 for(const fold of container.querySelectorAll('details')){fold.open=true;fireEvent(fold,new Event('toggle'));}
 fireEvent.click(screen.getByRole('button',{name:/Evidence and data checks/}));
 await waitFor(()=>expect(screen.getAllByText('249.4%').length).toBeGreaterThan(0));
 expect(screen.getAllByText('$1.09B').length).toBeGreaterThan(0);expect(screen.getAllByText('$0.4664').length).toBeGreaterThan(0);expect(screen.getAllByText('1.49x').length).toBeGreaterThan(0);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);expect(container.textContent).not.toMatch(raw);expect(container.textContent).not.toMatch(forbidden);expect(container.textContent).not.toContain('sha256');expect(JSON.stringify(d)).toBe(before);
});
it.each(['AAPL','NVDA'])('%s blocked top has one verdict and a plain recorded reason',async symbol=>{
 const p=buildPayload(symbol,'equity',price,ind,null,null,'1D',null,null,null,{nowMs:now});p.canonicalVerdict={...p.canonicalVerdict,permission:'BLOCK',setupType:'NONE',blockReasons:[{code:'NO_STRUCTURAL_STOP',message:'NO_STRUCTURAL_STOP'}],factors:[]} as any;const before=JSON.stringify(p);
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({ok:true,candles:bars.map(b=>({...b,c:b.close,h:b.high,l:b.low}))})} as Response);
 const {container}=render(<EquityTop data={p}/>);await screen.findByRole('img');expect(container.textContent?.match(/no setup/gi)).toHaveLength(1);expect(container.textContent).toContain('No clear stop level in the chart');expect(container.textContent).not.toContain('No measured checks');expect(container.textContent).not.toMatch(raw);expect(container.textContent).not.toMatch(forbidden);expect(JSON.stringify(p)).toBe(before);
});
it('Pro price header shows dated session close without inventing an instant',()=>{
 const {container}=render(<SymbolSnapshotHeader compact symbol="AAPL" asset="equity" timeframe="daily" stamp={{assetType:'equity',price:250,priceBasis:'last_close',latestDay:'2026-10-02'}} pick={null}/>);
 expect(container.textContent).toContain('Last close Fri, 2 Oct (New York)');expect(container.textContent).not.toMatch(raw);
});
