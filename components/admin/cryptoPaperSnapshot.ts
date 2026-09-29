'use client';
import {useSyncExternalStore} from 'react';
/**
 * One paper-account snapshot shared by the attention strip and the paper account panel, so a count or P&L on the
 * strip can never come from a different read than the table below it. Whoever loads fresh data publishes it here.
 */
type Snapshot={data:any;loadedAt:number}|null;
let current:Snapshot=null;const listeners=new Set<()=>void>();
export function publishPaperSnapshot(data:unknown,loadedAt=Date.now()){current={data,loadedAt};listeners.forEach(l=>l());}
export function usePaperSnapshot():Snapshot{
 return useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>current,()=>null);
}
