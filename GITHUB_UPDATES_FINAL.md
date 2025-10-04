# Final GitHub Updates - All Files

Update these 6 files on GitHub to fix all issues:

---

## 1. app/globals.css
**Issue:** Force-center CSS making layout cramped
**Action:** Replace entire file with this:

```css
:root { color-scheme: dark; }

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: #0a0a0a;
  color: #e5e5e5;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  overflow-x: hidden;
  max-width: 100vw;
}

a { color: #34d399; text-decoration: none; }
a:hover { text-decoration: underline; }

.container { max-width: 960px; margin: 0 auto; padding: 1rem; width: 100%; box-sizing: border-box; }
@media (min-width: 768px) {
  .container { padding: 1.25rem; }
}

/* Desktop nav styling - only applies at md breakpoint and above */
@media (min-width: 768px) {
  .nav { display: flex; gap: 1rem; opacity: .9; font-size: .95rem; }
  nav a { margin-right: 1.5rem; }
  nav a:last-child { margin-right: 0; }
}
.header { border-bottom: 1px solid #27272a; overflow: hidden; width: 100%; }

/* Buttons */
.btn {
  display: inline-block;
  padding: .7rem .95rem;
  border-radius: .8rem;
  background: #22c55e;         /* emerald */
  color: #0a0a0a;               /* near black */
  font-weight: 700;
  text-decoration: none;
}
.btn:hover { filter: brightness(1.05); }
.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, .35); /* focus ring */
}

.btn-outline {
  background: transparent;
  border: 1px solid #3f3f46;
  color: #e5e5e5;
  padding: .5rem .8rem;
  border-radius: .5rem;
}
.btn-outline:hover { filter: brightness(1.05); }
.btn-outline:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(63, 63, 70, .35);
}

/* Cookie banner */
.cookie {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 50;
  background: rgba(24,24,27,.98);
  color: #e5e5e5;
  border-top: 1px solid #27272a;
}
.cookie-row { display: flex; gap: 1rem; align-items: flex-start; padding-block: 1rem; }
.cookie-text { flex: 1; line-height: 1.55; }

/* Smooth anchor scroll for ToC links */
html { scroll-behavior: smooth; }

/* --- Dark baseline override (appended by script) --- */
:root { color-scheme: dark; }
html, body { background-color: #0a0a0a; color: #e5e5e5; }
.header, .nav, .container { color: inherit; background: transparent; }
a { color: #a7f3d0; }                  /* emerald-200ish for links */
a:hover { color: #6ee7b7; }            /* emerald-300ish */
```

---

## 2. components/Hero.tsx
**Issue:** Hero image too big, wrong guide link, too much padding
**Action:** Replace entire file with this:

```tsx
// components/Hero.tsx
import HeroShot from "./HeroShot";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-10">
        
        {/* Image first on mobile, right on desktop */}
        <div className="w-full md:order-2">
          <HeroShot />
        </div>

        {/* Text second on mobile, left on desktop */}
        <div className="w-full md:order-1">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span>Try Pro free for 7 days</span>
            <span className="text-neutral-500">•</span>
            <span>Cancel anytime</span>
          </div>

          <h1 className="mt-2 text-2xl font-bold leading-tight md:text-4xl lg:text-5xl">
            Find <span className="text-emerald-400">Breakouts</span> Before They Happen 🚀
          </h1>

          <p className="mt-3 text-sm md:text-base max-w-xl text-neutral-300">
            Scan crypto & stocks across timeframes in seconds. Get squeeze detection, confluence scoring,
            and alert hooks—so you act, not react. Trusted by traders who want speed, clarity, and confluence without noise.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/launch"
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm md:px-5 md:py-3 md:text-base font-medium text-neutral-900 hover:bg-emerald-400"
            >
              Start Free Now
            </Link>
            <Link
              href="/guide"
              className="rounded-xl border border-neutral-700 px-4 py-2.5 text-sm md:px-5 md:py-3 md:text-base font-medium hover:bg-neutral-900/50"
            >
              See How It Works
            </Link>
          </div>

          <p className="mt-3 text-xs text-neutral-400">
            No ads • Cancel anytime • Educational only — not financial advice
          </p>
        </div>

        </div>
      </div>
    </section>
  );
}
```

