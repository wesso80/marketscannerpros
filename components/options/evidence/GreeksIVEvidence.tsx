import { GreeksIVEvidenceModel } from '@/types/optionsScanner';

export default function GreeksIVEvidence({ data }: { data: GreeksIVEvidenceModel }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm text-slate-200">
      <div className="rounded-lg bg-white/5 px-3 py-2">IV Rank: {data.ivRank}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">IV Percentile: {data.ivPercentile}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">Skew/Term: {data.skewTerm}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">Greeks: {data.greeksSummary}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2 md:col-span-2">Gamma Risk: {data.gammaRisk}</div>
    </div>
  );
}
