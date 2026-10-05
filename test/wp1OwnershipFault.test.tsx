// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import OwnershipFlowPanel from '@/components/golden-egg/OwnershipFlowPanel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows an amber ownership feed failure without a raw unavailable label',async()=>{
 vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({error:'Provider timeout'})})));
 const {container}=render(<OwnershipFlowPanel symbol="AAPL"/>);
 const fault=await screen.findByText('Ownership feed failed (Provider timeout)');expect(fault.className).toContain('text-amber-300');expect(container.textContent).not.toContain('Unavailable');
});
