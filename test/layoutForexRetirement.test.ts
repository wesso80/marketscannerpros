import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DAILY_SCAN_ASSETS,parseDailyScanAssets} from '@/lib/scanner/dailyScanAssets';
import {scannerAssetType} from '@/lib/market/assets';
import TradeTable from '@/components/journal/layer2/TradeTable';
const read=(p:string)=>readFileSync(p,'utf8');
it('does not schedule or produce new forex scans',()=>{
 expect(DAILY_SCAN_ASSETS).toEqual(['equity','crypto']);expect(parseDailyScanAssets('crypto,forex')).toEqual(['crypto']);
 expect(read('app/api/jobs/scan-daily/route.ts')).not.toContain('await scanForex(');
 expect(read('lib/worker/schedule.ts')).not.toContain('assets=crypto,forex');
 expect(read('worker/ingest-data.ts')).toContain("COALESCE(asset_type, 'equity') <> 'forex'");
});
it('falls back to Stocks for retired or unknown preferences',()=>{
 expect(scannerAssetType('forex')).toBe('equity');expect(scannerAssetType('unknown')).toBe('equity');expect(scannerAssetType(null)).toBe('crypto');
});
it('renders legacy journal rows without changing the stored asset',()=>{
 const row:any={id:'old',symbol:'EURUSD',assetClass:'forex',side:'long',status:'closed',tradeType:'Spot',entry:{price:1.1,ts:'2026-09-01'},qty:1,targets:[]};
 const html=renderToStaticMarkup(createElement(TradeTable,{rows:[row],sort:{key:'entry_ts',dir:'desc'},onSort:vi.fn(),onSelectTrade:vi.fn(),onQuickClose:vi.fn(),loading:false,error:null}));
 expect(html).toContain('Forex (retired)');expect(row.assetClass).toBe('forex');
});
it('does not offer forex for new alert entries',()=>expect(read('components/AlertsWidget.tsx')).not.toContain('<option value="forex">'));
it('does not mention forex in watchlist add options or site metadata',()=>{
 const watchlist=read('components/WatchlistWidget.tsx');
 const form=watchlist.slice(watchlist.indexOf('id="add-symbol-title"'),watchlist.indexOf('onClick={addSymbol}'));
 expect(form.toLowerCase()).not.toContain('forex');
 const layout=read('app/layout.tsx');
 const metadata=layout.slice(layout.indexOf('export const metadata'),layout.indexOf('export const viewport'));
 expect(metadata.toLowerCase()).not.toContain('forex');
});
