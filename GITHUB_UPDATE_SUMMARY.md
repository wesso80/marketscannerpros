# GitHub Update Summary - Professional Layout Changes

## 🚨 CRITICAL: Fix Build Error First!
**The build is failing because Hero.tsx is corrupted on GitHub.** Update Hero.tsx FIRST (Section 2 below), then update the other files.

## Files to Update on GitHub (wesso80/marketscannerpros repo)

### 1. app/page.tsx
```tsx
"use client";
import Pricing from "../components/Pricing";
import Testimonials from "../components/Testimonials";
import Hero from "../components/Hero";
import Why from "../components/Why";
import HowItWorks from "../components/HowItWorks";
import SocialProof from "../components/SocialProof";
import ReferralBanner from "../components/ReferralBanner";
import { useState } from "react";
import "./pricing/styles.css";

export default function Home() {
  const [loading, setLoading] = useState<string | null>(null);

  // Get Streamlit URL from env or construct it
  const getStreamlitUrl = () => {
    // Use environment variable if set
    if (process.env.NEXT_PUBLIC_STREAMLIT_URL) {
      return process.env.NEXT_PUBLIC_STREAMLIT_URL;
    }

    // Fallback for local development
    if (typeof window !== "undefined") {
      const currentUrl = window.location.href;
      if (
        currentUrl.includes("localhost") ||
        currentUrl.includes("127.0.0.1")
      ) {
        return "http://localhost:5000";
      }
    }

    // Default fallback
    return "https://app.marketscannerpros.app";
  };

  const handleCheckout = async (plan: "pro" | "pro_trader") => {
    setLoading(plan);
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Hero />
      <SocialProof />
      <Why />
      <HowItWorks />
      <Testimonials />
      
      {/* Pricing Section */}
      <section className="w-full border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Pricing & Plans
          </h2>
          <p className="opacity-85 mb-10 text-base md:text-lg">
            Start free. Upgrade any time. Cancel in your Stripe portal.
          </p>

          <div className="plans">
          {/* Free Plan */}
          <div className="plan">
            <h2>Free</h2>
            <p>$0</p>
            <ul>
              <li>Limited symbols</li>
              <li>Core scanner</li>
            </ul>
            <button
              className="btn"
              onClick={() => window.open(getStreamlitUrl(), "_blank")}
            >
              Launch App
            </button>
          </div>

          {/* Pro Plan */}
          <div className="plan">
            <h2>
              Pro <span className="badge">7-day free trial</span>
            </h2>
            <p>$4.99 / month</p>
            <ul>
              <li>Multi-TF confluence</li>
              <li>Squeezes</li>
              <li>Exports</li>
            </ul>
            <button
              className="btn"
              onClick={() => handleCheckout("pro")}
              disabled={loading === "pro"}
            >
              {loading === "pro" ? "Processing..." : "Start Free Trial"}
            </button>
          </div>

          {/* Full Pro Trader Plan */}
          <div className="plan">
            <h2>
              Full Pro Trader <span className="badge">5-day free trial</span>
            </h2>
            <p>$9.99 / month</p>
            <ul>
              <li>All Pro features</li>
              <li>Advanced alerts</li>
              <li>Priority support</li>
            </ul>
            <button
              className="btn"
              onClick={() => handleCheckout("pro_trader")}
              disabled={loading === "pro_trader"}
            >
              {loading === "pro_trader" ? "Processing..." : "Start Free Trial"}
            </button>
          </div>
        </div>
        </div>
      </section>
      
      <ReferralBanner />
    </>
  );
}
```

