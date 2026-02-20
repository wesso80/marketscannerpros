import Badge from '@/components/msp/core/Badge';

export default function OptionsHeaderBar() {
  return (
    <header className="rounded-2xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--msp-text)]">Options Scanner</h1>
          <p className="text-sm text-[var(--msp-muted)]">Institutional 3-layer flow: Context → Setup → Execution → Decision</p>
        </div>
        <Badge tone="neutral">msp.score.v2.1</Badge>
      </div>
    </header>
  );
}
