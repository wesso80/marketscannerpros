"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function AccountInner() {
  const sp = useSearchParams();
  const sessionId = sp.get("session_id") ?? "";
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      {sessionId && <p className="mt-2 text-sm opacity-80">Session: {sessionId}</p>}
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}
