'use client';

/**
 * ComplianceDisclaimer — Reusable disclaimer banner for all tool pages.
 * Renders a clearly-visible educational disclaimer, with optional tool-specific variants.
 */

type ComplianceVariant = 'general' | 'options' | 'backtest' | 'cryptoDerivatives' | 'intraday' | 'aiData';

const VARIANT_COPY: Record<ComplianceVariant, { title: string; body: string }> = {
  general: {
    title: 'General Information Only',
    body: 'This page displays analytical information and scenario modelling only. It does not constitute financial advice, does not recommend any course of action, and does not consider your personal financial situation or objectives. Past performance does not guarantee future results. Always consult a licensed financial adviser before making investment decisions.',
  },
  options: {
    title: 'Options Risk — Educational Only',
    body: 'Options can expire worthless and may involve rapid losses, assignment risk, liquidity gaps, implied-volatility changes, and complex tax or margin consequences. This page displays educational market observations only — not options advice, not broker execution, and not a recommendation to buy, sell, write, or exercise contracts.',
  },
  backtest: {
    title: 'Historical Simulation Only',
    body: 'Backtests and replay tools use historical data and simplified assumptions. They may not capture slippage, spreads, liquidity, latency, commissions, survivorship bias, regime changes, or behavioural execution errors. Past results do not predict or guarantee future outcomes.',
  },
  cryptoDerivatives: {
    title: 'Crypto Derivatives Risk — Educational Only',
    body: 'Funding, open interest, liquidation, long/short, and flow readings are volatile derived observations that can reverse quickly and may differ by exchange. They are not trading signals, not leverage advice, and not a recommendation to use derivatives, margin, or short exposure.',
  },
  intraday: {
    title: 'Intraday Research Only',
    body: 'Short-timeframe observations, bias labels, and reference levels are for learning and review only. They are not live trading instructions, not financial advice, and no broker execution occurs. Intraday markets can move faster than displayed data updates.',
  },
  aiData: {
    title: 'AI & Data Limitations',
    body: 'AI summaries and market-data feeds may be incomplete, stale, delayed, or wrong. Treat outputs as research prompts only and verify all market data, events, and assumptions independently before making any financial decision.',
  },
};

export default function ComplianceDisclaimer({ compact = false, variant = 'general' }: { compact?: boolean; variant?: ComplianceVariant }) {
  const copy = VARIANT_COPY[variant];

  if (compact) {
    return (
      <div className="text-[11px] text-slate-600 leading-tight py-1">
        <strong>{copy.title}</strong> — {copy.body}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-center">
      <p className="text-[11px] text-amber-600/90 leading-relaxed m-0">
        <strong>{copy.title}</strong> — {copy.body}
      </p>
    </div>
  );
}
