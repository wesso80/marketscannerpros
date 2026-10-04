// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import CryptoTop from '@/components/crypto/top/CryptoTop';
import {buildTop} from '@/lib/crypto/breakdown/top';
import {baseBreakoutV1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {levels} from '@/lib/crypto/breakdown/levels';
import {SECTION_KEYS,type Breakdown,type DailyBar} from '@/lib/crypto/breakdown/types';
const daily:DailyBar[]=Array.from({length:90},(_,i)=>({t:new Date(Date.UTC(2026,6,i+1)).toISOString(),close:10,high:11,low:9,volume:100}));
function fixture():Breakdown{
 const sections=Object.fromEntries(SECTION_KEYS.map(k=>[k,{value:{metrics:[],notes:[]},source:'CoinGecko aggregate daily OHLC',asOf:daily.at(-1)!.t,basis:'Completed UTC day',status:'Last close'}])) as Breakdown['sections'];
 sections.price.value!.metrics=[{label:'Spot',value:14.09,source:'CoinGecko',asOf:null,basis:'spot',status:'Unknown'}];
 const data:Breakdown={symbol:'LINK',name:'Chainlink',coinId:'chainlink',rank:13,identityMatches:1,generatedAt:'2026-10-04T01:00:00Z',sections,budget:{capped:false,breakdownToday:0,appToday:0,accounting:'reserved HTTP-attempt ceiling'}};
 data.top=buildTop({...data,bars:daily,rule:baseBreakoutV1(daily),levels:levels(daily)});return data;
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows exactly one rule stage, honest missing times, and no network calls',()=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);const {container}=render(<CryptoTop data={fixture()}/>);
 expect(container.querySelectorAll('[data-stage-badge]')).toHaveLength(1);expect(screen.getByText('$14.09')).toBeTruthy();
 expect(container.querySelector('[data-top-source]')?.className).toContain('text-amber');expect(container.textContent).toContain('time unknown');expect(network).not.toHaveBeenCalled();
});
it('supports old responses and retains capped and identity warnings',()=>{const data=fixture();delete data.top;data.budget.capped=true;data.identityMatches=2;
 const {container}=render(<CryptoTop data={data}/>);expect(screen.getByText('Price unavailable')).toBeTruthy();expect(container.querySelector('[data-stage-badge]')).toBeNull();expect(container.textContent).toContain('daily limit reached');expect(container.textContent).toContain('2 coins share');
});

import BaseChart from '@/components/crypto/top/BaseChart';
it('renders no invented chart, splits missing days, and omits a missing-low base box',()=>{
 const data=fixture();const {container,rerender}=render(<BaseChart zone="UTC"/>);expect(screen.getByText('Chart unavailable: daily bars missing.')).toBeTruthy();
 const t=data.top!;t.chart.bars=[daily[0]];rerender(<BaseChart top={t} zone="UTC"/>);expect(container.querySelector('svg')).toBeNull();
 t.chart.bars=[daily[0],daily[1],daily[4],daily[5]];t.chart.baseLow=null;rerender(<BaseChart top={t} zone="UTC"/>);
 expect(container.querySelectorAll('polyline')).toHaveLength(2);expect(container.querySelector('[data-base-box]')).toBeNull();expect(screen.getByText('Base low unavailable')).toBeTruthy();expect(screen.getByRole('img').getAttribute('aria-label')).toContain('UTC');
});
