"use client";
import Link from "next/link";

export default function PartnersPage() {
  return (
    <>
      <style jsx global>{`
        :root {
          --bg: #05070b;
          --bg-alt: #0c1018;
          --card: #111624;
          --accent: #14b8a6;
          --accent-soft: rgba(20, 184, 166, 0.12);
          --text-main: #f9fafb;
          --text-muted: #9ca3af;
          --border-subtle: #1f2933;
        }
      `}</style>

      {/* Hero Section */}
      <section style={{
        width: '100%',
        background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
        color: '#f9fafb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        borderBottom: '1px solid #1f2933',
        padding: '80px 20px'
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#14b8a6',
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(20,184,166,0.1)',
            border: '1px solid rgba(20,184,166,0.3)',
            marginBottom: 24
          }}>
            <span>🤝</span>
            <span style={{ fontWeight: 600 }}>PARTNER PROGRAM</span>
          </div>

          <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.2, marginBottom: 20 }}>
            MarketScanner Pros — <br/>
            <span style={{ color: '#14b8a6' }}>Partner & Educator Program</span>
          </h1>

          <p style={{ fontSize: 20, color: '#e5e7eb', fontWeight: 600, marginBottom: 16, maxWidth: 800, margin: '0 auto 16px' }}>
            Bring Your Trading Methodology to Life — With Structure, Clarity, and AI
          </p>

          <p style={{ fontSize: 16, color: '#9ca3af', maxWidth: 700, margin: '0 auto 32px', lineHeight: 1.7 }}>
            MarketScanner Pros partners with trading educators and communities to combine your expertise with our market intelligence platform.
          </p>

          <div style={{ 
            maxWidth: 600,
            margin: '0 auto 40px',
            padding: '24px',
            background: 'rgba(20,184,166,0.05)',
            border: '1px solid rgba(20,184,166,0.2)',
            borderRadius: 12
          }}>
            <p style={{ fontSize: 16, color: '#e5e7eb', lineHeight: 1.8, margin: 0 }}>
              You teach the <strong style={{ color: '#14b8a6' }}>why</strong>.<br/>
              We provide the <strong style={{ color: '#22c55e' }}>infrastructure</strong>.
            </p>
            <p style={{ fontSize: 15, color: '#9ca3af', marginTop: 12, fontStyle: 'italic' }}>
              Together, we give traders clarity — not noise.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/contact" style={{
              display: 'inline-block',
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
              color: '#0b1120',
              padding: '14px 32px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'none',
              boxShadow: '0 4px 15px rgba(20,184,166,0.4)'
            }}>
              Apply for Partnership
            </Link>
            <Link href="#how-it-works" style={{
              display: 'inline-block',
              borderRadius: 999,
              border: '1px solid #1f2933',
              background: 'transparent',
              color: '#e5e7eb',
              padding: '14px 32px',
              fontSize: 16,
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'none'
            }}>
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* Who This Is For */}
      <section style={{
        width: '100%',
        background: 'linear-gradient(180deg, #000 0%, #0a0e1a 50%, #000 100%)',
        color: '#f9fafb',
        padding: '60px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
            Who This Is For
          </h2>
          <p style={{ fontSize: 18, color: '#14b8a6', marginBottom: 40, textAlign: 'center' }}>
            Designed for Trading Educators & Communities
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
            marginBottom: 40
          }}>
            <div style={{
              background: 'linear-gradient(145deg, #0f172a, #020617)',
              borderRadius: 12,
              border: '1px solid rgba(34,197,94,0.2)',
              padding: '28px'
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#22c55e', marginBottom: 20 }}>
                ✔ Perfect For
              </h3>
              <ul style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 2,
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                <li>✔ Discord trading groups</li>
                <li>✔ Market structure educators</li>
                <li>✔ Signal providers evolving beyond alerts</li>
                <li>✔ Analysts with proven frameworks</li>
                <li>✔ Content creators who teach, not hype</li>
              </ul>
            </div>

            <div style={{
              background: 'linear-gradient(145deg, #1e1b1b, #0a0808)',
              borderRadius: 12,
              border: '1px solid rgba(239,68,68,0.2)',
              padding: '28px'
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#ef4444', marginBottom: 20 }}>
                ❌ Not For
              </h3>
              <ul style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 2,
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                <li>❌ Pump groups</li>
                <li>❌ "Guaranteed returns" sellers</li>
                <li>❌ Anonymous signal spam</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section style={{
        width: '100%',
        background: '#05070b',
        color: '#f9fafb',
        padding: '60px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
            The Problem Partners Face
          </h2>
          <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 32, textAlign: 'center' }}>
            Most educators struggle with:
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 32
          }}>
            {[
              'Scaling analysis without burning out',
              'Explaining context repeatedly',
              'Members misusing signals',
              'Lack of structure across timeframes',
              'Signal blame during chop phases'
            ].map((problem, i) => (
              <div key={i} style={{
                padding: '20px',
                background: 'rgba(239,68,68,0.05)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                textAlign: 'center'
              }}>
                <p style={{ fontSize: 15, color: '#e5e7eb', margin: 0 }}>{problem}</p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 18, color: '#f59e0b', fontWeight: 600, textAlign: 'center' }}>
            Your edge is knowledge — but delivery is the bottleneck.
          </p>
        </div>
      </section>

      {/* The Solution */}
      <section style={{
        width: '100%',
        background: 'linear-gradient(180deg, #000 0%, #0a0e1a 50%, #000 100%)',
        color: '#f9fafb',
        padding: '60px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
            The MSP Partner Solution
          </h2>
          <p style={{ fontSize: 20, color: '#14b8a6', marginBottom: 40, textAlign: 'center' }}>
            Your System. Our Intelligence Engine.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 32,
            marginBottom: 40
          }}>
            {/* We Provide */}
            <div style={{
              padding: '32px',
              background: 'linear-gradient(145deg, #0f172a, #020617)',
              border: '1px solid rgba(20,184,166,0.3)',
              borderRadius: 12
            }}>
              <h3 style={{ fontSize: 22, fontWeight: 600, color: '#14b8a6', marginBottom: 20 }}>
                We Provide:
              </h3>
              <ul style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 1.9,
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                <li style={{ marginBottom: 10 }}>✓ Multi-asset scanners</li>
                <li style={{ marginBottom: 10 }}>✓ Multi-timeframe structure</li>
                <li style={{ marginBottom: 10 }}>✓ Phase-based market logic</li>
                <li style={{ marginBottom: 10 }}>✓ AI-powered signal explanations</li>
                <li>✓ TradingView-aligned workflows</li>
              </ul>
            </div>

            {/* You Provide */}
            <div style={{
              padding: '32px',
              background: 'linear-gradient(145deg, #0f172a, #020617)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 12
            }}>
              <h3 style={{ fontSize: 22, fontWeight: 600, color: '#22c55e', marginBottom: 20 }}>
                You Provide:
              </h3>
              <ul style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 1.9,
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                <li style={{ marginBottom: 10 }}>✓ Your methodology</li>
                <li style={{ marginBottom: 10 }}>✓ Your education</li>
                <li style={{ marginBottom: 10 }}>✓ Your rules & philosophy</li>
                <li>✓ Your community</li>
              </ul>
            </div>
          </div>

          <p style={{ 
            fontSize: 18, 
            color: '#e5e7eb', 
            fontWeight: 600, 
            textAlign: 'center',
            padding: '20px',
            background: 'rgba(34,197,94,0.1)',
            borderRadius: 8,
            border: '1px solid rgba(34,197,94,0.2)'
          }}>
            The result: <span style={{ color: '#22c55e' }}>structured learning</span> + <span style={{ color: '#14b8a6' }}>scalable analysis</span>.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" style={{
        width: '100%',
        background: '#05070b',
        color: '#f9fafb',
        padding: '60px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 48, textAlign: 'center' }}>
            How Partner Pages Work
          </h2>

          {/* Step 1 */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700
              }}>
                1
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
                Dedicated Partner Landing Page
              </h3>
            </div>

            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 20 }}>
              You receive:
            </p>

            <div style={{
              padding: '24px',
              background: 'rgba(59,130,246,0.05)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 8,
              marginBottom: 20
            }}>
              <ul style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 1.8,
                margin: 0,
                paddingLeft: 20
              }}>
                <li>A branded page on MarketScanner Pros</li>
                <li>Your methodology explained clearly</li>
                <li>Your rules mapped to MSP scanners</li>
                <li>Direct links to your Discord, courses, or community</li>
              </ul>
            </div>

            <div style={{
              padding: '20px',
              background: 'rgba(15,23,42,0.9)',
              borderLeft: '3px solid #60a5fa',
              borderRadius: 4
            }}>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0, fontStyle: 'italic' }}>
                <strong style={{ color: '#60a5fa' }}>Example:</strong><br/>
                "This page shows how [Partner Name] uses MarketScanner Pros to identify structure, phases, and high-probability conditions."
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700
              }}>
                2
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
                Your Logic, Mapped to MSP Structure
              </h3>
            </div>

            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 20 }}>
              We align:
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20
            }}>
              <div style={{
                padding: '20px',
                background: 'rgba(34,197,94,0.05)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 8
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#22c55e', marginBottom: 12 }}>
                  Your Concepts:
                </p>
                <ul style={{ fontSize: 14, color: '#e5e7eb', lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
                  <li>Your entry logic</li>
                  <li>Your timeframe bias</li>
                  <li>Your confirmation rules</li>
                  <li>Your risk philosophy</li>
                </ul>
              </div>

              <div style={{
                padding: '20px',
                background: 'rgba(20,184,166,0.05)',
                border: '1px solid rgba(20,184,166,0.2)',
                borderRadius: 8
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#14b8a6', marginBottom: 12 }}>
                  MSP Structure:
                </p>
                <ul style={{ fontSize: 14, color: '#e5e7eb', lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
                  <li>Bullish / Bearish / Consolidation Phases</li>
                  <li>Multi-Timeframe Alignment</li>
                  <li>Liquidity Zones</li>
                  <li>Trend continuation vs exhaustion</li>
                </ul>
              </div>
            </div>

            <p style={{ fontSize: 16, color: '#e5e7eb', marginTop: 20, fontWeight: 600, textAlign: 'center' }}>
              Your system becomes repeatable and teachable.
            </p>
          </div>

          {/* Step 3 */}
          <div>
            <div style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700
              }}>
                3
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
                AI Analyst — Teaching at Scale
              </h3>
            </div>

            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 20 }}>
              The MSP AI Analyst:
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 24
            }}>
              {[
                'Explains signals using your framework',
                'Reinforces your rules',
                'Reduces repetitive questions',
                'Improves member discipline'
              ].map((benefit, i) => (
                <div key={i} style={{
                  padding: '16px',
                  background: 'rgba(20,184,166,0.05)',
                  border: '1px solid rgba(20,184,166,0.2)',
                  borderRadius: 8,
                  textAlign: 'center'
                }}>
                  <p style={{ fontSize: 14, color: '#e5e7eb', margin: 0 }}>{benefit}</p>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 16, color: '#14b8a6', fontWeight: 600, textAlign: 'center', fontStyle: 'italic' }}>
              It doesn't replace you — it amplifies you.
            </p>
          </div>
        </div>
      </section>

      {/* What Partners Gain */}
      <section style={{
        width: '100%',
        background: 'linear-gradient(180deg, #000 0%, #0a0e1a 50%, #000 100%)',
        color: '#f9fafb',
        padding: '60px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 40, textAlign: 'center' }}>
            What Partners Gain
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
            marginBottom: 40
          }}>
            <div style={{
              padding: '28px',
              background: 'linear-gradient(145deg, #0f172a, #020617)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 12
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#22c55e', marginBottom: 20 }}>
                Core Benefits
              </h3>
              <ul style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 1.9,
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                <li style={{ marginBottom: 10 }}>✓ Professional infrastructure without building it</li>
                <li style={{ marginBottom: 10 }}>✓ Scalable analysis delivery</li>
                <li style={{ marginBottom: 10 }}>✓ Higher-quality members</li>
                <li style={{ marginBottom: 10 }}>✓ Reduced signal misuse</li>
                <li style={{ marginBottom: 10 }}>✓ Increased trust and retention</li>
                <li>✓ Cross-promotion to MSP users</li>
              </ul>
            </div>

            <div style={{
              padding: '28px',
              background: 'linear-gradient(145deg, #0f172a, #020617)',
              border: '1px solid rgba(20,184,166,0.2)',
              borderRadius: 12
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#14b8a6', marginBottom: 20 }}>
                Optional Add-Ons
              </h3>
              <ul style={{ 
                fontSize: 15, 
                color: '#e5e7eb', 
                lineHeight: 1.9,
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                <li style={{ marginBottom: 10 }}>• Revenue sharing</li>
                <li style={{ marginBottom: 10 }}>• Affiliate tracking</li>
                <li>• Custom onboarding flows</li>
              </ul>
            </div>
          </div>

          <div style={{
            padding: '32px',
            background: 'rgba(59,130,246,0.05)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 12,
            textAlign: 'center'
          }}>
            <h3 style={{ fontSize: 22, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>
              What Your Members Gain
            </h3>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              flexWrap: 'wrap',
              fontSize: 15,
              color: '#e5e7eb'
            }}>
              <span>✓ Clear signal explanations</span>
              <span>✓ Context across timeframes</span>
              <span>✓ Less emotional trading</span>
              <span>✓ Better understanding of your system</span>
              <span>✓ A learning-first environment</span>
            </div>
            <p style={{ fontSize: 15, color: '#9ca3af', marginTop: 20, fontStyle: 'italic' }}>
              This reduces churn and improves outcomes.
            </p>
          </div>
        </div>
      </section>

      {/* Example Use Cases */}
      <section style={{
        width: '100%',
        background: '#05070b',
        color: '#f9fafb',
        padding: '60px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 40, textAlign: 'center' }}>
            Example Partner Use Cases
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 20
          }}>
            {[
              { role: 'Educator', use: 'Uses MSP scanners to teach phase logic live' },
              { role: 'Discord Owner', use: 'Replaces raw alerts with explained setups' },
              { role: 'YouTuber', use: 'Walks through AI Analyst explanations on video' },
              { role: 'Signal Provider', use: 'Transitions from "alerts" to "analysis"' }
            ].map((example, i) => (
              <div key={i} style={{
                padding: '24px',
                background: 'linear-gradient(145deg, #0f172a, #020617)',
                border: '1px solid rgba(20,184,166,0.2)',
                borderRadius: 8
              }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#14b8a6', marginBottom: 8 }}>
                  {example.role}
                </p>
                <p style={{ fontSize: 14, color: '#e5e7eb', margin: 0 }}>
                  {example.use}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner Standards */}
      <section style={{
        width: '100%',
        background: 'linear-gradient(180deg, #000 0%, #0a0e1a 50%, #000 100%)',
        color: '#f9fafb',
        padding: '60px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 20 }}>
            Partner Standards
          </h2>
          <p style={{ fontSize: 16, color: '#f59e0b', marginBottom: 32, fontWeight: 600 }}>
            To protect quality and trust:
          </p>

          <div style={{
            padding: '32px',
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12,
            marginBottom: 24
          }}>
            <ul style={{ 
              fontSize: 16, 
              color: '#e5e7eb', 
              lineHeight: 2,
              listStyle: 'none',
              padding: 0,
              margin: 0
            }}>
              <li>✔ Education-first approach</li>
              <li>✔ No profit guarantees</li>
              <li>✔ No financial advice claims</li>
              <li>✔ Transparent methodology</li>
              <li>✔ Community focus</li>
            </ul>
          </div>

          <p style={{ fontSize: 18, color: '#ef4444', fontWeight: 700 }}>
            We partner selectively.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{
        width: '100%',
        background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
        color: '#f9fafb',
        padding: '80px 20px',
        borderBottom: '1px solid #1f2933'
      }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 20, lineHeight: 1.2 }}>
            Build Better Traders —<br/>
            <span style={{ color: '#14b8a6' }}>Not Louder Signals</span>
          </h2>
          <p style={{ fontSize: 17, color: '#9ca3af', marginBottom: 40, lineHeight: 1.7 }}>
            If you're serious about education, structure, and clarity, let's talk.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
            <Link href="/contact" style={{
              display: 'inline-block',
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(135deg, #14b8a6, #22c55e)',
              color: '#0b1120',
              padding: '16px 36px',
              fontSize: 17,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'none',
              boxShadow: '0 4px 15px rgba(20,184,166,0.4)'
            }}>
              Apply for Partnership
            </Link>
            <Link href="/contact" style={{
              display: 'inline-block',
              borderRadius: 999,
              border: '1px solid #1f2933',
              background: 'transparent',
              color: '#e5e7eb',
              padding: '16px 36px',
              fontSize: 17,
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'none'
            }}>
              Request a Demo
            </Link>
          </div>

          <p style={{ fontSize: 14, color: '#9ca3af', fontStyle: 'italic' }}>
            Partnerships are reviewed individually.
          </p>
        </div>
      </section>

      {/* Custom Partner Pages */}
      <section style={{
        width: '100%',
        background: '#05070b',
        color: '#f9fafb',
        padding: '60px 20px'
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
            Want Your Own Branded Page?
          </h2>
          <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 32 }}>
            Approved partners can receive:
          </p>

          <div style={{
            padding: '28px',
            background: 'rgba(20,184,166,0.05)',
            border: '1px solid rgba(20,184,166,0.2)',
            borderRadius: 12
          }}>
            <ul style={{ 
              fontSize: 15, 
              color: '#e5e7eb', 
              lineHeight: 2,
              listStyle: 'none',
              padding: 0,
              margin: 0
            }}>
              <li>✓ Custom URL (e.g. /partners/yourname)</li>
              <li>✓ Branded visuals</li>
              <li>✓ Custom AI Analyst prompts aligned to your system</li>
              <li>✓ Direct funnel to your community</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
