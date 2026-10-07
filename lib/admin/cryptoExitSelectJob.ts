import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {META,FEATURE_NAMES,encode,proposeHoldout} from './cryptoMetaModel';
import {EXIT_PLANS,EXIT_SELECT,walkForwardExit,type ExitRow,type ExitPlan,type ExitReport,type ExitSelector} from './cryptoExitSelect';
import {ensureReplayTables} from './cryptoReplayJob';
import {SIGNAL_FEATURES} from './cryptoSignalFeatures';

/** Exit-selection models and their own holdout look counter (Neon). Admin-only, research only. */
export const EXIT_DDL=`-- Exit selection in shadow (Phase 5): trained selectors and the locked holdout's look count (research only).
CREATE TABLE IF NOT EXISTS crypto_exit_models (
  model_id    TEXT PRIMARY KEY,
  trained_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_id      TEXT NOT NULL,
  version     TEXT NOT NULL,
  model       JSONB NOT NULL,
  report      JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS crypto_exit_holdout (
  id            INT PRIMARY KEY CHECK (id = 1),
  holdout_from  TIMESTAMPTZ NOT NULL,
  holdout_to    TIMESTAMPTZ NOT NULL,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  looks         INT NOT NULL DEFAULT 0
);
`;
export const exitDdlStatements=(sql=EXIT_DDL)=>sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
let ensured:Promise<void>|null=null;
export function ensureExitTables(){ensured??=(async()=>{for(const s of exitDdlStatements())await q(s);})().catch(e=>{ensured=null;throw e;});return ensured;}
export type StoredExitModel={version:string;featuresVersion:string;featureNames:string[];selector:ExitSelector};
const REPLAY_STATE='admin:crypto-markets:replay:v1';

type DatasetRow={signal_id:string;signal_at:string|Date;o:{fixed?:{status:string;r:number|null;exit:string|null}|null;shadows?:Record<string,{status:string;r:number|null}>;pathEnd?:string}|null;v:Record<string,string|number|boolean|null>};
/**
 * Rows where EVERY plan has a closed outcome (fixed plan not marked at the window end); others are counted, not
 * guessed. Purge time is the shared path end (the latest any plan could have closed).
 */
