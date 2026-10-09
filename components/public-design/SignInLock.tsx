/** Same signed-out gate as the workspace account lock: "Sign in required" and /auth?next=. */
export default function SignInLock({ heading, detail, next }: { heading: string; detail: string; next: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-[var(--msp-panel)] p-8 text-center" role="status">
      <p className="mb-2 text-sm font-semibold text-amber-300">Sign in required</p>
      <p className="text-xl font-bold text-white">{heading}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{detail}</p>
      <a href={`/auth?next=${encodeURIComponent(next)}`} className="mt-6 inline-flex rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300">Sign In</a>
    </div>
  );
}
