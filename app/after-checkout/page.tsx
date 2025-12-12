"use client";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AfterCheckoutContent() {
  const sp = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const session_id = sp.get("session_id");
    if (!session_id) {
      router.replace("/pricing");
      return;
    }
    
    (async () => {
      try {
        const res = await fetch(`/api/stripe/confirm?session_id=${session_id}`, {
          credentials: "include",
        });
        
        if (res.ok) {
          // Cookie is set server-side, redirect to dashboard
          setTimeout(() => {
            router.replace("/dashboard");
          }, 1000);
        } else {
          console.error("Confirmation failed");
          router.replace("/pricing");
        }
      } catch (err) {
        console.error("Error confirming payment:", err);
        router.replace("/pricing");
      }
    })();
  }, [sp, router]);

  return (
    <main className="mx-auto max-w-xl p-8 min-h-screen flex flex-col items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Finishing up…</h1>
        <p className="text-gray-600 mb-8">We're applying your Pro features. One moment.</p>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    </main>
  );
}

export default function AfterCheckout() {
  return (
    <Suspense fallback={
      <main className="mx-auto max-w-xl p-8 min-h-screen flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      </main>
    }>
      <AfterCheckoutContent />
    </Suspense>
  );
}
