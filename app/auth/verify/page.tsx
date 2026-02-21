"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function VerifyMagicLinkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying sign-in link...");

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setState("error");
        setMessage("Missing sign-in token.");
        return;
      }

      try {
        const verifyRes = await fetch("/api/auth/magic-link/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });

        const verifyData = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok || !verifyData?.email) {
          setState("error");
          setMessage(verifyData?.error || "Sign-in link is invalid or expired.");
          return;
        }

        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: verifyData.email }),
        });

        const loginData = await loginRes.json().catch(() => ({}));
        if (!loginRes.ok) {
          setState("error");
          setMessage(loginData?.error || "Unable to activate your account.");
          return;
        }

        setState("success");
        setMessage("Signed in successfully. Redirecting to command center...");
        setTimeout(() => {
          router.push("/tools/markets");
        }, 900);
      } catch {
        setState("error");
        setMessage("Network error while verifying sign-in link.");
      }
    };

    void run();
  }, [router, token]);

  const toneClass =
    state === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
      : state === "success"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-white/70";

  return (
    <main className="min-h-screen bg-[#070B14] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-24 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-14">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl">🔐</div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Verifying your sign-in</h1>
          </div>

          <div className={`mt-5 rounded-2xl border p-3 text-xs ${toneClass}`}>{message}</div>

          {state === "error" ? (
            <div className="mt-5 text-center text-xs text-white/60">
              <Link href="/auth" className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200">
                Back to sign in
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
