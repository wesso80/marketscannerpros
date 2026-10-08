// @vitest-environment jsdom
import React from 'react';
import { afterEach, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import PublicMSPCopilot from '@/components/PublicMSPCopilot';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const usage={enabled:true,plan:'pro',resetsAt:'2026-10-09T04:00:00Z',quotas:[{kind:'ai',remaining:20}]};
const open=()=>fireEvent.click(screen.getByRole('button',{name:'MSP Copilot · Pro'}));
it('offers Pro to Free without sending an AI request',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 render(<PublicMSPCopilot usage={{...usage,plan:'free'}} pagePath="/tools/golden-egg"/>);open();
 expect(screen.getByText(/Pro includes 20/)).toBeTruthy();expect(screen.queryByRole('textbox')).toBeNull();expect(fetcher).not.toHaveBeenCalled();
});
it('fails closed for disconnected pages and exhausted allowance',()=>{
 const {rerender}=render(<PublicMSPCopilot usage={usage} pagePath="/tools/macro"/>);open();
 expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
 rerender(<PublicMSPCopilot usage={{...usage,quotas:[{kind:'ai',remaining:0}]}} pagePath="/tools/golden-egg" evidenceToken="fixture"/>);
 expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
});
it('discards an in-flight answer when the symbol changes',async()=>{
 let resolve!:(value:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>resolve=r)));
 const {rerender}=render(<PublicMSPCopilot usage={usage} pagePath="/tools/golden-egg" symbol="AAPL" evidenceToken="a"/>);open();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Explain'}});fireEvent.click(screen.getByRole('button',{name:'Ask Copilot'}));
 rerender(<PublicMSPCopilot usage={usage} pagePath="/tools/golden-egg" symbol="BTC" evidenceToken="b"/>);
 resolve({ok:true,json:async()=>({content:'Old AAPL answer'})});
 await waitFor(()=>expect(screen.queryByText('Old AAPL answer')).toBeNull());
});
