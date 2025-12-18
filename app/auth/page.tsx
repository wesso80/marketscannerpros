"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function AuthContent() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? ""}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        // Cookie is set, redirect to dashboard
        setTimeout(() => {
          router.push("/dashboard");
        }, 1500);
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.8))',
        border: '1px solid rgba(51,65,85,0.8)',
        borderRadius: '20px',
        padding: '40px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px'
          }}>🔐</div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#f1f5f9',
            marginBottom: '8px'
          }}>
            {plan ? 'Activate Your Plan' : 'Sign In'}
          </h1>
          <p style={{
            color: '#94a3b8',
            fontSize: '15px',
            lineHeight: '1.5'
          }}>
            {plan 
              ? `Enter your email to activate ${plan === 'pro_trader' ? 'Pro Trader' : 'Pro'}`
              : 'Enter the email you used at checkout'
            }
          </p>
        </div>

        {success ? (
          <div style={{
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.4)',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
            <div style={{ color: '#10b981', fontWeight: '600', fontSize: '16px' }}>
              Subscription activated!
            </div>
            <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '8px' }}>
              Redirecting to dashboard...
            </div>
          </div>
        ) : (
          <form onSubmit={handleAuth}>
            <div style={{ marginBottom: '20px' }}>
              <label 
                htmlFor="email" 
                style={{
                  display: 'block',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px'
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '16px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <div style={{
                marginBottom: '20px',
                padding: '14px',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: '10px',
                color: '#fca5a5',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '16px',
                background: loading 
                  ? '#374151' 
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.2s'
              }}
            >
              {loading ? '⏳ Verifying...' : '🚀 Activate Subscription'}
            </button>
          </form>
        )}

        <div style={{
          marginTop: '24px',
          paddingTop: '24px',
          borderTop: '1px solid #334155',
          textAlign: 'center'
        }}>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>
            Don't have a subscription yet?
          </p>
          <Link 
            href="/pricing"
            style={{
              color: '#10b981',
              fontSize: '14px',
              fontWeight: '500',
              textDecoration: 'none'
            }}
          >
            View pricing plans →
          </Link>
        </div>

        <p style={{
          marginTop: '20px',
          color: '#475569',
          fontSize: '12px',
          textAlign: 'center'
        }}>
          Your subscription will be linked to this device
        </p>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <main style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
      }}>
        <div style={{ color: '#94a3b8' }}>Loading...</div>
      </main>
    }>
      <AuthContent />
    </Suspense>
  );
}
