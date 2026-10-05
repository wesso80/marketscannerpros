// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,within,fireEvent} from '@testing-library/react';
const state=vi.hoisted(()=>({tier:'pro',positions:[] as any[],pageData:vi.fn(),query:new URLSearchParams()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>state.query}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:state.tier,isLoading:false}),getPortfolioLimit:()=>5,canExportCSV:()=>true,canAccessPortfolioInsights:()=>false}));
vi.mock('@/lib/ai/pageContext',()=>({useAIPageContext:()=>({setPageData:state.pageData})}));
vi.mock('@/components/risk/RiskPermissionContext',()=>({useRiskPermission:()=>({isLocked:false})}));
vi.mock('@/lib/operatorState',()=>({writeOperatorState:vi.fn()}));
vi.mock('@/lib/workflow/client',()=>({createWorkflowEvent:vi.fn(),emitWorkflowEvents:vi.fn()}));
import {PortfolioContent} from '@/app/tools/portfolio/page';
beforeEach(()=>{vi.stubGlobal('React',React);localStorage.clear();state.positions=[];state.tier='pro';state.query=new URLSearchParams();vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url)==='/api/portfolio'?{syncRevision:"fixture-revision",positions:state.positions,closedPositions:[],performanceHistory:[],cashState:{startingCapital:10000,cashLedger:[]}}:{ok:false}})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('renders the actual empty page without zero-value summary tiles and opens the existing form',async()=>{
 const {container}=render(<PortfolioContent embeddedInWorkspace/>);
 expect(container.textContent).toContain('Loading saved records…');
 await screen.findByText('Add your first position');
 expect(within(screen.getByRole('tablist',{name:'Portfolio views'})).getAllByRole('tab')).toHaveLength(5);
 expect(container.textContent).not.toContain('$0.00');
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Add Position',exact:true}));
 expect(screen.getByText('Add New Position')).toBeTruthy();
});
it('renders saved exposure, one verdict, closed folds and a chart without changing quantities',async()=>{
 state.positions=[{id:1,symbol:'AAPL',side:'LONG',quantity:2,entryPrice:100,currentPrice:125,pl:50,plPercent:25,entryDate:'2026-10-02'}];
 const {container}=render(<PortfolioContent embeddedInWorkspace/>);
 await screen.findByRole('img',{name:'Allocation by recorded position value'});
 expect(container.querySelectorAll('[data-portfolio-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(screen.getByText('$250')).toBeTruthy();
 expect(container.textContent).not.toMatch(/N\/A|NaN|undefined/);
 expect(state.positions[0].quantity).toBe(2);
});
it.each(['Positions','Ledger','Risk','Allocation'])('%s keeps raw missing values out of rendered detail',async name=>{
 state.positions=[{id:1,symbol:'AAPL',side:'LONG',quantity:2,entryPrice:100,currentPrice:125,pl:50,plPercent:25,entryDate:'2026-10-02'}];
 const {container}=render(<PortfolioContent embeddedInWorkspace/>);
 await screen.findByRole('img',{name:'Allocation by recorded position value'});
 fireEvent.click(screen.getByRole('tab',{name,exact:true}));
 expect(container.textContent).not.toMatch(/\b(?:N\/A|UNKNOWN|Unavailable|undefined|NaN|bullish|bearish)\b|—|[A-Z]+_[A-Z_]+/i);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
