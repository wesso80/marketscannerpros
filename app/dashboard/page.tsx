'use client';
import React,{useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import SessionBadge from '@/components/SessionBadge';
import PortalButton from '@/components/PortalButton';

export default function DashboardPage(){
  const params=useSearchParams();
  const [msg,setMsg]=useState('');
  useEffect(()=>{const s=params.get('success');const c=params.get('canceled');
    if(s==='true') setMsg('✅ Payment successful! Your subscription is active.');
    else if(c==='true') setMsg('Payment canceled.');
  },[params]);
  return(<main className="container mx-auto px-4 py-8">
    <div className="mb-6 flex items-center gap-3"><h1 className="text-3xl font-bold">Dashboard</h1><SessionBadge/></div>
    {msg&&(<div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">{msg}</div>)}
    <PortalButton/></main>);
}
