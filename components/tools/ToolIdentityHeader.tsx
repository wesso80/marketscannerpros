type ToolIdentityHeaderProps = {
  toolName: string;
  description: string;
  modeLabel: string;
  confidenceLabel: string;
  lastUpdatedLabel: string;
};

export default function ToolIdentityHeader({
  toolName,
  description,
  modeLabel,
  confidenceLabel,
  lastUpdatedLabel,
}: ToolIdentityHeaderProps) {
  return (
    <div className="msp-elite-panel min-h-[78px]">
      <div className="msp-grid-12 items-center" style={{ rowGap: '8px' }}>
        <div className="col-span-12 lg:col-span-8">
          <h1 className="text-[1.2rem] font-semibold uppercase tracking-[0.03em] text-[var(--msp-text)]">{toolName}</h1>
          <p className="text-[0.82rem] leading-tight text-[var(--msp-text-muted)]">{description}</p>
        </div>
        <div className="col-span-12 lg:col-span-4 flex flex-wrap items-center justify-start gap-2 lg:justify-end">
          <span className="msp-state-chip msp-state-chip--observe">Operator Mode: {modeLabel}</span>
          <span className="msp-state-chip msp-state-chip--observe">Confidence: {confidenceLabel}</span>
          <span className="msp-state-chip msp-state-chip--observe">Last Scan: {lastUpdatedLabel}</span>
        </div>
      </div>
    </div>
  );
}
