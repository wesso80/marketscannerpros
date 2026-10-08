import React from 'react';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { SymbolSnapshotHeader } from '@/components/market/SymbolSnapshotHeader';
import { OverviewPicks } from '@/components/market/OverviewPicks';
import ScreenerTable, { type ScreenerRow } from '@/components/scanner/ScreenerTable';
const pick={symbol:'AAPL',asset_class:'equity',grade:'SECRET_GRADE',permission:'SECRET_PERMISSION',scorePercentile:98,scan_date:'2026-10-08',price:220,priceBasis:'last_close',data_as_of:'2026-10-07T20:00:00Z'};
it('Symbol ignores retired fields even when a legacy response still supplies them',()=>{
 const html=renderToStaticMarkup(<SymbolSnapshotHeader symbol="AAPL" asset="equity" timeframe="daily" stamp={{price:220,assetType:'equity'}} pick={pick}/>);
 expect(html).not.toMatch(/SECRET_|percentile|grade unavailable|permission unavailable/);
 expect(html).toContain('2026-10-08');expect(html).toContain('Daily scan');
});
it('Overview accepts both old and projected rows without grade or permission',()=>{
 for(const row of [pick,{symbol:'AAPL',scan_date:'2026-10-08',price:220}]){
  const html=renderToStaticMarkup(<OverviewPicks rows={[row]} asset="equity"/>);
  expect(html).not.toMatch(/SECRET_|Grade|Permission/);expect(html).toContain('AAPL');expect(html).toContain('220');
 }
});
it('Scanner table cannot display a supplied grade/permission in text or tooltips',()=>{
 const row={rank:1,symbol:'AAPL',direction:'NEUTRAL',confidence:50,quality:'high',strategy:'Recorded',permission:'BLOCKED',scorePermission:'BLOCK',canonical:{grade:'SECRET_GRADE',permission:'BLOCK',score:77},rsi:0,adx:12,price:220} as ScreenerRow;
 const html=renderToStaticMarkup(<ScreenerTable rows={[row]} onRowClick={()=>{}}/>);
 expect(html).not.toMatch(/SECRET_GRADE|sets grade|Engine verdict and Grade|NOT ALIGNED/);expect(html).toContain('AAPL');
});
it('Today and compact Scanner cards no longer display synthesized scores or daily grade changes',()=>{
 const today=readFileSync('components/desk/DeskFolds.tsx','utf8');
 expect(today).not.toContain('<MetricCol label="Score" value={row.score}');
 expect(today).not.toContain('<DSBadge tone={biasTone}>');
 expect(today).toContain('row.rsi == null');
 expect(readFileSync('app/tools/command-center/page.tsx','utf8')).not.toContain('changes.gradeChanges');
 const scanner=readFileSync('app/tools/scanner/page.tsx','utf8');
 const cards=scanner.slice(scanner.indexOf('function ProScannerCards'),scanner.indexOf('function RankedFallbackList'));
 expect(cards).not.toMatch(/row.confidence|computeMspScore|summarizeRankedReason|row.permission|row.canonical/);
 expect(cards).toContain('row.rsi != null');
});

import {topPicks,pickStamp,type PicksResponse} from '@/lib/market/overview';
import {findSymbolPick} from '@/lib/market/symbolSnapshot';
it('reads the #529 envelope and renamed fields without reviving scores',()=>{
 const data:PicksResponse={contract:'public-daily-observations-v1',observations:{equity:[{symbol:'AAA',assetClass:'equity',scanDate:'2026-10-07',price:100,changePercent:1.5,priceBasis:'daily_bar_close',priceBasisLabel:'daily bar close',indicators:{rsi:0},dataQuality:{level:'GOOD',freshness:'fresh',dataAsOf:'2026-10-07T20:00:00Z'}}]}};
 const rows=topPicks(data,'equity');expect(rows.map(r=>r.symbol)).toEqual(['AAA']);
 expect(pickStamp(rows[0])).toMatchObject({price:100,data_as_of:'2026-10-07T20:00:00Z',priceBasis:'daily_bar_close'});
 expect(findSymbolPick(data,'AAA','equity')).toEqual(rows[0]);expect(findSymbolPick(data,'AAA','crypto')).toBeNull();
 expect(rows[0]).not.toHaveProperty('score');expect(rows[0]).not.toHaveProperty('canonical');
});
