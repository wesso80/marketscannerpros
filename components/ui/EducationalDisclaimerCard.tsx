type EducationalDisclaimerCardProps = {
  /** Tailored feature name shown in the disclaimer, e.g. "Backtest", "Scanner" */
  feature?: string;
  className?: string;
};

export default function EducationalDisclaimerCard({ feature, className = '' }: EducationalDisclaimerCardProps) {
  const subject = feature ? `${feature} output` : 'All output';
  return (
    <div
      className={`rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 ${className}`}
      role="note"
      aria-label="Educational disclaimer"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-300">
          Educational Only
        </span>
        <p className="text-[11px] leading-5 text-slate-400">
          {subject} is for educational and research purposes only. It is not financial advice, a personal recommendation, a broker instruction, or a solicitation to buy or sell any security or asset. Past patterns do not guarantee future results. Always conduct your own research and consult a licensed financial professional before making investment decisions.
        </p>
      </div>
    </div>
  );
}
