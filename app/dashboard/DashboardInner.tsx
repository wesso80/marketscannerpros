'use client';
import React,{useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';

export default function DashboardInner(){
  const params = useSearchParams();
  const [msg,setMsg] = useState('');
  const [isCancel,setIsCancel] = useState(false);
  useEffect(()=>{
    const s=params.get('success'); const c=params.get('canceled');
    if(s==='true'){ setMsg('✅ Payment successful! Your subscription is active.'); setIsCancel(false); }
    else if(c==='true'){ setMsg('Payment canceled.'); setIsCancel(true); }
  },[params]);
  if(!msg) return null;
  const cls = isCancel
    ? 'bg-yellow-100 border border-yellow-400 text-yellow-700'
    : 'bg-green-100 border border-green-400 text-green-700';
  return <div className={`${cls} px-4 py-3 rounded mb-6`}>{msg}</div>;
}
