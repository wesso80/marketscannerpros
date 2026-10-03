'use client';
import {useEffect,useState} from 'react';
/** Read once per URL while mounted. Abort on navigation; no background polling. */
export function usePublicMarketFeed<T>(url:string|null){
 const [state,setState]=useState<{url:string|null;data:T|null;error:string|null;loading:boolean}>({url:null,data:null,error:null,loading:false});
 useEffect(()=>{
  if(!url)return;const controller=new AbortController();setState({url,data:null,error:null,loading:true});
  fetch(url,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error(`Data unavailable (${r.status})`);const data=await r.json();if(data.success===false||data.available===false)throw new Error(data.error??'Data unavailable');return data as T;})
   .then(data=>setState({url,data,error:null,loading:false})).catch(e=>{if(!controller.signal.aborted)setState({url,data:null,error:e.message,loading:false});});
  return ()=>controller.abort();
 },[url]);
 return state.url===url?state:{url,data:null,error:null,loading:Boolean(url)};
}
