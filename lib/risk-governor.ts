import {
  computeInstitutionalRiskGovernor,
  InstitutionalRiskGovernorInput,
  InstitutionalRiskGovernorOutput,
} from './institutional-risk-governor';

export type RiskGovernorInput = InstitutionalRiskGovernorInput;
export type RiskGovernorOutput = InstitutionalRiskGovernorOutput;

export function computeRiskGovernor(input: RiskGovernorInput): RiskGovernorOutput {
  return computeInstitutionalRiskGovernor(input);
}
