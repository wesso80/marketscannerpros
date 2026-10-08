// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MarketPressureWidget from '@/components/MarketPressureWidget';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
// W3: the widget shows measured market inputs only; the old composite reading (score, direction, alignment, label) is refused.
it('refuses the old composite pressure reading and never shows its score, direction or label',async()=>{
 const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,dataSources:{time:true},reading:{composite:64.2345,direction:'LONG',regime:'TREND_UP',alignment:0.75324,label:'BUILDING',summary:'MPE 64/100 — BUILDING. LONG evidence with bullish components.',pressures:Object.fromEntries(['time','volatility','liquidity','options'].map(key=>[key,{score:64.2345,weight:0.25,direction:'bullish',components:['Unusual activity (bullish)']}]))}})});
 vi.stubGlobal('fetch',fetchMock);
 const {container}=render(<MarketPressureWidget symbol="MU"/>);
 expect(await screen.findByText('Market inputs could not be loaded')).toBeTruthy();
 expect(container.textContent).not.toMatch(/Upside|Downside|75%|LONG|bullish|TREND_UP|BUILDING|MPE|64/);
 expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(fetchMock).toHaveBeenCalledWith('/api/market-pressure?symbol=MU&scanMode=intraday_1h');
});
