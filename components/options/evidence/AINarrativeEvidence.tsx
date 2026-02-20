import { AINarrativeEvidenceModel } from '@/types/optionsScanner';

export default function AINarrativeEvidence({ data }: { data: AINarrativeEvidenceModel }) {
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <div className="text-slate-300">Summary</div>
      <ul className="list-disc pl-5 text-slate-200">
        {data.summaryBullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="text-slate-300">Signal Checklist</div>
      <ul className="list-disc pl-5 text-slate-200">
        {data.signalChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
