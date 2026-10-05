/** Explicit-only runner. This filename is excluded by the repository's normal test glob. */
import {it,vi} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const safety=vi.hoisted(()=>{
 const nativeFetch=globalThis.fetch.bind(globalThis);
 globalThis.fetch=async()=>{throw Error('Network disabled before explicit validation runtime');};
 return {databaseAttempts:0,suppressedCacheWrites:0,recorderAttempts:0,nativeFetch};
});
vi.mock('@/lib/redis',()=>({getRedis:()=>null,getCached:async()=>null,setCached:async()=>{safety.suppressedCacheWrites++;},CACHE_KEYS:{},CACHE_TTL:{}}));
vi.mock('@/lib/db',()=>({q:()=>{safety.databaseAttempts++;throw Error('Database access forbidden in validation harness');},query:()=>{safety.databaseAttempts++;throw Error('Database access forbidden in validation harness');}}));
vi.mock('@/lib/signalRecorder',()=>({recordSignal:()=>{safety.recorderAttempts++;throw Error('Signal persistence forbidden');}}));
vi.mock('@/lib/brain/engineBridge',()=>({recordEngineEvent:()=>{safety.recorderAttempts++;throw Error('Event persistence forbidden');}}));
import {fetchSharedOptionsChain,clearSharedOptionsChainCache,liveValidationChainProviders} from '@/lib/options/chainCache';
import {optionSpotObservation} from '@/lib/options/spotObservation';
import {selectOptionsExpiry,marketDateKey} from '@/lib/options/expiry';
import {atmStrike} from '@/lib/options/atmStrike';
import {calculateTradeLevels} from '@/lib/options-confluence-analyzer';
import {buildPayload,isLocalGoldenEggDemoAllowed} from '@/lib/goldenEgg/engine';
import {atr} from '@/lib/indicators';
import {avFetch} from '@/lib/avRateGovernor';
import {WINDOW,inAcceptanceWindow,compareOi,liveQuoteBasisAccepted,type Check} from './evidence';

