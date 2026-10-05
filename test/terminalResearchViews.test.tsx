// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CapitalPressureView from '@/components/terminal/CapitalPressureView';
import GravityResearchView from '@/components/terminal/GravityResearchView';
import OptionsResearchView from '@/components/terminal/OptionsResearchView';
import { researchLabel, researchNumber, researchPrice } from '@/components/terminal/researchPresentation';

const capital = {data:{spot:249.3506,bias:'bullish',market_mode:'pin',conviction:73.654,gamma_state:'UNKNOWN',asof:'2026-10-02T20:00:00Z',flow_trade_permission:{blocked:true,tps:42.325,sessionLimited:true},probability_matrix:{continuation:60.125,pinReversion:20.245,expansion:19.63,regime:'NO_TREND'},liquidity_levels:[{level:245,label:'PDL',prob:0.625}],brain_decision_v1:{brain_score:{score:71.356}},institutional_risk_governor:{irs:32,riskMode:'DEFENSIVE'}}};
const gravity:any={targetStatus:'ACTIVE',currentPrice:249.3506,targetPrice:252.194,confidence:73.897,allPoints:[{timeframe:'1D',midpoint:252.194,distance:1.14}],zones:[{minPrice:251,maxPrice:253,dominantTimeframes:['1D'],confidence:78.348}],taggingStats:{taggedThisCycle:2,remainingUntagged:1},closeConfluence:{totalStackedTfs:3,activeWindowCount:1}};
const options:any={symbol:'MU',currentPrice:249.3506,direction:'bullish',directionStatus:'determined',confluenceStack:3,primaryStrike:{strike:250,type:'call',moneyness:'ATM'},primaryExpiration:{expirationDate:'2026-10-09'},dataQuality:{freshness:'REALTIME',optionsChainSource:'alpha_vantage',lastUpdated:'2026-10-02T20:00:00Z'},openInterestAnalysis:{totalCallOI:109234,totalPutOI:92487,pcRatio:0.8467,expirationDate:'2026-10-09',highOIStrikes:[{strike:250,type:'call',openInterest:3456}]},ivAnalysis:{currentIV:.493506},optionsQualityScore:79,expectedMove:{selectedExpiryPercent:4.2347}};
afterEach(()=>cleanup());
function assertCompact(root:HTMLElement){expect(root.querySelectorAll('[data-research-verdict]')).toHaveLength(1);expect(root.querySelectorAll('[data-research-source]')).toHaveLength(1);expect(root.querySelectorAll('details[open]')).toHaveLength(0);expect(root.textContent).not.toMatch(/TARGET ACTIVE|Trade Permission|playbook|UNKNOWN|NO_TREND|249\.3506/);}

