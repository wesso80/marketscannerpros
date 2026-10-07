import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {META,FEATURE_NAMES,encode,walkForward,proposeHoldout,predictBoth,type MetaRow,type WalkForwardReport,type fitBoth} from './cryptoMetaModel';
import {ensureReplayTables} from './cryptoReplayJob';
import {ensureSignalLedger} from './cryptoSignalLedger';
import {signalFeatures,SIGNAL_FEATURES} from './cryptoSignalFeatures';
import {assessVolumeMomentum} from './cryptoVolumeMomentum';
import {fetchCoinbaseCandles} from './cryptoPaperMarket';
import {aggregate} from './strategyHarness';
import {REPLAY} from './cryptoReplay';
import type {ExchangeBar} from './cryptoExchangeVolume';
import {latestExitModel} from './cryptoExitSelectJob';
import {selectPlan} from './cryptoExitSelect';

/** Model store, holdout lock and the live log-only score table (Neon). Admin-only, research only. */
export const META_DDL=`-- Shadow meta-labelling model (Phase 4): trained models, the locked holdout and live log-only scores (research only).
CREATE TABLE IF NOT EXISTS crypto_meta_models (
  model_id    TEXT PRIMARY KEY,
  trained_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_id      TEXT NOT NULL,
  version     TEXT NOT NULL,
  model       JSONB NOT NULL,
  report      JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS crypto_meta_holdout (
  id            INT PRIMARY KEY CHECK (id = 1),
  holdout_from  TIMESTAMPTZ NOT NULL,
  holdout_to    TIMESTAMPTZ NOT NULL,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  looks         INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crypto_meta_scores (
  signal_id   TEXT PRIMARY KEY,
  model_id    TEXT,
  coin        TEXT NOT NULL,
  product     TEXT,
  signal_at   TIMESTAMPTZ NOT NULL,
  scored_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL CHECK (status IN ('SCORED','UNAVAILABLE')),
  reason      TEXT,
  probs       JSONB,
  features    JSONB
);
CREATE INDEX IF NOT EXISTS crypto_meta_scores_signal_idx ON crypto_meta_scores (signal_at);
`;
export const metaDdlStatements=(sql=META_DDL)=>sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
let ensured:Promise<void>|null=null;
export function ensureMetaTables(){ensured??=(async()=>{for(const s of metaDdlStatements())await q(s);})().catch(e=>{ensured=null;throw e;});return ensured;}
const D=86400000,H=3600000,F=4*H;
type StoredModel={version:string;featuresVersion:string;featureNames:string[];models:ReturnType<typeof fitBoth>};
const REPLAY_STATE='admin:crypto-markets:replay:v1';

type DatasetRow={signal_id:string;signal_at:string|Date;fixed:{status:string;r:number|null;exit:string|null;at:string|null}|null;v:Record<string,string|number|boolean|null>};
/** Confirmed setups with a real (non-hypothetical) entry and a closed fixed-plan outcome; window-end marks are excluded. */
export function toMetaRows(rows:DatasetRow[]):MetaRow[]{
 const out:MetaRow[]=[];
 for(const r of rows){const f=r.fixed;if(!f||f.status!=='CLOSED'||f.r==null||!f.at||f.exit==='WINDOW_END')continue;
  out.push({id:r.signal_id,signalAt:new Date(r.signal_at).getTime(),exitAt:Date.parse(f.at),y:Number(f.r)>0?1:0,r:Number(f.r),x:encode(r.v??{})});}
 return out;
}
export async function trainMetaModel(){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 const st=await redis.get<{runId:string;status:string;featuresVersion?:string}>(REPLAY_STATE);
 if(!st)throw Error('Run the history replay first; the model trains on its dataset');
 if(st.status==='RUNNING')throw Error('History replay batches are not complete');
 if(st.featuresVersion&&st.featuresVersion!==SIGNAL_FEATURES.version)throw Error(`Replay features ${st.featuresVersion} differ from ${SIGNAL_FEATURES.version}; run the replay again`);
 await ensureReplayTables();await ensureMetaTables();
 const raw=await q<DatasetRow>(`SELECT signal_id,signal_at,outcomes->'fixed' fixed,features->'values' v FROM crypto_replay_signals WHERE run_id=$1 AND stage='MOMENTUM_VOLUME' AND entry IS NOT NULL AND NOT COALESCE((entry->>'hypothetical')::boolean,false)`,[st.runId]);
 const rows=toMetaRows(raw);
 if(rows.length<META.minTrain*2)throw Error(`Only ${rows.length} labelled signals; at least ${META.minTrain*2} are needed`);
 // Holdout: locked at the first training and reused after (moving it would let results leak into model choices).
 let [lock]=await q<{holdout_from:string|Date;holdout_to:string|Date;looks:number}>(`SELECT holdout_from,holdout_to,looks FROM crypto_meta_holdout WHERE id=1`);
 if(!lock){const h=proposeHoldout(rows)!;await q(`INSERT INTO crypto_meta_holdout (id,holdout_from,holdout_to) VALUES (1,$1,$2) ON CONFLICT (id) DO NOTHING`,[new Date(h.from).toISOString(),new Date(h.to).toISOString()]);
  [lock]=await q(`SELECT holdout_from,holdout_to,looks FROM crypto_meta_holdout WHERE id=1`);}
 const holdout={from:new Date(lock.holdout_from).getTime(),to:new Date(lock.holdout_to).getTime()};
 const {report,final}=walkForward(rows,holdout);
 if(!final)throw Error(`Fewer than ${META.minTrain} development signals are trainable before the locked holdout`);
 const [looked]=await q<{looks:number}>(`UPDATE crypto_meta_holdout SET looks=looks+1 WHERE id=1 RETURNING looks`);
 const modelId=new Date().toISOString(),stored:StoredModel={version:META.version,featuresVersion:SIGNAL_FEATURES.version,featureNames:FEATURE_NAMES,models:final};
 const full={...report,holdoutLooks:Number(looked?.looks??1),labelled:rows.length,datasetRunId:st.runId};
 await q(`INSERT INTO crypto_meta_models (model_id,run_id,version,model,report) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)`,[modelId,st.runId,META.version,JSON.stringify(stored),JSON.stringify(full)]);
 // Keep the five most recent models.
 await q(`DELETE FROM crypto_meta_models WHERE model_id NOT IN (SELECT model_id FROM crypto_meta_models ORDER BY trained_at DESC LIMIT 5)`);
 return {modelId,report:full};
}
async function latestModel(){const [m]=await q<{model_id:string;model:StoredModel}>(`SELECT model_id,model FROM crypto_meta_models ORDER BY trained_at DESC LIMIT 1`);return m??null;}

