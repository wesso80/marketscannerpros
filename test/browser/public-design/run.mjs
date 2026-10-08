import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(resolve(process.env.MSP_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');

let log='';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-H','127.0.0.1','-p','5178'],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED:'true',APP_SIGNING_SECRET:'fixture-only',DATABASE_URL:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>{log+=d;process.stdout.write(d);});server.stderr.on('data',d=>{log+=d;process.stderr.write(d);});
let browser;
try{
 const deadline=Date.now()+20000;while(!log.includes('Ready')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
 browser=await chromium.launch({headless:true,executablePath:process.env.MSP_CHROMIUM});
 const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/api/me')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,tier:'pro',isAdmin:false})});
  if(u.pathname==='/api/disclosure/status')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,accepted:true,version:'1'})});
  if(u.pathname==='/api/public-usage')return route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,plan:'pro',quotas:[{kind:'ai',remaining:20,limit:20}]})});
  if(page.url().includes('fixture=populated')) {
   if(u.pathname==='/api/cached/bulk-quotes')return route.fulfill({contentType:'application/json',body:JSON.stringify({quotes:{SPY:{price:550,changePct:0,latestDay:'2026-10-07',source:'database'},QQQ:{price:480,changePct:1.25,latestDay:'2026-10-07',source:'cache'},BTC:{price:62000,changePct:-1.2,observedAt:'2026-10-08T03:00:00Z',source:'cache',stale:true}}})});
   if(u.pathname==='/api/sectors/heatmap')return route.fulfill({contentType:'application/json',body:JSON.stringify({sectors:[{symbol:'XLK',name:'Technology',changePercent:1.4},{symbol:'XLE',name:'Energy',changePercent:-0.6},{symbol:'XLV',name:'Healthcare',changePercent:0},{symbol:'XLF',name:'Financials',changePercent:null}],asOfTradingDay:'2026-10-07',timestamp:'2026-10-08T03:00:00Z'})});
   if(u.pathname==='/api/economic-calendar')return route.fulfill({contentType:'application/json',body:JSON.stringify({events:[{event:'Synthetic release — browser fixture',country:'US',releaseTimeUtc:'2099-10-09T12:30:00Z',timingConfirmed:true,dataStatus:'MISSING'}]})});
  }
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fixture data unavailable"}'});
  return route.continue();
 });
 const out=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(out,{recursive:true});
 const results=[];
 for(const width of [1280,390])for(const path of ['/','/learn','/tools/golden-egg?symbol=AAPL&type=equity','/tools/command-center','/tools/command-center?fixture=populated']){
  await page.setViewportSize({width,height:1000});
  const response=await page.goto('http://127.0.0.1:5178'+path,{timeout:90000});
  await page.locator('[data-public-design]').waitFor();
  const cookies=page.getByRole('button',{name:'Essential Only',exact:true});if(await cookies.count())await cookies.click();
  if(path==='/learn'){
   await page.getByText('Correlation versus performance',{exact:true}).click();
   await page.getByText('Performance describes a change',{exact:false}).waitFor();
  }
  if(path.startsWith('/tools/golden-egg')){
   await page.getByRole('button',{name:/MSP Copilot/}).click();
   await page.getByText('Verified evidence is not available here yet.',{exact:false}).waitFor();
   await page.getByRole('button',{name:/MSP Copilot/}).click();
  }
  if(width===390&&path!=='/')await page.locator('summary').filter({hasText:'Browse destinations'}).click();
  if(path.includes('fixture=populated')){
   await page.getByText('Synthetic release — browser fixture',{exact:true}).waitFor();
   await page.getByLabel('Observed change').selectOption('flat');
   await page.getByText('1 of 7 symbols',{exact:true}).waitFor();
   await page.getByLabel('Observed change').selectOption('all');
  }
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(response.status()!==200||dimensions.scroll>width||errors.length)throw Error(JSON.stringify({path,width,status:response.status(),dimensions,errors}));
  await page.screenshot({path:out+'/public-design-'+(path==='/'?'home':path==='/learn'?'learning':path.includes('command-center')?(path.includes('populated')?'overview-populated':'overview-missing'):'symbol')+'-'+width+'.png',fullPage:true});
  results.push({path,width,status:response.status(),dimensions});
 }
 await writeFile(out+'/public-design-browser.json',JSON.stringify({results,errors},null,2));
 console.log('PASS: 10 public design browser checks');

}catch(e){console.log(String(e));process.exitCode=1;}finally{await browser?.close();server.kill();console.log(log.slice(-7000));}
