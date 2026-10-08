import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(resolve(process.env.MSP_BROWSER_RUNTIME,'package.json'));
const {chromium}=require('playwright');
let log='';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-H','127.0.0.1','-p','5178'],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',APP_SIGNING_SECRET:'fixture-only',DATABASE_URL:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
let browser;
try{
 const deadline=Date.now()+20000;while(!log.includes('Ready')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
 browser=await chromium.launch({headless:true,executablePath:process.env.MSP_CHROMIUM});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(u.pathname==='/api/disclosure/status')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,accepted:true,version:'1'})});if(u.pathname==='/api/me')return route.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,tier:'pro',isAdmin:false})});if(u.pathname==='/api/public-usage')return route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,plan:'pro',quotas:[{kind:'ai',remaining:20,limit:20}]})});if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fixture data unavailable"}'});return route.continue();});
 const r=await page.goto('http://127.0.0.1:5178/tools/golden-egg?symbol=AAPL&type=equity',{timeout:90000});
 await page.getByRole('button',{name:'Essential Only',exact:true}).click();
 await page.getByRole('button',{name:/MSP Copilot/}).click();
 await page.getByText('Verified evidence is not available here yet.',{exact:false}).waitFor();
 if(r.status()!==200||errors.length)throw Error(JSON.stringify({status:r.status(),errors}));
 if(!await page.locator('#public-copilot-question').isDisabled())throw Error('Missing evidence accepts questions');
 const out=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(out,{recursive:true});
 for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const box=await page.locator('#public-copilot-panel').boundingBox();
   if(!box||box.x<0||box.x+box.width>width+1){await page.screenshot({path:out+'/copilot-app-overflow.png'});throw Error(JSON.stringify({width,box}));}
   await page.screenshot({path:out+`/copilot-app-missing-${width}.png`});
 }
 await writeFile(out+'/copilot-app-smoke.json',JSON.stringify({status:r.status(),errors,widths:[1280,390],missingEvidenceDisabled:true,api:'mocked'}));
 console.log('PASS: actual Symbol page and Copilot missing-evidence state, 1280 and 390');

}catch(e){console.log(String(e));process.exitCode=1;}finally{await browser?.close();server.kill();console.log(log.slice(-7000));}
