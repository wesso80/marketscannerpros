// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
vi.mock('next/link',()=>({default:({children,href,...props}:any)=><a href={href} {...props}>{children}</a>}));
import MacroResearch from '@/components/public-design/MacroResearch';
import M2Research from '@/components/public-design/M2Research';
afterEach(cleanup);
const obs={value:0,date:'2026-10-07'};
const macro:any={timestamp:'2026-10-08',rates:{treasury2y:obs,treasury10y:obs,fedFunds:obs},inflation:{inflationRate:{value:2,history:[{date:'2026-08-01',value:2}]}},employment:{unemployment:obs},growth:{realGDP:{value:null,unit:'billions USD'}}};
it('retains zero and matching history dates without using response time as observation',()=>{
 render(<MacroResearch data={macro} paid loading={false} error={false} retry={()=>{}}/>);
 expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
 expect(screen.getByText('Observation: 2026-08-01')).toBeTruthy();
 expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
 expect(screen.getByRole('img')).toBeTruthy();
});
it('keeps Free limited to the current two summary readings',()=>{
 render(<MacroResearch data={macro} paid={false} loading={false} error={false} retry={()=>{}}/>);
 expect(screen.queryByRole('img')).toBeNull();expect(screen.queryByText('Unemployment')).toBeNull();
 expect(screen.getByText('10-year Treasury')).toBeTruthy();
});
it('does not reuse stale macro values after an error',()=>{
 render(<MacroResearch data={macro} paid loading={false} error retry={()=>{}}/>);
 expect(screen.getByText('Macro observations unavailable')).toBeTruthy();expect(screen.queryByText('0%')).toBeNull();
});
it('does not render a disabled M2 stand-in zero as a total',()=>{
 render(<M2Research data={{enabled:false,totalUsd:0,blocs:[]} as any} loading={false} error={false} retry={()=>{}}/>);
 expect(screen.getByText('Observations not collected')).toBeTruthy();expect(screen.queryByText('$0.00T')).toBeNull();
});
it('shows per-bloc dates, old observations and exclusions without a verdict',()=>{
 const data:any={enabled:true,totalUsd:1e12,validBlocCount:1,missingBlocCount:1,blocs:[{id:'us',name:'United States',usdM2:1e12,observationMonth:'2026-08',classification:'EXACT',provider:'Fixture bank',stale:true,r1:0,r12:null}],missing:[],excludedBlocs:[{id:'kr',name:'South Korea',reason:'not supplied'}],oneMonthPct:0,yoyPct:null,estimatedWeightedCoveragePercent:40,weightedCoverageThreshold:95,interpretationEligible:false,calculationStatus:'PARTIAL',parityStatus:'PENDING',calculatedAt:'2026-10-08'};
 render(<M2Research data={data} loading={false} error={false} retry={()=>{}}/>);
 expect(screen.getByText('2026-08 · EXACT')).toBeTruthy();expect(screen.getByText(/Older saved observation/)).toBeTruthy();expect(screen.getByText(/South Korea excluded/)).toBeTruthy();
 expect(screen.getByText('0.00%')).toBeTruthy();
});
