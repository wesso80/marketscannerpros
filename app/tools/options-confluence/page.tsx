import {redirect} from 'next/navigation';
import {optionsHref} from '@/lib/market/links';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const p=await searchParams;
 redirect(optionsHref(typeof p.symbol==='string'?p.symbol:'SPY',typeof p.expiry==='string'?p.expiry:typeof p.expiration==='string'?p.expiration:undefined));
}
