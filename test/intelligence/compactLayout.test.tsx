// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fixtures from '@/docs/qa/intelligence-2026-10-05/fixtures.json';
import { EvidenceBars, evidenceLabel } from '@/components/intelligence/CompactEvidence';
const state=vi.hoisted(()=>({data:null as any}));
vi.mock('@/components/intelligence/useEndpoint',()=>({useEndpoint:()=>({data:state.data,loading:false,error:null,updatedAt:null,retry:vi.fn()})}));
import FragilityPage from '@/app/intelligence/fragility/page';
import LiquidityPage from '@/app/intelligence/liquidity/page';
beforeEach(()=>vi.stubGlobal('React',React));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each([[FragilityPage,fixtures.fragility],[LiquidityPage,fixtures.liquidity]])('keeps one verdict, chart, source and closed details without mutating data', (Page,data)=>{
 state.data=structuredClone(data);const original=JSON.stringify(state.data);
 const {container}=render(<Page/>);
 expect(container.querySelectorAll('[data-layout-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-evidence-chart]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(container.textContent).not.toMatch(/DATA_PARITY_PENDING|\bMISSING\b|\bUnavailable\b|\bPlaybook\b/);
 expect(JSON.stringify(state.data)).toBe(original);
});
it('keeps a failed liquidity feed visible without numeric tiles or chart',()=>{
 state.data={...fixtures.liquidity,available:false,headline:null,reason:'DATA_UNAVAILABLE',stages:[]};
 const {container}=render(<LiquidityPage/>);
 expect(container.textContent).toContain('Liquidity observations could not be collected.');
 expect(container.querySelector('[data-evidence-chart]')).toBeNull();
 expect(container.querySelector('[data-stat-card]')).toBeNull();
});
it('labels missing and pending checks without implying a repair',()=>{
 expect(evidenceLabel('DATA_PARITY_PENDING')).toBe('source checks not finished');
 expect(evidenceLabel('DATA_UNAVAILABLE')).toBe('Not collected');
 expect(evidenceLabel('Finance series')).toBe('Finance series');
 expect(evidenceLabel('WAIT FOR CONFIRMATION')).toBe('Confirmation incomplete');
});
it('omits non-finite bars, but keeps real zero observations',()=>{
 const {container}=render(<EvidenceBars title="Measured" rows={[{label:'Real zero',value:0},{label:'No reading',value:NaN}]}/>);
 expect(container.textContent).toContain('Real zero');
 expect(container.textContent).not.toContain('No reading');
});
