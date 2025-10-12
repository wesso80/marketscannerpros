"use client";
import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function AfterCheckoutContent() {
  const sp = useSearchParams();

  useEffect(() => {
    const session_id = sp.get("session_id");
    
    if (!session_id) {
      // No session ID, go to pricing
      window.location.href = "/pricing";
      return;
    }
    
    // Call confirm API
    fetch(`/api/stripe/confirm?session_id=${session_id}`, {
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) {
          // Success! Redirect to Streamlit app
          console.log("Payment confirmed! Redirecting to app...");
          setTimeout(() => {
            window.location.href = 'https://app.marketscannerpros.app';
          }, 1000);
        } else {
          // API error - log it and redirect to pricing
          console.error("Confirmation API failed with status:", res.status);
          res.json().then(data => console.error("Error details:", data));
          window.location.href = "/pricing?error=confirmation_failed";
        }
      })
      .catch((err) => {
        // Network/fetch error
        console.error("Network error confirming payment:", err);
        window.location.href = "/pricing?error=network_error";
      });
  }, [sp]);

  return (
    <main className="mx-auto max-w-xl p-8 min-h-screen flex flex-col items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4 text-emerald-400">Payment Successful! 🎉</h1>
        <p className="text-gray-300 mb-8">Activating your Pro Trader features...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-4">Redirecting to app...</p>
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
