'use client';
import {useEffect,useId,useState,type ReactNode} from 'react';

export default function CollapsibleAdminGroup({label,active,children}:{label:string;active:boolean;children:ReactNode}) {
  const id=useId();
  const [open,setOpen]=useState(active);
  const key=`admin-nav:v1:${label.toLowerCase()}`;
  useEffect(()=>{
    try {const saved=localStorage.getItem(key);setOpen(active || saved==='open');}
    catch {setOpen(active);}
  },[key,active]);
  function toggle(){
    const next=!open;setOpen(next);
    try {localStorage.setItem(key,next?'open':'closed');} catch {/* Navigation works without storage. */}
  }
  return <section className="mb-4">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
      className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-emerald-400">
      <span>{label}</span><span aria-hidden="true">{open?'▾':'▸'}</span>
    </button>
    <div id={id} hidden={!open}>{children}</div>
  </section>;
}
