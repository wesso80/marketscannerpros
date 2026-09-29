import {it,expect} from 'vitest';
import {summarizeCryptoPaper,type CryptoStatsRow} from '@/lib/admin/cryptoPaperStats';
const reason=(kind:string,regime?:string)=>`crypto-v1|x|X-USD|t|`+JSON.stringify({signal:{kind},...(regime?{btcRegime:{state:regime}}:{})});
const row=(r:number,kind:string,regime?:string,instrument='coinbase:X-USD'):CryptoStatsRow=>({r_multiple:String(r),realised_pnl:String(r*500),outcome:r>0?'WIN':'LOSS',exit_reason:r>0?'TAKE_PROFIT':'STOP_LOSS',instrument_type:instrument,entry_time:'2026-09-28T00:00:00Z',exit_time:'2026-09-28T06:00:00Z',created_reason:reason(kind,regime)});
it('computes expectancy in R and groups by setup, venue and recorded BTC trend',()=>{
 const s=summarizeCryptoPaper([row(2,'BREAKOUT','UP'),row(-1,'BREAKOUT','DOWN'),row(-1,'CONTINUATION','DOWN',"okx-usd-v1:X-USDT"),row(2,'CONTINUATION')]);
 expect(s.overall).toMatchObject({trades:4,winRate:.5,avgR:.5,avgWinR:2,avgLossR:-1,profitFactor:2,netPnl:1000,avgHoldHours:6});
 expect(s.byBtcRegime.find(g=>g.label==='DOWN')).toMatchObject({trades:2,avgR:-1});
 expect(s.byBtcRegime.find(g=>g.label==='NOT_RECORDED')?.trades).toBe(1);
 expect(s.byVenue.map(g=>g.label).sort()).toEqual(['Coinbase USD','OKX USDT→USD']);
 expect(s.bySetup.find(g=>g.label==='BREAKOUT')?.trades).toBe(2);
});
it('labels small samples as insufficient and never invents R for missing values',()=>{
 const s=summarizeCryptoPaper([{...row(1,'BREAKOUT'),r_multiple:null,created_reason:'not json'}]);
 expect(s.sample).toBe('INSUFFICIENT');expect(s.overall).toMatchObject({trades:1,withR:0,avgR:null,winRate:null});
 expect(s.bySetup[0].label).toBe('NOT_RECORDED');
 expect(summarizeCryptoPaper([]).sample).toBe('NO_TRADES');
 expect(summarizeCryptoPaper(Array.from({length:30},()=>row(1,'BREAKOUT'))).sample).toBe('EARLY');
});