export const META_LIVE={perRun:4,lookbackHours:48};
/**
 * Cron step, LOG ONLY: scores new live-4h ledger signals with the latest model and stores the probabilities. Nothing
 * reads these scores to make a decision. Features are recomputed with the replay's own code from Coinbase candles
 * completed at the signal close, so live and training features match. Never throws.
 */
export async function scoreLiveSignals(now=Date.now()){
 try{await ensureSignalLedger();await ensureMetaTables();}catch{return {ok:false,error:'Model tables unavailable'};}
 try{
  // Either model may be present: the Phase 4 win-chance model and/or the Phase 5 exit selector (both log only).
  const m0=await latestModel(),e0=await latestExitModel();
  const model=m0&&m0.model.featuresVersion===SIGNAL_FEATURES.version?m0:null,exitModel=e0&&e0.model.featuresVersion===SIGNAL_FEATURES.version?e0:null;
  if(!model&&!exitModel)return {ok:true,skipped:m0||e0?'Model features out of date; retrain':'No trained model'};
  const due=await q<{signal_id:string;coin:string;product:string|null;venue:string|null;signal_at:string|Date}>(
   `SELECT l.signal_id,l.coin,l.product,l.venue,l.signal_at FROM crypto_signal_ledger l LEFT JOIN crypto_meta_scores s ON s.signal_id=l.signal_id
    WHERE l.source='live-4h' AND s.signal_id IS NULL AND l.signal_at > $1 ORDER BY l.signal_at DESC LIMIT $2`,[new Date(now-META_LIVE.lookbackHours*H).toISOString(),META_LIVE.perRun]);
  let scored=0;
  for(const row of due){
   const t=new Date(row.signal_at).getTime(),save=(status:'SCORED'|'UNAVAILABLE',reason:string|null,probs:unknown,features:unknown)=>q(
    `INSERT INTO crypto_meta_scores (signal_id,model_id,coin,product,signal_at,status,reason,probs,features) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT (signal_id) DO NOTHING`,
    [row.signal_id,model?.model_id??null,row.coin,row.product,new Date(t).toISOString(),status,reason,probs==null?null:JSON.stringify(probs),features==null?null:JSON.stringify(features)]);
   try{
    if(row.venue!=='gdax'||!/-USD$/.test(row.product??'')){await save('UNAVAILABLE','Not a Coinbase USD signal; the model was trained on Coinbase candles only',null,null);continue;}
    const hourly=await fetchCoinbaseCandles(row.product!,Math.floor((t-REPLAY.warmHours*H)/H)*H,t,H);
    const four=aggregate(hourly,F),i=four.findIndex(b=>b.t===t);
    const sig=i>=24?assessVolumeMomentum(four.slice(i-24,i+1),t):null;
    if(!sig||(sig.stage!=='MOMENTUM_VOLUME'&&sig.stage!=='EXTENDED')){await save('UNAVAILABLE','Signal not reproduced from completed Coinbase 4h candles',null,null);continue;}
    const day=Math.floor(t/D)*D;
    const daily=await fetchCoinbaseCandles(row.product!,day-REPLAY.warmDays*D,day,D);
    const btcDaily=await btcDailyFor(day);
    const [rank]=await q<{r:number}>(`SELECT r FROM (SELECT d.coin_id,rank() OVER (ORDER BY d.market_cap DESC) r FROM cg_hist_daily d JOIN cg_hist_coins c ON c.id=d.coin_id AND NOT c.stable WHERE d.day=$1::date AND d.market_cap IS NOT NULL) x WHERE coin_id=$2`,[new Date(day).toISOString().slice(0,10),row.coin]).catch(()=>[]);
    const [first]=await q<{day:string|null}>(`SELECT min(day)::text day FROM cg_hist_daily WHERE coin_id=$1 AND price IS NOT NULL`,[row.coin]).catch(()=>[]);
    const features=signalFeatures({signal:sig,signalAt:t,four:four.slice(Math.max(0,i-160),i+1),daily,btcDaily,mcapRank:rank?Number(rank.r):null,firstHistoryDay:first?.day??null});
    const x=encode(features.values),probs=model?predictBoth(model.model.models,x):null,exit=exitModel?selectPlan(exitModel.model.selector,x):null;
    await save('SCORED',null,{...(probs?{logistic:Math.round(probs.logistic*10000)/10000,gbt:Math.round(probs.gbt*10000)/10000}:{}),stage:sig.stage,
     ...(exit?{exit:{plan:exit.plan,expectedR:exit.expectedR,expected:exit.expected,modelId:exitModel!.model_id}}:{})},features);scored++;
   }catch(e){await save('UNAVAILABLE',`Candles unavailable: ${e instanceof Error?e.message.slice(0,120):'request failed'}`,null,null).catch(()=>undefined);}
  }
  return {ok:true,due:due.length,scored,model:model?.model_id??null,exitModel:exitModel?.model_id??null};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'Live scoring failed'};}
}
async function btcDailyFor(day:number):Promise<ExchangeBar[]>{
 const redis=getRedis(),key=`admin:crypto-markets:meta:btc-daily:${day}`;
 const cached=await redis?.get<ExchangeBar[]>(key).catch(()=>null);if(Array.isArray(cached)&&cached.length)return cached;
 const bars=await fetchCoinbaseCandles('BTC-USD',day-REPLAY.warmDays*D,day,D);
 await redis?.set(key,bars,{ex:2*86400}).catch(()=>undefined);return bars;
}
export async function metaModelView(){
 await ensureMetaTables();
 const [m]=await q<{model_id:string;trained_at:string|Date;run_id:string;version:string;report:WalkForwardReport&{holdoutLooks:number;labelled:number;datasetRunId:string}}>(`SELECT model_id,trained_at,run_id,version,report FROM crypto_meta_models ORDER BY trained_at DESC LIMIT 1`);
 const [lock]=await q<{holdout_from:string|Date;holdout_to:string|Date;locked_at:string|Date;looks:number}>(`SELECT holdout_from,holdout_to,locked_at,looks FROM crypto_meta_holdout WHERE id=1`);
 await ensureSignalLedger().catch(()=>undefined);
 const scores=await q<{signal_id:string;coin:string;signal_at:string|Date;scored_at:string|Date;status:string;reason:string|null;probs:{logistic:number;gbt:number;stage:string}|null;decision:string|null;outcome_r:number|null;ledger_status:string|null}>(
  `SELECT s.signal_id,s.coin,s.signal_at,s.scored_at,s.status,s.reason,s.probs,l.decision,(l.outcomes->'fixed2r'->>'r')::float8 outcome_r,l.status ledger_status
   FROM crypto_meta_scores s LEFT JOIN crypto_signal_ledger l ON l.signal_id=s.signal_id ORDER BY s.signal_at DESC LIMIT 40`).catch(()=>[]);
 const [counts]=await q<{scored:string;unavailable:string}>(`SELECT COUNT(*) FILTER (WHERE status='SCORED') scored,COUNT(*) FILTER (WHERE status='UNAVAILABLE') unavailable FROM crypto_meta_scores`).catch(()=>[]);
 return {simulated:true,shadow:true,config:{...META,featureNames:FEATURE_NAMES,featuresVersion:SIGNAL_FEATURES.version,live:META_LIVE},
  model:m?{modelId:m.model_id,trainedAt:new Date(m.trained_at).toISOString(),datasetRunId:m.run_id,version:m.version,report:m.report}:null,
  holdoutLock:lock?{from:new Date(lock.holdout_from).toISOString(),to:new Date(lock.holdout_to).toISOString(),lockedAt:new Date(lock.locked_at).toISOString(),looks:lock.looks}:null,
  live:{scored:Number(counts?.scored??0),unavailable:Number(counts?.unavailable??0),recent:scores.map(s=>({...s,signal_at:new Date(s.signal_at).toISOString(),scored_at:new Date(s.scored_at).toISOString()}))}};
}
