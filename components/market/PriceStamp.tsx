'use client';
import { useEffect, useState } from 'react';
import { formatPriceStamp, type PriceStampInput } from '@/lib/market/priceStamp';
export default function PriceStamp({compact=false,timeZone,...input}:PriceStampInput & {compact?:boolean;timeZone?:string}) {
  // Stable server rendering, then the viewer's zone (including its DST rules).
  const [zone,setZone]=useState(timeZone ?? 'UTC');
  useEffect(()=>{setZone(timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);},[timeZone]);
  const stamp=formatPriceStamp(input,{timeZone:zone});
  return <span data-price-stamp data-price-basis={stamp.basisLabel} className={compact?'text-xs':'text-sm'} style={{color:stamp.warning?'var(--msp-warn)':'var(--msp-text)'}}>{stamp.text}</span>;
}
