import { RiskComplianceEvidenceModel } from '@/types/optionsScanner';

export default function RiskComplianceEvidence({ data }: { data: RiskComplianceEvidenceModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div className="rounded-lg bg-white/5 px-3 py-2">Data Integrity: {data.dataIntegrity}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">Latency: {data.latency}</div>
      <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-rose-100">Why Blocked: {data.whyBlocked}</div>
    </div>
  );
}
