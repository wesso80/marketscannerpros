"use client";
import { useEffect, useState } from 'react';
import OutcomeCohort from './OutcomeCohort';
import type { OutcomeCohort as Cohort } from '@/lib/admin/verifiedOutcomes';
import type { AnalysisScope, analyzeOutcomeCohort } from '@/lib/admin/outcomeCohortAnalysis';

type Result = ReturnType<typeof analyzeOutcomeCohort> & {
  definition: { population: string; workspace: string; rate: string; limits: string; comparison: string };
};
const percent = (value: number | null) => value == null ? '—' : `${value}%`;
export default function OutcomeCohortAnalysis({scope}: {scope: AnalysisScope}) {
  const [cohort, setCohort] = useState<Cohort>('all');
  const [days, setDays] = useState(90);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null); setError(''); setLoading(true);
    const secret = sessionStorage.getItem('admin_secret');
    fetch(`/api/admin/outcome-cohorts?scope=${scope}&days=${days}&cohort=${cohort}`, {
      cache: 'no-store', credentials: 'include', signal: controller.signal,
      headers: secret ? {Authorization: `Bearer ${secret}`} : {},
    }).then(async response => {
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || 'Measurement cohorts are unavailable.');
      if (active) setData(json);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Measurement cohorts are unavailable.');
    }).finally(() => {if (active) setLoading(false);});
    return () => {active = false; controller.abort();};
  }, [scope, days, cohort, revision]);
  return <section aria-label="24-hour measurement analysis" className="my-5 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-slate-200">
    <h2 className="text-lg font-semibold">24-hour measurement analysis</h2>
    <p className="text-sm text-slate-400">This panel has its own cohort and window. Historical tables and other horizons below remain separate and are not verified by this selection.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <label>Measurement window <select aria-label="Measurement window" value={days} onChange={e => setDays(Number(e.target.value))} className="rounded bg-slate-800 p-2">
        <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
      </select></label>
      <button type="button" onClick={() => setRevision(v => v + 1)} disabled={loading} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-50">Refresh measurements</button>
    </div>
    <OutcomeCohort value={cohort} onChange={setCohort} summary={data?.provenance} scope={`Eligible measured 24h records over ${days} days; counts precede the cohort filter. ${scope === 'backtest' ? 'Shared-scan and admin-page calls.' : 'Shared-scan calls only.'}`}/>
    {loading ? <p role="status">Loading measurement cohort…</p> : null}
    {error ? <p role="alert" className="text-red-300">{error}</p> : null}
    {data ? <>
      <p>{data.overall.records} selected measurements · {data.overall.correct} correct / {data.overall.wrong} wrong / {data.overall.neutral} neutral</p>
      <p>Directional hit rate: {percent(data.overall.directionalHitRate)} ({data.overall.directionalDenominator} directional outcomes). Mean signed move: {percent(data.overall.avgSignedMovePct)} ({data.overall.moveSamples} valid moves).</p>
      <p className="text-xs text-slate-400">Latest selected signal: {data.dataAsOf ? new Date(data.dataAsOf).toLocaleString() : 'Not recorded'}</p>
      {data.overall.records === 0 ? <p>No matching measurements. Other cohorts may contain records.</p> : null}
      <details className="mt-3"><summary className="cursor-pointer">Cohort breakdown ({data.groups.length} groups)</summary>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>
          <th scope="col">Group</th><th scope="col">Records</th><th scope="col">Correct / wrong / neutral</th><th scope="col">Hit rate</th><th scope="col">Mean signed move</th>
        </tr></thead><tbody>{data.groups.map(group => <tr key={group.name} className="border-t border-slate-700">
          <th scope="row" className="py-2 font-normal">{group.name}</th><td>{group.records}</td><td>{group.correct} / {group.wrong} / {group.neutral}</td>
          <td>{percent(group.directionalHitRate)} (n={group.directionalDenominator})</td><td>{percent(group.avgSignedMovePct)} (n={group.moveSamples})</td>
        </tr>)}</tbody></table></div>
      </details>
      <div className="mt-3 space-y-1 text-xs text-slate-400"><p>{data.definition.population}</p><p>{data.definition.rate}</p><p>{data.definition.limits}</p><p>{data.definition.comparison}</p></div>
    </> : null}
  </section>;
}
