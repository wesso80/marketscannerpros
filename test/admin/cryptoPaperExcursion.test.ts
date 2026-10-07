import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';

type Row={position_id:string;status:string;state:any;mfe_r:number|null;mae_r:number|null;final_r:number|null;give_back:number|null;risk_usd:number|null;symbol:string;instrument_type:string;portfolio_id:string};
const db={rows:new Map<string,Row>(),trades:[] as any[],marks:[] as any[]};
vi.mock('@/lib/db',()=>({q:vi.fn(async(sql:string,p:any[]=[])=>{
 if(/^CREATE/.test(sql.trim()))return [];
 if(/INSERT INTO crypto_trade_excursions/.test(sql)){const [position_id,,portfolio_id,symbol,instrument_type,,status,state,mfe_r,mae_r,final_r,give_back,risk_usd]=p;
  db.rows.set(position_id,{position_id,portfolio_id,symbol,instrument_type,status,state:state?JSON.parse(state):null,mfe_r,mae_r,final_r,give_back,risk_usd});return [];}
 if(/INSERT INTO crypto_book_marks/.test(sql)){db.marks.push({at:p[2],open_pnl:p[3],peak_open_profit:p[4]});return [];}
 if(/FROM crypto_trade_excursions WHERE portfolio_id=\$1 AND status='OPEN'/.test(sql))return [...db.rows.values()].filter(r=>r.portfolio_id===p[0]&&r.status==='OPEN');
 if(/FROM arca_trades WHERE workspace_id=\$1 AND portfolio_id=\$2 AND position_id::text = ANY/.test(sql))return db.trades.filter(t=>p[2].includes(t.position_id));
 if(/SELECT symbol,instrument_type FROM crypto_trade_excursions WHERE position_id=\$1/.test(sql)){const r=db.rows.get(p[0]);return r?[r]:[];}
 if(/LEFT JOIN crypto_trade_excursions x ON x.position_id=t.position_id::text/.test(sql))return [];
 if(/SELECT position_id,mfe_r,risk_usd FROM crypto_trade_excursions WHERE position_id = ANY/.test(sql))return [...db.rows.values()].filter(r=>p[0].includes(r.position_id));
 if(/FROM crypto_trade_excursions WHERE portfolio_id=\$1$/.test(sql.trim()))return [...db.rows.values()].filter(r=>r.portfolio_id===p[0]);
 if(/FROM crypto_book_marks WHERE portfolio_id=\$1 ORDER BY at/.test(sql))return db.marks;
 throw Error('unexpected SQL in test: '+sql);
})}));
const S=900000,T0=Date.UTC(2026,9,7,0,0);
const bar=(k:number,high:number,low:number)=>({openAt:T0+k*S,closeAt:T0+(k+1)*S,open:low,high,low,close:low});
vi.mock('@/lib/admin/cryptoPaperMarket',()=>({fetchPaperPath:vi.fn(async()=>({candles:[]})),fetchCoinbaseCandles:vi.fn(async()=>[])}));
vi.mock('@/lib/admin/cryptoPaperOkx',()=>({fetchOkxUsdPath:vi.fn(async()=>({candles:[]}))}));
import {trackExcursions,giveBackView,EXCURSION_DDL,excursionDdlStatements} from '@/lib/admin/cryptoPaperExcursion';

const pos={id:'p1',symbol:'sol',instrumentType:'coinbase:SOL-USD',averageEntry:100,initialStopLoss:90,stopLoss:90,openedAt:new Date(T0+5*60000).toISOString(),quantity:10,unrealisedPnl:50};
describe('paper give-back tracking (research only)',()=>{
 beforeEach(()=>{db.rows.clear();db.trades=[];db.marks=[];});
 it('migration file matches the code DDL (two tables, one index)',()=>{
  expect(EXCURSION_DDL).toBe(readFileSync('migrations/121_crypto_trade_excursions.sql','utf8'));
  expect(excursionDdlStatements()).toHaveLength(3);
 });
 it('tracks an open position from the monitor candles, then finalises it when the ledger trade closes',async()=>{
  const notes:string[]=[];
  // Cycle 1 at T0+3 bars: entry candle high 130 is pre-fill (ignored); later high 120 -> MFE 2R (zero-cost check below uses net).
  await trackExcursions('w',{id:'book',totalEquity:10000},[pos],new Map([['p1',[bar(0,130,95),bar(1,112,99),bar(2,120,97)]]]),notes,T0+3*S);
  const open=db.rows.get('p1')!;
  expect(open.status).toBe('OPEN');expect(open.mfe_r).toBeGreaterThan(1.9);expect(open.mfe_r).toBeLessThan(2);expect(open.mae_r).toBeLessThan(-0.5);
  expect(open.risk_usd).toBe(100);
  expect(db.marks).toHaveLength(1);expect(db.marks[0].peak_open_profit).toBeGreaterThan(190);
  // Cycle 2: position closed by a stop inside bar 4; bars after the exit are wild and must not count.
  db.trades=[{position_id:'p1',exit_time:new Date(T0+5*S),exit_price:90,exit_reason:'STOP_LOSS',r_multiple:-1.02}];
  await trackExcursions('w',{id:'book',totalEquity:9900},[],new Map([['p1',[bar(3,115,101),bar(4,999,1),bar(5,999,1)]]]),notes,T0+8*S);
  const closed=db.rows.get('p1')!;
  expect(closed.status).toBe('CLOSED');expect(closed.final_r).toBe(-1.02);
  expect(closed.mfe_r).toBe(open.mfe_r); // bar 4 (exit bar) and bar 5 (after exit) excluded
  expect(closed.give_back).toBeCloseTo((closed.mfe_r!+1.02)/closed.mfe_r!,2);
  expect(notes.filter(n=>/skipped|unavailable/i.test(n))).toEqual([]);
 });
 it('never throws and never invents a row when the original stop is missing',async()=>{
  const notes:string[]=[];
  await trackExcursions('w',{id:'book',totalEquity:1},[{...pos,id:'p2',initialStopLoss:null,stopLoss:null}],new Map(),notes,T0+3*S);
  expect(db.rows.get('p2')).toMatchObject({status:'UNAVAILABLE',mfe_r:null,mae_r:null});
 });
 it('read model reports the book give-back and open P&L peak once the tables exist',async()=>{
  await trackExcursions('w',{id:'book',totalEquity:10000},[pos],new Map([['p1',[bar(0,101,99),bar(1,120,99)]]]),[],T0+2*S);
  const v=await giveBackView('book',[pos]);
  expect(v?.open[0]).toMatchObject({positionId:'p1',currentR:0.5});
  expect(v?.book.peakOpenProfitUsd).toBeGreaterThan(190);expect(v?.book.currentOpenPnlUsd).toBe(50);
  expect(v?.openPnlPeak.marks).toBe(1);
 });
});
