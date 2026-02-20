type EvidenceAccordionProps = {
  payload: any;
};

export default function EvidenceAccordion({ payload }: EvidenceAccordionProps) {
  const rows = payload?.contrib || [];
  return (
    <details className="rounded-2xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-5">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--msp-text)]">Evidence & Raw Metrics</summary>
      <div className="mt-4 space-y-2 text-sm text-[var(--msp-muted)]">
        {rows.length === 0 && <div>No evidence loaded yet.</div>}
        {rows.slice(0, 8).map((row: any, index: number) => (
          <div key={index}>• {row?.label || row?.key || 'feature'}: {typeof row?.value === 'number' ? row.value.toFixed(2) : '—'}</div>
        ))}
      </div>
    </details>
  );
}
