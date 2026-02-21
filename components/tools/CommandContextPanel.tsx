type ContextChip = {
  label: string;
  value: string;
};

type CommandContextPanelProps = {
  chips: ContextChip[];
  strategyModeLabel: string;
};

export default function CommandContextPanel({ chips, strategyModeLabel }: CommandContextPanelProps) {
  const contextChips = chips.slice(0, 7);
  void strategyModeLabel;

  return (
    <div className="msp-elite-panel min-h-[72px]">
      <div className="overflow-x-auto">
        <div className="grid grid-cols-2 gap-px rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] sm:grid-cols-4 lg:grid-cols-7">
        {contextChips.map((chip, index) => (
          <div key={chip.label} className={`px-2.5 py-2 ${index > 0 ? 'lg:border-l border-[var(--msp-divider)]' : ''}`}>
            <div className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">{chip.label}</div>
            <div className="text-[0.78rem] font-semibold uppercase tracking-[0.05em] text-[var(--msp-text)]">{chip.value}</div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