export function toExitRows(rows:DatasetRow[]){
 const out:ExitRow[]=[];let incomplete=0;
 for(const r of rows){const o=r.o,f=o?.fixed;
  if(!o||!f||f.status!=='CLOSED'||f.r==null||f.exit==='WINDOW_END'||!o.pathEnd){incomplete++;continue;}
  const rr={'fixed-2r':Number(f.r)} as Record<ExitPlan,number>;let ok=true;
  for(const p of EXIT_PLANS.slice(1)){const s=o.shadows?.[p];if(!s||s.status!=='CLOSED'||s.r==null){ok=false;break;}rr[p]=Number(s.r);}
  if(!ok){incomplete++;continue;}
  out.push({id:r.signal_id,signalAt:new Date(r.signal_at).getTime(),exitAt:Date.parse(o.pathEnd),x:encode(r.v??{}),r:rr});
 }
 return {rows:out,incomplete};
}
export async function trainExitSelector(){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 const st=await redis.get<{runId:string;status:string;featuresVersion?:string}>(REPLAY_STATE);
 if(!st)throw Error('Run the history replay first; exit selection trains on its dataset');
 if(st.status==='RUNNING')throw Error('History replay batches are not complete');
 if(st.featuresVersion&&st.featuresVersion!==SIGNAL_FEATURES.version)throw Error(`Replay features ${st.featuresVersion} differ from ${SIGNAL_FEATURES.version}; run the replay again`);
 await ensureReplayTables();await ensureExitTables();
 const raw=await q<DatasetRow>(`SELECT signal_id,signal_at,outcomes o,features->'values' v FROM crypto_replay_signals WHERE run_id=$1 AND stage='MOMENTUM_VOLUME' AND entry IS NOT NULL AND NOT COALESCE((entry->>'hypothetical')::boolean,false)`,[st.runId]);
 const {rows,incomplete}=toExitRows(raw);
 if(rows.length<META.minTrain*2)throw Error(`Only ${rows.length} signals with every plan closed; at least ${META.minTrain*2} are needed`);
 // Same holdout window as the Phase 4 model when it is locked (one untouched period for both), with its own look count.
 let [lock]=await q<{holdout_from:string|Date;holdout_to:string|Date;looks:number}>(`SELECT holdout_from,holdout_to,looks FROM crypto_exit_holdout WHERE id=1`);
 if(!lock){const [meta]=await q<{holdout_from:string|Date;holdout_to:string|Date}>(`SELECT holdout_from,holdout_to FROM crypto_meta_holdout WHERE id=1`).catch(()=>[]);
  const h=meta?{from:new Date(meta.holdout_from).getTime(),to:new Date(meta.holdout_to).getTime()}:proposeHoldout(rows)!;
  await q(`INSERT INTO crypto_exit_holdout (id,holdout_from,holdout_to) VALUES (1,$1,$2) ON CONFLICT (id) DO NOTHING`,[new Date(h.from).toISOString(),new Date(h.to).toISOString()]);
  [lock]=await q(`SELECT holdout_from,holdout_to,looks FROM crypto_exit_holdout WHERE id=1`);}
 const {report,final}=walkForwardExit(rows,{from:new Date(lock.holdout_from).getTime(),to:new Date(lock.holdout_to).getTime()});
 if(!final)throw Error(`Fewer than ${META.minTrain} development signals are trainable before the locked holdout`);
 const [looked]=await q<{looks:number}>(`UPDATE crypto_exit_holdout SET looks=looks+1 WHERE id=1 RETURNING looks`);
 const modelId=new Date().toISOString(),stored:StoredExitModel={version:EXIT_SELECT.version,featuresVersion:SIGNAL_FEATURES.version,featureNames:FEATURE_NAMES,selector:final};
 const full={...report,holdoutLooks:Number(looked?.looks??1),labelled:rows.length,incomplete,datasetRunId:st.runId,
  importance:report.importance.map(x=>({plan:x.plan,top:x.top.map(t=>({feature:FEATURE_NAMES[t.feature],share:t.share}))}))};
 await q(`INSERT INTO crypto_exit_models (model_id,run_id,version,model,report) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)`,[modelId,st.runId,EXIT_SELECT.version,JSON.stringify(stored),JSON.stringify(full)]);
 await q(`DELETE FROM crypto_exit_models WHERE model_id NOT IN (SELECT model_id FROM crypto_exit_models ORDER BY trained_at DESC LIMIT 5)`);
 return {modelId,report:full};
}
export async function latestExitModel(){
 try{await ensureExitTables();const [m]=await q<{model_id:string;model:StoredExitModel}>(`SELECT model_id,model FROM crypto_exit_models ORDER BY trained_at DESC LIMIT 1`);return m??null;}catch{return null;}
}
type LiveRow={signal_id:string;coin:string;signal_at:string|Date;status:string;reason:string|null;probs:{exit?:{plan:ExitPlan;expectedR:number;modelId:string}}|null;decision:string|null;ledger_status:string|null;fixed_r:number|null;plans:Record<string,{status:string;r:number|null}>|null};
export async function exitSelectView(){
 await ensureExitTables();
 const [m]=await q<{model_id:string;trained_at:string|Date;version:string;report:ExitReport&{holdoutLooks:number;labelled:number;incomplete:number;datasetRunId:string;importance:{plan:ExitPlan;top:{feature:string;share:number}[]}[]}}>(`SELECT model_id,trained_at,version,report FROM crypto_exit_models ORDER BY trained_at DESC LIMIT 1`);
 const [lock]=await q<{holdout_from:string|Date;holdout_to:string|Date;locked_at:string|Date;looks:number}>(`SELECT holdout_from,holdout_to,locked_at,looks FROM crypto_exit_holdout WHERE id=1`);
 // Live choices (log only), with the ledger's replayed outcome for that plan once a skipped signal resolves.
 const live=await q<LiveRow>(`SELECT s.signal_id,s.coin,s.signal_at,s.status,s.reason,s.probs,l.decision,l.status ledger_status,(l.outcomes->'fixed2r'->>'r')::float8 fixed_r,l.outcomes->'plans' plans
  FROM crypto_meta_scores s LEFT JOIN crypto_signal_ledger l ON l.signal_id=s.signal_id WHERE s.probs ? 'exit' ORDER BY s.signal_at DESC LIMIT 40`).catch(()=>[]);
 const recent=live.map(x=>{const plan=x.probs?.exit?.plan??null,chosenR=plan==null?null:plan==='fixed-2r'?x.fixed_r:x.plans?.[plan]?.status==='CLOSED'?x.plans[plan].r:null;
  return {signalId:x.signal_id,coin:x.coin,signalAt:new Date(x.signal_at).toISOString(),plan,expectedR:x.probs?.exit?.expectedR??null,decision:x.decision,fixedR:x.fixed_r,chosenR,resolved:x.ledger_status==='RESOLVED'};});
 const done=recent.filter(x=>x.resolved&&x.fixedR!=null&&x.chosenR!=null);
 return {simulated:true,shadow:true,config:{...EXIT_SELECT,plans:EXIT_PLANS,embargoDays:META.embargoDays,foldDays:META.foldDays,minTrain:META.minTrain,holdoutDays:META.holdoutDays,featuresVersion:SIGNAL_FEATURES.version},
  model:m?{modelId:m.model_id,trainedAt:new Date(m.trained_at).toISOString(),version:m.version,report:m.report}:null,
  holdoutLock:lock?{from:new Date(lock.holdout_from).toISOString(),to:new Date(lock.holdout_to).toISOString(),lockedAt:new Date(lock.locked_at).toISOString(),looks:lock.looks}:null,
  live:{recent,resolved:done.length,chosenMinusFixedR:done.length?Math.round(done.reduce((s,x)=>s+x.chosenR!-x.fixedR!,0)/done.length*1000)/1000:null}};
}
