// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro' }), canAccessPortfolioInsights: () => true }));
vi.mock('@/hooks/usePolling', () => ({ usePolling: vi.fn() }));
vi.mock('@/lib/ai/pageContext', () => ({ useAIPageContext: () => ({ setPageData: vi.fn() }) }));
vi.mock('@/components/ComplianceDisclaimer', () => ({ default: () => <p>Protected disclosure</p> }));
import CommoditiesPage from '@/app/tools/commodities/page';
const rows = [
 {symbol:'GOLD',name:'Gold',category:'Metals',price:249.3506,change:1,changePercent:1.1234,unit:'USD/oz',date:'2026-10-02',history:[],source:'SPOT',freshnessStatus:'DELAYED',dataAgeDays:3,eligibleForGate:true},
 {symbol:'WTI',name:'USO (WTI Crude Oil proxy)',category:'Energy',price:77,change:-1,changePercent:-1.1234,unit:'USD/share',date:'2026-10-02',history:[],source:'ETF_PROXY',sourceSymbol:'USO',freshnessStatus:'DELAYED',dataAgeDays:3,eligibleForGate:true},
 {symbol:'SUGAR',name:'Sugar',category:'Agriculture',price:20,change:1,changePercent:1,unit:'cents/lb',date:'2026-01-01',history:[],source:'LEGACY_MONTHLY',freshnessStatus:'STALE',dataAgeDays:277,eligibleForGate:false},
];
const fixture = {success:true,commodities:rows,byCategory:{Energy:[rows[1]],Metals:[rows[0]],Agriculture:[rows[2]]},summary:{totalCommodities:3,gainers:1,losers:1,avgChange:0,topGainer:rows[0],topLoser:rows[1]},dataHealth:{gateReady:true,eligibleCount:2,totalCount:3,staleSymbols:['SUGAR']},sourceAsOf:'2026-10-02',lastUpdate:'2026-10-05T00:00:00Z'};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('folds excluded rows, keeps prices readable, and has one verdict, source and legend without changing feed values',async()=>{
 const fetchMock=vi.fn(async()=>({ok:true,json:async()=>fixture}));vi.stubGlobal('fetch',fetchMock);
 const original=JSON.stringify(fixture);
 const {container}=render(<CommoditiesPage embedded/>);
 await screen.findByText('Gold');
 expect(container.querySelectorAll('[data-commodity-card]')).toHaveLength(2);
 expect(container.querySelectorAll('[data-commodity-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-commodity-legend]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-commodity-source]')).toHaveLength(1);
 const excluded=container.querySelector('[data-excluded-commodities]')!;
 expect(excluded.hasAttribute('open')).toBe(false);expect(excluded.textContent).toContain('Sugar');
 expect(screen.getByText('$249.35')).toBeTruthy();expect(screen.getAllByText('+1.12%').length).toBeGreaterThan(0);
 expect(container.textContent).not.toMatch(/RISK_ON|RISK_OFF|Trade Permission|Coming soon|Golden Egg/);
 fireEvent.change(screen.getByRole('combobox',{name:'Commodity category'}),{target:{value:'Agriculture'}});
 expect(container.querySelectorAll('[data-commodity-card]')).toHaveLength(0);
 expect(screen.getByText('No included observations in this category.')).toBeTruthy();
 expect(fetchMock).toHaveBeenCalledTimes(2);expect(JSON.stringify(fixture)).toBe(original);
});
