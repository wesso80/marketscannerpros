"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SuccessInner() {
  const sp = useSearchParams();
  const sessionId = sp.get("session_id") ?? "";
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Payment Successful 🎉</h1>
      {sessionId && <p className="mt-2 text-sm opacity-80">Session: {sessionId}</p>}
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
