// components/Newsletter.tsx
"use client";
import { useState } from "react";
export default function Newsletter() {
  const [email, setEmail] = useState("");
  return (
    <section className="border-b border-neutral-800">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="text-xl font-semibold">Get the Daily Scanner Digest</h3>
          <p className="mt-1 text-sm text-neutral-300">Top squeezes & confluence plays. No spam.</p>
          <form className="mt-4 flex gap-3" onSubmit={(e)=>e.preventDefault()}>
            <input
              type="email"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none"
            />
            <button className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-neutral-900 hover:bg-emerald-400">Subscribe</button>
          </form>
        </div>
      </div>
    </section>
  );
}
