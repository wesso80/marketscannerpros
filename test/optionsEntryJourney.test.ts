import {expect,it} from 'vitest';
import {optionsEntrySymbol,optionsTerminalUrl} from '@/lib/options/journey';
it('opens a bare options link on SPY despite a remembered crypto ticker',()=>{
 expect(optionsEntrySymbol('options-terminal','','','BTCUSD')).toBe('SPY');
 expect(optionsEntrySymbol('options-flow','AAPL','','BTCUSD')).toBe('AAPL');
 expect(optionsEntrySymbol('crypto','','crypto','ETHUSD')).toBe('ETHUSD');
 const url=new URL(optionsTerminalUrl({symbol:'AAPL',expiry:'2026-10-09'}),'https://fixture');
 expect(url.searchParams.get('tab')).toBe('options-terminal');expect(url.searchParams.get('symbol')).toBe('AAPL');expect(url.searchParams.get('expiry')).toBe('2026-10-09');
});
