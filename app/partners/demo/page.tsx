"use client";
import Link from "next/link";

/* ─── Platform capabilities for broker pitch ─── */
const capabilities = [
  {
    icon: "📊",
    title: "Multi-Asset Scanner",
    description: "Scan 10,000+ equities, crypto, options, and commodities with 15+ technical indicators. Returns structured alignment labels — never buy/sell directives.",
    tier: "All tiers",
  },
  {
    icon: "🥚",
    title: "Golden Egg Analysis",
    description: "Single-symbol deep analysis combining technicals, macro regime, options flow, time confluence, and AI commentary into a structured scenario report.",
    tier: "Pro Trader",
  },
  {
    icon: "🤖",
    title: "ARCA AI Analyst",
    description: "GPT-4.1 powered Q&A system for market analysis, technical commentary, and Pine Script development. Mandatory disclaimers on every response.",
    tier: "All tiers",
  },
  {
    icon: "⏱",
    title: "Time Confluence Engine",
    description: "Multi-timeframe candle close analysis with 50% retracement levels and weighted decompression targets. Unique analytical edge.",
    tier: "Pro Trader",
  },
  {
    icon: "📈",
    title: "Options Flow & Confluence",
    description: "Put/call ratios, IV rank, max pain, unusual activity detection, and open interest distribution. Full options analytics dashboard.",
    tier: "Pro Trader",
  },
  {
    icon: "🔬",
    title: "Strategy Backtesting",
    description: "User-defined strategy backtester against historical data. Returns win rate, profit factor, max drawdown, and equity curves with mandatory limitations disclaimer.",
    tier: "Pro Trader",
  },
  {
    icon: "📋",
    title: "Portfolio & Journal",
    description: "Paper trade portfolio tracker with P&L, plus a trade journal with analytics, streak tracking, and pattern recognition across historical entries.",
    tier: "Pro+",
  },
  {
    icon: "🌍",
    title: "Macro Intelligence",
    description: "Fear/greed indices, sector heatmaps, market breadth, economic calendar, earnings calendar, news sentiment — all in one dashboard.",
    tier: "Pro+",
  },
  {
    icon: "🛡",
    title: "Risk Metrics Engine",
    description: "Rule-based risk evaluation for simulated positions: daily loss limits, portfolio heat caps, R:R minimums, position count limits.",
    tier: "Pro Trader",
  },
  {
    icon: "💹",
    title: "Crypto Terminal",
    description: "Crypto-specific command center with derivatives data, liquidation analysis, DeFi stats, dominance tracking, and new listings monitor.",
    tier: "Pro+",
  },
];

/* ─── Integration options ─── */
const integrations = [
  {
    model: "White-Label Embed",
    description: "Full MSP platform embedded in your client portal via iframe or subdomain. Your branding, our engine.",
    icon: "🏷",
    effort: "Low",
  },

  {
    model: "Co-Branded Platform",
    description: "Joint-branded instance with your logo, colours, and domain. Full customisation of the user experience.",
    icon: "🤝",
    effort: "Medium",
  },
  {
    model: "Authorised Rep Model",
    description: "MSP operates under your AFSL as an authorised representative. Your licence, our technology — fully covered by your existing compliance framework.",
    icon: "📜",
    effort: "Legal review",
  },
];

/* ─── Revenue models ─── */
const revenueModels = [
  { model: "SaaS Fee", description: "Fixed monthly/annual fee for platform access", icon: "💰" },
  { model: "Per-Seat Pricing", description: "Pay per active user accessing MSP tools", icon: "👤" },
  { model: "Revenue Share", description: "Percentage of premium tier fees from your clients", icon: "📊" },
  { model: "Custom Enterprise", description: "Tailored pricing for large-scale deployments", icon: "🏢" },
];

