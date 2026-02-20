export default function DebugDrawer({ debug }: { debug?: Record<string, unknown> }) {
  if (!debug) return null;
  return (
    <details className="rounded-2xl border border-white/5 bg-white/3 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-200">Debug</summary>
      <pre className="mt-3 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-slate-200">{JSON.stringify(debug, null, 2)}</pre>
    </details>
  );
}
