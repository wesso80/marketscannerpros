// components/Newsletter.tsx
"use client";
import { useState } from "react";
export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<'idle'|'sending'|'done'|'error'>('idle');

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    try {
      // TODO: wire to email provider API (e.g. /api/newsletter/subscribe)
      await new Promise(r => setTimeout(r, 600));
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className="border-b border-neutral-800">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="text-xl font-semibold">Get the Daily Scanner Digest</h3>
          <p className="mt-1 text-sm text-neutral-300">Top squeezes & confluence plays. No spam.</p>
          {status === 'done' ? (
            <p className="mt-4 text-emerald-400 text-sm">Thanks! We&apos;ll be in touch.</p>
          ) : (
            <form className="mt-4 flex gap-3" onSubmit={handleSubscribe}>
              <input
                type="email"
                required
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none"
              />
              <button
                disabled={status === 'sending'}
                className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-neutral-900 hover:bg-emerald-400 disabled:opacity-50"
              >
                {status === 'sending' ? 'Sending…' : 'Subscribe'}
              </button>
            </form>
          )}
          {status === 'error' && <p className="mt-2 text-red-400 text-xs">Something went wrong — please try again.</p>}
        </div>
      </div>
    </section>
  );
}
