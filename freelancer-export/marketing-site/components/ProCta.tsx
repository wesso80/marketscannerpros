'use client'
import {useEffect,useState} from 'react'
type T='free'|'pro'|'pro_trader'
export default function ProCta(){
  const [t,setT]=useState<T>('free')
  const [wid,setWid]=useState<string|null>(null)
  useEffect(()=>{
    fetch('/api/auth/session',{credentials:'include'})
      .then(r=>r.json()).then(d=>{
        setT((d&&d.tier)||'free')
        setWid(d.workspaceId||null)
      }).catch(()=>{})
  },[])
  const appUrl = wid ? `https://app.marketscannerpros.app?wid=${wid}` : 'https://app.marketscannerpros.app'
  return t==='pro_trader'
    ? <a href={appUrl} target="_blank" rel="noopener noreferrer"
         className="inline-block mt-2 rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">
         Open Pro Trader App
       </a>
    : <a href="/pricing" className="inline-block mt-2 text-emerald-300 underline">View Pricing</a>
}
