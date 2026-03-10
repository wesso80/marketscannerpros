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
      <main className="mx-auto max-w-xl p-8 min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--msp-bg)", color: "#E5E7EB" }}>
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4" style={{ color: "#F59E0B" }}>Payment received!</h1>
          <p className="mb-2" style={{ color: "#9CA3AF" }}>Your subscription is active but we had trouble updating your session.</p>
          <p className="mb-6" style={{ color: "#9CA3AF" }}>Please sign in to activate your Pro features:</p>
          <Link
            href="/auth"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              background: "rgba(16,185,129,0.2)",
              color: "#10B981",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: "0.75rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-8 min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--msp-bg)", color: "#E5E7EB" }}>
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Finishing up…</h1>
        <p className="mb-8" style={{ color: "#9CA3AF" }}>We&apos;re applying your Pro features. One moment.</p>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: "#10B981" }}></div>
      </div>
    </main>
  );
}

export default function AfterCheckout() {
  return (
    <Suspense fallback={
      <main className="mx-auto max-w-xl p-8 min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--msp-bg)", color: "#E5E7EB" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: "#10B981" }}></div>
        </div>
      </main>
    }>
      <AfterCheckoutContent />
    </Suspense>
  );
}
