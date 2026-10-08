"use client";

import studio from '@/components/public-design/AccountStudio.module.css';
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { safeNext } from '@/lib/free/safeNext';
import { FREE_COPY } from '@/components/free/copy';

function VerifyMagicLinkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
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
        if (!verifyRes.ok || !verifyData?.email || !verifyData?.loginNonce) {
          setState("error");
          setMessage(verifyData?.error || "Sign-in link is invalid or expired.");
          return;
        }

        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: verifyData.email, loginNonce: verifyData.loginNonce }),
        });

        const loginData = await loginRes.json().catch(() => ({}));
        if (!loginRes.ok) {
          setState("error");
          setMessage(loginData?.error || "Unable to activate your account.");
          return;
        }

        const me = await fetch('/api/me', { credentials: 'include', cache: 'no-store' }).then(response => response.ok ? response.json() : null).catch(() => null);
        const landing = me?.isAdmin || ['pro','pro_trader'].includes(me?.tier || loginData.tier) ? '/tools/command-center' : '/tools/start';
        setState("success");
        setMessage(FREE_COPY.signedIn);
        setTimeout(() => {
          window.location.assign(next ?? landing);
        }, 900);
      } catch {
        setState("error");
        setMessage("Network error while verifying sign-in link.");
      }
    };

    void run();
  }, [router, token, next]);

  const toneClass =
    state === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
      : state === "success"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-white/70";

  return (
    <main className={studio.page}>
      <div className={studio.verify}>
        <div className={studio.verifyCard}>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl">🔐</div>
            <p className={studio.eyebrow}>SECURE ACCESS</p><h1>Verifying your sign-in</h1>
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

export default function VerifyMagicLinkPage() {
  return (
    <Suspense
      fallback={
        <main className={studio.page}>
          <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 text-white/60">Verifying...</div>
        </main>
      }
    >
      <VerifyMagicLinkContent />
    </Suspense>
  );
}
