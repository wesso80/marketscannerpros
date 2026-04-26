'use client';

/**
 * ComplianceDisclaimer — Reusable disclaimer banner for all tool pages.
 * Renders a clearly-visible educational disclaimer.
 */

export default function ComplianceDisclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="text-[11px] text-slate-600 leading-tight py-1">
        This page displays analytical information and scenario modelling only. It does not constitute financial advice,
        does not recommend any course of action, and does not consider your personal circumstances.
        Past performance does not guarantee future results.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-center">
      <p className="text-[11px] text-amber-600/90 leading-relaxed m-0">
        <strong>General Information Only</strong> — This page displays analytical information and scenario modelling only.
        It does not constitute financial advice, does not recommend any course of action, and does not consider your
        personal financial situation or objectives. Past performance does not guarantee future results.
        Always consult a licensed financial adviser before making investment decisions.
      </p>
    </div>
  );
}
