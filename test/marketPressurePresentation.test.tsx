// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MarketPressureWidget from '@/components/MarketPressureWidget';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('renders populated pressure as readable evidence without exposing direction codes',async()=>{
 const fetchMock=vi.fn().mockResolvedValue({json:async()=>({success:true,dataSources:{time:true},reading:{composite:64.2345,direction:'LONG',regime:'TREND_UP',alignment:0.75324,label:'BUILDING',summary:'MPE 64/100 — BUILDING. LONG evidence with bullish components.',pressures:Object.fromEntries(['time','volatility','liquidity','options'].map(key=>[key,{score:64.2345,weight:0.25,direction:'bullish',components:['Unusual activity (bullish)']}]))}})});
 vi.stubGlobal('fetch',fetchMock);
 const {container}=render(<MarketPressureWidget symbol="MU"/>);
 expect(await screen.findByText('↑ Upside evidence')).toBeTruthy();
 expect(container.textContent).toContain('75%');
 expect(container.textContent).not.toMatch(/LONG|bullish|TREND_UP|BUILDING|MPE|64\.2345/);
 expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(fetchMock).toHaveBeenCalledWith('/api/market-pressure?symbol=MU&scanMode=intraday_1h&sessionMode=extended');
});
