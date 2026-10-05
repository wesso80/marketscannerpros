const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.env.TRACK_ROOT,out=process.env.TRACK_OUT,port=Number(process.env.TRACK_PORT||3117),origin=`http://127.0.0.1:${port}`;
let server,browser;const results=[],requests=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const log=fs.openSync(path.join(out,'server.log'),'w');
 server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',STRIPE_SECRET_KEY:'sk_test_fixture_only',OPENAI_API_KEY:'sk-fixture-only',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',APP_SIGNING_SECRET:'fixture-only-signing-key-no-real-secret-123456'},stdio:['ignore',log,log]});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Next exited');try{if((await fetch(origin+'/tools/workspace?tab=journal')).ok)break;}catch{}if(i===99)throw Error('Next timeout');await new Promise(r=>setTimeout(r,300));}
 const packaged=(await import('/tmp/options-ui-browser/node_modules/@sparticuz/chromium/build/index.js')).default;
 for(const [tier,dataCase] of [['pro','populated'],['pro','empty'],['free','populated'],['anonymous','empty']])for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  browser=await chromium.launch({executablePath:'/tmp/validation-browser/chromium',args:packaged.args.filter(x=>!['--disable-web-security','--allow-running-insecure-content','--disable-site-isolation-trials'].includes(x)),headless:true,env:{...process.env,LD_LIBRARY_PATH:'/tmp/validation-browser',FONTCONFIG_PATH:'/etc/fonts'}});
  const context=await browser.newContext({viewport,timezoneId:'Australia/Sydney',serviceWorkers:'block'});
  const entries=dataCase==='empty'?[]:[...Array.from({length:12},(_,i)=>({id:i+1,symbol:i%2?'NEAR':'AAPL',assetClass:i%2?'crypto':'equity',side:i%3?'LONG':'SHORT',date:'2026-10-01',entryPrice:i%2?4:240,quantity:i%2?100:2,isOpen:i<2,exitDate:i<2?null:'2026-10-02',exitPrice:i%2?5:245,pl:i<2?null:i%3?-10:30,plPercent:i%3?-2:5,rMultiple:i%3?-0.5:1.5,strategy:'manual',stopLoss:i%2?3:230,target:i%2?6:260})),{id:99,symbol:'RESEARCH',assetClass:'equity',side:'LONG',date:'2026-10-01',entryPrice:100,quantity:1,isOpen:false,exitDate:'2026-10-02',exitPrice:100000,pl:99900,plPercent:99900,strategy:'scanner_signal',tags:['auto_alert','execution_engine','paper_trade'],executionMode:'PAPER'}];
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
    case '/api/quote':status=200;body={ok:true,price:u.searchParams.get('symbol')==='AAPL'?250:5,observedAt:new Date().toISOString(),observationDate:'2026-10-05'};break;
    case '/api/portfolio':status=200;body={syncRevision:"fixture-revision",positions:[],closedPositions:[],performanceHistory:[],cashState:{startingCapital:10000,cashLedger:[]},riskAnalytics:null};break;
    case '/api/journal':status=200;body={entries};break;
   }
   if(req.method()!=='GET'){status=200;body={ok:true,mocked:true,syncRevision:"fixture-revision",cashStateSaved:true};}
   requests.push({path:u.pathname,method:req.method(),status,action:'mocked'});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push({dataCase,width:viewport.width,message:e.message}));
  await page.goto(origin+'/tools/workspace?tab=journal',{waitUntil:'networkidle'});
  const cookie=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookie.isVisible())await cookie.click();
  await page.waitForLoadState('networkidle');if(tier!=='anonymous' && process.env.JOURNAL_BEFORE!=='true')await page.getByText(dataCase==='empty'?'Add your first trade':'Personal performance excludes automated research.',{exact:true}).waitFor({state:'visible',timeout:10000}).catch(()=>{});
  await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});
  const metric=await page.evaluate(()=>({observedAt:new Date().toISOString(),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,screens:document.documentElement.scrollHeight/innerHeight,text:document.body.innerText,openFolds:document.querySelectorAll('details[open]').length,sourceCount:document.querySelectorAll('[data-source-line]').length,verdicts:[...document.querySelectorAll('[data-journal-verdict]')].map(e=>({text:e.textContent,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))}));
  const stem=`${tier}-${dataCase}-${viewport.width}`;await page.screenshot({path:path.join(out,stem+'-viewport.png')});await page.screenshot({path:path.join(out,stem+'-full.png'),fullPage:true});
  if(tier!=='anonymous' && process.env.JOURNAL_EXPAND==='true'){
   for(const summary of await page.locator('details > summary').all()){if(await summary.isVisible() && !await summary.evaluate(el=>el.parentElement.open))await summary.click();}
   const expandAll=page.getByRole('button',{name:'Expand all',exact:true});if(await expandAll.isVisible())await expandAll.click();
   const expandedText=await page.locator('body').innerText();
   const bad=/\b(buy|sell|bullish|bearish|probability|should|likely|Trade Ideas|TARGET ACTIVE|Brain Decision|Golden Egg|Command Center|Workspace|Awaiting data|Monitor for|Wait for|Permission|Playbook|Target|UNKNOWN|Unknown|Unavailable|N\/A|undefined|NaN|DEGRADED|Degraded|MISSING|PARITY|alpha_vantage|EOD)\b|[A-Z]+_[A-Z_]+|\d{4}-\d{2}-\d{2}T\d{2}:/g;
   metric.hits=[...new Set(expandedText.match(bad)||[])];metric.expandedText=expandedText;
   if(tier==='pro' && dataCase==='populated' && viewport.width===390){
    const beforeKpis=await page.locator('[data-stat-card]').allTextContents();
    await page.getByLabel('Research records (automated, paper)',{exact:true}).check();
    await page.getByRole('button',{name:'Show all 13',exact:true}).click();
    metric.researchShown=(await page.locator('body').innerText()).includes('RESEARCH');
    metric.personalKpisUnchanged=JSON.stringify(beforeKpis)===JSON.stringify(await page.locator('[data-stat-card]').allTextContents());
    const optIn=page.getByLabel('Auto-log research records',{exact:true});
    metric.autoLogDefault=await optIn.isChecked();await optIn.check();
    metric.autoLogStored=await page.evaluate(()=>localStorage.getItem('msp:auto-log-research'));
    if(!metric.researchShown || !metric.personalKpisUnchanged || metric.autoLogDefault || metric.autoLogStored!=='true')throw Error('Research interaction failed');
   }

  }
  if(metric.text.includes('Tool Error'))throw Error('Tool Error');results.push({tier,dataCase,...metric});console.log(stem,metric.screens,metric.scrollWidth,metric.hits,metric.verdicts);
  await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({mocked:true,results,requests,errors},null,2));if(errors.length)throw Error(JSON.stringify(errors));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
