// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {symbolHref} from '@/lib/market/links';
import {cryptoResearchNote,symbolJournalHref} from '@/lib/market/symbolSnapshot';
import {normalizeCryptoSymbol} from '@/lib/crypto/breakdown/symbol';
import HandoffSection from '@/components/crypto/sections/HandoffSection';
import type {Breakdown} from '@/lib/crypto/breakdown/types';
vi.mock('next/link',()=>({default:({href,children,...p}:any)=><a href={href} {...p} onClick={e=>e.preventDefault()}>{children}</a>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('all scanner crypto fixtures keep their asset type including unusual symbols',()=>{
 for(const symbol of ['LINK-USD','QNT','CRVUSD','X','NEAR','AAVE','ETH','BTC','SOL','SUI']){
 const url=new URL(symbolHref(symbol,'crypto','daily'),'https://msp.test');expect(url.searchParams.get('type')).toBe('crypto');expect(normalizeCryptoSymbol(url.searchParams.get('symbol')!)).toBe(symbol==='LINK-USD'?'LINK':symbol);
 }expect(symbolHref('LINK-USD','crypto','daily')).toBe('/tools/golden-egg?symbol=LINK-USD&type=crypto&timeframe=daily');
});
it('creates a dated factual note with no strategy claim',()=>{const note=cryptoResearchNote('WATCH',{asOf:'2026-10-03T00:00Z',rangePct:10,volumeRatio:1,distancePct:-2});expect(note).toContain('2026-10-03 UTC');expect(note).toContain('Not a trade instruction');expect(note).not.toMatch(/buy|sell|likely/i);});
it('journal and watchlist are draft navigation only, with no write',()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const data={symbol:'LINK',sections:{ruleCheck:{value:{stage:'WATCH',metrics:[{label:'Base range; limit 35%',value:10},{label:'Volume / base median; minimum 3x',value:1},{label:'Distance to base high',value:-2}],notes:[]},asOf:'2026-10-03T00:00Z',source:'CoinGecko',basis:'daily',status:'Last close'}}} as unknown as Breakdown;
 render(<HandoffSection data={data}/>);fireEvent.click(screen.getByRole('button',{name:/Notes/}));const a=screen.getByRole('link',{name:/Log to journal/});const url=new URL(a.getAttribute('href')!,'https://msp.test');expect(url.searchParams.get('side')).toBe('LONG');expect(url.searchParams.get('tradeType')).toBe('Crypto');expect(url.searchParams.get('strategy')).toBeNull();expect(url.searchParams.get('notes')).toContain('locked v1 rule check = WATCH');fireEvent.click(a);fireEvent.click(screen.getByRole('link',{name:/Add to watchlist/}));expect(fetch).not.toHaveBeenCalled();
});
