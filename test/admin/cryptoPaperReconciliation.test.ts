import {expect,it} from 'vitest';
import {reconcileCryptoPaper} from '@/lib/admin/cryptoPaperReconciliation';
import type {ArcaPortfolio,ArcaPosition} from '@/lib/admin/portfolio-lab/types';
const p={startingBalance:1000,currentCash:899.95,totalEquity:1009.95,realisedPnl:-.05} as ArcaPortfolio;
const position={side:'LONG',assetClass:'crypto',averageEntry:100,currentPrice:110,quantity:1,entryFee:.05} as ArcaPosition;
it('reconciles an open position without counting unrealised P&L twice',()=>{
 expect(reconcileCryptoPaper(p,[position],{net:0,fees:0,count:0,invalid:0})).toMatchObject({status:'MATCHED',expectedCash:899.95,expectedEquity:1009.95,expectedRealised:-.05});
});
it('reconciles a closed round trip including both fees',()=>{
 expect(reconcileCryptoPaper({...p,currentCash:1009.89,totalEquity:1009.89,realisedPnl:9.89},[],{net:9.89,fees:.11,count:1,invalid:0})).toMatchObject({status:'MATCHED',closedTrades:1,closedFees:.11});
});
it('flags cash drift and independently invalid closed trades',()=>{
 expect(reconcileCryptoPaper({...p,currentCash:900},[position],{net:0,fees:0,count:0,invalid:1}).status).toBe('MISMATCH');
 expect(reconcileCryptoPaper({...p,currentCash:999},[position],{net:0,fees:0,count:0,invalid:0}).status).toBe('MISMATCH');
});
it('does not invent a missing entry fee',()=>{
 expect(reconcileCryptoPaper(p,[{...position,entryFee:undefined}],{net:0,fees:0,count:0,invalid:0}).status).toBe('UNAVAILABLE');
});
