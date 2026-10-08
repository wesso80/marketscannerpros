import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(resolve(process.env.MSP_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
const success=process.env.MSP_SMOKE_SUCCESS==='1';
let fixture;
if(success){
 console.log('Building fixture');const {build}=require('esbuild');
 const out=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(out,{recursive:true});
 await build({entryPoints:['test/browser/copilot/successFixture.ts'],bundle:true,platform:'node',format:'cjs',outfile:out+'/success-fixture.cjs'});
 process.env.APP_SIGNING_SECRET='fixture-only';
 fixture=require(out+'/success-fixture.cjs').successFixture();console.log('Fixture ready');
}
let questions=0,usageReads=0;
let log='';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-H','127.0.0.1','-p','5178'],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',APP_SIGNING_SECRET:'fixture-only',DATABASE_URL:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>{log+=d;process.stdout.write(d);});server.stderr.on('data',d=>{log+=d;process.stderr.write(d);});
let browser;
try{
 const deadline=Date.now()+20000;while(!log.includes('Ready')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
 browser=await chromium.launch({headless:true,executablePath:process.env.MSP_CHROMIUM});
 const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(success&&u.pathname==='/api/golden-egg')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:fixture.packet,reportUnlocked:true,copilotEvidenceToken:fixture.token})});if(success&&u.pathname==='/api/ai/copilot'){const body=route.request().postDataJSON();if(body.evidenceToken!==fixture.token||body.symbol!=='AAPL'||!route.request().headers()['idempotency-key'])throw Error('Page context or idempotency key missing');questions++;return route.fulfill({contentType:'application/json',body:JSON.stringify({content:fixture.content,capturedAt:fixture.evidence.capturedAt,evidence:fixture.evidence.observations,missing:['Supplementary sections unavailable in fixture'],quota:{limit:20,used:questions}})});}if(u.pathname==='/api/disclosure/status')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,accepted:true,version:'1'})});if(u.pathname==='/api/me')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,tier:'pro',isAdmin:false})});if(u.pathname==='/api/public-usage'){usageReads++;return route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,plan:'pro',quotas:[{kind:'ai',remaining:20-questions,limit:20}]})});}if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fixture data unavailable"}'});return route.continue();});
 console.log('Navigating');const r=await page.goto('http://127.0.0.1:5178/tools/golden-egg?symbol=AAPL&type=equity',{timeout:90000});
 console.log('Page loaded');await page.getByRole('button',{name:'Essential Only',exact:true}).click();
 await page.getByRole('button',{name:/MSP Copilot/}).click();
 if(success){
  await page.getByText('Chart context defaults',{exact:false}).waitFor();
  await page.locator('#public-copilot-question').fill('Explain the displayed price and observation date. Is this a buy recommendation?');
  await page.getByRole('button',{name:'Ask Copilot',exact:true}).click();
  await page.getByText(fixture.content,{exact:true}).waitFor();
  await page.getByText('19 of 20 questions remaining',{exact:false}).waitFor();
  await page.getByText('AI questions: 19 of 20 remaining',{exact:false}).waitFor();
  if(questions!==1||usageReads<2)throw Error('Question or shared allowance refresh mismatch');
 }else await page.getByText('Verified evidence is not available here yet.',{exact:false}).waitFor();
 if(r.status()!==200||errors.length)throw Error(JSON.stringify({status:r.status(),errors}));
 if(!success&&!await page.locator('#public-copilot-question').isDisabled())throw Error('Missing evidence accepts questions');
 const out=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(out,{recursive:true});
 for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const box=await page.locator('#public-copilot-panel').boundingBox();
   if(!box||box.x<0||box.x+box.width>width+1){await page.screenshot({path:out+'/copilot-app-overflow.png'});throw Error(JSON.stringify({width,box}));}
   await page.screenshot({path:out+`/copilot-app-${success?'success':'missing'}-${width}.png`});
 }
 await writeFile(out+'/copilot-app-smoke.json',JSON.stringify({status:r.status(),errors,widths:[1280,390],mode:success?'success':'missing',questions,usageReads,api:'mocked'}));
 console.log('PASS: actual Symbol page and Copilot '+(success?'answer + shared quota refresh':'missing-evidence')+', 1280 and 390');

}catch(e){console.log(String(e));process.exitCode=1;}finally{await browser?.close();server.kill();console.log(log.slice(-7000));}