describe('Terminal research presentation',()=>{
 it('keeps capital blocks visible, folds evidence, and preserves numeric inputs',()=>{
  const before=JSON.stringify(capital),refresh=vi.fn();
  const {container}=render(<CapitalPressureView symbol="MU" data={capital} loading={false} error={null} onRefresh={refresh}/>);
  assertCompact(container);expect(screen.getByText('Directional score').closest('details')).not.toBeNull();expect(container.textContent).not.toContain('Bullish');expect(screen.getByText('Pressure conditions are not aligned')).toBeTruthy();expect(screen.getByText('Prior day low')).toBeTruthy();expect(screen.getByText('71')).toBeTruthy();expect(screen.getByText('$249.35')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}));expect(refresh).toHaveBeenCalledOnce();expect(JSON.stringify(capital)).toBe(before);
 });
 it('keeps a hard risk block above folds even if other alignment conditions pass',()=>{
  render(<CapitalPressureView symbol="MU" data={{data:{...capital.data,flow_trade_permission:{blocked:false},institutional_risk_governor:{hardBlocked:true,hardBlockReasons:['Capital budget below minimum']}}}} loading={false} error={null} onRefresh={()=>{}}/>);
  expect(document.querySelector('[data-research-verdict]')?.textContent).toBe('A risk limit blocks this observation');expect(screen.queryByText('Pressure conditions are aligned')).toBeNull();expect(screen.getByText('Capital budget below minimum')).toBeTruthy();
 });
 it('does not fabricate zero scores when capital feed fails',()=>{
  const {container}=render(<CapitalPressureView symbol="MU" data={null} loading={false} error="HTTP 503" onRefresh={()=>{}}/>);
  expect(screen.getByText('Capital pressure feed failed')).toBeTruthy();expect(screen.getByRole('alert').textContent).toBe('HTTP 503');expect(container.querySelector('dl')).toBeNull();
 });
 it('gives gravity one plain verdict and real rounded evidence without changing its calculation',()=>{
  const before=JSON.stringify(gravity);
  const {container}=render(<GravityResearchView symbol="MU" tgm={gravity} coverage={null} calendar={null} receivedAt={new Date('2026-10-05T00:00:00Z')} empty={false} localDemo={false} error={null} onRefresh={()=>{}} loading={false}/>);
  assertCompact(container);expect(screen.getByText('Unreached midpoint levels remain')).toBeTruthy();expect(screen.getByText('74%')).toBeTruthy();expect(container.textContent).toContain('Receipt time is not a market observation timestamp');expect(JSON.stringify(gravity)).toBe(before);
 });
 it('does not dress empty or demonstration gravity up as a result',()=>{
  const {container}=render(<GravityResearchView symbol="MU" tgm={gravity} coverage={null} calendar={null} receivedAt={new Date()} empty={true} localDemo={true} error={null} onRefresh={()=>{}} loading={false}/>);
  expect(screen.getByText('Demonstration data · no live observation')).toBeTruthy();expect(container.querySelector('dl')).toBeNull();expect(container.querySelector('details')).toBeNull();
 });
 it('shows options verdict first, uses no duplicate symbol input and keeps one source across folds',()=>{
  const before=JSON.stringify(options),scan=vi.fn();
  const {container}=render(<OptionsResearchView symbol="MU" result={options} alignment="ALLOW" blocked={false} loading={false} error={null} onScan={scan} controls={null}/>);
  assertCompact(container);expect(container.textContent).toContain('Fri 9 Oct');expect(container.textContent).toContain('Alpha Vantage');expect(container.textContent).not.toContain('2026-10-09');expect(screen.getByText('Options conditions are aligned')).toBeTruthy();expect(container.querySelector('input')).toBeNull();expect(screen.getByText('49.4%')).toBeTruthy();expect(screen.getByText('109,234')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Run again'}));expect(scan).toHaveBeenCalledOnce();expect(JSON.stringify(options)).toBe(before);
 });
 it('withholds blocked contract, score and expected move rather than inventing a result',()=>{
  const {container}=render(<OptionsResearchView symbol="MU" result={{...options,entryTiming:{reason:'Market is closed'},dataConfidenceCaps:['Quote observation is stale']}} blocked={true} loading={false} error={null} onScan={()=>{}} controls={null}/>);
  assertCompact(container);expect(screen.getByText('Options analysis is on hold')).toBeTruthy();expect(screen.getByText('Market is closed')).toBeTruthy();expect(screen.getByText('Quote observation is stale')).toBeTruthy();expect(screen.queryByText('Options quality score')).toBeNull();expect(screen.queryByText(/Selected call/)).toBeNull();expect(screen.queryByText('Expected move')).toBeNull();expect(container.textContent).not.toContain('A usable contract, expiry and current quote are required');
 });
 it('reports a manual scan not yet run without Ready or empty count theater',()=>{
  const {container}=render(<OptionsResearchView symbol="MU" result={null} blocked={false} loading={false} error={null} onScan={()=>{}} controls={null}/>);
  expect(screen.getByText('Options analysis has not run for MU')).toBeTruthy();expect(container.querySelector('dl')).toBeNull();expect(container.textContent).not.toMatch(/Ready|Results 0/);
 });
 it('formats missing and raw values only in the UI',()=>{expect(researchNumber(NaN)).toBe('Not measured');expect(researchPrice(undefined)).toBe('Not measured');expect(researchLabel('NO_SETUP')).toBe('No pattern found');expect(researchLabel('UNKNOWN')).toBe('Not measured');expect(researchPrice(.000000123456)).toBe('$0.0000001235');});
});

it('suppresses headline and zone alignment figures exceeding 57% measured coverage',()=>{
 const {container}=render(<GravityResearchView symbol="MU" tgm={gravity} coverage={{percent:57,available:['1D'],missing:['1W']} as any} calendar={null} receivedAt={new Date()} empty={false} localDemo={false} error={null} onRefresh={()=>{}} loading={false}/>);
 expect(screen.getAllByText('Low coverage').length).toBeGreaterThan(0);expect(container.textContent).not.toMatch(/74%|78%/);
});
