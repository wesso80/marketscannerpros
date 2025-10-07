'use client';
import React,{useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';

export default function DashboardInner(){
  const params = useSearchParams();
  const [msg,setMsg] = useState('');
  useEffect(()=>{
    const s=params.get('success'); const c=params.get('canceled');
    if(s==='true') setMsg('✅ Payment successful! Your subscription is active.');
    else if(c==='true') setMsg('Payment canceled.');
  },[params]);
  return msg ? (
    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">{msg}</div>
  ) : null;
}