it('captures read-only Options acceptance evidence only on explicit invocation',async()=>{
 if(process.env.OPTIONS_ACCEPTANCE_EXPLICIT!=='1')throw Error('Use scripts/options-live-validation.mjs; no requests made.');
 const config=JSON.parse(process.env.OPTIONS_ACCEPTANCE_CONFIG||'{}');
 if(!config.out||Boolean(config.live)===Boolean(config.fixture))throw Error('Invalid explicit validation configuration');
 const mode=config.live?'live':'fixture';
 const fixture=config.fixture?JSON.parse(readFileSync(config.fixture,'utf8')):null;
 const actualStartedAt=new Date().toISOString();
 if(fixture?.now){vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(fixture.now));}
 const startedAt=new Date().toISOString();
 const checks:Check[]=[],requests:any[]=[],observations:any[]=[];
 const reference=config.exchange?JSON.parse(readFileSync(config.exchange,'utf8')):fixture?.exchange??null;
 const missingSymbol=config['missing-history-symbol']||fixture?.missingHistorySymbol||null;
 const allowedSymbols=new Set(['AAPL',...(missingSymbol?[missingSymbol]:[])]);
 // REALTIME_OPTIONS is not allowlisted: the partnership key is not entitled to it, and a third chain
 // GET would exceed the six-request cap once AAPL and the missing-history ticker each take a quote and a daily series.
 const allowedFunctions=new Set(['REALTIME_OPTIONS_FMV','HISTORICAL_OPTIONS','GLOBAL_QUOTE','TIME_SERIES_DAILY']);
 const secret=process.env.ALPHA_VANTAGE_API_KEY||'';
 const redact=(value:string)=>secret?value.split(secret).join('[REDACTED]'):value;
 const nativeFetch=safety.nativeFetch;
 let networkRequests=0;
 vi.stubGlobal('fetch',async(input:any,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const method=init?.method||(typeof input==='object'?input.method:null)||'GET';
  const fn=url.searchParams.get('function')||'',symbol=url.searchParams.get('symbol')||'';
  if(url.protocol!=='https:'||url.host!=='www.alphavantage.co'||url.pathname!=='/query'||method!=='GET'||!allowedFunctions.has(fn)||!allowedSymbols.has(symbol))throw Error('Network request blocked: outside the read-only provider allowlist');
  if(requests.length>=6)throw Error('Request budget exceeded (maximum six, no automatic retries)');
  const requestStartedAt=new Date().toISOString();
  const key=`${symbol}:${fn}`;
  const safeUrl=new URL(url);safeUrl.searchParams.set('apikey','[REDACTED]');
  const observation:any={function:fn,symbol,method:'GET',url:safeUrl.toString(),startedAt:requestStartedAt,mode};
  requests.push(observation);
  try{
   let status=200,body:any;
   if(fixture){if(!(key in fixture.responses))throw Error(`Fixture missing ${key}`);body=fixture.responses[key];}
   else{
    networkRequests++;
    const response=await nativeFetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)});
    status=response.status;
    const raw=await response.text();
    if(Buffer.byteLength(raw)>20*1024*1024)throw Error('Provider response exceeded 20MiB evidence limit');
    body=JSON.parse(redact(raw));
   }
   const raw=redact(JSON.stringify(body));
   Object.assign(observation,{finishedAt:new Date().toISOString(),httpStatus:status,sha256:createHash('sha256').update(raw).digest('hex')});
   observations.push({...observation,body:JSON.parse(raw)});
   return new Response(raw,{status,headers:{'content-type':'application/json'}});
  }catch(error){observation.finishedAt=new Date().toISOString();observation.error=redact(error instanceof Error?error.message:'Provider read failed');throw Error(observation.error);}
 });
 const read=async(symbol:string,fn:string)=>{
  const url=new URL('https://www.alphavantage.co/query');url.searchParams.set('function',fn);url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',secret);
  if(fn==='GLOBAL_QUOTE')url.searchParams.set('entitlement','realtime');
  if(fn==='TIME_SERIES_DAILY')url.searchParams.set('outputsize','compact');
  return avFetch<any>(url.toString(),`Options acceptance ${fn} ${symbol}`);
 };
 const candles=(payload:any)=>Object.entries(payload?.['Time Series (Daily)']||{}).map(([date,r]:[string,any])=>({ts:Date.parse(`${date}T00:00:00Z`),open:Number(r['1. open']),high:Number(r['2. high']),low:Number(r['3. low']),close:Number(r['4. close']),volume:Number(r['5. volume'])})).sort((a,b)=>a.ts-b.ts);
 const levelWitness=(symbol:string,spot:number,bars:any[],basis:string)=>{
  const measured=atr(bars.map(b=>({...b,timestamp:new Date(b.ts)})));
  const input={currentPrice:spot,primaryTF:'1D',mid50Levels:[],clusters:[],decompression:{},candlesByTf:{'1D':bars}} as any;
  const up=calculateTradeLevels(input,'bullish',null),down=calculateTradeLevels(input,'bearish',null);
  const price={price:spot,change:0,changePct:0,high:spot+5,low:spot-5,volume:1000,avgVolume:1000,historicalCloses:bars.map(b=>b.close)};
  // Deliberately nonzero day range: missing ATR must not be replaced with it.
  const payload=buildPayload(symbol,'equity',price as any,measured==null?null:{atr:measured} as any,null,null);
  return {symbol,basis,inputPrice:spot,controlledDayRange:{high:spot+5,low:spot-5,note:'Intentional nonzero day range to detect forbidden ATR substitution; not a market observation'},observedAt:new Date().toISOString(),barCount:bars.length,firstBarDate:bars[0]?new Date(bars[0].ts).toISOString():null,lastBarDate:bars.length?new Date(bars.at(-1).ts).toISOString():null,atr:measured??null,upsideLevels:up,downsideLevels:down,symbolPayload:{atr:payload.layer3.structure.volatility.atr??null,invalidation:payload.canonical?.levels.invalidation.price??null,scenarioInvalidation:payload.layer2.scenario.invalidationLevel.price??null,reactionZones:payload.layer2.scenario.reactionZones}};
 };
 let selectedExpiry:string|null=null,spot:any=null,chain:any=null,selectedRows:any[]=[],atm:number|null=null,sufficient:any=null,controlled:any=null,natural:any=null,fatal:string|null=null;
 try{
  clearSharedOptionsChainCache();
  chain=await fetchSharedOptionsChain<any>('AAPL',{apiKey:secret,fetchPayload:(_fn,url)=>avFetch(url,'Options acceptance chain'),providers:liveValidationChainProviders(),acceptFairValueMarks:true});
  const quote=await read('AAPL','GLOBAL_QUOTE');spot=optionSpotObservation(quote);
  selectedExpiry=selectOptionsExpiry(chain?.rows?.map((r:any)=>r.expiration)||[],config.expiry,Date.now());
  selectedRows=chain?.rows?.filter((r:any)=>r.expiration===selectedExpiry)||[];
  atm=atmStrike(selectedRows.map(r=>Number(r.strike)),spot?.price);
  checks.push({id:'CHAIN_AVAILABLE',pass:Boolean(chain?.rows?.length),evidence:chain?{provider:chain.provider,quoteBasis:chain.quoteBasis,asOfDate:chain.asOfDate,quoteCoverage:chain.quoteCoverage,cacheHit:chain.cacheHit}:null});
  checks.push({id:'SELECTED_EXPIRY',pass:Boolean(selectedExpiry&&selectedRows.length&&(!config.expiry||selectedExpiry===config.expiry)),evidence:{requestedExpiry:config.expiry??null,selectedExpiry,listedExpiries:[...new Set(chain?.rows?.map((r:any)=>r.expiration)||[])],selection:'existing selectOptionsExpiry helper; no substitute for unavailable requested expiry'}});
  checks.push({id:'UNDERLYING_SPOT_BASIS',pass:Boolean(spot?.price>0&&spot?.asOf===marketDateKey()&&spot?.basis),evidence:spot});
  checks.push({id:'CANONICAL_ATM',pass:atm!==null&&selectedRows.some(r=>Number(r.strike)===atm),evidence:{strike:atm,spot:spot?.price??null,expiry:selectedExpiry,selection:'existing atmStrike helper; lower strike wins equal-distance ties'}});
  checks.push({id:'LIVE_QUOTE_BASIS',pass:liveQuoteBasisAccepted(chain,marketDateKey()),evidence:{provider:chain?.provider??null,quoteBasis:chain?.quoteBasis??null,asOfDate:chain?.asOfDate??null,note:'REALTIME_OPTIONS_FMV dated today passes, including fair-value marks with no bid/ask. HISTORICAL_OPTIONS is captured but cannot pass. Open interest is only the provider row value.'}});
  checks.push({id:'EXCHANGE_REFERENCE_WINDOW',pass:inAcceptanceWindow(reference?.observedAt??''),evidence:{observedAt:reference?.observedAt??null,source:reference?.source??null}});
  checks.push(...compareOi(selectedRows,selectedExpiry,reference,chain?.asOfDate??null,new Date().toISOString()));
  const history=await read('AAPL','TIME_SERIES_DAILY');const bars=candles(history);
  sufficient=levelWitness('AAPL',spot?.price||Number.NaN,bars,'provider daily history; local existing helpers');
  checks.push({id:'SUFFICIENT_HISTORY_LEVELS',pass:Boolean(spot?.price>0&&sufficient.atr>0&&sufficient.upsideLevels&&sufficient.downsideLevels),evidence:sufficient});
  controlled=levelWitness('AAPL',spot?.price||100,[],'CONTROLLED history removal; behavioral check, not a live missing-history symbol');
  checks.push({id:'CONTROLLED_MISSING_HISTORY',pass:controlled.atr===null&&controlled.upsideLevels===null&&controlled.downsideLevels===null&&controlled.symbolPayload.atr===null&&controlled.symbolPayload.invalidation===null&&controlled.symbolPayload.scenarioInvalidation===null&&controlled.symbolPayload.reactionZones.length===0,evidence:controlled});
  if(missingSymbol){
   const q=optionSpotObservation(await read(missingSymbol,'GLOBAL_QUOTE'));const h=await read(missingSymbol,'TIME_SERIES_DAILY');const b=candles(h);
   natural=levelWitness(missingSymbol,q?.price||Number.NaN,b,'provider response; no history rows removed');
   const responseHasSeries=Boolean(h?.['Time Series (Daily)']&&typeof h['Time Series (Daily)']==='object');
   checks.push({id:'LIVE_MISSING_HISTORY_WITNESS',pass:Boolean(q?.price>0&&q?.asOf===marketDateKey()&&responseHasSeries&&b.length<15&&b.every(row=>[row.ts,row.open,row.high,row.low,row.close].every(Number.isFinite)&&row.high>=row.low)&&natural.atr===null&&natural.upsideLevels===null&&natural.downsideLevels===null&&natural.symbolPayload.atr===null&&natural.symbolPayload.invalidation===null&&natural.symbolPayload.scenarioInvalidation===null&&natural.symbolPayload.reactionZones.length===0),evidence:{spot:q,responseHasSeries,...natural}});
  }else checks.push({id:'LIVE_MISSING_HISTORY_WITNESS',pass:false,evidence:'No --missing-history-symbol supplied. Controlled history removal does not close live-symbol acceptance.'});
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('LOCAL_DEMO_MARKET_DATA','true');
  checks.push({id:'PRODUCTION_DEMO_DISABLED',pass:isLocalGoldenEggDemoAllowed()===false,evidence:'Existing production demo guard; no production route was contacted.'});
 }catch(error){fatal=redact(error instanceof Error?error.message:String(error));checks.push({id:'CAPTURE_COMPLETED',pass:false,evidence:fatal});}
 finally{
  const finishedAt=new Date().toISOString();
  checks.push({id:'SCHEDULED_SESSION_WINDOW',pass:inAcceptanceWindow(startedAt)&&inAcceptanceWindow(finishedAt),evidence:{startedAt,finishedAt,window:WINDOW,fixtureClock:fixture?.now??null}});
  checks.push({id:'READ_ONLY_BOUNDARY',pass:safety.databaseAttempts===0&&safety.recorderAttempts===0&&requests.every(r=>r.method==='GET')&&(!fixture||networkRequests===0),evidence:{...safety,networkRequests,requestCount:requests.length,productionRoutesCalled:0,redis:'disabled; writes suppressed in process',database:'mock rejects access'}});
  let revision='not collected';try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
  const report={mode,liveEvidenceChecksPassed:mode==='live'&&checks.every(c=>c.pass),liveAcceptance:false,discrepancyFixedClaim:false,revision,actualStartedAt,startedAt,finishedAt,window:WINDOW,selectedExpiry,underlyingSpot:spot,atmStrike:atm,providerOrder:liveValidationChainProviders(),checks,requests,limitations:['Runs current checkout helpers locally, not deployed UI/auth/route acceptance.','Provider contract date is available; a separate provider OI observation time is not exposed.','Independent same-expiry exchange evidence and a natural missing-history symbol are required.','The roughly 9x provider discrepancy is not claimed fixed.','Chain order is REALTIME_OPTIONS_FMV, then HISTORICAL_OPTIONS when FMV is missing, empty, or not entitled. Plain REALTIME_OPTIONS is not requested. Open interest is not invented.'],fatal};
  const clean=(value:unknown)=>redact(JSON.stringify(value,null,2));
  writeFileSync(join(config.out,'report.json'),clean(report));writeFileSync(join(config.out,'raw-observations.json'),clean(observations));
  writeFileSync(join(config.out,'missing-history.json'),clean({controlled,natural,sufficient}));
  if(reference)writeFileSync(join(config.out,'exchange-observation.json'),clean(reference));
  const lines=[`${mode.toUpperCase()} OPTIONS ACCEPTANCE — ${checks.every(c=>c.pass)?'CHECKS PASS':'FAIL / INCOMPLETE'}`,`Observed ${startedAt} → ${finishedAt}`,`AAPL expiry=${selectedExpiry??'MISSING'} spot=${spot?.price??'MISSING'} spotDate=${spot?.asOf??'MISSING'} basis=${spot?.basis??'MISSING'} ATM=${atm??'MISSING'}`,...checks.map(c=>`${c.pass?'PASS':'FAIL'} ${c.id}: ${JSON.stringify(c.evidence)}`),`Controlled missing history: ATR=${controlled?.atr??'MISSING'}; stop/targets=${controlled?.upsideLevels===null&&controlled?.downsideLevels===null?'NONE':'NOT PROVEN'}.`,`Live evidence checks passed: ${report.liveEvidenceChecksPassed}. Deployed UI acceptance: NOT VERIFIED. Provider discrepancy fixed: NOT CLAIMED.`,mode==='fixture'?'FIXTURE ONLY — zero provider requests; this is not live evidence.':'Local read-only helpers; deployed UI/session verification remains separate.'];
  const summary=redact(lines.join('\n'));writeFileSync(join(config.out,'summary.txt'),summary+'\n');console.log(summary);
  vi.unstubAllGlobals();globalThis.fetch=safety.nativeFetch;vi.unstubAllEnvs();vi.useRealTimers();
 }
});
