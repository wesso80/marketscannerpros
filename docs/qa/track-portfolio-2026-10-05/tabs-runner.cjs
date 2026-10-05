const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.env.TRACK_ROOT,out=process.env.TRACK_OUT,port=Number(process.env.TRACK_PORT||3117),origin=`http://127.0.0.1:${port}`;
let server,browser;const results=[],requests=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const log=fs.openSync(path.join(out,'server.log'),'w');
 server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',STRIPE_SECRET_KEY:'sk_test_fixture_only',OPENAI_API_KEY:'sk-fixture-only',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',APP_SIGNING_SECRET:'fixture-only-signing-key-no-real-secret-123456'},stdio:['ignore',log,log]});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Next exited');try{if((await fetch(origin+'/tools/workspace?tab=portfolio')).ok)break;}catch{}if(i===99)throw Error('Next timeout');await new Promise(r=>setTimeout(r,300));}
 const packaged=(await import('/tmp/options-ui-browser/node_modules/@sparticuz/chromium/build/index.js')).default;
 for(const [tier,dataCase] of [['pro','populated'],['free','populated']])for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  browser=await chromium.launch({executablePath:'/tmp/validation-browser/chromium',args:packaged.args.filter(x=>!['--disable-web-security','--allow-running-insecure-content','--disable-site-isolation-trials'].includes(x)),headless:true,env:{...process.env,LD_LIBRARY_PATH:'/tmp/validation-browser',FONTCONFIG_PATH:'/etc/fonts'}});
  const context=await browser.newContext({viewport,timezoneId:'Australia/Sydney',serviceWorkers:'block'});
  const positions=dataCase==='empty'?[]:[{id:1,symbol:'AAPL',side:'LONG',quantity:8,entryPrice:240,currentPrice:250,pl:80,plPercent:4.1667,entryDate:'2026-10-02',assetClass:'equity'},{id:2,symbol:'NEAR',side:'LONG',quantity:200,entryPrice:4,currentPrice:5,pl:200,plPercent:25,entryDate:'2026-10-02',assetClass:'crypto'}];
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
    case '/api/portfolio':status=200;body={syncRevision:"fixture-revision",positions,closedPositions:[],performanceHistory:[],cashState:{startingCapital:10000,cashLedger:[]},riskAnalytics:null};break;
    case '/api/journal':status=200;body={entries:[]};break;
   }
   if(req.method()!=='GET'){status=200;body={ok:true,mocked:true,syncRevision:"fixture-revision",cashStateSaved:true};}
   requests.push({path:u.pathname,method:req.method(),status,action:'mocked'});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push({dataCase,width:viewport.width,message:e.message}));
  await page.goto(origin+'/tools/workspace?tab=portfolio',{waitUntil:'networkidle'});
  const cookie=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookie.isVisible())await cookie.click();
  await page.waitForLoadState('networkidle');if(tier!=='anonymous')await page.getByText(dataCase==='empty'?'Add your first position':'Value simulated',{exact:true}).waitFor({state:'visible',timeout:10000}).catch(()=>{});
  await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});
  for(const tab of ['Overview','Positions','Ledger','Risk','Allocation']) {
   await page.getByRole('tab',{name:tab,exact:true}).click();
   await page.evaluate(async()=>{await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   const metric=await page.evaluate(()=>{
    document.querySelectorAll('details[open]').forEach((el)=>{el.open=false;});
    window.scrollTo(0,0);
    return {observedAt:new Date().toISOString(),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,screens:document.documentElement.scrollHeight/innerHeight,text:document.body.innerText,openFolds:document.querySelectorAll('details[open]').length,sourceCount:document.querySelectorAll('[data-source-line]').length};
   });
   const stem=`${tier}-${tab}-${viewport.width}`;await page.screenshot({path:path.join(out,stem+'-full.png'),fullPage:true});
   for (const summary of await page.locator('details > summary').all()) { if(!await summary.evaluate(el=>el.parentElement.open)) await summary.click(); }
   const expandedText=await page.locator('body').innerText();
   const bad=/\b(buy|sell|bullish|bearish|probability|should|likely|Trade Ideas|TARGET ACTIVE|Brain Decision|Golden Egg|Command Center|Workspace|Awaiting data|Monitor for|Wait for|Permission|Playbook|Target|UNKNOWN|Unknown|Unavailable|N\/A|undefined|NaN|DEGRADED|Degraded|MISSING|PARITY|alpha_vantage|EOD)\b|[A-Z]+_[A-Z_]+|\d{4}-\d{2}-\d{2}T\d{2}:/g;
   metric.hits=[...new Set(expandedText.match(bad)||[])];
   for (const summary of (await page.locator('details > summary').all()).reverse()) { if(await summary.evaluate(el=>el.parentElement.open)) await summary.click(); }
   results.push({tier,tab,...metric});console.log(stem,metric.screens,metric.scrollWidth,metric.hits);
  }
  await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({mocked:true,results,requests,errors},null,2));if(errors.length)throw Error(JSON.stringify(errors));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
