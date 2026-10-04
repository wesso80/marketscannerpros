import React from 'react';
import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SymbolSnapshotHeader} from '@/components/market/SymbolSnapshotHeader';
import {noQuoteLabel} from '@/lib/market/priceStamp';
import {readFileSync} from 'node:fs';
vi.mock('next/link',()=>({default:({href,children}:any)=><a href={href}>{children}</a>}));
it('crypto header trusts the observation time, not latestDay',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T01:00Z'));
 for(const [age,status] of [[3,'Live'],[20,'Stale'],[null,'Unknown']] as const){const markup=renderToStaticMarkup(<SymbolSnapshotHeader symbol="LINK" asset="crypto" timeframe="daily" pick={null} stamp={{price:14,assetType:'crypto',priceBasis:'spot',observedAt:age==null?null:new Date(Date.now()-age*60000).toISOString(),source:'CoinGecko'}}/>);expect(markup).toContain(`>${status}<`);}
 vi.useRealTimers();
});
it('missing weekend quotes say closed, regular session says no quote',()=>{expect(noQuoteLabel(false)).toBe('market closed, no quote');expect(noQuoteLabel(true)).toBe('no quote');expect(noQuoteLabel(null)).toBe('no quote');});
it('scanner daily label uses bar interval and completed timestamp, without a spot fetch',()=>{const s=readFileSync('app/tools/scanner/page.tsx','utf8');const f=s.slice(s.indexOf('function ScannerRowStamp'),s.indexOf('function ProScannerCards'));expect(f).toContain('daily bar close');expect(f).toContain('lastCompletedBarAt');expect(f).not.toContain('fetch(');});
