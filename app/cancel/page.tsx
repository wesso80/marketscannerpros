"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CancelInner() {
  const sp = useSearchParams();
  const reason = sp.get("reason") ?? "";
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Checkout Cancelled</h1>
      {reason && <p className="mt-2 text-sm opacity-80">Reason: {reason}</p>}
    </main>
  );
}

export default function CancelPage() {
  return (
    <Suspense fallback={null}>
      <CancelInner />
    </Suspense>
  );
}
