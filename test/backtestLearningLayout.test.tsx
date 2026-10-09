// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {PLAYBOOKS} from '@/lib/doctrine/registry';
import {learningText} from '@/lib/learningPresentation';
const state=vi.hoisted(()=>({profile:null as any,failed:false,backtest:vi.fn(),scanner:vi.fn(),range:vi.fn()}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:'pro',isLoggedIn:true,isLoading:false})}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({selectedSymbol:'AAPL'})}));
vi.mock('@/app/v2/_lib/api',()=>({fetchBacktest:state.backtest,fetchScannerBacktest:state.scanner,fetchSymbolRange:state.range}));
import BacktestHub from '@/components/backtest/BacktestHub';
import LearningTab from '@/app/tools/workspace/LearningTab';
beforeEach(()=>{vi.stubGlobal('React',React);state.profile=null;state.failed=false;state.backtest.mockReset().mockResolvedValue({totalTrades:2,totalReturn:12.345,winningTrades:1,losingTrades:1,equityCurve:[{date:'2025-01-01',equity:10000},{date:'2025-12-31',equity:11234.5}],trades:[]});state.scanner.mockReset();state.range.mockReset();vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:!state.failed,json:async()=>String(url).endsWith('/profile')?{profile:state.profile}:{playbooks:PLAYBOOKS}})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows an explicitly labelled sample and never runs on page load',()=>{
 const {container}=render(<BacktestHub embeddedInWorkspace/>);
 expect(screen.getByText('Sample chart · illustrative only, not a simulation result')).toBeTruthy();
 expect(container.querySelectorAll('[data-layout-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(state.backtest).not.toHaveBeenCalled();expect(state.scanner).not.toHaveBeenCalled();expect(state.range).not.toHaveBeenCalled();
});
it('keeps the request inputs and replaces the sample only after an explicit run',async()=>{
 const {container}=render(<BacktestHub embeddedInWorkspace/>);
 fireEvent.click(screen.getByText('Simulation settings'));
 fireEvent.click(screen.getByRole('button',{name:'Run Backtest'}));
 await screen.findByText('AAPL: 2 simulated trades, +12.3% historical return.');
 expect(state.backtest).toHaveBeenCalledExactlyOnceWith({symbol:'AAPL',strategy:'msp_day_trader',startDate:'2024-01-01',endDate:'2025-12-31',initialCapital:10000,timeframe:'daily'});
 expect(container.querySelector('[data-backtest-sample]')).toBeNull();
 expect(screen.getByText('Simulation details').closest('details')?.open).toBe(false);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
it('empty Learning has one Journal action and folded framework definitions',async()=>{
 const {container}=render(<LearningTab/>);
 await screen.findByText('No recorded learning history yet.');
 expect(screen.getByRole('link',{name:'Open Journal'}).getAttribute('href')).toBe('/tools/workspace?tab=journal');
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.textContent).not.toMatch(/Golden Egg|bullish|bearish|NO_SETUP/);
});
it('keeps the learning profile and formats the user\'s own measured values',async()=>{
 state.profile={totalTrades:24,edgeScore:62,overallWinRate:0.5833,overallAvgRR:1.42,doctrineStats:[],bestDoctrine:null,worstDoctrine:null,bestRegime:null,worstRegime:null};
 render(<LearningTab/>);
 await screen.findByText('24 recorded trades in your learning profile.');
 expect(screen.queryByText('62')).toBeNull();expect(screen.getByText('58%')).toBeTruthy();expect(screen.getByText('1.4')).toBeTruthy();
 expect(state.profile.edgeScore).toBe(62);expect(state.profile.overallWinRate).toBe(0.5833);
});
it('reports a failed Learning feed instead of claiming no history',async()=>{
 state.failed=true;render(<LearningTab/>);
 await screen.findByText('Learning records could not be loaded.');
 expect(screen.queryByText('No recorded learning history yet.')).toBeNull();
});
it('keeps registry identifiers unchanged and makes every framework detail plain',()=>{
 for(const pb of PLAYBOOKS){
  const raw=JSON.stringify(pb);
  const text=[pb.label,pb.description,...pb.entryCriteria,pb.riskModel.stopDescription,pb.riskModel.targetDescription,...pb.failureSignals].map(learningText).join(' ');
  expect(text).not.toMatch(/\b(bullish|bearish|target|playbook|long|short)\b|[A-Z]+_[A-Z_]+/i);
  expect(JSON.stringify(pb)).toBe(raw);
 }
 expect(learningText('Negative gamma exposure (dealers short gamma)')).toBe('Negative gamma exposure (dealer negative gamma positioning)');
});
