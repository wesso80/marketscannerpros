import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),out=resolve(process.env.MSP_BROWSER_OUTPUT);await mkdir(out,{recursive:true});
const require=createRequire(resolve(process.env.MSP_BROWSER_RUNTIME,'package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import History from './components/public-design/M2History';createRoot(document.getElementById('root')).render(<History/>);`,loader:'tsx',resolveDir:root},bundle:true,jsx:'automatic',platform:'browser',outfile:out+'/history.js',tsconfig:root+'/tsconfig.json',plugins:[{name:'fixture-adapters',setup(b){b.onResolve({filter:/^(next\/link|@\/lib\/useUserTier)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:root,loader:'tsx',contents:a.path==='next/link'?`import React from 'react';export default function Link(p){return <a {...p}/>}`:`export function useUserTier(){return {tier:new URLSearchParams(location.search).get('mode')==='free'?'free':'pro',isAdmin:false,isLoading:false}}`}));}}]});
await build({entryPoints:[root+'/lib/research/publicM2History.ts'],bundle:true,platform:'node',format:'cjs',outfile:out+'/projection.cjs'});
const {projectM2History,historyWindow}=createRequire(out+'/fixture.cjs')(out+'/projection.cjs');
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0b141a;font-family:Arial,sans-serif}*{box-sizing:border-box}</style><link rel="stylesheet" href="/history.css"><div id="root"></div><script src="/history.js"></script>');}if(!['/history.js','/history.css'].includes(path))return res.writeHead(404).end();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(out+path));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.MSP_CHROMIUM}),results=[];
try{for(const width of [1280,390])for(const mode of ['free','ready','empty','error']){
 const page=await browser.newPage({viewport:{width,height:900}});let requests=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname!=='/api/research/m2-history')return route.continue();requests++;
  if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'});
  const now=new Date('2026-10-08T00:00:00Z'),months=Number(u.searchParams.get('months'));
  const rows=mode==='empty'?[]:historyWindow(months,now).months.filter(m=>m!=='2026-08').map((m,i)=>({observed_on:m+'-01',value:m==='2026-07'?0:20000000+i*10000,fetched_at:'2026-10-01',description:'Synthetic stored source'}));
  return route.fulfill({contentType:'application/json',body:JSON.stringify({data:projectM2History(u.searchParams.get('bloc'),months,rows,now)})});
 });
 await page.goto(origin+'/?mode='+mode);
 if(mode==='free'){await page.getByRole('link',{name:'Explore Pro history access ↗'}).waitFor();if(requests)throw Error('Free requested history');}
 else {await page.getByRole('button',{name:'Open M2 history'}).click();
  if(mode==='error')await page.getByRole('alert').waitFor();
  else {await page.getByText(/Read from storage:/).waitFor();
   if(mode==='empty'){await page.getByText('No stored observations for this window.').waitFor();if(await page.getByRole('img').count())throw Error('Empty history invented a chart');}
   else {await page.getByRole('img').waitFor();await page.getByLabel('History window',{exact:true}).selectOption('36');await page.getByText('35 observed months · 1 missing or invalid months',{exact:true}).waitFor();await page.getByLabel('Economic bloc',{exact:true}).selectOption('AU');await page.getByRole('img',{name:'Australia stored M2 history, gaps are not connected',exact:true}).waitFor();const d=await page.locator('svg path').getAttribute('d');if((d.match(/M/g)||[]).length!==2)throw Error('Missing month was bridged');}
   await page.getByText('Observation dates and sources',{exact:true}).click();if(mode==='ready')await page.getByRole('cell',{name:'$0.00T',exact:true}).waitFor();
  }
 }
 const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(dims.scroll>width||errors.length)throw Error(JSON.stringify({width,mode,dims,errors}));
 await page.screenshot({path:out+`/m2-history-${width}-${mode}.png`,fullPage:true});results.push({width,mode,requests,dims,errors});await page.close();
}await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log('PASS '+results.length+' real history component browser cases');}finally{await browser.close();server.close();}
