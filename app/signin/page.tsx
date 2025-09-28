"use client";
import{useState}from"react";
import{signIn}from"next-auth/react";
export default function S({searchParams}:any){
 const[code,setCode]=useState("");const cb=searchParams?.callbackUrl??"/dashboard";
return(<main className="mx-auto max-w-md p-8 space-y-4"><h1 className="text-2xl font-semibold">Enter Access Code</h1><form onSubmit={e=>{e.preventDefault();signIn("credentials",{code,callbackUrl:cb});}} className="space-y-2"><input type="password" required value={code} onChange={e=>setCode(e.target.value)} placeholder="Your access code" className="w-full rounded border border-neutral-700 p-2"/><button className="w-full rounded border border-neutral-700 py-2" type="submit">Continue</button></form></main>);}
