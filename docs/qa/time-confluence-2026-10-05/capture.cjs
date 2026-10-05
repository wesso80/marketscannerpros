const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.env.TERMINAL_WORKTREE||'/workspace/scratch/0535040d28c6/terminal-job-c',out=process.env.TERMINAL_SCREEN_DIR||'/tmp/terminal-shell-after',port=Number(process.env.TERMINAL_PORT||3105),origin=`http://127.0.0.1:${port}`;
const scanFixture=require(__dirname+'/fixtures.cjs');
const cases=[['time-confluence','BTCUSD','crypto','pro',false],['time-confluence','MU','equity','pro',false],['time-confluence','BTCUSD','crypto','pro',true],['time-confluence','MU','equity','pro',true],['time-confluence','BTCUSD','crypto','free',false],['time-confluence','MU','equity','anonymous',false]];
let server,browser;const results=[],requests=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const log=fs.openSync(path.join(out,'server.log'),'w');
 server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',STRIPE_SECRET_KEY:'sk_test_fixture_only',OPENAI_API_KEY:'sk-fixture-only',STRIPE_WEBHOOK_SECRET:'dummy',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',APP_SIGNING_SECRET:'fixture-only-signing-key-no-real-secret-123456'},stdio:['ignore',log,log]});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Next exited');try{if((await fetch(origin+'/tools/terminal?symbol=MU')).ok)break;}catch{}if(i===99)throw Error('Next timeout');await new Promise(r=>setTimeout(r,300));}
 const packaged=(await import('/tmp/options-ui-browser/node_modules/@sparticuz/chromium/build/index.js')).default;
 for(const [tab,symbol,type,tier,measured] of cases)for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  browser=await chromium.launch({executablePath:'/tmp/validation-browser/chromium',args:packaged.args.filter(x=>!['--disable-web-security','--allow-running-insecure-content','--disable-site-isolation-trials'].includes(x)),headless:true,env:{...process.env,LD_LIBRARY_PATH:'/tmp/validation-browser',FONTCONFIG_PATH:'/etc/fonts'}});
  const context=await browser.newContext({viewport,timezoneId:'Australia/Sydney',serviceWorkers:'block'});
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
    case '/api/market-pressure':if(measured){status=200;body=scanFixture.pressure(symbol,type);}break;
    case '/api/quote':status=200;body={ok:true,price:100,symbol,type};break;
    case '/api/confluence-scan':if(JSON.parse(req.postData()||'{}').mode==='calendar'){status=200;body={success:true,data:{schedule:[],closesOnAnchorDay:[],forwardClusters:[],anchor:'TODAY',anchorTimeISO:'2026-10-05T09:00:00Z',horizonEndISO:'2026-10-06T09:00:00Z',horizonDays:1,assetClass:'crypto',scheduleModel:'crypto_247',scheduleModelLabel:'Crypto daily UTC',scheduleBasis:'Fixture calendar',timezone:'UTC',sessionMode:'EXTENDED',warnings:[],totalCloseEventsInHorizon:0}};break;}status=200;body=scanFixture.scan(symbol,type,measured);break;
    case '/api/options-flow':status=403;body={error:'Options flow feed not collected in this fixture'};break;
    case '/api/flow':status=200;body={success:true,data:{symbol,asof:'2026-10-02T20:00:00Z',bias:'neutral',market_mode:'mixed',spot:100,conviction:54,flow_trade_permission:{blocked:true,tps:54,noTradeMode:{reason:'Score below research threshold'}}}};break;
    case '/api/funding-rates':case '/api/long-short-ratio':case '/api/crypto/open-interest':status=200;body={coins:[],meta:{freshnessStatus:'stale'}};break;
   }
   if(req.method()!=='GET'&&!['/api/confluence-scan','/api/options-flow'].includes(u.pathname)){status=200;body={ok:true,mocked:true};}
   requests.push({url:req.url(),method:req.method(),status,action:'mocked'});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('console',async m=>{if(m.type()==='error')console.log('CONSOLE',tab,await Promise.all(m.args().map(a=>a.evaluate(v=>v instanceof Error?v.stack:String(v)).catch(()=>m.text()))));});page.on('pageerror',e=>errors.push({tab,tier,width:viewport.width,message:e.message}));
  await page.goto(origin+`/tools/terminal?tab=${tab}&symbol=${symbol}&type=${type}`,{waitUntil:'networkidle'});
  const cookie=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookie.isVisible())await cookie.click();
  await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
  const metric=await page.evaluate(()=>({observedAt:new Date().toISOString(),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,screens:document.documentElement.scrollHeight/innerHeight,text:document.body.innerText,heroes:[...document.querySelectorAll('h1')].map(e=>e.textContent),textInputs:[...document.querySelectorAll('input[type="text"],input:not([type])')].map(e=>({label:e.getAttribute('aria-label'),value:e.value})),openFolds:document.querySelectorAll('details[open]').length}));
  const stem=`${tab}-${symbol.toLowerCase()}-${tier}-${measured?'measured':'missing'}-${viewport.width}`;await page.screenshot({path:path.join(out,stem+'-viewport.png')});await page.screenshot({path:path.join(out,stem+'-full.png'),fullPage:true});const row={tab,symbol,type,tier,measured,viewport,...metric};if(tab==='options-flow'){row.flowState=await page.getByText('Options flow feed not collected in this fixture',{exact:true}).boundingBox();if(!row.flowState||row.flowState.y+row.flowState.height>844)throw Error('Options Flow state below fold');}if(tab==='time-confluence' && tier==='pro'){await page.getByRole('button',{name:'Run Time Confluence',exact:true}).click();await page.waitForLoadState('networkidle');await page.waitForTimeout(300);row.afterRun=await page.evaluate(()=>({sourceCount:document.querySelectorAll('[data-source-line]').length,openFolds:document.querySelectorAll('details[open]').length,verdicts:[...document.querySelectorAll('[data-time-verdict]')].map(e=>({text:e.textContent,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})),screens:document.documentElement.scrollHeight/innerHeight,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText,observedAt:new Date().toISOString()}));if(row.afterRun.text.includes('Tool Error'))throw Error('Time Confluence after-run fixture failed');await page.screenshot({path:path.join(out,stem+'-after-run.png'),fullPage:true});await page.locator('details').evaluateAll(es=>es.forEach(e=>e.open=true));row.expandedText=await page.locator('body').innerText();row.expandedWidth=await page.evaluate(()=>document.documentElement.scrollWidth);row.expandedSourceCount=await page.locator('[data-source-line]').count();row.expandedAttributes=await page.locator('[title],[aria-label]').evaluateAll(es=>es.map(e=>[e.getAttribute('title'),e.getAttribute('aria-label')].filter(Boolean).join(' ')).join(' '));}results.push(row);
  await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({mocked:true,root,results,requests,errors},null,2));console.log(JSON.stringify(results.map(({tab,tier,width,screens,scrollWidth,heroes,textInputs})=>({tab,tier,width,screens,scrollWidth,heroes,textInputs})),null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
