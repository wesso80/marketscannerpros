// @vitest-environment jsdom
import React from 'react';
import { afterEach,it,expect,vi } from 'vitest';
import { cleanup,render,screen,waitFor } from '@testing-library/react';
import PublicUsageSummary from '@/components/research/PublicUsageSummary';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows remaining and pending counts with the localized reset, without a counter when disabled',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({enabled:true,resetsAt:'2026-10-09T04:00:00Z',quotas:[{kind:'symbol',limit:3,remaining:1,pending:1,completed:1},{kind:'ai',limit:5,remaining:5,pending:0,completed:0}]})}).mockResolvedValueOnce({ok:true,json:async()=>({enabled:false})}));
 const {rerender}=render(<PublicUsageSummary refreshKey="AAPL"/>);
 expect(await screen.findByText('Symbol reports: 1 of 3 remaining (1 in progress)')).toBeTruthy();
 expect(screen.getByText(/midnight US Eastern/)).toBeTruthy();
 rerender(<PublicUsageSummary refreshKey="MSFT"/>);await waitFor(()=>expect(screen.queryByRole('complementary')).toBeNull());
});
it('never shows fabricated remaining quota on an error',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));
 render(<PublicUsageSummary refreshKey="AAPL"/>);expect(await screen.findByText('Usage count temporarily unavailable.')).toBeTruthy();
 expect(screen.queryByRole('complementary')).toBeNull();
});
