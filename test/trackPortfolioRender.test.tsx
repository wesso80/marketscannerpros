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
it('shows total cost and side-aware open P&L instead of a stored -121470 pl', async () => {
  state.positions = [
    { id: 1, symbol: 'AAPL', side: 'LONG', quantity: 10, entryPrice: 100, currentPrice: 110, pl: -121470, plPercent: -99, entryDate: '2026-10-02' },
    { id: 2, symbol: 'MSFT', side: 'SHORT', quantity: 5, entryPrice: 200, currentPrice: 180, pl: -50000, plPercent: -50, entryDate: '2026-10-02' },
    { id: 3, symbol: 'OPT', side: 'LONG', quantity: 2, entryPrice: 1.5, currentPrice: 2, tradeType: 'Options', pl: 0, plPercent: 0, entryDate: '2026-10-02' },
  ];
  const { container } = render(<PortfolioContent embeddedInWorkspace />);
  await screen.findByRole('img', { name: 'Allocation by recorded position value' });
  expect(screen.getByText('Total cost')).toBeTruthy();
  expect(screen.getByText('$300')).toBeTruthy();
  expect(screen.getByText('$600')).toBeTruthy();
  expect(screen.getByText('+$300')).toBeTruthy();
  expect(container.textContent).toContain('Value minus Total cost equals Open P&L');
  expect(container.textContent).not.toContain('121,470');
  expect(container.textContent).not.toContain('121470');
  expect(container.textContent).not.toContain('-99');
  fireEvent.click(screen.getByRole('tab', { name: 'Positions', exact: true }));
  expect(screen.getAllByText('+10.00%').length).toBeGreaterThan(0);
  expect(container.textContent).not.toContain('-99.00%');
});
it('shows unavailable for a missing price and leaves that position out of the totals', async () => {
  state.positions = [
    { id: 1, symbol: 'AAPL', side: 'LONG', quantity: 10, entryPrice: 100, currentPrice: 110, pl: -99, plPercent: -99, entryDate: '2026-10-02' },
    { id: 2, symbol: 'GAP', side: 'short', quantity: 5, entryPrice: 20, currentPrice: null, pl: 0, plPercent: -50, entryDate: '2026-10-02' },
  ];
  const { container } = render(<PortfolioContent embeddedInWorkspace />);
  await screen.findByRole('img', { name: 'Allocation by recorded position value' });
  expect(screen.getByText('$1,100')).toBeTruthy();
  expect(screen.getByText('$1,000')).toBeTruthy();
  expect(screen.getByText('+$100')).toBeTruthy();
  expect(screen.getByText('1 position without a current price')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Positions', exact: true }));
  expect(screen.getAllByText('unavailable').length).toBeGreaterThan(0);
  expect(container.textContent).not.toContain('-99');
  expect(container.textContent).not.toMatch(/\$NaN/);
});
it.each(['Positions','Ledger','Risk','Allocation'])('%s keeps raw missing values out of rendered detail',async name=>{
 state.positions=[{id:1,symbol:'AAPL',side:'LONG',quantity:2,entryPrice:100,currentPrice:125,pl:50,plPercent:25,entryDate:'2026-10-02'}];
 const {container}=render(<PortfolioContent embeddedInWorkspace/>);
 await screen.findByRole('img',{name:'Allocation by recorded position value'});
 fireEvent.click(screen.getByRole('tab',{name,exact:true}));
 expect(container.textContent).not.toMatch(/\b(?:N\/A|UNKNOWN|Unavailable|undefined|NaN|bullish|bearish)\b|—|[A-Z]+_[A-Z_]+/i);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