---

## 3. components/HeroShot.tsx
**Issue:** Image way too big on desktop AND mobile
**Action:** Replace entire file with this:

```tsx
// components/HeroShot.tsx
"use client";

export default function HeroShot() {
  return (
    <div
      className="relative rounded-lg md:rounded-xl border border-neutral-800 bg-neutral-900 p-2 w-full overflow-hidden mx-auto"
      style={{
        maxWidth: "200px",
        boxShadow:
          "0 0 0 1px rgba(16,185,129,.08), 0 20px 60px -15px rgba(0,0,0,.5), 0 10px 30px -10px rgba(0,0,0,.4)",
      }}
    >
      <img
        src="/marketing/hero-dashboard.png"
        alt="MarketScanner dashboard preview"
        className="rounded-md w-full h-auto mx-auto"
        style={{ display: 'block', maxWidth: '100%' }}
      />
    </div>
  );
}
```

---

## 4. components/SocialProof.tsx
**Issue:** File corrupted with extra JSX
**Action:** Replace entire file with this (exactly 35 lines):

```tsx
// components/SocialProof.tsx
import Image from "next/image";

const logos = [
  { src: "/logos/reddit.svg",        alt: "Reddit" },
  { src: "/logos/indiehackers.svg",  alt: "Indie Hackers" },
  { src: "/logos/producthunt.svg",   alt: "Product Hunt" },
  { src: "/logos/appstore.svg",      alt: "App Store" },
  { src: "/logos/googleplay.svg",    alt: "Google Play" },
];

export default function SocialProof() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <p className="mb-8 text-center text-xs uppercase tracking-wide text-neutral-500">
          As seen on
        </p>

        <div className="grid grid-cols-2 items-center justify-items-center gap-8 sm:grid-cols-3 md:grid-cols-5">
          {logos.map((l) => (
            <Image
              key={l.alt}
              src={l.src}
              alt={l.alt}
              width={160}
              height={32}
              className="opacity-70 hover:opacity-100 transition"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

---

## 5. app/guide/page.tsx
**Issue:** Page doesn't exist or is empty
**Action:** EDIT the existing file (don't create new) and replace with this:

```tsx
export const metadata = {
  title: "MarketScanner Pro — User Guide",
  alternates: { canonical: "/guide" }
};

