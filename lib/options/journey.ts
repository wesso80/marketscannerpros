import {optionsHref,symbolHref} from '@/lib/market/links';
export function optionsEntrySymbol(tab:string,symbol:string,type:string,remembered:string):string {
 if(symbol)return symbol;
 if(['options-terminal','options-confluence','options-flow'].includes(tab)&&!type)return 'SPY';
 return remembered || (type==='equity'?'SPY':'BTCUSD');
}
export function optionsTerminalUrl(params:Record<string,string|undefined>):string {
 const query=new URLSearchParams();for(const [k,v]of Object.entries(params))if(v)query.set(k,v);
 query.set('tab','options-terminal');if(!query.has('symbol'))query.set('symbol','SPY');if(!query.has('type'))query.set('type','equity');
 return `/tools/terminal?${query}`;
}

/** Equity movers open the Options Terminal. Crypto keeps the pre-O-10 confluence link. */
export function moverResearchLink(mover:{asset_class:'equity'|'crypto';ticker:string;setupClass:string;deployment:string;confluenceScore:number|string},deploymentMode:string):{href:string;label:string;tableLabel:string} {
 if(mover.asset_class==='equity') return {href:optionsHref(mover.ticker),label:'Open Options',tableLabel:'Open Options →'};
 return {href:symbolHref(mover.ticker,'crypto'),label:'Open Symbol',tableLabel:'Open Symbol →'};
}

/** Backtest return to the chain. A crypto symbol is not sent to the equity options chain. */
export function backtestOptionsTerminalLink(symbol:string,assetType:string):{href:string;label:string}|null {
 if(assetType==='crypto') return null;
 return {href:optionsHref(symbol),label:'Open Options'};
}
