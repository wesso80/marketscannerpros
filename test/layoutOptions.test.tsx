import React from 'react';
import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import PerContractCosts from '@/components/options-terminal/PerContractCosts';
import {optionsHref} from '@/lib/market/links';
import {optionJournalParams} from '@/lib/options/journalHandoff';
import {buildIVMetrics} from '@/hooks/useOptionsChain';
import type {OptionsContract} from '@/types/optionsTerminal';
const call={contractId:'AAPL335C',type:'call',strike:335,expiration:'2026-10-05',bid:1.20,ask:1.29,theta:-.31,iv:.25,mark:1.245,delta:.5,gamma:0,vega:0,rho:0,itm:false,spread:.09,spreadPct:7.23,volume:100,openInterest:200,last:1.24} satisfies OptionsContract;
it('L-7 reuses O-4 dollar math and states the quote basis',()=>{
 const html=renderToStaticMarkup(<PerContractCosts contract={call} spot={333.69} quoteBasis="previous_session" asOfDate="2026-10-02"/>);
 for(const value of ['$129.00','$124.50','$336.29','$-31.00','$9.00','last session','Fri 2 Oct'])expect(html).toContain(value);
 const missing=renderToStaticMarkup(<PerContractCosts contract={{...call,bid:0}} spot={333.69}/>);expect(missing).toContain('No valid bid');expect(missing).not.toContain('0.0%');
});
it('a put keeps the LONG premium handoff',()=>{
 const p=optionJournalParams('AAPL',{...call,type:'put'},'analysis');expect(p.get('side')).toBe('LONG');expect(p.get('tradeType')).toBe('Options');expect(p.get('strikePrice')).toBe('335');expect(p.get('expirationDate')).toBe('2026-10-05');
});
it('shared IV metrics have the fixture straddle and quote-date move',()=>{
 const metrics=buildIVMetrics([call,{...call,type:'put'}],333.69,'2026-10-05','2026-10-02');
 expect(metrics.avgIV).toBe(.25);expect(metrics.atmStraddleMid).toBe(2.49);expect(metrics.expectedMoveAbs).toBeCloseTo(333.69*.25*Math.sqrt(3/365));
});
it('default/options redirects preserve symbol and expiry and share both section props',()=>{
 expect(optionsHref()).toBe('/tools/options?symbol=SPY');expect(optionsHref('aapl','2026-10-05')).toBe('/tools/options?symbol=AAPL&expiry=2026-10-05');
 for(const name of ['options-confluence','options-flow'])expect(readFileSync(`app/tools/${name}/page.tsx`,'utf8')).toContain('redirect(optionsHref(');
 const source=readFileSync('components/options-terminal/OptionsResearchSections.tsx','utf8');expect(source.match(/symbol=\{symbol\} expiry=\{expiry\}/g)).toHaveLength(2);expect(source).toContain('key={`${symbol}:${expiry}`}');
});
