import DecisionCommandBar from '@/components/options/layer1/DecisionCommandBar';
import { DecisionActions, DecisionModel, DeskHeaderModel } from '@/types/optionsScanner';

type ScanModeType =
  | 'scalping'
  | 'intraday_30m'
  | 'intraday_1h'
  | 'intraday_4h'
  | 'swing_1d'
  | 'swing_3d'
  | 'swing_1w'
  | 'macro_monthly'
  | 'macro_yearly';

type Layer1DeskContextProps = {
  header: DeskHeaderModel;
  decision: DecisionModel;
  symbol: string;
  scanMode: ScanModeType;
  loading: boolean;
  onSymbolChange: (next: string) => void;
  onScanModeChange: (next: ScanModeType) => void;
  onRunScan: () => void;
  actions: DecisionActions;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
};

export default function Layer1DeskContext({
  decision,
  symbol,
  scanMode,
  loading,
  onSymbolChange,
  onScanModeChange,
  onRunScan,
  actions,
  viewMode,
  onToggleViewMode,
}: Layer1DeskContextProps) {
  return (
    <section>
      <DecisionCommandBar
        decision={decision}
        symbol={symbol}
        scanMode={scanMode}
        loading={loading}
        onSymbolChange={onSymbolChange}
        onScanModeChange={onScanModeChange}
        onRunScan={onRunScan}
        actions={actions}
        viewMode={viewMode}
        onToggleViewMode={onToggleViewMode}
      />
    </section>
  );
}
