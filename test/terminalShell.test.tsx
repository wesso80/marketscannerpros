// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
const state=vi.hoisted(()=>({tab:'capital',symbol:'MU',type:'equity'}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(state),useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({selectedSymbol:state.symbol,selectSymbol:vi.fn()})}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:'pro',isLoading:false}),canAccessTimeScanner:()=>true}));
vi.mock('@/hooks/useCachedTopSymbols',()=>({useCachedTopSymbols:()=>({crypto:[],equity:[]})}));
vi.mock('@/components/TimeGravityMapWidget',()=>({default:({symbol}:{symbol:string})=><p>Gravity for {symbol}</p>}));
vi.mock('@/app/v2/_lib/api',()=>({useCloseCalendar:()=>({data:null,loading:false,error:null}),useFlow:()=>({data:null,loading:false,error:null}),useFuturesTerminal:()=>({data:null,loading:false,error:null})}));
import TerminalPage from '@/app/tools/terminal/page';
import TimeScanner from '@/app/tools/time-scanner/page';
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({price:100})})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('renders one Terminal hero and one shared symbol picker',()=>{
 const {container}=render(<TerminalPage/>);
 expect(screen.getAllByRole('heading',{name:'Terminal',exact:true})).toHaveLength(1);
 expect(screen.getAllByRole('textbox')).toHaveLength(1);
 expect(screen.getByRole('textbox',{name:'Terminal symbol'})).toBeTruthy();
 expect(container.textContent).not.toMatch(/Terminal subview|Back to Golden Egg/);
 expect(screen.getByRole('button',{name:'Back to Symbol'})).toBeTruthy();
});
it.each(['capital','options-confluence','time-gravity','options-flow','time-confluence'])('%s shares one hero without a subview header',tab=>{
 state.tab=tab;const {container}=render(<TerminalPage/>);
 expect(screen.getAllByRole('heading',{name:'Terminal',exact:true})).toHaveLength(1);
 expect(container.textContent).not.toContain('Terminal subview');
});
it('embedded Gravity reads Terminal symbol without another symbol or price input',async()=>{
 render(<TimeScanner symbol="MU" assetType="equity" embeddedInTerminal/>);
 expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByRole('spinbutton')).toBeNull();expect(screen.queryByRole('button',{name:'Load Symbol'})).toBeNull();expect(await screen.findByText('Gravity for MU')).toBeTruthy();
});
