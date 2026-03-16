"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 2000;

function AfterCheckoutContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const session_id = sp.get("session_id");
    if (!session_id) {
      router.replace("/pricing");
      return;
    }

    let cancelled = false;

    const confirm = async (attempt: number): Promise<boolean> => {
      try {
        const res = await fetch(`/api/stripe/confirm?session_id=${encodeURIComponent(session_id)}`, {
          credentials: "include",
        });
        if (res.ok) return true;
        console.error(`[after-checkout] confirm attempt ${attempt} failed: ${res.status}`);
        return false;
      } catch (err) {
        console.error(`[after-checkout] confirm attempt ${attempt} error:`, err);
        return false;
      }
    };

    (async () => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (cancelled) return;
        if (attempt > 1) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        const ok = await confirm(attempt);
        if (ok && !cancelled) {
          setStatus("success");
          // Wait briefly so the cookie is fully set before navigating
          await new Promise(r => setTimeout(r, 500));
          router.replace("/tools/markets");
          return;
        }
      }
      if (!cancelled) setStatus("error");
    })();

    return () => { cancelled = true; };
  }, [sp, router]);

  if (status === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center bg-[var(--msp-bg)] p-8 text-slate-200">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-amber-400">Payment received!</h1>
          <p className="mb-2 text-slate-400">Your subscription is active but we had trouble updating your session.</p>
          <p className="mb-6 text-slate-400">Please sign in to activate your Pro features:</p>
          <Link
            href="/auth"
            className="inline-block rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-6 py-3 font-semibold text-emerald-400 transition hover:bg-emerald-500/30"
          >
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center bg-[var(--msp-bg)] p-8 text-slate-200">
      <div className="text-center">
        <h1 className="mb-4 text-3xl font-bold">Finishing up…</h1>
        <p className="mb-8 text-slate-400">We&apos;re applying your Pro features. One moment.</p>
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-500"></div>
      </div>
    </main>
  );
}

export default function AfterCheckout() {
  return (
    <Suspense fallback={
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center bg-[var(--msp-bg)] p-8 text-slate-200">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-500"></div>
        </div>
      </main>
    }>
      <AfterCheckoutContent />
    </Suspense>
  );
}
