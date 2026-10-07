// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import CryptoReplay from '@/components/admin/CryptoReplay';
const view={config:{version:'replay-v1',from:'2022-01-01',segmentDays:90,horizonDays:7,halfSpread:.0005,cost:.0005,startingBalance:200000,liquiditySource:'Coinbase hourly volume (proxy)',featuresVersion:'signal-features-v1',unavailableFeatures:{fundingRate:'No point-in-time perpetual funding history stored'},shadowPlans:['trail-only-v4'],universeTop:100},
 state:{runId:'2026-10-07T00:00:00.000Z',status:'SIMULATED',startedAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T03:00:00.000Z',from:'2022-01-01',dataEnd:'2026-10-07T00:00:00.000Z',btcDownFilter:true,requests:12345,dropped:0,rows:900,
  counts:{DONE:80,NO_COINBASE_PAIR:40},segments:{total:1200,done:1200,failed:0},problems:[],
  simulation:{at:'2026-10-07T03:00:00.000Z',btcDownFilter:true,summary:{live:{taken:120,closed:118,realisedPnl:1520.5,finalEquity:201520.5,maxDrawdownPct:-1.2,pnlUnknown:2},research:{taken:80,closed:80,realisedPnl:-300,finalEquity:199700,maxDrawdownPct:-0.8,pnlUnknown:0}}}},
 dataset:{total:'900',extended:'150',no_entry:'200',taken:'200',skipped:'700',taken_r:0.12,skipped_r:-0.05,extended_r:-0.2,first_signal:'2022-01-03T04:00:00Z',last_signal:'2026-10-06T20:00:00Z',skipReasons:[{reason:'5% portfolio risk cap',n:'30'}]}};
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>structuredClone(view)})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('labels the replay as simulated research, shows both books, approximations and the dataset link',async()=>{
 render(<CryptoReplay/>);
 expect(await screen.findByText(/900/)).toBeTruthy();
 expect(screen.getByRole('heading',{name:/History replay · SIMULATED · RESEARCH ONLY/})).toBeTruthy();
 expect(screen.getByText('Live sleeve')).toBeTruthy();expect(screen.getByText('Research')).toBeTruthy();
 expect(screen.getByText(/USD 201,521|USD 201,520/)).toBeTruthy();
 expect(screen.getByText(/equity counts realised P&L only/)).toBeTruthy();
 expect(screen.getByText(/fundingRate \(No point-in-time perpetual funding history stored\)/)).toBeTruthy();
 expect(screen.getByRole('link',{name:/Download the labelled dataset/}).getAttribute('href')).toBe('/api/admin/crypto-markets/replay?format=csv');
 expect(screen.getByText(/1,200 \/ 1,200/)).toBeTruthy();
});
