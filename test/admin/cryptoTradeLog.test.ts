import {it,expect} from 'vitest';
import {csvCell,paperTradeLog,backtestTradeLog,PAPER_LOG_HEADERS,type PaperLogRow} from '@/lib/admin/cryptoTradeLog';
it('quotes CSV cells and neutralises spreadsheet formulas',()=>{
 expect(csvCell('a,b')).toBe('"a,b"');expect(csvCell('say "hi"')).toBe('"say ""hi"""');
 expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);expect(csvCell('-5% move')).toBe("'-5% move");
 expect(csvCell(-1.02)).toBe('-1.02');expect(csvCell(null)).toBe('');expect(csvCell(NaN)).toBe('');
});
const base:PaperLogRow={order_id:'o1',symbol:'solana',instrument_type:'coinbase:SOL-USD',created_reason:'crypto-v1|solana|SOL-USD|t|'+JSON.stringify({signal:{kind:'BREAKOUT',asOf:'2026-09-29T04:00:00.000Z',reason:'Completed 4h 20-bar breakout, 1.5x volume',relativeVolume:2.1,changePct:3.2},pair:{exchange:'gdax',product:'SOL-USD'},plan:{rewardRisk:1.8,risk:480},btcRegime:{state:'UP'},derivatives:{fundingState:'NEUTRAL',fundingRate:.0001,flags:['LEVERAGE_DRIVEN']},correlation:{scale:.71,correlated:[{coin:'eth',rho:.82}],unavailable:[]},liquidity:{capped:false,volumeUsd:5e7},quote:{ask:150}}),
 filled_at:'2026-09-29T04:15:00Z',filled_price:'150.1',quantity:'10',notional_value:'1501',stop_loss:'140',take_profit_1:'170',position_id:'p1',position_status:'CLOSED',current_price:null,unrealised_pnl:null,exit_time:'2026-09-30T02:00:00Z',exit_price:'169.8',exit_reason:'TAKE_PROFIT',realised_pnl:'195.2',r_multiple:'1.93',fees_estimate:'1.6',outcome:'WIN'};
it('writes one row per paper order with entry evidence, outcome and shadow result',()=>{
 const csv=paperTradeLog([base,{...base,order_id:'o2',created_reason:null,position_id:'p2',position_status:'OPEN',exit_time:null,exit_price:null,exit_reason:null,realised_pnl:null,r_multiple:null,outcome:null,unrealised_pnl:'12.5',current_price:'151'}],
  new Map([['p1',{plan:'partial-trail-v2',status:'CLOSED',r:2.4,legs:[{reason:'PARTIAL_TARGET'},{reason:'TRAIL_STOP'}]} as never]]));
 const [head,row1,row2]=csv.trim().split('\r\n');
 expect(head.split(',')).toEqual(PAPER_LOG_HEADERS);
 const cols=(r:string)=>Object.fromEntries(PAPER_LOG_HEADERS.map((h,i)=>[h,r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)[i]]));
 expect(cols(row1)).toMatchObject({simulated:'true',venue:'Coinbase',setup:'BREAKOUT',why_entered:'"Completed 4h 20-bar breakout, 1.5x volume"',btc_trend:'UP',funding_state:'NEUTRAL',derivatives_flags:'LEVERAGE_DRIVEN',correlated_with:'eth:0.82',status:'CLOSED',exit_reason:'TAKE_PROFIT',r_multiple:'1.93',shadow_plan:'partial-trail-v2',shadow_r:'2.4',shadow_final_exit:'TRAIL_STOP'});
 // Missing evidence stays blank; open trades show their mark instead of an exit.
 expect(cols(row2)).toMatchObject({setup:'',btc_trend:'',status:'OPEN',exit_reason:'',open_pnl_usd:'12.5',last_mark:'151'});
});
it('exports backtest trades with both exit plans',()=>{
 const csv=backtestTradeLog([{id:'x',coin:'sol',product:'SOL-USD',kind:'CONTINUATION',signalAt:'s',entryAt:'e',fill:1,stop:.9,target:1.2,btcRegime:'DOWN',btc200:'BEAR',half:'SECOND',filledBars:2,fixed:{status:'CLOSED',r:-1.03,exit:'STOP_LOSS',at:'z'},shadow:{plan:'partial-trail-v2',status:'CLOSED',r:-1.03,legs:[{reason:'STOP'}]}}],new Map([['x',{breadth:.35,gate:'OFF'}]]));
 expect(csv.trim().split('\r\n')[1]).toBe('true,true,sol,SOL-USD,CONTINUATION,s,e,1,0.9,1.2,DOWN,BEAR,0.35,OFF,SECOND,CLOSED,STOP_LOSS,z,-1.03,false,partial-trail-v2,CLOSED,-1.03,STOP,2');
});
