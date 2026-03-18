'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface OnboardingProgress {
  authenticated: boolean;
  hasWatchlist: boolean;
  hasJournal: boolean;
  hasPortfolio: boolean;
}

const DISMISS_KEY = 'msp_onboarding_dismissed';

const steps = [
  {
    key: 'hasWatchlist' as const,
    title: 'Add to Watchlist',
    description: 'Search a ticker above, then add it to your watchlist to track it.',
    href: null, // action is on current page
    icon: '🔍',
  },
  {
    key: 'hasJournal' as const,
    title: 'Log Your First Trade',
    description: 'Record a trade in the journal to start tracking your performance.',
    href: '/tools/journal',
    icon: '📝',
  },
  {
    key: 'hasPortfolio' as const,
    title: 'Track a Position',
    description: 'Add an open position to your portfolio for live P&L tracking.',
    href: '/tools/portfolio',
    icon: '📊',
  },
];

export default function OnboardingChecklist() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [dismissed, setDismissed] = useState(true); // default hidden until we confirm

  useEffect(() => {
    // Check localStorage first — if dismissed, don't fetch
    if (localStorage.getItem(DISMISS_KEY) === 'true') {
      setDismissed(true);
      return;
    }
    setDismissed(false);

    fetch('/api/onboarding/progress')
      .then((r) => r.json())
      .then((data: OnboardingProgress) => {
        if (!data.authenticated) return;
        setProgress(data);
        // Auto-dismiss if all steps complete
        if (data.hasWatchlist && data.hasJournal && data.hasPortfolio) {
          localStorage.setItem(DISMISS_KEY, 'true');
          setDismissed(true);
        }
      })
      .catch(() => {});
  }, []);

  if (dismissed || !progress) return null;

  const completedCount = steps.filter((s) => progress[s.key]).length;

  return (
    <div className="relative rounded-lg border border-emerald-500/30 bg-gradient-to-r from-slate-800/80 to-slate-900/80 p-4 backdrop-blur">
      {/* Dismiss button */}
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, 'true');
          setDismissed(true);
        }}
        className="absolute right-3 top-3 text-slate-400 transition hover:text-slate-200"
        aria-label="Dismiss onboarding"
      >
        ✕
      </button>

      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-emerald-400">
          Getting Started
          <span className="ml-2 text-xs font-normal text-slate-400">
            {completedCount}/{steps.length} complete
          </span>
        </h3>
        {/* Progress bar */}
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => {
          const done = progress[step.key];
          const inner = (
            <div
              className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 transition ${
                done
                  ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70'
                  : 'border-slate-600/40 bg-slate-800/50 hover:border-emerald-500/40 hover:bg-slate-800/80'
              }`}
            >
              <span className="mt-0.5 text-base">{done ? '✅' : step.icon}</span>
              <div className="min-w-0">
                <p className={`text-xs font-medium ${done ? 'text-emerald-400 line-through' : 'text-slate-200'}`}>
                  {step.title}
                </p>
                {!done && (
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{step.description}</p>
                )}
              </div>
            </div>
          );

          return step.href && !done ? (
            <Link key={step.key} href={step.href}>
              {inner}
            </Link>
          ) : (
            <div key={step.key}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