### 2. components/Hero.tsx (CRITICAL - Fix Build Error)
```tsx
// components/Hero.tsx
import HeroShot from "./HeroShot";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-20">
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
              href="/user-guide"
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

### 3. components/SocialProof.tsx
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

### 3. components/Why.tsx
```tsx
// components/Why.tsx
export default function Why() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl font-bold md:text-3xl mb-6">Built for Serious Traders</h2>
        <ul className="space-y-4 text-base md:text-lg">
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Never miss a squeeze again — get alerted before the crowd</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Cut hours of chart-watching into minutes of clarity</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Focus only on high-probability setups with multi-timeframe confluence</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
```

### 4. components/Why.tsx
```tsx
// components/Why.tsx
export default function Why() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl font-bold md:text-3xl mb-6">Built for Serious Traders</h2>
        <ul className="space-y-4 text-base md:text-lg">
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Never miss a squeeze again — get alerted before the crowd</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Cut hours of chart-watching into minutes of clarity</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Focus only on high-probability setups with multi-timeframe confluence</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
```

### 5. components/HowItWorks.tsx
```tsx
// components/HowItWorks.tsx
const steps = [
  {
    title: "Pick your symbols",
    desc: "Choose crypto or stocks you want to scan — build as many watchlists as you like.",
  },
  {
    title: "Run the scanner",
    desc: "Multi-timeframe analysis (EMA stack + squeeze detection) runs in seconds.",
  },
  {
    title: "Act on signals",
    desc: "See confluence scores, export CSVs, and connect alert hooks.",
  },
];

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M9.55 16.2 5.8 12.45l1.4-1.4 2.35 2.35 6.25-6.3 1.4 1.45z"/>
    </svg>
  );
}

export default function HowItWorks() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-center text-2xl font-bold md:text-3xl">How It Works</h2>
        <p className="mt-3 text-center text-base text-neutral-400">From charts to clarity in 3 steps</p>

        <div className="mt-10 md:mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 text-center shadow-lg"
            >
              <CheckIcon style={{width:32,height:32}} className="mx-auto mb-4 text-emerald-400" />
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm md:text-base text-neutral-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### 6. components/Testimonials.tsx
```tsx
// components/Testimonials.tsx
export default function Testimonials() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl font-bold md:text-3xl mb-6">What Traders Are Saying</h2>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <p className="text-base leading-6 text-neutral-300">
              "I spotted XRP's squeeze 3 hours early thanks to MarketScanner Pro."
            </p>
            <footer className="mt-3 text-sm text-neutral-500">— Beta user</footer>
          </blockquote>

          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <p className="text-base leading-6 text-neutral-300">
              "Cut my chart-watching from 4 hours a day to 15 minutes."
            </p>
            <footer className="mt-3 text-sm text-neutral-500">— Pro Trader</footer>
          </blockquote>

          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <p className="text-base leading-6 text-neutral-300">
              "Finally a scanner that actually shows multi-timeframe confluence clearly."
            </p>
            <footer className="mt-3 text-sm text-neutral-500">— Early adopter</footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
```

### 7. components/ReferralBanner.tsx
```tsx
// components/ReferralBanner.tsx
export default function ReferralBanner() {
  return (
    <section className="w-full border-b border-neutral-800 bg-emerald-500/10">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10 text-center">
        <span className="inline-block rounded-lg border border-emerald-600/30 bg-emerald-600/20 px-5 py-3 text-base md:text-lg text-emerald-200 font-medium">
          Invite a friend → both get 7 days Pro free
        </span>
      </div>
    </section>
  );
}
```

### 8. app/layout.tsx (Already updated)
```tsx
import "./globals.css";
import BackToTop from "../components/BackToTop";
import Footer from "../components/Footer";
import AnalyticsLoader from "../components/AnalyticsLoader";
import CookieBanner from "../components/CookieBanner";
import Header from "../components/Header";

export const metadata = { 
  title: "MarketScanner Pros",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5"
};
import { APP_URL } from 'lib/appUrl';
import AppUrlFixer from "@/components/AppUrlFixer";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased overflow-x-hidden">
        <AppUrlFixer />
        <Header />
        <main>{children}</main>
        <Footer />
        <CookieBanner />
        <AnalyticsLoader />
        <BackToTop />
      </body>
    </html>
  );
}
```

### 9. components/Header.tsx (Already updated)
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

        {/* Single nav (no mobile duplicate) */}
        <nav className="flex items-center gap-6 text-emerald-300/90">
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

### 10. app/globals.css (Use original - no force-center CSS)
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

## Summary of Changes

**Consistency improvements:**
- All sections now use `max-w-6xl` container width
- Unified vertical spacing: `py-12 md:py-16`
- Consistent heading sizes: `text-2xl md:text-3xl`
- Increased padding and text sizes for better readability
- Professional spacing between elements

**Key fixes:**
- Pricing section wrapped in proper `<section>` tag with consistent styling
- ReferralBanner moved after Pricing (better flow)
- All components use full-width sections with centered content containers
- No more "cut and paste" appearance - everything flows together
