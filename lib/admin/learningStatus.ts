import type {Redis} from '@upstash/redis';
import {adminDiscoveryOnly} from './discoveryOnly';
import {jevConfigured} from './jevClient';
import {JEV_STAGES} from './cryptoJev';
import {jevCoverage} from './cryptoJevEvidence';
import {EARLY_SCAN_KEY,FORWARD_BOOK_KEY,MOMENTUM_SCAN_KEY,forwardResolved,type ForwardBook} from './cryptoForwardScore';
import {calibrationFiledKey,calibrationLedgerKey,type CalibrationLedger} from './cryptoCalibration';
import {SHADOW,shadowWeightsKey,type ShadowWeights} from './cryptoShadowScore';
import type {MomentumScan} from './cryptoVolumeMomentum';
/**
 * One read-only health view of the crypto Jev learning loop: which stamps are being written, whether they are scoring,
 * why they are not, and what each one is graded against. Nothing here calls a provider or Jev. CoinGecko and the
 * exchanges are the only market-data sources; no Alpha Vantage.
 */
export type LearningState='ok'|'collecting'|'attention'|'paused'|'off';
export type LearningItem={id:string;label:string;state:LearningState;summary:string;lastAt:string|null;gradedAgainst:string;where:string;next:string|null;counts:Record<string,number>};
export type LearningStatus={checkedAt:string;mode:{discoveryOnly:boolean;jevKey:boolean};items:LearningItem[];shadowWeights:ShadowWeights|null};
const ago=(iso:string|null|undefined,now:number)=>iso&&Number.isFinite(Date.parse(iso))?Math.round((now-Date.parse(iso))/60000):null;
const reasons=(r:Record<string,number>)=>Object.entries(r).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(', ');
function stampCoverage(rows:MomentumScan['rows']){
 const named=rows.filter(r=>JEV_STAGES.includes(r.stage as typeof JEV_STAGES[number]));
 const jev=jevCoverage(named.map(r=>r.jev));
 const cat={scored:0,noHeadlines:0,unavailable:0,unstamped:0,reasons:{} as Record<string,number>,detail:null as string|null};
 const chart={scored:0,noBars:0,unavailable:0,unstamped:0,reasons:{} as Record<string,number>};
 for(const r of named){
  const c=r.catalyst;
  if(!c)cat.unstamped++;
  else if(c.status==='scored')cat.scored++;else if(c.status==='no-headlines')cat.noHeadlines++;else{cat.unavailable++;const k=c.reason??'not recorded';cat.reasons[k]=(cat.reasons[k]??0)+1;if(!cat.detail&&c.detail)cat.detail=c.detail;}
  const ch=r.chart;
  if(!ch)chart.unstamped++;
  else if(ch.status==='scored')chart.scored++;else if(ch.reason==='no-bars')chart.noBars++;else{chart.unavailable++;const k=ch.reason??'not recorded';chart.reasons[k]=(chart.reasons[k]??0)+1;}
 }
 return {named:named.length,jev,cat,chart};
}
export async function learningStatus(redis:Redis|null,workspaceId:string,now=Date.now()):Promise<LearningStatus>{
 const items:LearningItem[]=[];
 const jevKey=jevConfigured(),discoveryOnly=adminDiscoveryOnly();
 const [four,early,book,ledger,filed,weights]=redis&&workspaceId?await Promise.all([redis.get<MomentumScan>(MOMENTUM_SCAN_KEY),redis.get<MomentumScan>(EARLY_SCAN_KEY),redis.get<ForwardBook>(FORWARD_BOOK_KEY),redis.get<CalibrationLedger>(calibrationLedgerKey(workspaceId)),redis.get<Record<string,string>>(calibrationFiledKey(workspaceId)),redis.get<ShadowWeights>(shadowWeightsKey(workspaceId))]):[null,null,null,null,null,null];
 // 1. Jev shadow on crypto setups
 const c4=stampCoverage(four?.rows??[]),c1=stampCoverage(early?.rows??[]);
 const shadowScored=c4.jev.scored+c1.jev.scored,shadowUnavailable=c4.jev.unavailable+c1.jev.unavailable,shadowUnstamped=c4.jev.unscored+c1.jev.unscored,shadowNamed=c4.named+c1.named;
 const shadowReasons={...c4.jev.reasons};for(const [k,v] of Object.entries(c1.jev.reasons))shadowReasons[k]=(shadowReasons[k]??0)+v;
 items.push({id:'shadow',label:'Jev shadow on crypto setups (jev-shadow-v2)',
  state:!jevKey?'off':!shadowNamed?'collecting':shadowUnavailable>shadowScored?'attention':'ok',
  summary:!jevKey?'AI_GATEWAY_API_KEY is not set on this deployment; no row is scored.':!shadowNamed?'No named setups in the saved 4h/1h scans yet.':`${shadowScored} scored · ${shadowUnavailable} unavailable${Object.keys(shadowReasons).length?` (${reasons(shadowReasons)})`:''} · ${shadowUnstamped} not yet stamped, across ${shadowNamed} named rows.`,
  lastAt:four?.updatedAt??early?.updatedAt??null,gradedAgainst:'paper R (closed trades) and forward 4h / 24h marks',where:'Setups tab → Jev column; Paper account → By Jev; Learning → ledger',next:shadowUnavailable>shadowScored&&shadowReasons.parse?'Gateway answers are not parsing: check the question type (boolean vs noul).':null,counts:{named:shadowNamed,scored:shadowScored,unavailable:shadowUnavailable,unstamped:shadowUnstamped}});
 // 2. Catalyst stamp
 const catScored=c4.cat.scored+c1.cat.scored,catNone=c4.cat.noHeadlines+c1.cat.noHeadlines,catUnavailable=c4.cat.unavailable+c1.cat.unavailable,catUnstamped=c4.cat.unstamped+c1.cat.unstamped;
 const catReasons={...c4.cat.reasons};for(const [k,v] of Object.entries(c1.cat.reasons))catReasons[k]=(catReasons[k]??0)+v;
 const catDetail=c4.cat.detail??c1.cat.detail;
 const catTop=Object.entries(catReasons).sort((a,b)=>b[1]-a[1])[0]?.[0];
 items.push({id:'catalyst',label:'Catalyst stamp on crypto setups (jev-catalyst-v2, CoinGecko headlines)',
  state:!jevKey?'off':!shadowNamed?'collecting':catUnavailable>catScored+catNone?'attention':'ok',
  summary:!jevKey?'AI_GATEWAY_API_KEY is not set; headlines are fetched but not scored.':`${catScored} scored · ${catNone} no headlines · ${catUnavailable} unavailable${Object.keys(catReasons).length?` (${reasons(catReasons)})`:''} · ${catUnstamped} not yet stamped.${catDetail?` Detail: “${catDetail}”`:''}`,
  lastAt:four?.updatedAt??early?.updatedAt??null,gradedAgainst:'paper R and forward 24h mark',where:'Setups tab → Catalyst column; Learning → ledger (catalyst.* fields)',
  next:catTop==='cg-paused'?'CoinGecko credits are below the pause threshold, so no headline call is made. Nothing to fix; it resumes when credits allow.':catTop==='cg-unavailable'||catTop==='cg-error'?'CoinGecko /news?coin_id is not answering. Check the plan includes the news endpoint (Analyst) and the Market data tab’s credit status.':catTop==='cg-bad-shape'?'CoinGecko /news returned an unexpected shape; the parser accepts flat and {data:[{attributes}]} forms, so the response needs a look.':null,
  counts:{scored:catScored,noHeadlines:catNone,unavailable:catUnavailable,unstamped:catUnstamped}});
 // 2b. Chart confirmer: needs the 25 stored candles; a scan that kept only the signal candle is no-bars, not a failure.
 const chScored=c4.chart.scored+c1.chart.scored,chNoBars=c4.chart.noBars+c1.chart.noBars,chUnavailable=c4.chart.unavailable+c1.chart.unavailable,chUnstamped=c4.chart.unstamped+c1.chart.unstamped;
 const chReasons={...c4.chart.reasons};for(const [k,v] of Object.entries(c1.chart.reasons))chReasons[k]=(chReasons[k]??0)+v;
 items.push({id:'chart',label:'Chart confirmer on crypto setups (jev-chart-v1, stored candles)',
  state:!jevKey?'off':!shadowNamed?'collecting':chUnavailable>chScored?'attention':chScored?'ok':'collecting',
  summary:!jevKey?'AI_GATEWAY_API_KEY is not set; no chart read is scored.':`${chScored} scored · ${chNoBars} no stored bars · ${chUnavailable} unavailable${Object.keys(chReasons).length?` (${reasons(chReasons)})`:''} · ${chUnstamped} not yet stamped. Four reads per setup: clean base, strong close, volume expansion, overhead supply.`,
  lastAt:four?.updatedAt??early?.updatedAt??null,gradedAgainst:'paper R and forward 24h mark (chart.* fields)',where:'Setups tab → Evidence column and chart badge; Learning → ledger',
  next:chNoBars&&!chScored?'Rows scored so far carried only the signal candle. The next 4h window stores all 25 candles and the read runs on them.':null,
  counts:{scored:chScored,noBars:chNoBars,unavailable:chUnavailable,unstamped:chUnstamped}});
 // 3. Forward score
 const fRows=book?.rows.length??0,fResolved=book?forwardResolved(book.rows):0;
 items.push({id:'forward',label:'Forward score (VOLUME_WATCH / EXTENDED / EARLY_WATCH marks)',state:!fRows?'collecting':'ok',summary:`${fRows} saved rows · ${fResolved} resolved on both marks${fResolved<30?' · under 30, no rate is shown':''}.`,lastAt:book?.updatedAt??null,gradedAgainst:'next completed 4h close and 24h mark',where:'Setups tab → Forward score',next:null,counts:{rows:fRows,resolved:fResolved}});
 // 4. Calibration ledger
 const confirmed=ledger?.fields.flatMap(f=>f.sides.filter(s=>s.status==='confirmed')).length??0,graded=ledger?.fields.flatMap(f=>f.sides.filter(s=>!s.informational)).length??0;
 const stale=ledger?(now-Date.parse(ledger.checkedAt))>36*3600000:false;
 items.push({id:'calibration',label:'Calibration ledger and proposals',state:!ledger?'collecting':stale?'attention':'ok',
  summary:!ledger?'No ledger saved yet. The daily pass writes one after the first paper cycle of the day; Recompute runs it now.':`${ledger.source.withR} closed trades with R · ${ledger.source.forwardFilled24h} forward rows with a 24h mark · ${graded} graded sides · ${confirmed} confirmed · ${Object.keys(filed??{}).length} proposals filed so far${stale?' · STALE (over 36h)':''}.`,
  lastAt:ledger?.checkedAt??null,gradedAgainst:'two-window lift on paper R and forward 24h',where:'Learning tab (this page); proposals appear in Recommendations',next:ledger&&ledger.source.withR<30&&ledger.source.forwardFilled24h<30?'Collecting. Nothing can confirm until a side has 30 rows; the forward book fills faster than the paper ledger.':null,counts:{withR:ledger?.source.withR??0,forward24h:ledger?.source.forwardFilled24h??0,confirmed,filed:Object.keys(filed??{}).length}});
 // 5. Composite shadow score: gated on confirmed sides; stamped on named rows only when available.
 const shadowStamped=[...(four?.rows??[]),...(early?.rows??[])].filter(r=>r.shadow&&r.shadow.weightsVersion===weights?.version).length;
 items.push({id:'shadowScore',label:'Composite shadow score (shadow-score-v1)',
  state:!weights?'collecting':weights.available?'ok':'collecting',
  summary:!weights?'No weights derived yet; the daily calibration pass derives them from confirmed ledger sides.':weights.available?`Available: ${weights.weights.length} weights from ${weights.confirmedFields} confirmed fields (version ${weights.version}). ${shadowStamped} named rows carry a current stamp. Weights are each confirmed side’s lift in multiples of the confirmation floor, clipped at ±${SHADOW.clip}; nothing is fitted.`:`Not available: ${weights.reason} No row is scored until then.`,
  lastAt:weights?.computedAt??null,gradedAgainst:'sign of the stamped score against paper R and forward 24h (shadow.sign field), out of sample by construction',where:'Learning tab → weights table below; ledger field shadow.sign',
  next:weights&&!weights.available?`Waiting for the ledger: needs confirmed sides on at least ${SHADOW.minConfirmedFields} different fields.`:null,counts:{weights:weights?.weights.length??0,confirmedFields:weights?.confirmedFields??0,stamped:shadowStamped}});
 // 6. Equity surfaces are out of scope here: this desk is crypto-only and every market-data call goes to CoinGecko or the exchanges.
 for(const i of items)if(i.lastAt){const m=ago(i.lastAt,now);if(m!=null&&m>36*60&&i.state==='ok')i.state='attention';}
 return {checkedAt:new Date(now).toISOString(),mode:{discoveryOnly,jevKey},items,shadowWeights:weights??null};
}
