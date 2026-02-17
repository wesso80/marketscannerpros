"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import { getGuideByPath } from '@/lib/guides/toolGuides';

interface ToolsPageHeaderProps {
  badge: string;
  title: string;
  subtitle: string;
  icon: string;
  actions?: React.ReactNode;
  backHref?: string;
}

export function ToolsPageHeader({ badge, title, subtitle, icon, actions, backHref }: ToolsPageHeaderProps) {
  const pathname = usePathname();
  const pageGuide = getGuideByPath(pathname || '');
  const [activeHelpTab, setActiveHelpTab] = React.useState<'overview' | 'steps' | 'tips'>('overview');
  const [helpOpen, setHelpOpen] = React.useState(false);

  return (
    <div className="border-b border-msp-border bg-msp-card px-6 py-5 shadow-msp">
      <div
        style={{
          maxWidth: "1600px",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          rowGap: 14,
          flexDirection: "row",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "1 1 100%", minWidth: 260 }}>
          <div className="grid h-[42px] w-[42px] place-items-center rounded-msp border border-msp-borderStrong bg-msp-panel">
            <span style={{ fontSize: "20px", color: "var(--msp-accent)", fontWeight: 800 }}>{icon}</span>
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-msp-borderStrong bg-msp-panel px-2.5 py-1 text-[11px] tracking-[0.06em] text-msp-accent">
              {badge}
            </div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "var(--msp-text)",
                margin: "6px 0 0 0",
                letterSpacing: "-0.02em",
              }}
            >
              {title}
            </h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--msp-text-muted)", fontSize: "12px" }}>{subtitle}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-msp-warn/30 bg-msp-warnTint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-msp-warn">
              Educational Only • Not Financial Advice
            </div>
            {pageGuide ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setHelpOpen((current) => !current)}
                  className="rounded-panel border border-msp-borderStrong bg-msp-panel px-3 py-1.5 text-[11px] font-semibold text-msp-accent"
                >
                  {helpOpen ? 'Hide How It Works' : 'How It Works'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            flex: "1 1 100%",
            minWidth: 220,
            marginTop: 12,
          }}
        >
          {backHref && (
            <Link
              href={backHref}
              className="rounded-panel border border-msp-border bg-msp-panel px-4 py-2.5 text-[13px] font-semibold text-msp-text no-underline"
            >
              ← Back
            </Link>
          )}
          {actions}
        </div>
      </div>

      {pageGuide && helpOpen ? (
        <div className="mx-auto mt-4 max-w-[1600px] rounded-panel border border-msp-borderStrong bg-msp-panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full border border-msp-borderStrong bg-msp-card px-2 py-0.5 text-[10px] uppercase tracking-[0.04em] text-msp-accent">
              {pageGuide.badge}
            </span>
            <span className="text-sm font-semibold text-msp-text">{pageGuide.title}</span>
            <Link href="/guide" className="ml-auto text-xs font-semibold text-msp-accent no-underline">
              Full Guide →
            </Link>
          </div>

          <div className="mb-3 flex gap-2">
            {([
              { key: 'overview', label: 'Overview' },
              { key: 'steps', label: 'Steps' },
              { key: 'tips', label: 'Pro Tips' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveHelpTab(tab.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  activeHelpTab === tab.key
                    ? 'border border-msp-borderStrong bg-msp-accentGlow text-msp-accent'
                    : 'border border-msp-border bg-msp-card text-msp-text-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeHelpTab === 'overview' ? (
            <p className="text-sm text-msp-text-muted">{pageGuide.summary}</p>
          ) : activeHelpTab === 'steps' ? (
            <ul className="space-y-1 text-sm text-msp-text-muted">
              {pageGuide.steps.map((step, idx) => (
                <li key={idx}>• {step}</li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1 text-sm text-msp-text-muted">
              {pageGuide.tips.map((tip, idx) => (
                <li key={idx}>• {tip}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default ToolsPageHeader;
