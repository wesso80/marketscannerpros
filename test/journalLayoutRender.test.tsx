// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
const state=vi.hoisted(()=>({entries:[] as any[],pageData:vi.fn(),query:new URLSearchParams()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>state.query}));
vi.mock('@/lib/ai/pageContext',()=>({useAIPageContext:()=>({setPageData:state.pageData})}));
import JournalPage from '@/components/journal/JournalPage';
const own=(id:number)=>({id,symbol:'AAPL',side:'LONG',date:'2026-10-01',entryPrice:100,quantity:1,isOpen:false,exitPrice:110,exitDate:'2026-10-02',pl:10,plPercent:10,strategy:'manual'});
beforeEach(()=>{vi.stubGlobal('React',React);localStorage.clear();state.entries=[];state.query=new URLSearchParams();vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url)==='/api/journal'?{entries:state.entries}:{ok:false}})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('new user gets an action, no zero tiles, and auto-log defaults off in folded settings',async()=>{
 const {container}=render(<JournalPage tier="pro" embeddedInWorkspace/>);
 await screen.findByText('Add your first trade');
 expect(container.querySelectorAll('[data-stat-card]')).toHaveLength(0);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-journal-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 const settings=screen.getByText('Journal settings');fireEvent.click(settings);
 const toggle=screen.getByLabelText('Auto-log research records') as HTMLInputElement;
 expect(toggle.checked).toBe(false);fireEvent.click(toggle);
 expect(localStorage.getItem('msp:auto-log-research')).toBe('true');
});
it('defaults to ten personal records and keeps research out of summaries after revealing it',async()=>{
 state.entries=[...Array.from({length:12},(_,i)=>own(i)),{...own(50),symbol:'RESEARCH',pl:100000,tags:['auto_alert']}];
 const {container}=render(<JournalPage tier="pro" embeddedInWorkspace/>);
 await screen.findByText('Show all 12');
 expect(container.querySelector('tbody')?.textContent).not.toContain('RESEARCH');
 expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
 expect(screen.getByRole('img',{name:'Cumulative personal closed P&L'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Show all 12'}));
 await waitFor(()=>expect(container.querySelectorAll('tbody tr')).toHaveLength(12));
 fireEvent.click(screen.getByLabelText('Research records (automated, paper)'));
 fireEvent.click(await screen.findByRole('button',{name:'Show all 13'}));
 await waitFor(()=>expect(container.querySelectorAll('tbody')[1]?.textContent).toContain('RESEARCH'));
 expect(container.textContent).not.toContain('$100,120');
 expect(container.querySelectorAll('[data-journal-verdict]')).toHaveLength(1);
 expect(container.textContent).not.toMatch(/\b(?:N\/A|UNKNOWN|Unavailable|undefined|NaN|Playbook|Golden Egg)\b|[A-Z]+_[A-Z_]+/);
 fireEvent.click(screen.getByRole('tab',{name:'Open',exact:true}));
 await waitFor(()=>expect(container.querySelectorAll('tbody tr')).toHaveLength(1));
});

it('research-only accounts retain a way to reveal saved research from the empty state',async()=>{
 state.entries=[{...own(99),symbol:'AUTO',executionMode:'PAPER'}];
 const {container}=render(<JournalPage tier="pro" embeddedInWorkspace/>);
 await screen.findByText('Add your first trade');
 fireEvent.click(screen.getByLabelText('Research records (automated, paper)'));
 await waitFor(()=>expect(container.querySelectorAll('tbody')[1]?.textContent).toContain('AUTO'));
 expect(container.querySelectorAll('[data-stat-card]')).toHaveLength(0);
});

it('shows a saved entry before the journal list reload finishes', async () => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let journalGets = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u === '/api/journal/add-trade') return { ok: true, json: async () => ({ success: true, id: 77 }) };
    if (u === '/api/journal') {
      journalGets += 1;
      if (journalGets > 1) await pending;
      const entries = journalGets > 1
        ? [{ id: 77, symbol: 'SOL', side: 'LONG', date: '2026-10-11', entryPrice: 150, quantity: 2, isOpen: true, tradeType: 'Spot', assetClass: 'equity' }]
        : [];
      return { ok: true, json: async () => ({ entries }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }));
  const { container } = render(<JournalPage tier="pro" embeddedInWorkspace />);
  await screen.findByText('Add your first trade');
  fireEvent.click(screen.getByRole('button', { name: 'New Trade' }));
  fireEvent.change(screen.getByLabelText('Symbol *'), { target: { value: 'SOL' } });
  fireEvent.change(screen.getByLabelText('Entry Price *'), { target: { value: '150' } });
  fireEvent.change(screen.getByLabelText('Quantity *'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Trade' }));
  const saved = await screen.findAllByRole('link', { name: 'SOL' });
  expect(saved.length).toBeGreaterThan(0);
  expect(saved.every((link) => link.textContent === 'SOL')).toBe(true);
  expect(screen.queryByText('Loading trades...')).toBeNull();
  expect(journalGets).toBeGreaterThanOrEqual(2);
  expect(container.querySelector('tbody')?.textContent).toContain('SOL');
  release();
  await waitFor(() => expect(container.querySelector('tbody')?.textContent).toContain('SOL'));
});
