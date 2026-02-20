import { LiquidityEvidenceModel } from '@/types/optionsScanner';

export default function LiquidityEvidence({ data }: { data: LiquidityEvidenceModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div className="rounded-lg bg-white/5 px-3 py-2">Magnet Levels: {data.magnetLevels}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">Sweep Flags: {data.sweepFlags}</div>
      <div className="rounded-lg bg-white/5 px-3 py-2">Volume Profile: {data.volumeProfile}</div>
    </div>
  );
}
