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
