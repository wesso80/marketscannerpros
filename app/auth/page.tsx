"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type StatusState = { tone: "idle" | "loading" | "success" | "error"; text: string };

function AdminLoginSection() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [adminStatus, setAdminStatus] = useState<StatusState>({ tone: "idle", text: "" });
  const [adminLoading, setAdminLoading] = useState(false);

  const handleAdminLogin = async () => {
    if (!adminEmail || !passphrase) {
      setAdminStatus({ tone: "error", text: "Enter email and passphrase." });
      return;
    }
    setAdminLoading(true);
    setAdminStatus({ tone: "loading", text: "Authenticating..." });
    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: adminEmail, passphrase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminStatus({ tone: "error", text: data?.error || "Authentication failed." });
        return;
      }
      setAdminStatus({ tone: "success", text: "Admin access granted. Redirecting..." });
      setTimeout(() => router.push("/tools/explorer"), 600);
    } catch {
      setAdminStatus({ tone: "error", text: "Network error." });
    } finally {
      setAdminLoading(false);
    }
  };

  const toneClass =
    adminStatus.tone === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
      : adminStatus.tone === "success"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-white/70";

  return (
    <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
        <span>🛡️</span> Admin Direct Login
      </div>
      {adminStatus.tone !== "idle" && (
        <div className={`mt-3 rounded-2xl border p-3 text-xs ${toneClass}`}>{adminStatus.text}</div>
      )}
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => { e.preventDefault(); void handleAdminLogin(); }}
      >
        <input
          type="email"
          placeholder="Admin email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0B1222] px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40"
        />
        <input
          type="password"
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0B1222] px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40"
        />
        <button
          type="submit"
          disabled={adminLoading}
          className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {adminLoading ? "Authenticating..." : "Admin Sign In"}
        </button>
      </form>
    </div>
  );
}

function AuthContent() {
  const [email, setEmail] = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const [status, setStatus] = useState<StatusState>({ tone: "idle", text: "" });
  const [success] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  void searchParams; // keep for Suspense boundary

  // If already logged in, redirect to tools
  const [checkingSession, setCheckingSession] = useState(true);
  useState(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d?.authenticated) {
          router.replace('/tools');
        } else {
          setCheckingSession(false);
        }
      })
      .catch(() => setCheckingSession(false));
  });

  const clearStatus = () => setStatus({ tone: "idle", text: "" });

  const handleSendMagicLink = async () => {
    if (!email || !email.includes("@")) {
      setStatus({ tone: "error", text: "Enter a valid email address." });
      return;
    }

    setMagicLoading(true);
    setStatus({ tone: "loading", text: "Sending secure sign-in link..." });

    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ tone: "error", text: data?.error || "Could not send sign-in link." });
        return;
      }

      setStatus({
        tone: "success",
        text: data?.message || "Check your inbox for your secure sign-in link.",
      });
    } catch {
      setStatus({ tone: "error", text: "Network error while sending sign-in link." });
    } finally {
      setMagicLoading(false);
    }
  };



  const statusClassName =
    status.tone === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
      : status.tone === "success"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-white/70";

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      {checkingSession ? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
      <>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-24 h-[300px] w-[300px] md:h-[520px] md:w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-48 h-[400px] w-[400px] md:h-[760px] md:w-[760px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-14">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex items-start justify-between">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                How it works
              </span>
              <span className="text-[11px] text-white/40">No password required</span>
            </div>

            <div className="mt-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <span className="text-xl">🔐</span>
              </div>

              <h1 className="mt-4 text-xl font-semibold tracking-tight">Sign In to MarketScannerPros</h1>

              <p className="mt-2 text-sm text-white/60">Enter your email and we’ll send a secure sign-in link.</p>
            </div>

            {status.tone !== "idle" ? (
              <div className={`mt-5 rounded-2xl border p-3 text-xs ${statusClassName}`}>
                {status.text}
              </div>
            ) : null}

            {!success ? (
              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendMagicLink();
                }}
              >
                <div>
                  <label className="mb-2 block text-xs font-medium text-white/70">Email address</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (status.tone !== "idle") clearStatus();
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-[#0B1222] px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/10"
                  />
                  <p className="mt-2 text-[11px] text-white/40">Use the email tied to your subscription if you already upgraded.</p>
                </div>

                <button
                  type="submit"
                  disabled={magicLoading}
                  className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-3 text-sm font-semibold transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {magicLoading ? "⏳ Sending..." : "✉️ Send Sign-In Link"}
                </button>

                <div className="pt-1 text-center text-xs text-white/50">
                  Don’t have a subscription?{" "}
                  <Link href="/pricing" className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200">
                    View pricing plans
                  </Link>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-white/60">Not receiving the email?</p>
                  <ul className="mt-2 space-y-1 text-[11px] text-white/45">
                    <li>• Check spam/promotions folders</li>
                    <li>• Wait 30–60 seconds and try again</li>
                    <li>
                      • Contact{" "}
                      <Link href="/contact" className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200">
                        support
                      </Link>{" "}
                      if it still doesn’t show
                    </li>
                  </ul>
                </div>
              </form>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center text-sm text-emerald-200">
                Access granted. Redirecting to your command center...
              </div>
            )}
          </div>

          <AdminLoginSection />

          <div className="mt-6 text-center text-[11px] text-white/35">Educational tool only · Not financial advice</div>
        </div>
      </div>
      </>
      )}
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[var(--msp-bg)] text-white">
          <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 text-white/60">Loading...</div>
        </main>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
