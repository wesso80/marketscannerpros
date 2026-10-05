const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.env.TERMINAL_WORKTREE||'/workspace/scratch/0535040d28c6/terminal-job-c',out=process.env.TERMINAL_SCREEN_DIR||'/tmp/terminal-shell-after',port=Number(process.env.TERMINAL_PORT||3105),origin=`http://127.0.0.1:${port}`;
const fixture=JSON.parse(fs.readFileSync('/tmp/terminal-pages-fixtures.json','utf8'));
const cases=[['gravity','MU','equity','pro'],['capital','SPY','equity','pro'],['options-confluence','MU','equity','pro']];
let server,browser;const results=[],requests=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const log=fs.openSync(path.join(out,'server.log'),'w');
 server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',STRIPE_SECRET_KEY:'sk_test_mocked_validation_only',OPENAI_API_KEY:'sk-mocked-validation-only',STRIPE_WEBHOOK_SECRET:'dummy',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',APP_SIGNING_SECRET:'fixture-only-signing-key-no-real-secret-123456'},stdio:['ignore',log,log]});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Next exited');try{if((await fetch(origin+'/tools/terminal?symbol=MU')).ok)break;}catch{}if(i===99)throw Error('Next timeout');await new Promise(r=>setTimeout(r,300));}
 const packaged=(await import('/tmp/options-ui-browser/node_modules/@sparticuz/chromium/build/index.js')).default;
 for(const [tab,symbol,type,tier] of cases)for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
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
    case '/api/quote':status=200;body={ok:true,price:100,symbol,type};break;
    case '/api/options-flow':status=403;body={error:'Options flow feed not collected in this fixture'};break;
    case '/api/flow':status=200;body=fixture.capital;break;
    case '/api/time-gravity-map':status=200;body=fixture.gravity;break;
    case '/api/options-scan':status=200;body=fixture.options;break;
    case '/api/options/expirations':status=200;body={success:true,expirations:[{date:'2026-10-09',label:'9 Oct 2026',dte:7,calls:45,puts:45,totalOI:201721}]};break;
    case '/api/journal':status=200;body={entries:[]};break;
    case '/api/funding-rates':case '/api/long-short-ratio':case '/api/crypto/open-interest':status=200;body={coins:[],meta:{freshnessStatus:'stale'}};break;
   }
   if(req.method()!=='GET'&&!['/api/confluence-scan','/api/options-scan'].includes(u.pathname)){status=200;body={ok:true,mocked:true};}
   requests.push({url:req.url(),method:req.method(),body:req.postData(),status,action:'mocked'});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('console',async m=>{if(m.type()==='error')console.log('CONSOLE',tab,await Promise.all(m.args().map(a=>a.evaluate(v=>v instanceof Error?v.stack:String(v)).catch(()=>m.text()))));});page.on('pageerror',e=>errors.push({tab,tier,width:viewport.width,message:e.message}));
  await page.goto(origin+`/tools/terminal?tab=${tab}&symbol=${symbol}&type=${type}`,{waitUntil:'networkidle'});
  const cookie=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookie.isVisible())await cookie.click();
  await page.waitForLoadState('networkidle');
  if(tab==='options-confluence'){const run=page.getByRole('button',{name:/^Run analysis$|^Run Options Research$|^Analyze|^Scan/i}).first();console.log('Options buttons',await page.getByRole('button').allTextContents());await run.click();await page.waitForTimeout(600);await page.waitForLoadState('networkidle');}
  await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});
  await page.waitForTimeout(100);
  const metric=await page.evaluate(()=>({observedAt:new Date().toISOString(),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,screens:document.documentElement.scrollHeight/innerHeight,text:document.body.innerText,heroes:[...document.querySelectorAll('h1')].map(e=>e.textContent),textInputs:[...document.querySelectorAll('input[type="text"],input:not([type])')].map(e=>({label:e.getAttribute('aria-label'),value:e.value})),openFolds:document.querySelectorAll('details[open]').length,verdicts:[...document.querySelectorAll('[data-research-verdict]')].map(e=>({text:e.textContent,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})),sourceCount:document.querySelectorAll('[data-research-source]').length}));
  const stem=`${tab}-${symbol.toLowerCase()}-${tier}-${viewport.width}`;await page.screenshot({path:path.join(out,stem+'-viewport.png')});await page.screenshot({path:path.join(out,stem+'-full.png'),fullPage:true});if(metric.text.includes('Tool Error'))throw Error(tab+' rendered Tool Error');
  if(process.env.TERMINAL_ASSERT_COMPACT==='1'){if(metric.heroes.length!==1||metric.textInputs.length!==1||metric.verdicts.length!==1||metric.sourceCount!==1||metric.verdicts[0].bottom>viewport.height||metric.scrollWidth>viewport.width||metric.screens>2.5)throw Error('Compact layout gate failed: '+JSON.stringify({tab,...metric}));}
  const row={tab,symbol,type,tier,viewport,...metric};for(const d of await page.locator('[data-gravity-view] details, [data-capital-view] details, [data-options-research] details').all())await d.locator('summary').click();row.allOpen=await page.evaluate(()=>({text:document.body.innerText,researchText:document.querySelector('[data-gravity-view],[data-capital-view],[data-options-research]')?.textContent,scrollWidth:document.documentElement.scrollWidth,sourceCount:document.querySelectorAll('[data-research-source]').length}));if(process.env.TERMINAL_ASSERT_COMPACT==='1'&&(/TARGET ACTIVE|Trade Permission|playbook|UNKNOWN|NO_SETUP|NO_TREND/.test(row.allOpen.researchText)||row.allOpen.sourceCount!==1||row.allOpen.scrollWidth>viewport.width))throw Error('Expanded evidence gate failed: '+tab);await page.screenshot({path:path.join(out,stem+'-evidence-open.png'),fullPage:true});results.push(row);
  await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({mocked:true,root,results,requests,errors},null,2));console.log(JSON.stringify(results.map(({tab,tier,width,screens,scrollWidth,heroes,textInputs})=>({tab,tier,width,screens,scrollWidth,heroes,textInputs})),null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
