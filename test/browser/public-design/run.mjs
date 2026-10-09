import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(resolve(process.env.MSP_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const {build}=require('esbuild');
const fixtureOut=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(fixtureOut,{recursive:true});
await build({entryPoints:['test/browser/copilot/successFixture.ts'],bundle:true,platform:'node',format:'cjs',outfile:fixtureOut+'/design-fixture.cjs'});
await build({entryPoints:['lib/research/publicM2History.ts'],bundle:true,platform:'node',format:'cjs',outfile:fixtureOut+'/history-fixture.cjs'});
const {projectM2History,historyWindow}=require(fixtureOut+'/history-fixture.cjs');
let historyRequests=0;
process.env.APP_SIGNING_SECRET='fixture-only';
const symbolFixture=require(fixtureOut+'/design-fixture.cjs').successFixture();
const dates=Array.from({length:24},(_,i)=>new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10));
const chartFixture={symbol:'AAPL',type:'equity',requestedDays:90,from:dates[0],to:dates.at(-1),dates,returnPairs:23,missing:[],basis:'Synthetic browser fixture only.',series:['AAPL','SPY','QQQ'].map((symbol,j)=>({symbol,source:'Synthetic fixture',values:dates.map((_,i)=>i*(.12+j*.03)+Math.sin(i)*.4),changePct:3,correlation:j?0.8:null})),price:{source:'Synthetic fixture',basis:'Synthetic browser fixture only.',points:dates.map((date,i)=>({date,close:120+i,open:119+i,high:121+i,low:118+i,volume:100000,sma20:118+i,sma50:null,upper:125+i,lower:115+i,rsi:55,macd:1,signal:.8}))}};
let comparisonRequests=0;
const fixturePlan=process.env.MSP_DESIGN_PLAN==='free'?'free':'pro';

const baseUrl=process.env.MSP_BROWSER_BASE_URL || 'http://127.0.0.1:5178';
let log='';
const server=process.env.MSP_BROWSER_BASE_URL ? null : spawn(process.execPath,[createRequire(resolve('package.json')).resolve('next/dist/bin/next'),'dev',process.env.MSP_BROWSER_BUNDLER==='turbopack'?'--turbopack':'--webpack','-H','127.0.0.1','-p','5178'],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED:'true',APP_SIGNING_SECRET:'fixture-only',DATABASE_URL:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
server?.stdout.on('data',d=>{log+=d;process.stdout.write(d);});server?.stderr.on('data',d=>{log+=d;process.stderr.write(d);});
let browser;
try{
 const deadline=Date.now()+20000;while(server && server.exitCode===null && !log.includes('Ready')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
 if(server && !log.includes('Ready'))throw Error('Preview server did not become ready: '+log);
 browser=await chromium.launch({headless:true,executablePath:process.env.MSP_CHROMIUM});
 const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
  if(page.url().includes('fixture=symbol')) {
   if(u.pathname==='/api/golden-egg')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:symbolFixture.packet,reportUnlocked:true,copilotEvidenceToken:symbolFixture.token})});
   if(u.pathname==='/api/symbol-comparison'){comparisonRequests++;return route.fulfill({contentType:'application/json',body:JSON.stringify(chartFixture)});}
  }
  if(u.pathname==='/api/research/m2-history'){
   historyRequests++;if(fixturePlan==='free')throw Error('Free requested paid history');
   const months=Number(u.searchParams.get('months')),now=new Date('2026-10-08T00:00:00Z');
   const rows=historyWindow(months,now).months.filter(m=>m!=='2026-08').map((m,i)=>({observed_on:m+'-01',value:m==='2026-07'?0:20000000+i*100000,fetched_at:'2026-10-01',description:'Synthetic history source'}));
   return route.fulfill({contentType:'application/json',body:JSON.stringify({data:projectM2History(u.searchParams.get('bloc'),months,rows,now)})});
  }
  if(u.pathname==='/api/portfolio' || u.pathname==='/api/journal'){
   if(route.request().method()!=='GET')throw Error('Unexpected record mutation during read-only design check');
   const populated=page.url().includes('fixture=records');
   if(u.pathname==='/api/journal')return route.fulfill({contentType:'application/json',body:JSON.stringify({entries:populated?[{id:1,symbol:'AAPL',side:'LONG',date:'2026-10-01',entryPrice:100,quantity:1,isOpen:false,exitPrice:110,exitDate:'2026-10-02',pl:10,plPercent:10,strategy:'manual',notes:'Synthetic record for layout verification'}]:[]})});
   return route.fulfill({contentType:'application/json',body:JSON.stringify({syncRevision:'fixture',positions:populated?[{id:1,symbol:'AAPL',side:'LONG',quantity:2,entryPrice:100,currentPrice:110,pl:20,plPercent:10,entryDate:'2026-10-01',assetClass:'equity'}]:[],closedPositions:[],performanceHistory:[],cashState:{startingCapital:10000,cashLedger:[]}})});
  }
  if(u.pathname==='/api/auth/magic-link')return route.fulfill({contentType:'application/json',body:JSON.stringify({message:'Fixture: check your inbox.'})});
  if(u.pathname==='/api/payments/checkout')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture checkout unavailable. No payment started.'})});
  if(u.pathname==='/api/me' && (page.url().includes('/auth') || page.url().includes('/pricing')))return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:false,tier:'free'})});
  if(u.pathname==='/api/me')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,tier:fixturePlan,isAdmin:false})});
  if(u.pathname==='/api/disclosure/status')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,accepted:true,version:'1'})});
  if(u.pathname==='/api/public-usage')return route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,plan:fixturePlan,quotas:fixturePlan==='pro'?[{kind:'ai',completed:0,pending:0,remaining:20,limit:20}]:[{kind:'symbol',remaining:3,limit:3},{kind:'ai',remaining:0,limit:0}]})});
  if(page.url().includes('fixture=populated')) {
   const observation={value:4.2,date:'2026-10-07'};
   if(u.pathname==='/api/economic-indicators')return route.fulfill({contentType:'application/json',body:JSON.stringify({timestamp:'2026-10-08T00:00:00Z',rates:{treasury3m:observation,treasury2y:{value:3.7,date:'2026-10-06'},treasury5y:{value:null},treasury10y:observation,treasury30y:observation,fedFunds:observation,yieldCurve:{value:0.5}},inflation:{inflationRate:{value:2.5,history:[{date:'2026-08-01',value:2.5}]}},employment:{unemployment:observation},growth:{realGDP:{value:23000,unit:'billions USD'}},regime:{label:'fixture'}})});
   if(u.pathname==='/api/intelligence/global-m2')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{enabled:true,totalUsd:30e12,validBlocCount:2,missingBlocCount:9,oneMonthPct:0,yoyPct:null,calculatedAt:'2026-10-08T00:00:00Z',estimatedWeightedCoveragePercent:45,weightedCoverageThreshold:95,interpretationEligible:false,calculationStatus:'PARTIAL',parityStatus:'PENDING',blocs:[{id:'us',name:'United States',usdM2:20e12,observationMonth:'2026-08',classification:'EXACT',provider:'Synthetic fixture',stale:true,r1:0,r12:2},{id:'eu',name:'Euro area',usdM2:10e12,observationMonth:'2026-07',classification:'ALTERNATIVE',provider:'Synthetic fixture',stale:false,health:'LIVE',r1:-1,r12:null}],missing:[{id:'jp',reason:'Fixture observation missing'}],excludedBlocs:[{id:'kr',name:'South Korea',reason:'Fixture source unavailable'}]}})});

   if(u.pathname==='/api/cached/bulk-quotes')return route.fulfill({contentType:'application/json',body:JSON.stringify({quotes:{SPY:{price:550,changePct:0,latestDay:'2026-10-07',source:'database'},QQQ:{price:480,changePct:1.25,latestDay:'2026-10-07',source:'cache'},BTC:{price:62000,changePct:-1.2,observedAt:'2026-10-08T03:00:00Z',source:'cache',stale:true}}})});
   if(u.pathname==='/api/sectors/heatmap')return route.fulfill({contentType:'application/json',body:JSON.stringify({sectors:[{symbol:'XLK',name:'Technology',changePercent:1.4},{symbol:'XLE',name:'Energy',changePercent:-0.6},{symbol:'XLV',name:'Healthcare',changePercent:0},{symbol:'XLF',name:'Financials',changePercent:null}],asOfTradingDay:'2026-10-07',timestamp:'2026-10-08T03:00:00Z'})});
   if(u.pathname==='/api/economic-calendar')return route.fulfill({contentType:'application/json',body:JSON.stringify({events:[{event:'Synthetic release â€” browser fixture',country:'US',releaseTimeUtc:'2099-10-09T12:30:00Z',timingConfirmed:true,dataStatus:'MISSING'}]})});
  }
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fixture data unavailable"}'});
  return route.continue();
 });
 const out=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(out,{recursive:true});
 const results=[];
 // Compile the shared shell first when checking a heavy workspace route in isolation.
 if(process.env.MSP_DESIGN_SCOPE==='records')await page.goto(baseUrl+'/pricing',{timeout:90000});
 const extraPaths=process.env.MSP_DESIGN_PATHS?JSON.parse(process.env.MSP_DESIGN_PATHS):null;
 for(const width of JSON.parse(process.env.MSP_DESIGN_WIDTHS || '[1280,390]'))for(const path of (extraPaths || ['/pricing','/auth','/','/learn','/tools/golden-egg?symbol=AAPL&type=equity','/tools/command-center','/tools/command-center?fixture=populated','/tools/golden-egg?symbol=AAPL&type=equity&fixture=symbol','/tools/macro','/tools/macro?fixture=populated','/intelligence/global-m2','/intelligence/global-m2?fixture=populated','/tools/workspace?tab=Portfolio','/tools/workspace?tab=Portfolio&fixture=records','/tools/workspace?tab=Journal','/tools/workspace?tab=Journal&fixture=records']).filter(path=>process.env.MSP_DESIGN_SCOPE==='m2'?path.startsWith('/intelligence/global-m2'):process.env.MSP_DESIGN_SCOPE==='symbol'?path.startsWith('/tools/golden-egg'):process.env.MSP_DESIGN_SCOPE==='account'?['/pricing','/auth'].includes(path):process.env.MSP_DESIGN_SCOPE==='records'?path.startsWith('/tools/workspace'):process.env.MSP_DESIGN_SCOPE!=='economic'||path.startsWith('/tools/macro')||path.startsWith('/intelligence/global-m2'))){
  await page.setViewportSize({width,height:1000});
  const response=await page.goto(baseUrl+path,{timeout:Number(process.env.MSP_DESIGN_NAVIGATION_TIMEOUT_MS || 90000)});
  await page.locator('[data-public-design]:visible').waitFor();
  const cookies=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookies.count())await cookies.click();
  if(path==='/pricing'){
   await page.getByText('3 Symbol reports per day',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Annual',exact:true}).click();
   await page.getByText('US$249',{exact:false}).waitFor();
   await page.getByRole('button',{name:'Continue to Pro checkout',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Fixture checkout unavailable'}).waitFor();
  }
  if(path==='/auth'){
   await page.getByLabel('Email address',{exact:true}).fill('fixture@example.test');
   await page.getByRole('button',{name:'Email me a secure link',exact:true}).click();
   await page.getByText('Fixture: check your inbox.',{exact:true}).waitFor();
  }
  if(path==='/learn'){
   await page.getByText('Correlation versus performance',{exact:true}).click();
   await page.getByText('Performance describes a change',{exact:false}).waitFor();
  }
  if(path.startsWith('/tools/golden-egg')&&!path.includes('fixture=symbol')){
   await page.getByRole('button',{name:/MSP Copilot/}).click();
   await page.getByText(fixturePlan==='free'?'Pro includes 20 questions daily.':'Verified evidence is not available here yet.',{exact:false}).waitFor();
   await page.getByRole('button',{name:/MSP Copilot/}).click();
  }
  if(width===390&&await page.locator('summary:visible').filter({hasText:'Browse destinations'}).count())await page.locator('summary:visible').filter({hasText:'Browse destinations'}).click();
  if(path.includes('command-center')&&path.includes('fixture=populated')){
   await page.getByText('Synthetic release â€” browser fixture',{exact:true}).waitFor();
   await page.getByLabel('Observed change').selectOption('flat');
   await page.getByText('1 of 7 symbols',{exact:true}).waitFor();
   await page.getByLabel('Observed change').selectOption('all');
  }
  if(path.includes('fixture=symbol')){
   await page.getByRole('img',{name:/AAPL and benchmarks/}).waitFor();
   if(await page.locator('#symbol-chart').count()!==1)throw Error('Duplicate chart host');
   const requestsBeforeModes=comparisonRequests;
   await page.getByRole('button',{name:'Price & indicators',exact:true}).click();
   await page.getByRole('img',{name:'AAPL daily price and selected indicators',exact:true}).waitFor();
   await page.getByRole('button',{name:'Compare',exact:true}).click();
   if(comparisonRequests!==requestsBeforeModes)throw Error('Mode switch refetched comparison');
  }
  if(path.startsWith('/tools/macro'))await page.locator('[data-economic-research="macro"]').waitFor();
  if(path.startsWith('/intelligence/global-m2')){
   await page.locator('[data-economic-research="m2"]').waitFor();
   if(fixturePlan==='free') {await page.getByRole('link',{name:'Explore Pro history access ↗'}).waitFor();if(historyRequests)throw Error('Free requested history');}
   else {
    await page.getByRole('button',{name:'Open M2 history',exact:true}).click();
    await page.getByRole('img',{name:'United States stored M2 history, gaps are not connected',exact:true}).waitFor();
    await page.getByLabel('History window',{exact:true}).selectOption('36');
    await page.getByText('35 observed months · 1 missing or invalid months',{exact:true}).waitFor();
    await page.getByLabel('Economic bloc',{exact:true}).selectOption('AU');
    await page.getByRole('img',{name:'Australia stored M2 history, gaps are not connected',exact:true}).waitFor();
    await page.getByText('Observation dates and sources',{exact:true}).click();
    await page.getByRole('cell',{name:'Not available',exact:true}).waitFor();
   }
  }
  if(path.startsWith('/tools/macro')&&path.includes('populated'))await page.getByRole('img',{name:/Treasury yields/}).waitFor();
  if(path.startsWith('/intelligence/global-m2')&&path.includes('populated'))await page.getByRole('heading',{name:'United States',exact:true}).waitFor();
  if(path.startsWith('/tools/workspace')&&(path.includes('Portfolio')||path.includes('Journal'))){
   await page.locator('[data-records-studio]').waitFor();
   if(path.includes('Journal')){await page.getByRole('button',{name:'New Trade',exact:true}).click();await page.getByRole('dialog',{name:'New trade drawer',exact:true}).waitFor();await page.getByRole('button',{name:'Close Panel',exact:true}).click();}
   else await page.getByRole('button',{name:'Add Position',exact:true}).waitFor();
  }
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(response.status()!==200||dimensions.scroll>width||errors.length)throw Error(JSON.stringify({path,width,status:response.status(),dimensions,errors}));
  await page.screenshot({path:out+'/public-design-'+path.replace(/[^a-zA-Z0-9]/g,'_')+'-'+width+'.png',fullPage:true});
  if(process.env.MSP_DESIGN_MANUAL==='true'&&path.includes('fixture=symbol')){
   await page.locator('summary:visible').filter({hasText:'Change symbol'}).click();
   await page.getByRole('textbox',{name:'Symbol',exact:true}).fill('MSFT');
   await Promise.all([
    page.waitForRequest(r=>new URL(r.url()).pathname==='/api/golden-egg'&&new URL(r.url()).searchParams.get('symbol')==='MSFT'),
    page.getByRole('button',{name:'Review',exact:true}).click(),
   ]);
   await page.waitForURL(u=>u.searchParams.get('symbol')==='MSFT');
  }
  results.push({path,width,plan:fixturePlan,status:response.status(),dimensions});
  await writeFile(out+'/public-design-browser.json',JSON.stringify({complete:false,results,errors},null,2));
  console.log('PASS '+width+' '+path);
 }
 // Development mount lifecycle may replay effects; mode switches must not fetch again.
 await writeFile(out+'/public-design-browser.json',JSON.stringify({complete:true,results,errors},null,2));
 console.log('PASS: '+results.length+' public design browser checks');

}catch(e){await writeFile(fixtureOut+'/failure.txt',String(e));console.log(String(e));process.exitCode=1;}finally{await browser?.close();server?.kill();console.log(log.slice(-7000));}
