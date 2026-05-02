type FuturesRiskNoticeProps = {
  message: string;
};

export default function FuturesRiskNotice({ message }: FuturesRiskNoticeProps) {
  return (
    <section className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2" aria-label="Futures risk notice">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-200">Futures Risk - Educational Only</div>
      <p className="mt-1 text-xs leading-5 text-amber-100/90">{message}</p>
    </section>
  );
}
