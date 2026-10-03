import {Suspense} from 'react';
import OptionsPageClient from '@/components/options-terminal/OptionsPageClient';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const symbol=typeof params.symbol==='string'&&params.symbol.trim()?params.symbol.trim().toUpperCase():'SPY';
 const expiry=typeof params.expiry==='string'?params.expiry:typeof params.expiration==='string'?params.expiration:undefined;
 return <Suspense fallback={<p>Loading Options…</p>}><OptionsPageClient symbol={symbol} expiry={expiry}/></Suspense>;
}
