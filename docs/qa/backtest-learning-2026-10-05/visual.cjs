const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const playbooks=JSON.parse(fs.readFileSync(process.env.LEARNING_FIXTURE || path.join(__dirname,'playbooks.json'),'utf8'));
const root=process.env.TRACK_ROOT,out=process.env.TRACK_OUT,port=Number(process.env.TRACK_PORT||3117),origin=`http://127.0.0.1:${port}`;
let server,browser;const results=[],requests=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const log=fs.openSync(path.join(out,'server.log'),'w');
 server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',STRIPE_SECRET_KEY:'sk_test_fixture_only',OPENAI_API_KEY:'sk-fixture-only',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',APP_SIGNING_SECRET:'fixture-only-signing-key-no-real-secret-123456'},stdio:['ignore',log,log]});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Next exited');try{if((await fetch(origin+'/tools/workspace?tab=backtest')).ok)break;}catch{}if(i===99)throw Error('Next timeout');await new Promise(r=>setTimeout(r,300));}
 const packaged=(await import('/tmp/options-ui-browser/node_modules/@sparticuz/chromium/build/index.js')).default;
 for(const tab of ['backtest','learning'])for(const [tier,dataCase] of [['pro','populated'],['pro','empty'],['free','populated'],['anonymous','empty']])for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  browser=await chromium.launch({executablePath:'/tmp/validation-browser/chromium',args:packaged.args.filter(x=>!['--disable-web-security','--allow-running-insecure-content','--disable-site-isolation-trials'].includes(x)),headless:true,env:{...process.env,LD_LIBRARY_PATH:'/tmp/validation-browser',FONTCONFIG_PATH:'/etc/fonts'}});
  const context=await browser.newContext({viewport,timezoneId:'Australia/Sydney',serviceWorkers:'block'});
  const requestStart=requests.length;
  const alerts=dataCase==='empty'?[]:Array.from({length:12},(_,i)=>({id:String(i+1),symbol:i%2?'NEAR':'AAPL',asset_type:i%2?'crypto':'equity',condition_type:i%2?'price_below':'price_above',condition_value:i%2?5.12:250+i,is_active:true,trigger_count:i<2?1:0,name:`Recorded threshold ${i+1}`,is_recurring:false,notify_email:false}));
  const history=dataCase==='empty'?[]:[{id:'h1',alert_id:'1',symbol:'AAPL',triggered_at:new Date(Date.now()-60000).toISOString(),condition_met:'price above 250',alert_name:'Recorded threshold 1'},{id:'h2',alert_id:'1',symbol:'AAPL',triggered_at:new Date(Date.now()-7200000).toISOString(),condition_met:'price above 250',alert_name:'Recorded threshold 1'}];
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin){requests.push({url:req.url(),action:'abort-external'});return route.abort();}
   if(!u.pathname.startsWith('/api/'))return route.continue();let body={ok:false,error:'Fixture feed not collected'},status=503;
   switch(u.pathname){
    case '/api/me':status=200;body={authenticated:tier!=='anonymous',tier,isAdmin:false,email:null};break;
    case '/api/disclosure/status':status=200;body={authenticated:tier!=='anonymous',accepted:true,version:'1'};break;
    case '/api/favorites':status=200;body={favorites:[]};break;
    case '/api/health/data':status=200;body={stale:false};break;
    case '/api/scanner/top-cached':status=200;body={equity:[],crypto:[]};break;
    case '/api/regime':status=200;body={available:false};break;
    case '/api/quote':status=200;body={ok:true,price:u.searchParams.get('symbol')==='AAPL'?250:5};break;
    case '/api/portfolio':status=200;body={syncRevision:"fixture-revision",positions:[],closedPositions:[],performanceHistory:[],cashState:{startingCapital:10000,cashLedger:[]},riskAnalytics:null};break;
    case '/api/alerts':status=200;body={alerts,quota:{used:alerts.length,max:tier==='free'?3:999,triggersToday:history.length}};break;
    case '/api/alerts/history':status=200;body={history,stats:{last24h:history.length}};break;
    case '/api/backtest':status=200;body={totalTrades:2,totalReturn:12.345,winningTrades:1,losingTrades:1,winRate:50,profitFactor:1.42,maxDrawdown:2.5,sharpeRatio:0.8,cagr:6,avgWin:400,avgLoss:-200,sortinoRatio:1.2,calmarRatio:2.4,volatility:12,timeInMarket:15,equityCurve:[{date:'2025-01-01',equity:10000},{date:'2025-12-31',equity:11234.5}],trades:[],statisticsBasis:{equity:'bar_close_mark_to_market',warnings:['Historical simulation; costs and sampling limits apply.']}};break;
    case '/api/doctrine/playbooks':status=200;body={playbooks};break;
    case '/api/doctrine/profile':status=200;body={profile:dataCase==='empty'?null:{totalTrades:24,edgeScore:62,overallWinRate:0.5833,overallAvgRR:1.42,bestDoctrine:{label:'Trend continuation',winRate:0.65,totalTrades:6},worstDoctrine:{label:'Compression expansion',winRate:0.5,totalTrades:6},bestRegime:{regime:'trend',winRate:0.65,trades:6},worstRegime:{regime:'range',winRate:0.5,trades:6},doctrineStats:playbooks.slice(0,4).map((pb,i)=>({doctrineId:pb.id,label:pb.label,totalTrades:6,winRate:0.5+i*0.05,avgRMultiple:1.2+i*0.1,profitFactor:1.3+i*0.1}))}};break;
    case '/api/entitlements':status=200;body={tier,status:'active'};break;
    case '/api/watchlists':status=200;body={watchlists:[{id:'1',name:'Saved'}]};break;
    case '/api/referral/dashboard':status=200;body={referralCode:'fixture',referralUrl:'https://marketscannerpros.app/?ref=fixture',stats:{clicks:12,signups:3,conversions:1,creditsEarned:500,contestEntries:0,nextEntryProgress:1},history:[],leaderboard:[],contest:{period:'October 2026',drawDate:'2026-11-01',prizePool:'$500',yourEntries:0,totalEntries:4}};break;
    case '/api/notifications/prefs':status=200;body={prefs:{in_app_enabled:true,email_enabled:false,discord_enabled:false,discord_webhook_url:null}};break;
    case '/api/journal':status=200;body={entries:[]};break;
   }
   if(req.method()!=='GET' && !u.pathname.startsWith('/api/backtest')){status=200;body={ok:true,mocked:true,syncRevision:"fixture-revision",cashStateSaved:true};}
   requests.push({path:u.pathname,method:req.method(),status,action:'mocked'});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push({dataCase,width:viewport.width,message:e.message}));
  await page.goto(origin+'/tools/workspace?tab='+tab,{waitUntil:'networkidle'});
  const cookie=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookie.isVisible())await cookie.click();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});
  const metric=await page.evaluate(()=>({observedAt:new Date().toISOString(),finalUrl:location.href,rowCount:document.querySelectorAll('[data-alert-row]').length,width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,screens:document.documentElement.scrollHeight/innerHeight,text:document.body.innerText,openFolds:document.querySelectorAll('details[open]').length,sourceCount:document.querySelectorAll('[data-source-line]').length,verdicts:[...document.querySelectorAll('[data-layout-verdict]')].map(e=>({text:e.textContent,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))}));
  const stem=`${tab}-${tier}-${dataCase}-${viewport.width}`;await page.screenshot({path:path.join(out,stem+'-viewport.png')});await page.screenshot({path:path.join(out,stem+'-full.png'),fullPage:true});
  if(process.env.ALERTS_BEFORE!=='true'){
   const disclosure='Alerts are user-defined notifications only. Triggered alerts are not trading signals, financial advice, or recommendations to buy, sell, hold, short, or trade any asset.';
   const bad=/\b(buy|sell|bullish|bearish|probability|should|likely|Trade Ideas|Backtest Engine|Strategy Backtesting Engine|TARGET ACTIVE|Brain Decision|Golden Egg|Command Center|Workspace|Awaiting data|Monitor for|Wait for|Permission|Playbook|Target|UNKNOWN|Unknown|Unavailable|N\/A|undefined|NaN|DEGRADED|Degraded|MISSING|PARITY|alpha_vantage|EOD)\b|[A-Z]+_[A-Z_]+|\d{4}-\d{2}-\d{2}T\d{2}:/g;
   metric.closedHits=[...new Set(metric.text.replace(disclosure,'').match(bad)||[])];
   await page.locator('details').evaluateAll(elements=>elements.forEach(el=>el.open=true));
   const expandedText=await page.locator('body').innerText();metric.expandedText=expandedText;
   metric.hits=[...new Set(expandedText.replace(disclosure,'').match(bad)||[])];

  }
  if(process.env.ALERTS_BEFORE!=='true' && tier==='pro' && dataCase==='populated'){
   if(tab==='learning'){
    metric.frameworkDetailHits=[];
    for(const pb of playbooks){
     await page.getByRole('button',{name:new RegExp(pb.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
     const text=await page.locator('body').innerText();
     const hits=[...new Set(text.match(/\b(bullish|bearish|Golden Egg|UNKNOWN|Unknown|Unavailable|undefined|NaN|Playbook|Target)\b|[A-Z]+_[A-Z_]+/g)||[])];
     if(hits.length)metric.frameworkDetailHits.push({framework:pb.id,hits});
    }
   } else {
    await page.locator('details').evaluateAll(elements=>elements.forEach(el=>el.open=false));
    metric.requestsBeforeRun=requests.slice(requestStart).filter(x=>x.path?.startsWith('/api/backtest')).length;
    await page.getByText('Simulation settings',{exact:true}).click();
    await page.getByRole('button',{name:'Run Backtest',exact:true}).click();
    await page.getByText('AAPL: 2 simulated trades, +12.3% historical return.',{exact:true}).waitFor();
    await page.locator('details').evaluateAll(elements=>elements.forEach(el=>el.open=false));
    metric.result=await page.evaluate(()=>({screens:document.documentElement.scrollHeight/innerHeight,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText,sourceCount:document.querySelectorAll('[data-source-line]').length,samples:document.querySelectorAll('[data-backtest-sample]').length}));
    await page.screenshot({path:path.join(out,stem+'-result-full.png'),fullPage:true});
   }
  }
  if(metric.text.includes('Tool Error'))throw Error('Tool Error');results.push({tab,tier,dataCase,...metric});console.log(stem,metric.screens,metric.scrollWidth,metric.rowCount,metric.hits);
  await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({mocked:true,results,requests,errors},null,2));if(errors.length)throw Error(JSON.stringify(errors));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