export default function UserGuide() {
  return (
    <main>
      <h1>MarketScanner Pro — User Guide</h1>
      <p>Everything you need to run scans, interpret scores, and manage alerts.</p>
      <h2>1) Quick Start</h2>
      <ol>
        <li>Pick a watchlist (Manual Entry or import CSV).</li>
        <li>Click <em>Run Scanner</em> for Equities or Crypto.</li>
        <li>Open a symbol to inspect multi-TF confluence, signals, and indicators.</li>
        <li>(Optional) Set price alerts or export CSV for journaling.</li>
      </ol>
      <h2>2) Scoring Model & Weights</h2>
      <p>Final score is a weighted sum across core signals. Partial credit applies when alignment is close but not perfect.</p>
      <ul>
        <li><strong>EMA Stack (30%)</strong> — EMA9 &gt; 13 &gt; 21 &gt; 50 bullish; reverse bearish.</li>
        <li><strong>SMA5 + EMA9/13 Trigger (10%)</strong> — Cross-up adds, cross-down subtracts; ATR filter reduces noise.</li>
        <li><strong>RSI Regime (20%)</strong> — Bull ≥ 55, Neutral 45–55; Bear ≤ 45 (asset-adaptive).</li>
        <li><strong>MACD Momentum (20%)</strong> — Signal line cross + histogram slope; penalize fading momentum.</li>
        <li><strong>ATR Risk/Extension (10%)</strong> — Normalizes moves; penalizes over-extension.</li>
        <li><strong>Volume Context (7%)</strong> — Bonus when volume &gt; 20-day average; filters illiquid names.</li>
        <li><strong>Squeeze / Expansion (3%)</strong> — BB bandwidth + ATR compression; expansion bonus.</li>
      </ul>
      <h2>3) Timeframes & Confluence</h2>
      <p>We aggregate confluence across: 30m, 1h, 2h, 3h, 4h, 6h, 8h, 1D, Weekly.</p>
      <ul>
        <li><strong>Stack tiers:</strong> ×2 Watch → ×3 Setup → ×4 High-conviction → ×≥5 Extreme.</li>
        <li><strong>Countdown:</strong> badge shows time remaining in each active candle.</li>
        <li><strong>Weekly:</strong> adds macro context but doesn't block intraday triggers.</li>
      </ul>
      <h2>4) Entries, Targets, Stops, Risk</h2>
      <ul>
        <li><strong>Entry:</strong> Prefer SMA cross in direction of EMA stack; avoid entries when price is &gt; 1× ATR from mean.</li>
        <li><strong>Stops:</strong> Trend = ×1.2× ATR(14); Counter-trend = ×0.8× ATR.</li>
        <li><strong>Targets:</strong> ×0.7× / ×1.5× / 2× ATR% grid; take partial at 1×; trail remainder by EMA21 or ATR stop.</li>
        <li>Use the prior-bar 50% retrace as a visual pullback level.</li>
      </ul>

      <h2>5) Price Alerts</h2>
      <ul>
        <li><strong>Auto Check</strong> cadence for scanning.</li>
        <li><strong>Triggers:</strong> target hits (TP/SL grid), custom price levels.</li>
        <li><strong>Signal events:</strong> SMA5↔EMA9/13 cross, EMA stack flip, RSI regime change, squeeze expansion.</li>
        <li><strong>Delivery:</strong> in-app notifications (100% reliable); optional email alerts for mobile coverage.</li>
      </ul>

      <h2>6) Advanced Charts</h2>
      <p>Indicators: EMAs, RSI, MACD, BB/ATR context, volume. If you see mismatches vs your broker:</p>
      <ul>
        <li>Align timezone &amp; session settings.</li>
        <li>Match candle granularity (1D vs 4h vs 1h etc.).</li>
        <li>Illiquid names may show spiky prints; confirm with a second source.</li>
      </ul>

      <h2>7) Exports & Workflow</h2>
      <ul>
        <li>CSV copy for journaling; email notifications for scan results and alerts.</li>
        <li>Export snapshots from charts for trade logs.</li>
      </ul>
    </main>
  );
}
```

---

## 6. components/Header.tsx
**Issue:** User Guide tab links to wrong URL
**Action:** Replace entire file with this:

```tsx
'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold tracking-tight text-emerald-300">
          MarketScannerPros
        </Link>

        <nav className="flex items-center gap-4 md:gap-6 text-emerald-300/90 text-sm md:text-base">
          <Link href="/blog">Blog</Link>
          <Link href="/guide">User Guide</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}
```

**CRITICAL FIX:** Line 15 must say `/guide` NOT `/user-guide` - this is why clicking the tab gives "page not found"!

---

## Summary of Changes

1. **app/globals.css** - Removed force-center CSS (line 85-98)
2. **components/Hero.tsx** - Reduced padding (py-12), fixed guide link (/guide not /user-guide)
3. **components/HeroShot.tsx** - Shrunk image to 200px max-width (mobile-friendly!)
4. **components/SocialProof.tsx** - Fixed corruption (removed extra JSX after component)
5. **app/guide/page.tsx** - Added complete user guide content
6. **components/Header.tsx** - CRITICAL FIX: User Guide tab now links to /guide (was /user-guide)

**Mobile Fix:** Hero image now 200px max-width instead of 280px for proper mobile display!

**4-Hour User Guide Bug SOLVED:** Header navigation was linking to /user-guide instead of /guide!

All files are ready to copy-paste directly into GitHub!
