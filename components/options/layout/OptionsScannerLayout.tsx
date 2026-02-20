import Layer1DeskContext from '@/components/options/layer1/Layer1DeskContext';
import Layer2ExecutionPlan from '@/components/options/layer2/Layer2ExecutionPlan';
import Layer3EvidenceDock from '@/components/options/layer3/Layer3EvidenceDock';
import {
  DecisionActions,
  DecisionModel,
  DeskHeaderModel,
  EvidenceModuleKey,
  EvidenceModulesModel,
  EvidenceSummaryModel,
  ExecutionPlanModel,
  SetupModel,
} from '@/types/optionsScanner';

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

type OptionsScannerLayoutProps = {
  header: DeskHeaderModel;
  decision: DecisionModel;
  symbol: string;
  scanMode: ScanModeType;
  loading: boolean;
  onSymbolChange: (next: string) => void;
  onScanModeChange: (next: ScanModeType) => void;
  onRunScan: () => void;
  setup: SetupModel;
  plan: ExecutionPlanModel;
  evidenceSummary: EvidenceSummaryModel;
  evidence: EvidenceModulesModel;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
  actions: DecisionActions;
  evidenceOpen: Record<EvidenceModuleKey, boolean>;
  onToggleEvidence: (key: EvidenceModuleKey) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export default function OptionsScannerLayout(props: OptionsScannerLayoutProps) {
  return (
    <div className="space-y-5">
      <Layer1DeskContext
        header={props.header}
        decision={props.decision}
        symbol={props.symbol}
        scanMode={props.scanMode}
        loading={props.loading}
        onSymbolChange={props.onSymbolChange}
        onScanModeChange={props.onScanModeChange}
        onRunScan={props.onRunScan}
        actions={props.actions}
        viewMode={props.viewMode}
        onToggleViewMode={props.onToggleViewMode}
      />

      <Layer2ExecutionPlan
        setup={props.setup}
        plan={props.plan}
        permission={props.decision.permission}
        viewMode={props.viewMode}
        onCopyPlan={props.actions.onDeploy}
        onSendToJournal={props.actions.onJournal}
      />

      <Layer3EvidenceDock
        summary={props.evidenceSummary}
        modules={props.evidence}
        open={props.evidenceOpen}
        onToggle={props.onToggleEvidence}
        onExpandAll={props.onExpandAll}
        onCollapseAll={props.onCollapseAll}
      />
    </div>
  );
}
