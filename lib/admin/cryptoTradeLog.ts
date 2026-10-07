import type {BacktestTrade} from './cryptoBacktest';
import {btcDownFilter,type RsTag} from './cryptoMarketRegime';
import type {ShadowState} from './cryptoPaperShadow';
import {giveBack} from './cryptoExcursion';
type Cell=string|number|boolean|null|undefined;
/** RFC 4180 quoting; text starting with = + - @ is prefixed so spreadsheets never evaluate it as a formula. */
export function csvCell(v:Cell):string{
 if(v==null||(typeof v==='number'&&!Number.isFinite(v)))return '';
 if(typeof v==='number'||typeof v==='boolean')return String(v);
 const s=/^[=+\-@\t\r]/.test(v)?`'${v}`:v;
 return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}
export function toCsv(headers:string[],rows:Cell[][]):string{return [headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';}
export type PaperLogRow={order_id:string;symbol:string;instrument_type:string;created_reason:string|null;filled_at:string|Date|null;filled_price:string|number|null;quantity:string|number|null;notional_value:string|number|null;stop_loss:string|number|null;take_profit_1:string|number|null;position_id:string|null;position_status:string|null;current_price:string|number|null;unrealised_pnl:string|number|null;exit_time:string|Date|null;exit_price:string|number|null;exit_reason:string|null;realised_pnl:string|number|null;r_multiple:string|number|null;fees_estimate:string|number|null;outcome:string|null};
const iso=(v:string|Date|null|undefined)=>v==null?null:new Date(v).toISOString();
const num=(v:unknown)=>v==null||v===''?null:Number(v);
export const PAPER_LOG_HEADERS=['simulated','order_id','opened_at','coin','venue','pair','setup','signal_candle','why_entered','relative_volume','signal_change_pct','reward_risk_at_entry','btc_trend','shadow_filter_btc_down','btc_200d_regime','rs_excess_30d_vs_btc','rs_tercile','coin_above_50d','rs_leader_rule','flow_state','taker_buy_share_4h','taker_buy_share_24h','long_liq_usd_24h','short_liq_usd_24h','liq_coverage_hours','funding_state','funding_rate_8h','oi_change_24h_pct','derivatives_flags','correlation_risk_scale','correlated_with','liquidity_capped','pair_volume_24h_usd','entry_quote_ask','entry_price','stop','target','quantity','notional_usd','planned_risk_usd','status','exit_time','exit_price','exit_reason','outcome','realised_pnl_usd','r_multiple','fees_usd','open_pnl_usd','last_mark','shadow_plan','shadow_status','shadow_r','shadow_final_exit','shadow_v3_status','shadow_v3_r','shadow_v3_final_exit','shadow_v4_status','shadow_v4_r','shadow_v4_final_exit','mfe_r','mae_r','give_back','shadow_v5_status','shadow_v5_r','shadow_v5_final_exit','shadow_v6_status','shadow_v6_r','shadow_v6_final_exit','shadow_v7_status','shadow_v7_r','shadow_v7_final_exit'];
/**
 * One row per filled paper order: the evidence it was opened on, and the ledger's (and shadows') outcome. Missing evidence stays blank.
 * `shadows` is keyed `${positionId}|${plan}`; a legacy map keyed by position id alone is read as the v2/v1 slot.
 */
/** excursions: position id -> fixed-plan MFE/MAE (net R) and give-back from crypto_trade_excursions; blank when not tracked. */
export function paperTradeLog(rows:PaperLogRow[],shadows:Map<string,ShadowState>,excursions:Record<string,{mfeR:number|null;maeR:number|null;giveBack:number|null}>={}):string{
 const shadow=(positionId:string|null,plan:string)=>positionId?shadows.get(`${positionId}|${plan}`):undefined;
 return toCsv(PAPER_LOG_HEADERS,rows.map(r=>{
  let e:Record<string,any>={};try{const s=r.created_reason??'';e=JSON.parse(s.slice(s.indexOf('{')));}catch{e={};}
  const sh=shadow(r.position_id,'partial-trail-v2')??shadow(r.position_id,'partial-trail-v1')??(r.position_id?shadows.get(r.position_id):undefined),closed=r.exit_time!=null;
  const v3=shadow(r.position_id,'failed-breakout-trail-v3'),v4=shadow(r.position_id,'trail-only-v4'),later=['ratchet-v5','half2r-trail3-v6','chandelier3-v7'].map(p=>shadow(r.position_id,p));
  return [true,r.order_id,iso(r.filled_at),r.symbol,({gdax:'Coinbase',okex:'OKX'} as Record<string,string>)[e.pair?.exchange]??e.pair?.exchange,e.pair?.product,e.signal?.kind,e.signal?.asOf,e.signal?.reason,e.signal?.relativeVolume,e.signal?.changePct,e.plan?.rewardRisk,
   e.btcRegime?.state,e.shadowFilter?.decision??btcDownFilter(e.btcRegime?.state),e.btcRegime?.longTrend,e.relativeStrength?.excess,e.relativeStrength?.tercile,e.relativeStrength?.above50,e.relativeStrength?.rule,e.flow?.state,e.flow?.takerBuyShare4h,e.flow?.takerBuyShare24h,e.flow?.liqLongUsd24h,e.flow?.liqShortUsd24h,e.flow?.liqCoverageHours,e.derivatives?.fundingState,e.derivatives?.fundingRate,e.derivatives?.oiChange24hPct,(e.derivatives?.flags??[]).join(' '),e.correlation?.scale,(e.correlation?.correlated??[]).map((c:{coin:string;rho:number})=>`${c.coin}:${c.rho}`).concat((e.correlation?.unavailable??[]).map((c:string)=>`${c}:unavailable`)).join(' '),
   e.liquidity?.capped,e.liquidity?.volumeUsd,e.quote?.ask,num(r.filled_price),num(r.stop_loss),num(r.take_profit_1),num(r.quantity),num(r.notional_value),e.plan?.risk,
   closed?'CLOSED':r.position_status??'UNKNOWN',iso(r.exit_time),num(r.exit_price),r.exit_reason,r.outcome,num(r.realised_pnl),num(r.r_multiple),num(r.fees_estimate),
   closed?null:num(r.unrealised_pnl),closed?null:num(r.current_price),sh?.plan,sh?.status,sh?.r,sh?.legs.at(-1)?.reason,v3?.status,v3?.r,v3?.legs.at(-1)?.reason,v4?.status,v4?.r,v4?.legs.at(-1)?.reason,...(x=>[x?.mfeR,x?.maeR,x?.giveBack])(r.position_id?excursions[r.position_id]:undefined),...later.flatMap(v=>[v?.status,v?.r,v?.legs.at(-1)?.reason])];
 }));
}
export const BACKTEST_LOG_HEADERS=['simulated','backtest','coin','pair','setup','signal_candle','entry_time','entry_price','stop','target','btc_trend','shadow_filter_btc_down','btc_200d_regime','breadth_above_50d','bull_gate','rs_excess_30d_vs_btc','rs_tercile','coin_above_50d','rs_leader_rule','window_half','fixed_status','fixed_exit','fixed_exit_time','fixed_r','fixed_marked_to_market','shadow_plan','shadow_status','shadow_r','shadow_final_exit','no_trade_candles_filled','jev_status','jev_chase','jev_btc_headwind','chart_status','chart_clean_base','chart_strong_close','chart_volume_expansion','chart_overhead_supply','mfe_r','mae_r','give_back'];
export function backtestTradeLog(trades:BacktestTrade[],tags=new Map<string,{breadth:number|null;gate:string;rs?:RsTag}>()):string{
 return toCsv(BACKTEST_LOG_HEADERS,trades.map(t=>[true,true,t.coin,t.product,t.kind,t.signalAt,t.entryAt,t.fill,t.stop,t.target,t.btcRegime,btcDownFilter(t.btcRegime),t.btc200,tags.get(t.id)?.breadth,tags.get(t.id)?.gate,tags.get(t.id)?.rs?.excess,tags.get(t.id)?.rs?.tercile,tags.get(t.id)?.rs?.above50,tags.get(t.id)?.rs?.rule,t.half,t.fixed.status,t.fixed.exit,t.fixed.at,t.fixed.r,!!t.fixed.marked,t.shadow.plan,t.shadow.status,t.shadow.r,t.shadow.legs.at(-1)?.reason,t.filledBars??0,
  t.jev?t.jev.status==='scored'?'scored':`unavailable:${t.jev.reason??''}`:null,t.jev?.chase,t.jev?.btcHeadwind,t.chart?t.chart.status==='scored'?'scored':`unavailable:${t.chart.reason??''}`:null,t.chart?.cleanBase,t.chart?.strongClose,t.chart?.volumeExpansion,t.chart?.overheadSupply,t.excursion?.mfeR,t.excursion?.maeR,giveBack(t.excursion?.mfeR,t.fixed.r)]));
}
