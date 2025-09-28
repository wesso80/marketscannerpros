"use client";
import { signIn } from "next-auth/react";
export default function SignIn({searchParams}:any){
  const cb=searchParams?.callbackUrl??"/dashboard";
  return(<main className="mx-auto max-w-md p-8 space-y-4">
    <h1 className="text-2xl font-semibold">Sign in</h1>
    <button className="w-full rounded border border-neutral-700 py-2" onClick={()=>signIn("google",{callbackUrl:cb})}>Continue with Google</button>
  </main>);
}
