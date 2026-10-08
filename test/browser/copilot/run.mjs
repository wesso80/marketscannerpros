import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),dir=resolve(root,'test/browser/copilot');
const require=createRequire(resolve(root,'package.json'));
const {build}=require('esbuild');
const runtimeRequire=createRequire(resolve(process.env.MSP_BROWSER_RUNTIME,'package.json'));
const {chromium}=runtimeRequire('playwright');
const out=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(out,{recursive:true});
await build({entryPoints:[dir+'/entry.tsx'],bundle:true,jsx:'automatic',platform:'browser',tsconfig:root+'/tsconfig.json',outfile:out+'/copilot-fixture.js',define:{'process.env.NODE_ENV':'"development"'}});
await writeFile(out+'/copilot-input.css','@tailwind base; @tailwind components; @tailwind utilities;');
const css=spawnSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',out+'/copilot-input.css','-o',out+'/copilot-fixture.css','--content',dir+'/entry.tsx,'+root+'/components/PublicMSPCopilot.tsx'],{stdio:'pipe'});if(css.status!==0)throw Error(css.stderr.toString());
await build({entryPoints:[root+'/lib/ai/publicCopilotPolicy.ts'],bundle:true,platform:'node',format:'cjs',outfile:out+'/copilot-policy.cjs'});
const {validateCopilotAnswer}=require(out+'/copilot-policy.cjs');
const longEvidence={symbol:'AAPL',timeframe:'daily',capturedAt:'2026-10-08T01:00:00Z',observations:[
 {id:'price',field:'symbol.canonical.price',value:123},
 {id:'quote-date',field:'symbol.canonical.priceTs',value:'2026-10-07T20:00:00Z'},
 {id:'bbwp',field:'symbol.priceEvidence.bbwp',value:0},
 {id:'bar-date',field:'symbol.priceEvidence.basis.lastCompletedBar',value:'2026-10-06'},
 {id:'atr',field:'symbol.priceEvidence.atrPct',value:2.5},
 {id:'oi',field:'options.openInterest.putCall',value:0.91},
 {id:'options-date',field:'options.chain.lastUpdated',value:'2026-10-06'},
 {id:'expiry',field:'options.chain.expiry',value:'2026-10-09'},
 {id:'missing',field:'options.impliedVolatility.atmIvPct',value:null},
],missing:['News is unavailable in this fixture.']};
const longContent=validateCopilotAnswer({statements:[
 ...['price','bbwp','atr','oi','missing'].map(id=>({kind:'observation',text:'',evidenceIds:[id]})),
 ...['volatility','options','missing','timing','advice'].map(text=>({kind:'explanation',text,evidenceIds:[]})),
]},longEvidence);
if(!longContent)throw Error('Long fixture did not pass real policy validation');
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/copilot-fixture.css"><div id="root"></div><script src="/copilot-fixture.js"></script>');}if(!['/copilot-fixture.css','/copilot-fixture.js'].includes(path))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(out+path));}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;const results=[];
try{browser=await chromium.launch({headless:true,...(process.env.MSP_CHROMIUM?{executablePath:process.env.MSP_CHROMIUM}:{})});
for(const width of [1280,390])for(const mode of ['free','ready','partial','exhausted','loading','switch','error','long']){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];let held;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();requests.push({path:url.pathname,body:request.postDataJSON()});
  if(url.pathname==='/api/ai/copilot'){
   if(mode==='switch'){held=route;return;}
   return route.fulfill({status:mode==='error'?422:200,contentType:'application/json',body:JSON.stringify(mode==='error'?{error:'The answer could not be verified. No question credit was used.'}:{content:mode==='long'?longContent:'OBSERVATION: Fixture evidence describes AAPL.',capturedAt:'2026-10-08T00:00:00Z',missing:mode==='long'?longEvidence.missing:[],evidence:mode==='long'?longEvidence.observations:[{id:'e1',field:'fixture.source',value:'Synthetic only'}],quota:{limit:20,used:1,resetsAt:'2026-10-09T04:00:00Z'}})});
  }
  if(mode==='loading')return;
  return route.fulfill({status:mode==='partial'&&url.pathname==='/api/research/news'?503:200,contentType:'application/json',body:JSON.stringify({copilotEvidenceToken:url.pathname+'-'+url.searchParams.get('symbol')})});
 });
 await page.goto(origin+'/?mode='+mode);await page.getByRole('button',{name:'MSP Copilot · Pro'}).click();
 if(mode==='free'){await page.getByText('Pro includes 20 questions daily.').waitFor();if(requests.length)throw Error('Free triggered data calls');}
 else if(mode==='loading'){await page.getByText('Loading connected page evidence…').waitFor();if(!await page.getByRole('textbox').isDisabled())throw Error('Loading accepts questions');}
 else {await page.getByText('Chart context defaults',{exact:false}).waitFor();
  if(mode==='partial')await page.getByText('Unavailable: news.',{exact:false}).waitFor();
  if(mode==='exhausted'){if(!await page.getByRole('textbox').isDisabled())throw Error('Exhausted accepts questions');}
  else{await page.getByRole('textbox').fill(mode==='long'?'Explain the volatility and options readings, their dates, and what is missing. Does this tell me to buy?':'Explain these measurements');await page.getByRole('button',{name:'Ask Copilot',exact:true}).click();
   if(mode==='switch'){const deadline=Date.now()+10000;while(!held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));if(!held)throw Error('AI request did not arrive within 10 seconds');await page.getByRole('button',{name:'Change symbol'}).click();await held.fulfill({contentType:'application/json',body:JSON.stringify({content:'STALE AAPL ANSWER'})});await page.getByText('Chart context defaults',{exact:false}).waitFor();if(await page.getByText('STALE AAPL ANSWER').count())throw Error('Stale answer rendered');}
   else if(mode==='error')await page.getByRole('alert').waitFor();
   else{await page.getByText(mode==='long'?longContent:'OBSERVATION: Fixture evidence describes AAPL.',{exact:true}).waitFor();await page.getByText('19 of 20',{exact:false}).waitFor();await page.getByText('Source evidence',{exact:true}).click();await page.getByText(mode==='long'?'[price] symbol.canonical.price: 123':'Synthetic only',{exact:false}).waitFor();}
   const ai=requests.filter(r=>r.path==='/api/ai/copilot');if(ai.length!==1||ai[0].body.sectionTokens.length!==(mode==='partial'?4:5))throw Error('Incorrect evidence request');
  }
 }
 if(mode==='long'){const scroller=page.locator('[aria-live=polite]');if(!await scroller.evaluate(el=>el.scrollHeight>el.clientHeight))throw Error('Long answer not scrollable');await scroller.evaluate(el=>el.scrollTop=el.scrollHeight);await page.getByRole('textbox').fill('What does open interest measure?');if(!await page.getByRole('button',{name:'Ask Copilot',exact:true}).isEnabled())throw Error('Follow-up inaccessible');}
 const layout=await page.evaluate(()=>{const b=document.querySelector('#public-copilot-panel').getBoundingClientRect();return {documentWidth:document.documentElement.scrollWidth,left:b.left,right:b.right,top:b.top,bottom:b.bottom};});
 if(layout.documentWidth>width||layout.left<0||layout.right>width+1||layout.top<0||layout.bottom>901||errors.length)throw Error(JSON.stringify({width,mode,layout,errors}));
 await page.screenshot({path:out+`/copilot-${width}-${mode}.png`,fullPage:true});results.push({width,mode,layout,requests:requests.map(r=>r.path),errors});await page.close();
}
await writeFile(out+'/copilot-browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,externalCalls:0,results:out+'/copilot-browser-results.json'}));
}finally{await browser?.close();server.close();}
