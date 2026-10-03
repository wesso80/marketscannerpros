/**
 * Shared TypeSafe Jev client via Vercel AI Gateway. One state, many typed questions, calibrated answers.
 * Evidence only: callers store probabilities; nothing here routes an order or edits a rule.
 * Failures throw JevFailure with a short reason so the caller can record why a row is unavailable.
 */
export const JEV_GATEWAY='https://ai-gateway.vercel.sh/v1/evaluate';
export const JEV_MODEL='typesafe-ai/jev';
const RETRY_STATUS=new Set([429,529]);
export type JevBooleanQuestion={type:'boolean';instructions:unknown;criteria?:{true:unknown;false:unknown}};
export type JevChoiceQuestion={type:'choice';instructions:unknown;criteria:Record<string,unknown>};
export type JevScoreQuestion={type:'score';instructions:unknown;criteria:unknown[]};
export type JevQuestion=JevBooleanQuestion|JevChoiceQuestion|JevScoreQuestion;
export type JevBooleanAnswer={type:'boolean';probability:number};
export type JevChoiceAnswer={type:'choice';choice:string;probabilities:Record<string,number>|null;confidence:number|null};
export type JevScoreAnswer={type:'score';score:number;probabilities:Record<string,number>|null;confidence:number|null};
export type JevAnswer=JevBooleanAnswer|JevChoiceAnswer|JevScoreAnswer;
export type JevResult<Q extends Record<string,JevQuestion>>={model:string;answers:{[K in keyof Q]:Q[K] extends JevBooleanQuestion?JevBooleanAnswer:Q[K] extends JevChoiceQuestion?JevChoiceAnswer:JevScoreAnswer};inputTokens?:number;outputTokens?:number};
export class JevFailure extends Error{constructor(public reason:string){super(reason);}}
export const jevConfigured=()=>!!process.env.AI_GATEWAY_API_KEY?.trim();
const unit=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1?n:null;
const probs=(v:unknown)=>{
 if(!v||typeof v!=='object')return null;
 const out:Record<string,number>={};
 for(const [k,n] of Object.entries(v as Record<string,unknown>)){const p=unit(n);if(p==null)return null;out[k]=p;}
 return out;
};
/** Accepts the gateway's `probability`, TypeSafe's native `noul`, or a bare number. */
function booleanAnswer(raw:unknown):JevBooleanAnswer|null{
 const direct=unit(raw);if(direct!=null)return {type:'boolean',probability:direct};
 if(!raw||typeof raw!=='object')return null;
 const r=raw as Record<string,unknown>;
 for(const key of ['probability','noul','boolean','p']){const p=unit(r[key]);if(p!=null)return {type:'boolean',probability:p};}
 return null;
}
function choiceAnswer(raw:unknown,options:string[]):JevChoiceAnswer|null{
 if(!raw||typeof raw!=='object')return null;
 const r=raw as Record<string,unknown>;
 const choice=typeof r.choice==='string'?r.choice:null;
 if(!choice||!options.includes(choice))return null;
 return {type:'choice',choice,probabilities:probs(r.probabilities),confidence:unit(r.confidence)};
}
function scoreAnswer(raw:unknown,levels:number):JevScoreAnswer|null{
 if(!raw||typeof raw!=='object')return null;
 const r=raw as Record<string,unknown>;
 const score=typeof r.score==='number'&&Number.isFinite(r.score)&&r.score>=0&&r.score<=levels-1?r.score:null;
 if(score==null)return null;
 return {type:'score',score,probabilities:probs(r.probabilities),confidence:unit(r.confidence)};
}
async function post(key:string,payload:string,timeoutMs:number){
 try{return await fetch(JEV_GATEWAY,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:payload,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});}
 catch(e){throw new JevFailure(e instanceof Error&&e.name==='TimeoutError'?'timeout':'error');}
}
/** One request. A 429/529 is retried once after a short wait, as the provider asks. Any other failure throws JevFailure. `module` labels the usage counter; it does not change the request. */
export async function askJev<Q extends Record<string,JevQuestion>>(state:unknown,questions:Q,opts:{timeoutMs?:number;retryWaitMs?:number;module?:string}={}):Promise<JevResult<Q>>{
 const key=process.env.AI_GATEWAY_API_KEY?.trim();
 if(!key)throw new JevFailure('no-key');
 const payload=JSON.stringify({model:JEV_MODEL,state,questions});
 let r=await post(key,payload,opts.timeoutMs??20000);
 if(RETRY_STATUS.has(r.status)){await new Promise(resolve=>setTimeout(resolve,opts.retryWaitMs??1500));r=await post(key,payload,opts.timeoutMs??20000);}
 if(!r.ok)throw new JevFailure(`http-${r.status}`);
 let body:{model?:unknown;answers?:Record<string,unknown>;usage?:{input_tokens?:unknown;output_tokens?:unknown}};
 try{body=await r.json();}catch{throw new JevFailure('parse');}
 const raw=body.answers??(body as unknown as Record<string,unknown>);
 const answers:Record<string,JevAnswer>={};
 for(const [id,question] of Object.entries(questions)){
  const parsed=question.type==='boolean'?booleanAnswer(raw[id]):question.type==='choice'?choiceAnswer(raw[id],Object.keys(question.criteria)):scoreAnswer(raw[id],question.criteria.length);
  if(!parsed)throw new JevFailure('parse');
  answers[id]=parsed;
 }
 const inputTokens=body.usage?.input_tokens;
 const outputTokens=body.usage?.output_tokens;
 const result:JevResult<Q>={model:typeof body.model==='string'?body.model:JEV_MODEL,answers:answers as JevResult<Q>['answers'],...(typeof inputTokens==='number'?{inputTokens}:{}),...(typeof outputTokens==='number'?{outputTokens}:{})};
 if(opts.module){
  const {recordJevUsage}=await import('./jevUsage');
  await recordJevUsage({module:opts.module,at:new Date().toISOString(),inputTokens:typeof inputTokens==='number'?inputTokens:null,outputTokens:typeof outputTokens==='number'?outputTokens:null});
 }
 return result;
}
