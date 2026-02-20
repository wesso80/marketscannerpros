interface DerivativesDecisionRowProps {
  permission: string;
  biasLabel: string;
  rotation: string;
  volRegime: string;
  liquidityState: string;
  playbook: string;
  drivers: string[];
}

export default function DerivativesDecisionRow({
  permission,
  biasLabel,
  rotation,
  volRegime,
  liquidityState,
  playbook,
  drivers,
}: DerivativesDecisionRowProps) {
  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 md:px-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_420px]">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[
            ['Permission', permission],
            ['Bias', biasLabel],
            ['Rotation', rotation],
            ['Vol Regime', volRegime],
            ['Liquidity', liquidityState],
            ['Playbook', playbook],
          ].map(([label, value]) => (
            <div key={label} className="h-12 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[11px] text-white/50">{label}</div>
              <div className="truncate text-sm font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
          <div className="text-sm font-semibold text-white">Why</div>
          <div className="text-xs text-white/50">3 drivers behind today’s decision</div>
          <div className="mt-3 grid gap-2">
            {drivers.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
                • {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
