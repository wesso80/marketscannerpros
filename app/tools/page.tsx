'use client';

import Link from 'next/link';

export default function ToolsPage() {
  const currentYear = new Date().getFullYear();
  const emailLink = "mailto:support@marketscannerpros.app?subject=Free%20Trial%20Request%20-%20MarketScannerPros&body=Hi%2C%0A%0AI%27d%20like%20to%20request%20a%20free%20trial%20of%20your%20TradingView%20indicators.%0A%0ATradingView%20username%3A%20%0AScripts%20I%27m%20most%20interested%20in%3A%20%0A%0AThanks%2C%0A";

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
          --danger: #f97373;
          --radius-lg: 18px;
          --radius-md: 12px;
          --shadow-soft: 0 18px 45px rgba(0,0,0,0.75);
          --shadow-small: 0 10px 25px rgba(0,0,0,0.5);
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
        color: 'var(--text-main)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        lineHeight: 1.5
      }}>
        <div style={{ maxWidth: 1120, padding: '32px 20px 60px', margin: '0 auto' }}>
          {/* Header */}
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 32,
            flexWrap: 'wrap'
          }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'radial-gradient(circle at 30% 20%, #22c55e, #0f766e 40%, #020617 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 20,
                color: '#f9fafb',
                boxShadow: 'var(--shadow-small)'
              }}>M</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 18 }}>MarketScannerPros</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Premium TradingView indicators & dashboards</div>
              </div>
            </Link>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{
                fontSize: 11,
                padding: '4px 9px',
                borderRadius: 999,
                border: '1px solid var(--border-subtle)',
                background: 'rgba(15,23,42,0.8)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: '#22c55e',
                  boxShadow: '0 0 8px rgba(34,197,94,0.9)'
                }}></span>
                <span>Early-access beta · Free trials</span>
              </div>
              <a href={emailLink} style={{
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                padding: '9px 18px',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                background: 'linear-gradient(135deg, var(--accent), #22c55e)',
                color: '#0b1120',
                boxShadow: 'var(--shadow-small)',
                textDecoration: 'none'
              }}>
                <span>📩</span>
                <span>Request Free Trial</span>
              </a>
            </div>
          </header>

          {/* Main content */}
          <main 
            className="grid-2-col-responsive"
            style={{
              marginBottom: 40
            }}>
            {/* Hero section */}
            <section style={{
              background: 'radial-gradient(circle at top, #111827, #020617 60%)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
              padding: '24px 22px 22px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                right: -40,
                top: -40,
                width: 260,
                height: 260,
                background: 'radial-gradient(circle, rgba(45,212,191,0.22), transparent 60%)',
                filter: 'blur(1px)',
                opacity: 0.8
              }} aria-hidden="true"></div>
              
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--text-muted)',
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.9)',
                border: '1px solid rgba(148,163,184,0.25)',
                marginBottom: 10
              }}>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: 'rgba(34,197,94,0.12)',
                  color: '#bbf7d0',
                  fontSize: 11
                }}>Invite-only scripts</span>
                <span>Hosted on TradingView · Manual access</span>
              </div>

              <h1 style={{ fontSize: 26, lineHeight: 1.25, marginBottom: 8, fontWeight: 650 }}>
                TradingView tools built to read the whole market, not just one candle.
              </h1>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460 }}>
                MarketScannerPros indicators give you multi-timeframe trend, momentum and confluence in one view – designed
                for traders who want structure and clarity instead of random signals.
              </p>

              <div style={{
                margin: '18px 0 20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '8px 18px',
                fontSize: 13,
                color: 'var(--text-muted)'
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>✅ <strong style={{ color: 'var(--text-main)', fontWeight: 500 }}>Multi-TF dashboards</strong> for bias & alignment</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>✅ <strong style={{ color: 'var(--text-main)', fontWeight: 500 }}>Auto-Fib tools</strong> with smart levels & alerts</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>✅ <strong style={{ color: 'var(--text-main)', fontWeight: 500 }}>Time confluence windows</strong> for key zones</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>✅ <strong style={{ color: 'var(--text-main)', fontWeight: 500 }}>Manual access control</strong> via TradingView invite-only</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10, zIndex: 2, position: 'relative' }}>
                <a href={emailLink} style={{
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '9px 18px',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  background: 'linear-gradient(135deg, var(--accent), #22c55e)',
                  color: '#0b1120',
                  boxShadow: 'var(--shadow-small)',
                  textDecoration: 'none'
                }}>
                  <span>🚀</span>
                  <span>Get My Free Trial</span>
                </a>
                <a href="https://www.tradingview.com/u/Marketscannerpros/" target="_blank" rel="noreferrer" style={{
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '9px 18px',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                  textDecoration: 'none'
                }}>
                  View scripts on TradingView
                </a>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <strong style={{ color: '#e5e7eb' }}>Currently 100% free</strong> · Access is invite-only while we build out the full product. Payments and
                subscriptions will be added later – early users keep their free trial for the full beta phase.
              </p>

              <div style={{
                position: 'absolute',
                right: 18,
                bottom: 18,
                fontSize: 11,
                padding: '5px 10px',
                borderRadius: 999,
                background: 'var(--accent-soft)',
                color: '#a5f3fc',
                border: '1px solid rgba(34,197,235,0.35)'
              }}>Beta phase · All access is Free Trial only</div>
            </section>

            {/* Side card */}
            <aside style={{
              background: 'linear-gradient(145deg, #020617, #020617 40%, #020617 60%, #0f172a 100%)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-soft)',
              padding: '18px 18px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}>
              <div>
                <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>How the free trial works</h3>
                <p style={{ fontSize: 13, margin: 0, color: 'var(--text-muted)' }}>
                  While we're in beta, all scripts are available on a
                  <strong> manual free-trial basis</strong>. No card required, just your TradingView username.
                </p>
              </div>
              <ul style={{ fontSize: 13, marginTop: 4, listStyle: 'none', paddingLeft: 0 }}>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(15,23,42,0.85)' }}>
                  <span>Duration</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Currently open-ended beta</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(15,23,42,0.85)' }}>
                  <span>Access type</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Invite-only on TradingView</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(15,23,42,0.85)' }}>
                  <span>Cost</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(34,197,94,0.7)', color: '#bbf7d0' }}>0 · Free during beta</span>
                </li>
                <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span>Requirements</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Valid TradingView username</span>
                </li>
              </ul>
              <p style={{ fontSize: 13, margin: 0, color: 'var(--text-muted)' }}>
                When we later add paid plans, beta users will be given the option to stay on preferred terms. For now, just
                request access and start testing the tools in your own workflow.
              </p>
            </aside>
          </main>

          {/* Tools section */}
          <section>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 560 }}>Included TradingView tools (beta)</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)' }}>
              These are live or in final testing on the <strong>@Marketscannerpros</strong> TradingView profile. All are
              currently offered on a free-trial basis.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 18,
              marginBottom: 26
            }}>
              {/* Card 1 */}
              <article style={{
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-small)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ position: 'relative', height: 150, background: '#020617', overflow: 'hidden' }}>
                  <img src="/images/msp-dashboard.png" alt="MSP Multi-TF Dashboard screenshot" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.9 }} />
                  <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(55,65,81,0.7)', color: 'var(--text-muted)' }}>Live · Invite-only</div>
                </div>
                <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 14, fontWeight: 560 }}>MSP — Multi-TF Dashboard v3</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Reads 4 timeframes at once and scores trend, momentum and bias. Gives you instant clarity on whether the
                    market is aligned long, short or stuck in chop.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                    <span>Focus: <span style={{ color: 'var(--accent)' }}>Context & bias</span></span>
                    <span>TV: Indicator</span>
                  </div>
                </div>
              </article>

              {/* Card 2 */}
              <article style={{
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-small)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ position: 'relative', height: 150, background: '#020617', overflow: 'hidden' }}>
                  <img src="/images/auto-fib.png" alt="MarketScannerPros Auto Fib Tool screenshot" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.9 }} />
                  <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(55,65,81,0.7)', color: 'var(--text-muted)' }}>Beta · Invite-only</div>
                </div>
                <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 14, fontWeight: 560 }}>MSP Auto Fib Tool – Locked & Alerts</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Automatically anchors swings, plots key retracement/extension levels and lets you lock zones for precise,
                    repeatable execution with alerts.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                    <span>Focus: <span style={{ color: 'var(--accent)' }}>Levels & structure</span></span>
                    <span>TV: Indicator</span>
                  </div>
                </div>
              </article>

              {/* Card 3 */}
              <article style={{
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-small)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ position: 'relative', height: 150, background: '#020617', overflow: 'hidden' }}>
                  <img src="/images/confluence-strategy.png" alt="Confluence Strategy screenshot" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.9 }} />
                  <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(55,65,81,0.7)', color: 'var(--text-muted)' }}>Private testing</div>
                </div>
                <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 14, fontWeight: 560 }}>MarketScannerPros — Confluence Strategy</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Multi-signal strategy that combines trend, momentum, structure and time-based filters. Used internally to
                    stress-test ideas before indicators ship.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                    <span>Focus: <span style={{ color: 'var(--accent)' }}>System testing</span></span>
                    <span>TV: Strategy</span>
                  </div>
                </div>
              </article>

              {/* Card 4 */}
              <article style={{
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-small)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ position: 'relative', height: 150, background: '#020617', overflow: 'hidden' }}>
                  <img src="/images/time-confluence.png" alt="Time Confluence Windows screenshot" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.9 }} />
                  <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(55,65,81,0.7)', color: 'var(--text-muted)' }}>Live · Public</div>
                </div>
                <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 14, fontWeight: 560 }}>Time Confluence Windows — 50% Levels</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Highlights stacked time windows and key 50% levels so you can see where multiple sessions and swings
                    overlap – ideal for planning zones in advance.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                    <span>Focus: <span style={{ color: 'var(--accent)' }}>Timing zones</span></span>
                    <span>TV: Indicator</span>
                  </div>
                </div>
              </article>

              {/* Card 5 - Squeeze Strategy */}
              <article style={{
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-small)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}>
                <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)', color: '#fde047', zIndex: 2 }}>NEW</div>
                <div style={{ position: 'relative', height: 150, background: '#020617', overflow: 'hidden' }}>
                  <img src="/images/squeeze-strategy.png" alt="Squeeze Strategy Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.9 }} />
                  <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(55,65,81,0.7)', color: 'var(--text-muted)' }}>Live · Invite-only</div>
                </div>
                <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 14, fontWeight: 560 }}>Short & Long Squeeze Backtest v6</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    A volatility-squeeze strategy that auto-backtests both breakout expansions and reversal snaps.
                    Comes with built-in optimization logic that automatically selects the best TP/SL/RSI/Vol settings.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Backtesting</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Alerts</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Auto-Optimizer</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                    <span>Focus: <span style={{ color: 'var(--accent)' }}>Volatility breakouts</span></span>
                    <span>TV: Strategy</span>
                  </div>
                </div>
              </article>

              {/* Card 6 - Candlestick Pattern Strategy */}
              <article style={{
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-small)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}>
                <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)', color: '#fde047', zIndex: 2 }}>NEW</div>
                <div style={{ position: 'relative', height: 150, background: '#020617', overflow: 'hidden' }}>
                  <img src="/images/candle-pattern.png" alt="Candlestick Strategy Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.9 }} />
                  <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(55,65,81,0.7)', color: 'var(--text-muted)' }}>Live · Invite-only</div>
                </div>
                <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 14, fontWeight: 560 }}>MSP Candlestick Pattern Strategy</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Scans for classic reversal patterns — engulfing, tweezer top/bottom, railroad tracks, pin bars,
                    and compression coils — with auto SL/TP, alerts and position sizing protection.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Candle Patterns</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Risk System</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(55,65,81,0.8)', color: 'var(--text-muted)' }}>Alerts</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                    <span>Focus: <span style={{ color: 'var(--accent)' }}>Pattern recognition</span></span>
                    <span>TV: Strategy</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          {/* Pro Trader AI Tools Section */}
          <section style={{ marginTop: 40 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 560 }}>🔮 Pro Trader AI Tools</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)' }}>
              Advanced AI-powered analysis tools for professional traders. Time Confluence, Options Analysis, and more.
              <span style={{ color: '#A855F7', marginLeft: 8 }}>Pro Trader subscription required.</span>
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 18,
              marginBottom: 26
            }}>
              {/* Time Confluence Scanner */}
              <Link href="/tools/confluence-scanner" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #1E1B4B, #0F0A1E 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(168,85,247,0.4)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #7C3AED, #A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>
                    <span>🔮</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(168, 85, 247, 0.7)', color: '#A855F7' }}>Pro Trader</div>
                    <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)', color: '#fde047' }}>NEW</div>
                  </div>
                  <div style={{ padding: '14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Time Confluence Scanner</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Scans multiple timeframes for decompression events — when candles gravitate toward their 50% levels. 
                      Shows pull direction, confluence stack, and trade setups with entry/stop/target.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)', color: '#C4B5FD' }}>Decompression</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)', color: '#C4B5FD' }}>Multi-TF</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)', color: '#C4B5FD' }}>50% Levels</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: '#A855F7' }}>Time-based confluence</span></span>
                      <span>Type: AI Scanner</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Options Confluence Scanner */}
              <Link href="/tools/options-confluence" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #0D3326, #071A12 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(16,185,129,0.4)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #10B981, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>
                    <span>🎯</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Pro Trader</div>
                    <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)', color: '#fde047' }}>NEW</div>
                  </div>
                  <div style={{ padding: '14px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Options Confluence Scanner</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Get intelligent strike & expiration recommendations based on Time Confluence analysis.
                      Uses 50% levels for targets, decompression timing for expiration, and Greeks-aware risk assessment.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', color: '#6EE7B7' }}>Strike Selection</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', color: '#6EE7B7' }}>Expiration Logic</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', color: '#6EE7B7' }}>Greeks-Aware</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: '#10B981' }}>Options trading</span></span>
                      <span>Type: AI Scanner</span>
                    </div>
                  </div>
                </article>
              </Link>
            </div>
          </section>

          {/* Alpha Vantage Premium Tools */}
          <section style={{ marginTop: 40 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 560 }}>Alpha Vantage Premium Tools</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)' }}>
              Live market data, analysis, and screening powered by Alpha Vantage Premium API. These tools are included with all paid subscriptions.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 18,
              marginBottom: 26
            }}>
              {/* Scanner Tool */}
              <Link href="/tools/scanner" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #10B981, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>📊</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Multi-Market Scanner</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Scan 500+ stocks, 350+ crypto, 60+ forex pairs across timeframes. Custom presets and filtering.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Market screening</span></span>
                      <span>Type: Scanner</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Top Gainers & Losers */}
              <Link href="/tools/gainers-losers" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #10B981, #EF4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>🚀</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Top Gainers & Losers</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Real-time market movers showing top gainers, biggest losers, and most actively traded stocks in the US markets.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Market movers</span></span>
                      <span>Type: Data Feed</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Company Overview */}
              <Link href="/tools/company-overview" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>🏢</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Company Overview</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Comprehensive fundamental analysis with 40+ metrics including PE ratios, profit margins, growth rates, analyst targets, and technical indicators.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Fundamentals</span></span>
                      <span>Type: Research</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* News & Sentiments */}
              <Link href="/tools/news" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #F59E0B, #EF4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>📰</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>News & Sentiments</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      AI-powered sentiment analysis of financial news with per-ticker sentiment scores, relevance ratings, and bullish/bearish classifications.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Sentiment</span></span>
                      <span>Type: Analysis</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Sector Heatmap */}
              <Link href="/tools/heatmap" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #10B981, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>🗺️</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Sector Heatmap</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Visual treemap of S&P 500 sector performance. Track all 11 GICS sectors with real-time, daily, weekly, monthly, and YTD changes.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Sectors</span></span>
                      <span>Type: Heatmap</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Crypto Heatmap */}
              <Link href="/tools/crypto-heatmap" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #F7931A, #627EEA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>🪙</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Crypto Heatmap</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Visual treemap of top 16 cryptocurrencies by market cap. Track BTC, ETH, SOL and more with 24h price changes and market dominance.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Crypto</span></span>
                      <span>Type: Heatmap</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Crypto Derivatives Dashboard */}
              <Link href="/tools/crypto-dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #F7931A, #10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>₿</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Crypto Derivatives</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Real-time funding rates, open interest, long/short ratios, and liquidation data for crypto futures. Get derivatives-based trading signals.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Crypto Futures</span></span>
                      <span>Type: Dashboard</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Commodities Dashboard */}
              <Link href="/tools/commodities" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>🛢️</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                    <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)', color: '#fde047' }}>NEW</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Commodities</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Real-time commodity prices for energy (WTI, Brent, Natural Gas), metals (Copper, Aluminum), and agriculture (Wheat, Corn, Coffee).
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Commodities</span></span>
                      <span>Type: Dashboard</span>
                    </div>
                  </div>
                </article>
              </Link>

              {/* Intraday Charts */}
              <Link href="/tools/intraday-charts" style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-small)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  height: '100%'
                }}>
                  <div style={{ position: 'relative', height: 150, background: 'linear-gradient(135deg, #10B981, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                    <span>📈</span>
                    <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 11, padding: '4px 7px', borderRadius: 999, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(16, 185, 129, 0.7)', color: '#10B981' }}>Live</div>
                    <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.5)', color: '#fde047' }}>NEW</div>
                  </div>
                  <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 14, fontWeight: 560 }}>Intraday Charts</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      Real-time candlestick charts with 1min to 60min intervals. OHLCV data, volume analysis, VWAP, and session stats for day trading.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      <span>Focus: <span style={{ color: 'var(--accent)' }}>Day Trading</span></span>
                      <span>Type: Charts</span>
                    </div>
                  </div>
                </article>
              </Link>
            </div>
          </section>

          {/* How to section */}
          <section className="grid-3-2-col-responsive">
            <div style={{
              background: 'rgba(15,23,42,0.95)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              padding: '14px 14px 12px'
            }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>How to request your free trial</h3>
              <ol style={{ margin: '6px 0 6px 20px', padding: 0, fontSize: 13 }}>
                <li style={{ marginBottom: 6 }}>Make sure you have a TradingView account.</li>
                <li style={{ marginBottom: 6 }}>
                  Click any <strong>"Request Free Trial"</strong> button on this page – it opens a pre-filled email to us.
                </li>
                <li style={{ marginBottom: 6 }}>
                  Add your <strong>TradingView username</strong> and which scripts you want to try (or just say "all of them").
                </li>
                <li style={{ marginBottom: 6 }}>
                  We'll add you to the invite-only scripts and reply once access is active.
                </li>
              </ol>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Access is granted manually so allow some time depending on timezone. If you haven't heard back within 24 hours,
                feel free to follow up.
              </p>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <p>
                📩 <strong style={{ color: 'var(--text-main)' }}>Email for access:</strong><br />
                <a href="mailto:support@marketscannerpros.app" style={{ color: '#a5f3fc', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>support@marketscannerpros.app</a>
              </p>
              <p>
                🔗 <strong style={{ color: 'var(--text-main)' }}>TradingView profile:</strong><br />
                <a href="https://www.tradingview.com/u/Marketscannerpros/" target="_blank" rel="noreferrer" style={{ color: '#a5f3fc', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                  https://www.tradingview.com/u/Marketscannerpros/
                </a>
              </p>
              <p>
                When we later introduce paid plans, this page will be updated with pricing and checkout links. Until then,
                everything here is free to test as part of the beta.
              </p>
            </div>
          </section>

          {/* Footer */}
          <footer style={{
            marginTop: 32,
            borderTop: '1px solid rgba(15,23,42,0.9)',
            paddingTop: 14,
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'space-between'
          }}>
            <span>© {currentYear} MarketScannerPros. All rights reserved.</span>
            <span>Nothing on this site is financial advice. For educational use only.</span>
          </footer>
        </div>
      </div>
    </>
  );
}
