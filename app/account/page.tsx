"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PortalButton from "@/components/PortalButton";
import AdaptivePersonalityCard from "@/components/AdaptivePersonalityCard";
import PageHowItWorks from '@/components/PageHowItWorks';
import { useUserTier } from "@/lib/useUserTier";

interface ReferralInfo {
  referralCode: string;
  referralUrl: string;
  stats: {
    pending: number;
    completed: number;
    rewarded: number;
    totalReferrals: number;
  };
}

interface NotificationPrefs {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  emailTo: string;
  discordEnabled: boolean;
  discordWebhookUrl: string;
}

export default function AccountPage() {
  const { tier, isLoading, isLoggedIn } = useUserTier();
  const [isMobile, setIsMobile] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    inAppEnabled: true,
    emailEnabled: false,
    emailTo: '',
    discordEnabled: false,
    discordWebhookUrl: '',
  });
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Get user info
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.email) setEmail(data.email);
      })
      .catch(() => {});

    // Get referral info
    fetch("/api/referral", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setReferralInfo(data);
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    setPrefsLoading(true);
    fetch('/api/notifications/prefs', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        const prefs = data?.prefs || {};
        setNotificationPrefs({
          inAppEnabled: prefs.in_app_enabled !== false,
          emailEnabled: prefs.email_enabled === true,
          emailTo: typeof prefs.email_to === 'string' ? prefs.email_to : '',
          discordEnabled: prefs.discord_enabled === true,
          discordWebhookUrl: typeof prefs.discord_webhook_url === 'string' ? prefs.discord_webhook_url : '',
        });
      })
      .catch(() => {
        setPrefsError('Unable to load notification settings');
      })
      .finally(() => {
        setPrefsLoading(false);
      });
  }, [isLoggedIn]);

  const copyReferralLink = () => {
    if (referralInfo?.referralUrl) {
      navigator.clipboard.writeText(referralInfo.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveNotificationPrefs = async () => {
    setPrefsSaving(true);
    setPrefsMessage(null);
    setPrefsError(null);

    try {
      const res = await fetch('/api/notifications/prefs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPrefs),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefsError(data?.error || 'Failed to save notification settings');
        return;
      }

      setPrefsMessage('Notification settings saved.');
      setTimeout(() => setPrefsMessage(null), 2500);
    } catch {
      setPrefsError('Failed to save notification settings');
    } finally {
      setPrefsSaving(false);
    }
  };

  const tierDisplay = {
    free: { name: "Free", color: "#9ca3af", badge: "#475569" },
    pro: { name: "Pro", color: "#22c55e", badge: "#059669" },
    pro_trader: { name: "Pro Trader", color: "var(--msp-accent)", badge: "var(--msp-accent)" },
    anonymous: { name: "Not Signed In", color: "#6b7280", badge: "#374151" },
  };

  const currentTier = tierDisplay[tier] || tierDisplay.anonymous;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f9fafb" }}>
      {/* Header */}
      <div style={{ 
        borderBottom: "1px solid rgba(51,65,85,0.5)", 
        padding: isMobile ? "14px" : "20px",
        background: "rgba(15,23,42,0.8)"
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 0 }}>
          <Link href="/tools" style={{ color: "#94a3b8", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            ← Back to Tools
          </Link>
          <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>Account Settings</h1>
          {!isMobile && <div style={{ width: 100 }}></div>}
        </div>
      </div>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: isMobile ? "24px 14px" : "40px 20px" }}>
        <PageHowItWorks route="/account" />

        <AdaptivePersonalityCard
          skill="account"
          setupText={`Account page ${tier} plan and lifecycle context`}
          baseScore={50}
        />

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 24 }}>Loading...</div>
          </div>
        ) : !isLoggedIn ? (
          <div style={{ 
            textAlign: "center", 
            padding: 60,
            background: "var(--msp-card)",
            borderRadius: 16,
            border: "1px solid rgba(51,65,85,0.8)"
          }}>
            <h2 style={{ fontSize: 24, marginBottom: 16 }}>Sign In Required</h2>
            <p style={{ color: "#94a3b8", marginBottom: 24 }}>
              Please sign in to view your account settings.
            </p>
            <Link 
              href="/auth"
              style={{
                display: "inline-block",
                padding: "12px 32px",
                background: "var(--msp-accent)",
                color: "#0b1120",
                borderRadius: 999,
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              Sign In
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Subscription Status Card */}
            <div style={{ 
              background: "var(--msp-card)",
              borderRadius: 16,
              border: "1px solid rgba(51,65,85,0.8)",
              padding: isMobile ? 18 : 32,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
            }}>
              <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <span>📊</span> Subscription Status
              </h2>
              
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div style={{
                  padding: "8px 20px",
                  background: currentTier.badge,
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#fff"
                }}>
                  {currentTier.name}
                </div>
                {tier === "pro" || tier === "pro_trader" ? (
                  <span style={{ color: "#22c55e", fontSize: 14 }}>✓ Active</span>
                ) : (
                  <span style={{ color: "#94a3b8", fontSize: 14 }}>Free tier</span>
                )}
              </div>

              {email && (
                <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>
                  Signed in as: <strong style={{ color: "#e5e7eb" }}>{email}</strong>
                </p>
              )}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(tier === "pro" || tier === "pro_trader") && (
                  <PortalButton />
                )}
                
                {tier === "free" && (
                  <Link
                    href="/pricing"
                    style={{
                      padding: "10px 20px",
                      background: "var(--msp-accent)",
                      border: "none",
                      borderRadius: 10,
                      color: "#0b1120",
                      fontWeight: 600,
                      fontSize: 14,
                      textDecoration: "none",
                      boxShadow: "0 4px 14px rgba(20,184,166,0.4)"
                    }}
                  >
                    🚀 Upgrade to Pro
                  </Link>
                )}
              </div>
            </div>

            {/* Plan Features Card */}
            <div style={{ 
              background: "var(--msp-card)",
              borderRadius: 16,
              border: "1px solid rgba(51,65,85,0.8)",
              padding: isMobile ? 18 : 32
            }}>
              <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <span>✨</span> Your Plan Features
              </h2>
              
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {tier === "free" && (
                  <>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Scanner (Top 10 equities + crypto)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> MSP Analyst AI (10/day)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Portfolio tracker (3 positions)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Trade journal
                    </li>
                  </>
                )}
                {tier === "pro" && (
                  <>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Unlimited symbol scanning
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> MSP Analyst AI (50/day)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Market Movers & News
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> Company Overview
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> AI Tools & Insights
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "#22c55e" }}>✓</span> CSV exports
                    </li>
                  </>
                )}
                {tier === "pro_trader" && (
                  <>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "var(--msp-accent)" }}>✓</span> Everything in Pro
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "var(--msp-accent)" }}>✓</span> MSP Analyst AI (200/day)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "var(--msp-accent)" }}>✓</span> Full backtesting engine
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "var(--msp-accent)" }}>✓</span> Golden Egg Deep Analysis
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: 10, color: "#e5e7eb" }}>
                      <span style={{ color: "var(--msp-accent)" }}>✓</span> Premium support
                    </li>
                  </>
                )}
              </ul>
            </div>
            {/* Referral Program Card */}
            {referralInfo && (
              <div style={{ 
                background: "var(--msp-panel)",
                borderRadius: 16,
                border: "1px solid var(--msp-border)",
                padding: isMobile ? 18 : 32
              }}>
                <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>🎁</span> Refer a Friend
                </h2>
                <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>
                  When your friend subscribes, you <strong style={{ color: "var(--msp-accent)" }}>both get 1 month Pro Trader free!</strong>
                </p>

                {/* Referral Link */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 8 }}>
                    Your Referral Link
                  </label>
                  <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                    <input
                      type="text"
                      readOnly
                      value={referralInfo.referralUrl}
                      style={{
                        flex: 1,
                        padding: "12px 16px",
                        background: "rgba(15,23,42,0.8)",
                        border: "1px solid rgba(51,65,85,0.5)",
                        borderRadius: 8,
                        color: "#e5e7eb",
                        fontSize: 13,
                      }}
                    />
                    <button
                      onClick={copyReferralLink}
                      style={{
                        padding: "12px 20px",
                        background: copied ? "#22c55e" : "var(--msp-accent)",
                        border: "none",
                        borderRadius: 8,
                        color: "#fff",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}
                    >
                      {copied ? "✓ Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Referral Stats */}
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", 
                  gap: 16,
                  padding: 16,
                  background: "rgba(15,23,42,0.5)",
                  borderRadius: 12
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#fbbf24" }}>{referralInfo.stats.pending}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Pending</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>{referralInfo.stats.rewarded}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Rewarded</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#60a5fa" }}>{referralInfo.stats.totalReferrals}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Total</div>
                  </div>
                </div>
              </div>
            )}

            {/* Notification Preferences Card */}
            <div style={{
              background: 'var(--msp-card)',
              borderRadius: 16,
              border: '1px solid rgba(51,65,85,0.8)',
              padding: 32
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>🔔</span> Notification Delivery Settings
              </h2>
              <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>
                Choose how trade lifecycle notifications are delivered to you.
              </p>

              {prefsLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 14 }}>Loading settings...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e5e7eb', fontSize: 14 }}>
                      <span>In-app notifications</span>
                      <input
                        type="checkbox"
                        checked={notificationPrefs.inAppEnabled}
                        onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, inAppEnabled: e.target.checked }))}
                      />
                    </label>

                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e5e7eb', fontSize: 14 }}>
                      <span>Email notifications</span>
                      <input
                        type="checkbox"
                        checked={notificationPrefs.emailEnabled}
                        onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, emailEnabled: e.target.checked }))}
                      />
                    </label>
                    <input
                      type="email"
                      value={notificationPrefs.emailTo}
                      onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, emailTo: e.target.value }))}
                      placeholder="you@example.com"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(15,23,42,0.8)',
                        border: '1px solid rgba(51,65,85,0.7)',
                        borderRadius: 8,
                        color: '#e5e7eb',
                        fontSize: 13,
                      }}
                    />

                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e5e7eb', fontSize: 14 }}>
                      <span>Discord notifications</span>
                      <input
                        type="checkbox"
                        checked={notificationPrefs.discordEnabled}
                        onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, discordEnabled: e.target.checked }))}
                      />
                    </label>
                    <input
                      type="url"
                      value={notificationPrefs.discordWebhookUrl}
                      onChange={(e) => setNotificationPrefs((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))}
                      placeholder="https://discord.com/api/webhooks/..."
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(15,23,42,0.8)',
                        border: '1px solid rgba(51,65,85,0.7)',
                        borderRadius: 8,
                        color: '#e5e7eb',
                        fontSize: 13,
                      }}
                    />
                  </div>

                  {prefsError && (
                    <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{prefsError}</p>
                  )}
                  {prefsMessage && (
                    <p style={{ color: '#34d399', fontSize: 13, marginBottom: 12 }}>{prefsMessage}</p>
                  )}

                  <button
                    onClick={() => void saveNotificationPrefs()}
                    disabled={prefsSaving}
                    style={{
                      padding: '10px 20px',
                      background: 'var(--msp-accent)',
                      border: 'none',
                      borderRadius: 10,
                      color: '#0b1120',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: prefsSaving ? 'not-allowed' : 'pointer',
                      opacity: prefsSaving ? 0.7 : 1,
                    }}
                  >
                    {prefsSaving ? 'Saving...' : 'Save Notification Settings'}
                  </button>
                </>
              )}
            </div>

            {/* Help Card */}
            <div style={{ 
              background: "rgba(15,23,42,0.5)",
              borderRadius: 16,
              border: "1px solid rgba(51,65,85,0.5)",
              padding: isMobile ? 16 : 24,
              textAlign: "center"
            }}>
              <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>
                Need help? Contact us at{" "}
                <a href="mailto:support@marketscannerpros.app" style={{ color: "#22c55e" }}>
                  support@marketscannerpros.app
                </a>
              </p>
            </div>

            {/* Data Management Card */}
            <div style={{ 
              background: "rgba(239,68,68,0.05)",
              borderRadius: 16,
              border: "1px solid rgba(239,68,68,0.2)",
              padding: isMobile ? 16 : 24,
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, color: "#f87171" }}>
                <span>🗑️</span> Data Management
              </h2>
              <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
                Under GDPR and Australian Privacy laws, you have the right to request deletion of your personal data.
              </p>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to request deletion of all your data? This action cannot be undone. You will receive a confirmation email within 48 hours.")) {
                    // Send deletion request
                    fetch("/api/auth/delete-request", {
                      method: "POST",
                      credentials: "include"
                    }).then(res => {
                      if (res.ok) {
                        alert("Data deletion request submitted. You will receive a confirmation email within 48 hours.");
                      } else {
                        alert("Failed to submit request. Please email support@marketscannerpros.app directly.");
                      }
                    }).catch(() => {
                      alert("Failed to submit request. Please email support@marketscannerpros.app directly.");
                    });
                  }
                }}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                Request Data Deletion
              </button>
              <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12 }}>
                Or email <a href="mailto:support@marketscannerpros.app?subject=Data%20Deletion%20Request" style={{ color: "#94a3b8" }}>support@marketscannerpros.app</a> with subject "Data Deletion Request"
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
