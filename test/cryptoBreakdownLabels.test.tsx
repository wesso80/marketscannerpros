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
// J16-WP2-1 moved the bar basis from each row to one page source line; rows still never fetch a spot price.
it('scanner states the completed-bar basis once, without a spot fetch',()=>{const s=readFileSync('app/tools/scanner/page.tsx','utf8');const f=s.slice(s.indexOf('function ScannerRowStamp'),s.indexOf('function ProScannerCards'));expect(f).not.toContain('fetch(');expect(s).toContain('basis="Last completed bar"');expect(s).toContain('lastCompletedBarAt');});
it('command center and terminal derivatives links are market-wide',()=>{
 for(const file of ['app/tools/command-center/page.tsx','app/tools/terminal/page.tsx']){const s=readFileSync(file,'utf8');expect(s).toContain('href="/tools/crypto-dashboard"');expect(s).not.toContain('crypto-dashboard?symbol=');}
});
