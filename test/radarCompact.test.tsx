// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import MspRadarReport from '@/components/msp-radar/MspRadarReport';
const { payload } = require('./fixtures/radarLayout.cjs');
let container:HTMLDivElement, root:ReturnType<typeof createRoot>;
const fetcher=vi.fn();
vi.mock('next/link',()=>({default:({href,children,...props}:any)=><a href={href} {...props}>{children}</a>}));
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetcher);fetcher.mockReset().mockImplementation(async(url:string)=>({ok:true,status:200,json:async()=>url.includes('/archive')?{items:[]}:payload()}));container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe('Radar compact report',()=>{
 it('shows five desktop cards, three mobile cards, and expands the same ordered candidates',async()=>{
  await act(async()=>root.render(<MspRadarReport/>));
  const cards=()=>[...container.querySelectorAll('[data-radar-candidates]>li')];
  expect(cards()).toHaveLength(5);expect(cards().filter(e=>!e.classList.contains('hidden'))).toHaveLength(3);
  expect(cards().map(e=>e.querySelector('a')?.textContent)).toEqual(['AAPL','NVDA','MU','AMD','MSFT']);
  const button=[...container.querySelectorAll('button')].find(e=>e.textContent==='Show all 8 candidates')!;
  await act(async()=>button.click());expect(cards()).toHaveLength(8);
  expect(container.querySelectorAll('[data-radar-lifecycle]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-radar-verdict]')).toHaveLength(1);
  expect(container.textContent).not.toMatch(/Run COMPLETE|Health NORMAL|DATA HEALTH WARNING|Golden Egg|2026-10-02T21:00/);
  expect(fetcher.mock.calls.every(([,options])=>options.cache==='no-store'&&options.credentials==='include')).toBe(true);
 });
 it('retains a visible partial-coverage warning and does not show a success verdict on failure',async()=>{
  fetcher.mockImplementation(async(url:string)=>({ok:true,status:200,json:async()=>url.includes('/archive')?{items:[]}:payload('partial',true)}));
  await act(async()=>root.render(<MspRadarReport/>));expect(container.textContent).toContain('Partial coverage');expect(container.textContent).toContain('Candidate coverage is incomplete.');
  act(()=>root.unmount());root=createRoot(container);
  fetcher.mockImplementation(async(url:string)=>({ok:true,status:200,json:async()=>url.includes('/archive')?{items:[]}:payload('failed')}));
  await act(async()=>root.render(<MspRadarReport/>));expect(container.querySelector('[data-radar-verdict]')?.textContent).toBe('This session report could not be collected.');expect(container.querySelector('[data-radar-candidates]')).toBeNull();
 });
});
