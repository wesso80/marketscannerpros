// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
const state=vi.hoisted(()=>({regime:null as any}));
vi.mock('@/app/v2/_lib/api',()=>({useRegime:()=>({data:state.regime,loading:false})}));
vi.mock('next/link',()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}));
vi.mock('@/lib/free/funnel',()=>({trackFreeEvent:vi.fn()}));
import RegimeBar from '@/app/v2/_components/RegimeBar';
import TodayStrip from '@/components/overview/TodayStrip';
import StartToday from '@/components/free/StartToday';
import {rankSectorStrength} from '@/lib/analysis/commandCenter';
beforeEach(()=>{vi.stubGlobal('React',React);state.regime=null;vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url).includes('daily-picks')?{topPicks:{equity:[{symbol:'AAPL',score:89.123456,dataTimestamp:'2026-10-05T13:00:00Z'}],crypto:[]}}:String(url).includes('preview')?{preview:null}:{used:0,limit:5,resetsAt:'2026-10-06T00:00:00Z'}})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('hides an absent regime only when the caller opts in',()=>{
 const {container,rerender}=render(<RegimeBar hideIfMissing/>);expect(container.textContent).toBe('');
 rerender(<RegimeBar/>);expect(container.textContent).toContain('Not available right now');
 state.regime={regime:'risk_on',signals:[]};rerender(<RegimeBar hideIfMissing/>);expect(container.textContent).toContain('Risk-On');
});
it('Today has one stored-picks verdict and source, readable scores, and no scan on mount',async()=>{
 const {container}=render(<StartToday/>);await screen.findByText('AAPL');
 expect(container.querySelectorAll('[data-today-verdict]')).toHaveLength(1);expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.textContent).toContain('89.1');expect(container.textContent).not.toContain('89.123456');expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(vi.mocked(fetch).mock.calls.some(([url,options])=>String(url).includes('/scanner/run')||(options as RequestInit)?.method==='POST')).toBe(false);
});
it('Overview summary has one plain verdict and hides absent price cards',()=>{
 const sectors=[{symbol:'XLK',name:'Technology',changePercent:1.2345}];const {container}=render(<TodayStrip regime={{regimeLabel:'RISK_ON',available:true,stale:false,asOf:'2026-10-05T13:00:00Z'}} loading={false} hasRegimeData regimeColor="white" sectors={sectors} strength={rankSectorStrength(sectors)} quotes={{BTC:{price:100,dataTimestamp:'2026-10-05T13:00:00Z'}}}/>);
 expect(container.querySelectorAll('[data-today-verdict]')).toHaveLength(1);expect(container.textContent).not.toContain('RISK_ON');expect(container.textContent).not.toContain('time unknown');expect(container.querySelectorAll('[data-stat-card]')).toHaveLength(2);
 expect(container.querySelectorAll('[data-stamp-line]')).toHaveLength(0);
});
