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
 const tail=`symbol=${encodeURIComponent(mover.ticker)}&setupClass=${encodeURIComponent(mover.setupClass)}&eligibility=${encodeURIComponent(mover.deployment)}&confluence=${encodeURIComponent(String(mover.confluenceScore))}&deploymentMode=${encodeURIComponent(deploymentMode)}`;
 if(mover.asset_class==='equity') return {href:`/tools/terminal?tab=options-terminal&type=equity&${tail}`,label:'Open Options Terminal',tableLabel:'Open Options Terminal →'};
 return {href:`/tools/terminal?tab=options-confluence&${tail}`,label:'Open Confluence Panel',tableLabel:'Open Confluence →'};
}

/** Backtest return to the chain. A crypto symbol is not sent to the equity options chain. */
export function backtestOptionsTerminalLink(symbol:string,assetType:string):{href:string;label:string}|null {
 if(assetType==='crypto') return null;
 return {href:`/tools/terminal?tab=options-terminal&type=equity&symbol=${encodeURIComponent(symbol)}`,label:'Open Options Terminal'};
}
