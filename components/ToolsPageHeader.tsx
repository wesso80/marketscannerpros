"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import { getGuideByPath } from '@/lib/guides/toolGuides';
import TerminalPageHeader from '@/components/terminal/TerminalPageHeader';

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

  const headerActions = (
    <>
      {backHref && (
        <Link
          href={backHref}
          className="rounded-panel border border-msp-border bg-msp-panel px-4 py-2.5 text-[13px] font-semibold text-msp-text no-underline"
        >
          ← Back
        </Link>
      )}
      {actions}
    </>
  );

  const headerMeta = (
    <>
      <div className="inline-flex items-center gap-1.5 rounded-full border border-msp-warn/30 bg-msp-warnTint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-msp-warn">
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
    </>
  );

  return (
    <div className="msp-container py-4">
      <TerminalPageHeader
        badge={badge}
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={headerActions}
        meta={headerMeta}
      />

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
