import { OptionsFlowEvidenceModel } from '@/types/optionsScanner';

export default function FlowEvidence({ data }: { data: OptionsFlowEvidenceModel }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm text-slate-200">
      <div className="rounded-lg bg-white/5 px-3 py-2">Call/Put: {data.callPutPressure}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">OI Change: {data.oiChange}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">Unusual: {data.unusualActivity}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">Volume: {data.volumeBursts}</div>
    </div>
  );
}
