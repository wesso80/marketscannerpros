// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import FuturesTerminalPanel from '@/components/terminal/futures/FuturesTerminalPanel';
import type {FuturesTerminalResponse} from '@/app/v2/_lib/api';
import {buildFuturesSessionState} from '@/lib/terminal/futures/futuresSessionEngine';
import {estimateFuturesLiquidityParticipation} from '@/lib/terminal/futures/liquidityParticipation';
const session=buildFuturesSessionState('/ES',new Date('2026-10-05T15:00:00Z'));
const data={symbol:'/ES',marketPath:'futures',session,closeCalendar:{},riskNotice:'Research and simulation only.',dataState:'ready',errors:[]} as FuturesTerminalResponse;
beforeEach(()=>vi.stubGlobal('React',React));afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('does not expose raw backend errors or retained estimates on request failure',()=>{
 const {container}=render(<FuturesTerminalPanel data={data} loading={false} error="PROVIDER_UNKNOWN token=secret" tab="Liquidity & Volume" symbol="/ES"/>);
 expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
 expect(container.textContent).not.toMatch(/PROVIDER_UNKNOWN|secret|\/100/);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(0);
});
it('keeps absent data honest without claiming schedule modules are present',()=>{
 const {container}=render(<FuturesTerminalPanel data={null} loading={false} error={null} tab="Futures Session" symbol="/ES"/>);
 expect(container.textContent).toContain('No market observations collected');
 expect(container.textContent).not.toMatch(/remain available|UNKNOWN|Data State/);
});
it('labels model estimates while keeping the calculation snapshot unchanged',()=>{
 const estimate=estimateFuturesLiquidityParticipation('/ES',session);
 const snapshot=JSON.stringify(data);
 const {container}=render(<FuturesTerminalPanel data={data} loading={false} error={null} tab="Liquidity & Volume" symbol="/ES"/>);
 expect(container.textContent).toContain('Session-based estimates, not measured volume or order-book liquidity.');
 expect(container.textContent).not.toContain('/100');
 expect(Number.isFinite(estimate.liquidityScore)).toBe(true);
 expect(Number.isFinite(estimate.participationScore)).toBe(true);
 expect(container.querySelectorAll('[data-futures-summary]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(JSON.stringify(data)).toBe(snapshot);
});
it('folds partial coverage without raw issue strings, and suppresses estimates on provider failure',()=>{
 const {container,rerender}=render(<FuturesTerminalPanel data={{...data,dataState:'partial',errors:['NO_SETUP','PROVIDER_DEGRADED']}} loading={false} error={null} tab="Futures Session" symbol="/ES"/>);
 expect(screen.getByRole('status').textContent).toContain('limited data coverage');
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(container.textContent).not.toMatch(/NO_SETUP|PROVIDER_DEGRADED|Data State: partial/);
 rerender(<FuturesTerminalPanel data={{...data,dataState:'error',errors:['data unavailable from current feed']}} loading={false} error={null} tab="Liquidity & Volume" symbol="/ES"/>);
 expect(container.textContent).not.toContain('/100');
 expect(container.textContent).toContain('schedule context only');
});
