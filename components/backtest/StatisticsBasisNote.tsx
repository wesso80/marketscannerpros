import type { BacktestStatisticsBasis } from '@/lib/backtest/balanceStatistics';

export default function StatisticsBasisNote({ basis }: { basis?: BacktestStatisticsBasis }) {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/30 p-3 text-xs leading-5 text-amber-100">
      <strong>Realised balance statistics</strong>
      <p>Open-position gains and losses are excluded. Drawdown and risk ratios describe closed trades, so they can understate portfolio risk.</p>
      <details className="mt-2">
        <summary className="cursor-pointer font-semibold">Calculation basis and sample limits</summary>
        {(basis?.warnings ?? ['Calculation basis is unavailable for this saved result. Re-run the backtest.']).map(warning => (
          <p key={warning} className="mt-2">{warning}</p>
        ))}
      </details>
    </div>
  );
}
