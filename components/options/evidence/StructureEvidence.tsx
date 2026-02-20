import { StructureEvidenceModel } from '@/types/optionsScanner';

export default function StructureEvidence({ data }: { data: StructureEvidenceModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div>Trend: {data.trendStructure}</div>
      <div>State: {data.state}</div>
      <ul className="list-disc pl-5 text-slate-300">
        {data.keyLevels.map((level) => (
          <li key={level}>{level}</li>
        ))}
      </ul>
    </div>
  );
}
