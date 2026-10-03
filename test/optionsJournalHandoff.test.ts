import { describe, it, expect } from 'vitest';
import { optionJournalParams } from '@/lib/options/journalHandoff';
import { enrichTradesWithLivePrices, journalQuoteRequest } from '@/lib/journal/markToMarket';
import type { TradeRowModel } from '@/types/journal';

describe('option buyer journal handoff', () => {
  it.each(['call', 'put'] as const)('preserves %s identity and a long premium position', (type) => {
    const p = optionJournalParams('AAPL', { type, strike: 335, expiration: '2026-10-05', ask: 1.29 }, 'scenario');
    expect(Object.fromEntries(p)).toMatchObject({side:'LONG', tradeType:'Options', optionType:type.toUpperCase(), strikePrice:'335', expirationDate:'2026-10-05', quantity:'1', entryPrice:'1.29'});
    const trade = { id:'fixture', symbol:'AAPL', assetClass:'options', tradeType:p.get('tradeType'), side:p.get('side')!.toLowerCase(), qty:1, status:'open', entry:{price:Number(p.get('entryPrice'))}, option:{right:type.toUpperCase(),strike:335,expiration:'2026-10-05'} } as TradeRowModel;
    const key=journalQuoteRequest(trade)!.key;
    const [marked]=enrichTradesWithLivePrices([trade], {[key]:{price:1.79,observedAt:null,retrievedAt:'2026-10-02'}});
    expect(marked.pnlUsd).toBeCloseTo(50);
  });
  it('does not invent an ask from a missing or invalid quote',()=>{
    expect(()=>optionJournalParams('AAPL',{type:'put',strike:335,expiration:'2026-10-05',ask:0},'analysis')).toThrow();
  });
});
