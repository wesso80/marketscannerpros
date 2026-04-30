"use client";

export interface AdminResearchDeltaView {
  scoreDelta: number;
  lifecycleDelta: string;
  dataTrustDelta: number;
  newEvidence: string[];
  removedEvidence: string[];
  newContradictions: string[];
  resolvedContradictions: string[];
  newRisks: string[];
  changedContexts: string[];
}

export default function AdminResearchDeltaPanel({ delta }: { delta: AdminResearchDeltaView }) {
  const scoreColor = delta.scoreDelta > 0 ? "text-emerald-300" : delta.scoreDelta < 0 ? "text-red-300" : "text-white/60";
  const trustColor = delta.dataTrustDelta > 0 ? "text-emerald-300" : delta.dataTrustDelta < 0 ? "text-red-300" : "text-white/60";

  return (
    <section className="rounded-xl border border-white/10 bg-[#0F172A]/60 p-4">
      <h3 className="mb-2 text-sm font-bold text-white">What Changed Since Last Scan</h3>
      <div className="grid gap-2 md:grid-cols-3 text-xs">
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          <div className="text-white/45">Score Delta</div>
          <div className={`${scoreColor} font-semibold`}>{delta.scoreDelta >= 0 ? "+" : ""}{delta.scoreDelta.toFixed(2)}</div>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          <div className="text-white/45">Lifecycle Delta</div>
          <div className="text-white/85">{delta.lifecycleDelta}</div>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] p-2">
          <div className="text-white/45">Data Trust Delta</div>
          <div className={`${trustColor} font-semibold`}>{delta.dataTrustDelta >= 0 ? "+" : ""}{delta.dataTrustDelta.toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 text-xs">
        <List title="New Evidence" items={delta.newEvidence} />
        <List title="Removed Evidence" items={delta.removedEvidence} />
        <List title="New Contradictions" items={delta.newContradictions} />
        <List title="Resolved Contradictions" items={delta.resolvedContradictions} />
        <List title="New Risks" items={delta.newRisks} />
        <List title="Changed Contexts" items={delta.changedContexts} />
      </div>
    </section>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] p-2">
      <div className="mb-1 text-white/45">{title}</div>
      {items.length === 0 ? (
        <div className="text-white/45">None</div>
      ) : (
        <ul className="list-disc pl-5 text-white/80 space-y-0.5">
          {items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}
