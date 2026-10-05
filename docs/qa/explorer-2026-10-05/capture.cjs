const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixtures=require('./fixtures.cjs');
const root=process.env.TRACK_ROOT,out=process.env.TRACK_OUT,port=Number(process.env.TRACK_PORT||3127),origin=`http://127.0.0.1:${port}`,before=process.env.BEFORE==='true';let server,browser;const results=[],requests=[],errors=[],redirects=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const log=fs.openSync(path.join(out,'server.log'),'w');
 server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',STRIPE_SECRET_KEY:'sk_test_fixture_only',OPENAI_API_KEY:'sk-fixture-only',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',APP_SIGNING_SECRET:'fixture-only-signing-key-no-real-secret-123456'},stdio:['ignore',log,log]});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Next exited');try{if((await fetch(origin+'/tools/explorer')).ok)break;}catch{}if(i===99)throw Error('Next timeout');await new Promise(r=>setTimeout(r,300));}

 const packaged=(await import('/tmp/options-ui-browser/node_modules/@sparticuz/chromium/build/index.js')).default;

 for(const tab of (process.env.DEEP_ONLY ? ['equity','crypto'] : ['overview','heatmap','cross','equity','crypto','crypto-command','crypto-intel']))for(const [tier,dataCase] of before?(process.env.DEEP_ONLY ? [['pro','selected']] : [['pro','populated'],...(['equity','crypto'].includes(tab)?[['pro','selected']]:[])]):[['pro','populated'],...(['equity','crypto'].includes(tab)?[['pro','selected'],['pro','selected-missing']]:[]),...(process.env.PRO_ONLY?[]:[['free','populated'],['anonymous','populated']])])for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
 browser=await chromium.launch({executablePath:'/tmp/validation-browser/chromium',args:packaged.args.filter(x=>!['--disable-web-security','--allow-running-insecure-content','--disable-site-isolation-trials'].includes(x)),headless:true,env:{...process.env,LD_LIBRARY_PATH:'/tmp/validation-browser',FONTCONFIG_PATH:'/etc/fonts'}});
 const context=await browser.newContext({viewport,timezoneId:'Australia/Sydney',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin!==origin){requests.push({url:req.url(),action:'abort-external'});return route.abort();}
 if(!u.pathname.startsWith('/api/'))return route.continue();let body={ok:false,error:'Fixture feed not collected'},status=503;
 if(u.pathname==='/api/me'){status=200;body={authenticated:tier!=='anonymous',tier,isAdmin:false,email:null};}
 if(u.pathname==='/api/disclosure/status'){status=200;body={authenticated:tier!=='anonymous',accepted:true,version:'1'};}
 if(fixtures[u.pathname]){status=200;body=structuredClone(fixtures[u.pathname]);}
 if(dataCase==='selected-missing' && u.pathname.startsWith('/api/upe/')){status=503;body={error:'Fixture assessment not collected'};}
 requests.push({path:u.pathname,method:req.method(),status,action:'mocked'});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push({tab,tier,dataCase,width:viewport.width,message:e.message}));

 await page.goto(origin+'/tools/explorer?tab='+tab+(dataCase.startsWith('selected')?'&symbol='+ (tab==='equity'?'AAPL':'BTC'):''),{waitUntil:'networkidle'});const cookie=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookie.isVisible())await cookie.click();
 await page.evaluate(async()=>{await document.fonts.ready;scrollTo(0,0);});
 const metric=await page.evaluate(()=>({observedAt:new Date().toISOString(),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,screens:document.documentElement.scrollHeight/innerHeight,text:document.body.innerText,openFolds:document.querySelectorAll('details[open]').length,sourceCount:document.querySelectorAll('[data-source-line]').length,verdicts:[...document.querySelectorAll('[data-layout-verdict]')].map(e=>({text:e.textContent,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})),charts:[...document.querySelectorAll('[data-market-chart]'), ...[...document.querySelectorAll('h3')].filter(e=>e.textContent==='Sector Heatmap').map(e=>e.parentElement)].map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))}));
 const stem=`${tab}-${tier}-${dataCase}-${viewport.width}`;await page.screenshot({path:path.join(out,stem+'-full.png'),fullPage:true});
 {const clean=t=>t.replace(/Educational and research use only\.[\s\S]*?buy or sell any security\./,'');const bad=/\b(buy|sell|bullish|bearish|probability|should|likely|Trade Ideas|TARGET ACTIVE|Brain Decision|Golden Egg|Command Center|Workspace|Awaiting data|Monitor for|Wait for|Permission|Playbook|Target|UNKNOWN|Unknown|Unavailable|N\/A|undefined|NaN|DEGRADED|Degraded|MISSING|PARITY|alpha_vantage|EOD)\b|[A-Z]+_[A-Z_]+|\d{4}-\d{2}-\d{2}T\d{2}:/gi;
 metric.closedHits=[...new Set(clean(metric.text).match(bad)||[])];await page.locator('details').evaluateAll(els=>els.forEach(el=>el.open=true));metric.expandedText=await page.locator('body').innerText();metric.hits=[...new Set(clean(metric.expandedText).match(bad)||[])];metric.attributes=await page.locator('[title],[aria-label]').evaluateAll(els=>els.map(el=>[el.getAttribute('title'),el.getAttribute('aria-label')].filter(Boolean).join(' ')).join(' '));metric.attributeHits=[...new Set(metric.attributes.match(bad)||[])];metric.expandedSourceCount=await page.locator('[data-source-line]').count();}
 results.push({tab,tier,dataCase,...metric});console.log(stem,metric.screens.toFixed(3),metric.scrollWidth,metric.hits||[]);await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({mocked:true,fixtureBasis:'Deterministic intercepted Explorer API fixtures; not live acceptance',results,requests,errors,redirects},null,2));if(errors.length)throw Error(JSON.stringify(errors));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
