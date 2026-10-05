import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {symbolHref} from '@/lib/market/links';
import {scannerAssetType} from '@/lib/market/assets';
it('builds Symbol links with encoded identity and timeframe',()=>expect(symbolHref('btc/usd','crypto','4h')).toBe('/tools/golden-egg?symbol=BTC%2FUSD&type=crypto&timeframe=4h'));
it('has a URL-driven market selector with safe defaults',()=>{
 expect(scannerAssetType(null)).toBe('crypto');expect(scannerAssetType('equity')).toBe('equity');expect(scannerAssetType('forex')).toBe('equity');
 const s=readFileSync('app/tools/scanner/page.tsx','utf8');expect(s).toContain('aria-label="Market"');expect(s).toContain("params.set('type',asset)");expect(s).toContain('function ScannerRowStamp');expect(s).toContain('<ScannerRowStamp row={row}');expect(s).toContain('router.push(symbolHref(r.symbol');
});