export default function PartnerDemoPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)",
      color: "#f9fafb",
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
    }}>

      {/* ─── Hero ─── */}
      <section style={{
        padding: "80px 20px 60px",
        borderBottom: "1px solid #1f2933",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "#14b8a6",
            padding: "6px 14px",
            borderRadius: 999,
            background: "rgba(20,184,166,0.1)",
            border: "1px solid rgba(20,184,166,0.3)",
            marginBottom: 24,
          }}>
            <span style={{ fontWeight: 700 }}>BROKER &amp; PARTNER DEMO</span>
          </div>

          <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15, marginBottom: 20 }}>
            Add MarketScanner Pros<br />
            <span style={{ color: "#10b981" }}>To Your Platform</span>
          </h1>

          <p style={{
            fontSize: 18,
            color: "#94a3b8",
            maxWidth: 700,
            margin: "0 auto 32px",
            lineHeight: 1.7,
          }}>
            A ready-built AI analytics suite covering equities, crypto, options, and commodities — 
            A ready-built AI analytics suite your clients can use under your existing licence. 
            White-label it, embed it, or co-brand it. No development cost on your side.
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/contact" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 12,
              background: "#10b981",
              color: "#0b1120",
              padding: "14px 32px",
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(16,185,129,0.4)",
            }}>
              Request a Demo Call
            </Link>
            <a href="#capabilities" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 12,
              border: "1px solid #334155",
              background: "transparent",
              color: "#e2e8f0",
              padding: "14px 32px",
              fontSize: 16,
              fontWeight: 600,
              textDecoration: "none",
            }}>
              See Full Capabilities ↓
            </a>
          </div>
        </div>
      </section>

      {/* ─── Value Proposition ─── */}
      <section style={{
        padding: "60px 20px",
        borderBottom: "1px solid #1f2933",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
            Why Brokers Add MSP
          </h2>
          <p style={{ fontSize: 16, color: "#94a3b8", textAlign: "center", marginBottom: 40, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
            Differentiate your platform. Retain active traders. Generate premium-tier revenue.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
            gap: 20,
          }}>
            {[
              {
                stat: "10,000+",
                label: "Assets Scanned",
                detail: "Equities, crypto, options, commodities — all from licensed data providers (Nasdaq, Alpha Vantage, CoinGecko)",
              },
              {
                stat: "15+",
                label: "Technical Indicators",
                detail: "RSI, MACD, Bollinger Bands, ATR, moving averages, volume analysis, and custom confluence scoring",
              },
              {
                stat: "GPT-4.1",
                label: "AI Engine",
                detail: "ARCA AI analyst provides market commentary, scenario analysis, and Pine Script development — with mandatory disclaimers",
              },
              {
                stat: "0",
                label: "Execution Capability",
                detail: "No trades executed, no funds held, no broker connections. Pure analytics — your compliance team will appreciate this",
              },
              {
                stat: "3",
                label: "Subscription Tiers",
                detail: "Free, Pro ($39.99/mo), Pro Trader ($89.99/mo) — ready for your pricing structure or bundled into your existing plans",
              },
              {
                stat: "100%",
                label: "Compliance Remediated",
                detail: "350+ text changes across 95+ files. All outputs use educational framing. Full legal briefing pack available for your compliance review.",
              },
            ].map((item, i) => (
              <div key={i} style={{
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: "24px",
              }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#10b981", marginBottom: 4 }}>
                  {item.stat}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>
                  {item.label}
                </div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Platform Capabilities ─── */}
      <section id="capabilities" style={{
        padding: "60px 20px",
        borderBottom: "1px solid #1f2933",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
            Platform Capabilities
          </h2>
          <p style={{ fontSize: 16, color: "#94a3b8", textAlign: "center", marginBottom: 40 }}>
            Everything your clients need for market analysis — built, tested, and ready to deploy.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
            gap: 16,
          }}>
            {capabilities.map((cap, i) => (
              <div key={i} style={{
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{cap.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{cap.title}</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#10b981",
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}>
                    {cap.tier}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Integration Models ─── */}
      <section style={{
        padding: "60px 20px",
        borderBottom: "1px solid #1f2933",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
            Integration Options
          </h2>
          <p style={{ fontSize: 16, color: "#94a3b8", textAlign: "center", marginBottom: 40 }}>
            Choose the model that fits your platform and compliance requirements.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
            gap: 20,
          }}>
            {integrations.map((item, i) => (
              <div key={i} style={{
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: "24px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{item.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
                  {item.model}
                </h3>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 12 }}>
                  {item.description}
                </p>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#60a5fa",
                  background: "rgba(96,165,250,0.1)",
                  border: "1px solid rgba(96,165,250,0.2)",
                  padding: "3px 10px",
                  borderRadius: 999,
                }}>
                  Effort: {item.effort}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Revenue Models ─── */}
      <section style={{
        padding: "60px 20px",
        borderBottom: "1px solid #1f2933",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
            Revenue Models
          </h2>
          <p style={{ fontSize: 16, color: "#94a3b8", textAlign: "center", marginBottom: 40 }}>
            Flexible commercial arrangements to suit your business.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
            gap: 16,
          }}>
            {revenueModels.map((item, i) => (
              <div key={i} style={{
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: "24px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{item.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>
                  {item.model}
                </h3>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Compliance Section ─── */}
      <section style={{
        padding: "60px 20px",
        borderBottom: "1px solid #1f2933",
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
            Built for Compliance
          </h2>
          <p style={{ fontSize: 16, color: "#94a3b8", textAlign: "center", marginBottom: 40 }}>
            Your compliance team will appreciate the work already done.
          </p>

          <div style={{
            background: "rgba(16, 185, 129, 0.05)",
            border: "1px solid rgba(16, 185, 129, 0.15)",
            borderRadius: 12,
            padding: "28px",
            marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#10b981", marginBottom: 16 }}>
              What We&apos;ve Already Done
            </h3>
            <ul style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 2, margin: 0, padding: 0, listStyle: "none" }}>
              <li>✅ 350+ text changes across 95+ source files — removing directive, advisory, and predictive language</li>
              <li>✅ All outputs use educational framing: &quot;Conditions Aligned&quot; not &quot;Buy Signal&quot;</li>
              <li>✅ Mandatory disclaimers on every AI response, backtest result, and tool page</li>
              <li>✅ No execution capability — zero broker connections, zero order submission</li>
              <li>✅ Paper trade simulation only — clearly labelled throughout</li>
              <li>✅ General Advice Warning, footer disclaimer, and dedicated disclaimer page — MSP does not hold an AFSL and operates under the partner&apos;s licence</li>
              <li>✅ Risk metrics engine uses &quot;simulated entries&quot; language — never permission/execution</li>
              <li>✅ AI system prompts explicitly forbid financial advice, directive language</li>
              <li>✅ Full Legal Briefing Pack (v1.3) prepared for external counsel review</li>
            </ul>
          </div>

          <div style={{
            background: "rgba(96, 165, 250, 0.05)",
            border: "1px solid rgba(96, 165, 250, 0.15)",
            borderRadius: 12,
            padding: "28px",
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#60a5fa", marginBottom: 16 }}>
              Available Documentation
            </h3>
            <ul style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 2, margin: 0, padding: 0, listStyle: "none" }}>
              <li>📄 MSP Legal / Compliance Briefing Pack (v1.3, 800+ lines)</li>
              <li>📄 Entitlement Policy Map — tier-by-tier feature access matrix</li>
              <li>📄 Terms of Service with Paper Trade &amp; AI disclosure sections</li>
              <li>📄 Privacy Policy (GDPR/CCPA compliant)</li>
              <li>📄 Full disclaimer page with AFSL disclosure</li>
              <li>📄 Data licence documentation (Nasdaq, Alpha Vantage, CoinGecko)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Data Sources ─── */}
      <section style={{
        padding: "60px 20px",
        borderBottom: "1px solid #1f2933",
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 40 }}>
            Licensed Data Sources
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
            gap: 16,
          }}>
            {[
              { name: "Nasdaq", type: "Equities", detail: "Licensed market data for US equity display" },
              { name: "Alpha Vantage", type: "Equities, Options, Indicators", detail: "Premium 600 RPM commercial API" },
              { name: "CoinGecko", type: "Cryptocurrency", detail: "Commercial API for crypto OHLC, derivatives, metrics" },
              { name: "OpenAI", type: "AI Engine", detail: "GPT-4o-mini and GPT-4.1 via commercial API" },
            ].map((source, i) => (
              <div key={i} style={{
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: "20px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
                  {source.name}
                </div>
                <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginBottom: 8 }}>
                  {source.type}
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                  {source.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Live Platform Link ─── */}
      <section style={{
        padding: "60px 20px",
        borderBottom: "1px solid #1f2933",
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
            See It Live
          </h2>
          <p style={{ fontSize: 16, color: "#94a3b8", marginBottom: 32, lineHeight: 1.7 }}>
            The full platform is live and operational. Explore any of the tools below to see exactly what your clients would experience.
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
            gap: 12,
          }}>
            {[
              { href: "/tools/scanner", label: "Market Scanner" },
              { href: "/tools/golden-egg", label: "Golden Egg" },
              { href: "/tools/ai-analyst", label: "ARCA AI Analyst" },
              { href: "/tools/options-confluence", label: "Options Terminal" },
              { href: "/tools/crypto", label: "Crypto Terminal" },
              { href: "/tools/backtest", label: "Backtester" },
              { href: "/tools/portfolio", label: "Portfolio Tracker" },
              { href: "/tools/journal", label: "Trade Journal" },
            ].map((tool, i) => (
              <Link key={i} href={tool.href} style={{
                display: "block",
                padding: "12px 16px",
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid #1e293b",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                textAlign: "center",
                transition: "border-color 0.2s",
              }}>
                {tool.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section style={{
        padding: "80px 20px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>
            Ready to Explore a Partnership?
          </h2>
          <p style={{ fontSize: 16, color: "#94a3b8", marginBottom: 32, lineHeight: 1.7 }}>
            We&apos;ll walk you through the platform, discuss integration options, and share the Legal Briefing Pack with your compliance team.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/contact" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 12,
              background: "#10b981",
              color: "#0b1120",
              padding: "16px 36px",
              fontSize: 17,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(16,185,129,0.4)",
            }}>
              Schedule a Demo Call
            </Link>
            <a href="mailto:support@marketscannerpros.app" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 12,
              border: "1px solid #334155",
              background: "transparent",
              color: "#e2e8f0",
              padding: "16px 36px",
              fontSize: 17,
              fontWeight: 600,
              textDecoration: "none",
            }}>
              Email Us Directly
            </a>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 24 }}>
            support@marketscannerpros.app
          </p>
        </div>
      </section>
    </main>
  );
}
