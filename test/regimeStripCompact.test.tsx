// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
const state=vi.hoisted(()=>({data:null as any,loading:false}));
vi.mock('@/app/v2/_lib/api',()=>({useRegime:()=>state}));
import RegimeBar from '@/app/v2/_components/RegimeBar';
beforeEach(()=>{vi.stubGlobal('React',React);state.loading=false;state.data=null;});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps one regime in the closed summary and retains eligible evidence behind a native disclosure',()=>{
 state.data={regime:'TREND_UP',signals:[
  {source:'market',kind:'market',regime:'TREND_UP',stale:false},
  {source:'macro_context',kind:'context',regime:'TREND_UP',stale:false,counted:true},
  {source:'old',regime:'TREND_DOWN',stale:true},
  {source:'excluded',regime:'RISK_OFF',stale:false,counted:false},
 ]};
 const original=JSON.stringify(state.data);const {container}=render(<RegimeBar/>);
 const fold=container.querySelector('details')!;expect(fold.open).toBe(false);
 const summary=fold.querySelector('summary')!;
 expect(summary.textContent?.match(/Trend Up/g)).toHaveLength(1);
 expect(summary.textContent).toContain('2 supporting signals');
 expect(summary.className).toContain('min-h-10');
 expect(screen.getByRole('list',{name:'Market regime supporting signals',hidden:true}).querySelectorAll('li')).toHaveLength(2);
 expect(container.textContent).not.toMatch(/excluded|TREND_UP|macro_context/);
 expect(container.querySelector('[class*="overflow-x-auto"]')).toBeNull();
 expect(JSON.stringify(state.data)).toBe(original);
});
it('preserves hideIfMissing behavior and never creates a default regime',()=>{
 const {container,rerender}=render(<RegimeBar hideIfMissing/>);expect(container.textContent).toBe('');
 rerender(<RegimeBar/>);expect(container.textContent).toContain('Not available right now');expect(container.querySelector('details')).toBeNull();
 state.data={regime:'unknown',signals:[]};rerender(<RegimeBar hideIfMissing/>);expect(container.textContent).toBe('');
});
it('does not expose retained signal evidence while loading',()=>{
 state.loading=true;state.data={regime:'TREND_UP',signals:[{source:'market',regime:'TREND_UP',stale:false}]};
 const {container}=render(<RegimeBar/>);expect(container.textContent).toContain('Loading');expect(container.textContent).not.toContain('Trend Up');expect(container.querySelector('details')).toBeNull();
});
